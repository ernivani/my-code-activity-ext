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
    console.log('Checking for custom remote URL...');
    const customUrl = Config.getCustomRemoteUrl();
    if (customUrl) {
        console.log('Using custom remote URL:', customUrl);
        return customUrl;
    }

    console.log('Checking if code-tracking repository exists...');
    const existing = await fetch(`https://api.github.com/repos/${username}/code-tracking`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json'
        }
    });

    if (existing.ok) {
        console.log('Found existing code-tracking repository');
        const data = await existing.json();
        return data.clone_url;
    }

    console.log('Repository not found, creating new one...');
    const createResp = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
            name: 'code-tracking',
            private: false,
            description: 'Auto-generated code tracking repository',
            auto_init: true
        })
    });

    if (!createResp.ok) {
        const details = await createResp.text();
        console.error('Failed to create repository:', details);
        throw new Error(`Failed to create code-tracking repo: ${details}`);
    }

    console.log('Successfully created new repository');
    const repoData = await createResp.json();
    await initializeReadme(username, token);
    return repoData.clone_url;
}

async function initializeReadme(username: string, token: string) {
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
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json'
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
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json'
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
        if (!fs.existsSync(localPath)) {
            console.log('Creating local repository...');
            await fs.promises.mkdir(localPath, { recursive: true });
            await exec(`git init ${localPath}`);
            await exec(`git -C ${localPath} remote add origin ${remoteUrl}`);
        }

        // Configure git user
        await exec(`git -C ${localPath} config user.email || git -C ${localPath} config user.email "code-tracker@example.com"`);
        await exec(`git -C ${localPath} config user.name || git -C ${localPath} config user.name "Code Tracker"`);

        // Get current branch
        const branchName = Config.getBranchName();
        
        try {
            // Check if branch exists locally
            await exec(`git -C ${localPath} rev-parse --verify ${branchName}`);
        } catch {
            // Branch doesn't exist, create it
            console.log(`Creating new branch: ${branchName}`);
            await exec(`git -C ${localPath} checkout -b ${branchName}`);
        }

        try {
            // Try to pull from remote branch if it exists
            await exec(`git -C ${localPath} pull origin ${branchName} --allow-unrelated-histories`);
        } catch (error) {
            console.log(`Remote branch ${branchName} not found or other error:`, error);
            // Continue anyway as the branch might not exist remotely yet
        }

        // Handle README
        const readmeContent = `# Welcome to Code Tracking Repository

This repository contains all your coding activity tracking data that can be reviewed.

## What is this?

This repository is automatically maintained by the VS Code Code Tracking extension. It records your coding activity and commits it periodically, allowing you to:

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

        const readmePath = path.join(localPath, 'README.md');
        
        if (!fs.existsSync(readmePath)) {
            console.log('Creating README.md...');
            fs.writeFileSync(readmePath, readmeContent, 'utf-8');
            try {
                await exec(`git -C ${localPath} add README.md`);
                await exec(`git -C ${localPath} commit -m "Initialize README.md"`);
                await exec(`git -C ${localPath} push origin main`);
                console.log('README.md created and pushed successfully');
            } catch (err) {
                console.error('Failed to commit README:', err);
            }
        }
    } catch (error) {
        console.error('Failed to set up repository:', error);
        throw new Error(`Failed to set up repository: ${error}`);
    }
}

function formatTimestamp(date: Date): string {
    return date.toLocaleString('fr-FR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

export async function commitAndPush(localPath: string, message: string, token: string, remoteUrl: string) {
    try {
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

        await exec(`git -C ${localPath} commit -m "${commitMessage}" || true`);  // || true to handle "nothing to commit" case
        await exec(`git -C ${localPath} push -u origin ${branchName}`);
    } catch (error) {
        console.error('Failed to commit and push changes:', error);
        throw error;
    }
}

function withAuth(url: string, token: string): string {
    return url.replace('https://', `https://${token}@`);
} 