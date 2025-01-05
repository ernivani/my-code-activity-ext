import fetch from 'node-fetch';
import * as cp from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../utils/config';
import { OllamaService } from '../ai/ollama';
import { GitDiffService } from '../git/diff-service';

const exec = promisify(cp.exec);

export async function ensureCodeTrackingRepo(token: string, username: string): Promise<string> {
    // First check for custom remote URL in settings
    const customUrl = Config.getCustomRemoteUrl();
    if (customUrl) {
        return customUrl;
    }

    // Get token info
    const { isCustom } = await Config.getToken();
    
    // If using a custom token, we must have a custom URL
    if (isCustom) {
        throw new Error('Custom token provided but no custom remote URL configured. Please set codeTracker.customRemoteUrl in settings.');
    }

    // If we reach here, we're using GitHub
    return await ensureGithubRepo(token, username);
}

async function ensureGithubRepo(token: string, username: string): Promise<string> {
    const existing = await fetch(`https://api.github.com/repos/${username}/code-tracking`, {
        headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/vnd.github.v3+json'
        }
    });

    if (existing.ok) {
        const data = await existing.json();
        return data.clone_url;
    }

    const createResp = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
            name: 'code-tracking',
            private: false,
            description: 'Auto-generated code tracking repository',
            autoInit: true
        })
    });

    if (!createResp.ok) {
        const details = await createResp.text();
        console.error('Failed to create repository:', details);
        throw new Error(`Failed to create code-tracking repo: ${details}`);
    }

    const repoData = await createResp.json();
    await initializeGithubReadme(username, token);
    return repoData.clone_url;
}

// Rename and move GitHub-specific README initialization
async function initializeGithubReadme(username: string, token: string) {
    const readmeContent = `# Welcome to Code Tracking Repository

This repository contains all your coding activity tracking data that can be reviewed.

## What is this?

This repository is automatically maintained by the [VS Code Code Tracking extension](https://github.com/ernivani/my-code-activity-ext). It records your coding activity and commits it periodically, allowing you to:

- Review your coding patterns
- Track time spent on different projects
- Monitor your coding activity over time

The data is automatically updated every 5 minutes (configurable in VS Code settings).

## Repository Structure

- Each commit represents a snapshot of your coding activity
- Commit messages contain summaries of what changed
- The data is organized chronologically

Last Updated: ${new Date().toISOString()}
`;

    const getReadmeResp = await fetch(`https://api.github.com/repos/${username}/code-tracking/contents/README.md`, {
        headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/vnd.github.v3+json'
        }
    });

    if (!getReadmeResp.ok) {
        console.error('Failed to get README:', await getReadmeResp.text());
        return;
    }

    const readmeData = await getReadmeResp.json();
    
    const updateReadmeResp = await fetch(`https://api.github.com/repos/${username}/code-tracking/contents/README.md`, {
        method: 'PUT',
        headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
            message: 'Initialize README with welcome message',
            content: Buffer.from(readmeContent).toString('base64'),
            sha: readmeData.sha
        })
    });

    if (!updateReadmeResp.ok) {
        console.error('Failed to update README:', await updateReadmeResp.text());
    }
}

export async function ensureLocalRepo(localPath: string, remoteUrl: string, token: string) {
    try {
        // Format remote URL to include token if it's a custom repository
        const { isCustom } = await Config.getToken();
        let authenticatedUrl = remoteUrl;
        if (isCustom) {
            // Parse the URL to determine the provider
            const urlObj = new URL(remoteUrl);
            if (urlObj.hostname === 'gitlab.com') {
                authenticatedUrl = remoteUrl.replace(/^https?:\/\//, `https://git:${token}@`);
            } else {
                authenticatedUrl = remoteUrl.replace(/^https?:\/\//, `https://oauth2:${token}@`);
            }
        }

        // First check if it's already a git repository
        const isGitRepo = await fs.promises.access(path.join(localPath, '.git'))
            .then(() => true)
            .catch(() => false);

        if (!isGitRepo) {
            console.log('Creating local repository...');
            await fs.promises.mkdir(localPath, { recursive: true });
            await exec(`git init ${localPath}`);
            await exec(`git -C ${localPath} remote add origin "${authenticatedUrl}"`);

            // Create initial commit with README
            await createInitialCommit(localPath);

            // Try to force push
            try {
                const branchName = Config.getBranchName();
                await exec(`git -C ${localPath} push -u origin ${branchName} --force`);
                console.log('Remote repository initialized successfully');
            } catch (error: unknown) {
                if (error instanceof Error) {
                    if (error.message.includes('Repository not found') || error.message.includes('not found')) {
                        throw new Error(`Remote repository not found. For custom Git providers, please create the repository '${remoteUrl}' first.`);
                    }
                }
                throw error;
            }
        } else {
            // Check if remote URL matches (without credentials for comparison)
            try {
                const { stdout: currentRemote } = await exec(`git -C ${localPath} remote get-url origin`);
                const currentUrl = new URL(currentRemote.trim());
                const newUrl = new URL(remoteUrl);
                
                // Compare URLs without credentials
                if (currentUrl.host !== newUrl.host || currentUrl.pathname !== newUrl.pathname) {
                    await exec(`git -C ${localPath} remote set-url origin "${authenticatedUrl}"`);
                }
            } catch {
                // If remote doesn't exist or URL is invalid, add it
                await exec(`git -C ${localPath} remote add origin "${authenticatedUrl}"`);
            }
        }

        // Configure git user
        await exec(`git -C ${localPath} config user.email || git -C ${localPath} config user.email "code-tracker@example.com"`);
        await exec(`git -C ${localPath} config user.name || git -C ${localPath} config user.name "Code Tracker"`);

        // Get current branch
        const branchName = Config.getBranchName();
        
        try {
            // Check if branch exists locally
            await exec(`git -C ${localPath} rev-parse --verify ${branchName}`);
            // Switch to the branch if it exists
            await exec(`git -C ${localPath} checkout ${branchName}`);
        } catch {
            // Branch doesn't exist, create it
            await exec(`git -C ${localPath} checkout -b ${branchName}`);
        }

        try {
            // Try to pull from remote branch if it exists
            await exec(`git -C ${localPath} pull origin ${branchName} --allow-unrelated-histories`);
        } catch (error) {
            console.log(`Remote branch ${branchName} not found or other error:`, error);
            // For custom repositories, we've already handled initialization
        }
    } catch (error) {
        console.error('Failed to set up repository:', error);
        throw new Error(`Failed to set up repository: ${error}`);
    }
}

async function createInitialCommit(localPath: string) {
    const readmeContent = `# Code Tracking Repository

This repository contains code activity tracking data.

## What is this?

This repository is automatically maintained by the VS Code Code Tracking extension. It records coding activity and commits it periodically, allowing you to:

- Review coding patterns
- Track time spent on different projects
- Monitor coding activity over time

The data is automatically updated every 5 minutes (configurable in VS Code settings).

## Repository Structure

- Each commit represents a snapshot of coding activity
- Commit messages contain summaries of what changed
- The data is organized chronologically

Last Updated: ${new Date().toISOString()}
`;

    const readmePath = path.join(localPath, 'README.md');
    if (!fs.existsSync(readmePath)) {
        console.log('Creating README.md...');
        fs.writeFileSync(readmePath, readmeContent, 'utf-8');
        try {
            await exec(`git -C ${localPath} add README.md`);
            await exec(`git -C ${localPath} commit -m "Initialize repository with README"`);
            // No need to push here as it will be handled by the calling function
            console.log('README.md created and committed successfully');
        } catch (err) {
            console.error('Failed to commit README:', err);
        }
    }
}

export async function commitAndPush(localPath: string, message: string, token: string, remoteUrl: string) {
    try {
        // Format remote URL to include token if it's a custom repository
        const { isCustom } = await Config.getToken();
        if (isCustom) {
            // Parse the URL to determine the provider
            const urlObj = new URL(remoteUrl);
            let authenticatedUrl;
            if (urlObj.hostname === 'gitlab.com') {
                // GitLab uses username:token format
                authenticatedUrl = remoteUrl.replace(/^https?:\/\//, `https://git:${token}@`);
            } else {
                // Default oauth2 format for other providers
                authenticatedUrl = remoteUrl.replace(/^https?:\/\//, `https://oauth2:${token}@`);
            }
            await exec(`git -C ${localPath} remote set-url origin "${authenticatedUrl}"`);
        }

        const branchName = Config.getBranchName();
        await exec(`git -C ${localPath} add .`);

        let commitMessage = message;
        if (Config.isAiCommitEnabled()) {
            try {
                const diffService = GitDiffService.getInstance();
                const ollamaService = OllamaService.getInstance();

                const [diff, files, functions] = await Promise.all([
                    diffService.getGitDiff(localPath),
                    diffService.getModifiedFiles(localPath),
                    diffService.getModifiedFunctions(localPath)
                ]);

                if (diff && files.length > 0) {
                    commitMessage = await ollamaService.generateCommitMessage(diff, files);
                }
            } catch (error) {
                console.error('Error generating AI commit message:', error);
                // Fallback to original message if AI generation fails
            }
        }

        // Escape quotes and properly wrap the commit message
        const escapedMessage = commitMessage.replace(/"/g, '\\"');
        await exec(`git -C ${localPath} commit -m "${escapedMessage}" || true`);  // || true to handle "nothing to commit" case

        try {
            // Try normal push first
            await exec(`git -C ${localPath} push -u origin ${branchName}`);
        } catch (pushError) {
            if (pushError instanceof Error && 
                (pushError.message.includes('non-fast-forward') || 
                 pushError.message.includes('fetch first') || 
                 pushError.message.includes('rejected'))) {
                console.log('Push rejected, trying force push...');
                // Try to force push
                await exec(`git -C ${localPath} push -u origin ${branchName} --force`);
            } else {
                throw pushError;
            }
        }

        // Reset the remote URL to the non-authenticated version for security
        if (isCustom) {
            await exec(`git -C ${localPath} remote set-url origin "${remoteUrl}"`);
        }
    } catch (error) {
        console.error('Failed to commit and push changes:', error);
        throw error;
    }
}
