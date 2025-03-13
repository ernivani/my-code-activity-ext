import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { Config } from '../utils/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let githubToken: string | undefined;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Gets the GitHub token from memory or from the config file
 */
export async function getGithubToken(): Promise<string | undefined> {
    if (!githubToken) {
        try {
            const homeDir = os.homedir();
            const tokenPath = path.join(homeDir, '.code-tracking-config', 'github-token.json');
            if (fs.existsSync(tokenPath)) {
                const tokenFile = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
                // Validate the token by attempting to fetch user info
                try {
                    await fetchUserInfo(tokenFile.token);
                    githubToken = tokenFile.token;
                    vscode.window.setStatusBarMessage('GitHub token validated', 3000);
                } catch (error) {
                    console.error('Invalid token in config file:', error);
                    // Clear the invalid token
                    githubToken = undefined;
                    // Attempt to refresh the token
                    await refreshGitHubToken();
                }
            }
        } catch (error) {
            console.error('Error reading github token file:', error);
        }
    }
    return githubToken;
}

/**
 * Attempts to refresh the GitHub token by requesting a new session
 */
async function refreshGitHubToken(): Promise<boolean> {
    try {
        // Request a new session with clearSessionPreference to force a new token
        const session = await vscode.authentication.getSession('github', ['repo'], { 
            createIfNone: true,
            clearSessionPreference: true
        });
        
        if (session) {
            githubToken = session.accessToken;
            await Config.saveGithubToken(session.accessToken);
            vscode.window.setStatusBarMessage(`GitHub token refreshed for ${session.account.label}`, 3000);
            return true;
        }
    } catch (error) {
        console.error('Failed to refresh GitHub token:', error);
    }
    return false;
}

/**
 * Tries to get an existing GitHub session from various sources
 */
export async function tryGetExistingSession(): Promise<vscode.AuthenticationSession | undefined> {
    // First try to get from config file
    const configToken = await getGithubToken();
    if (configToken) {
        try {
            const userInfo = await fetchUserInfo(configToken);
            if (userInfo.login) {
                return {
                    accessToken: configToken,
                    account: { label: userInfo.login, id: userInfo.login },
                    id: userInfo.login,
                    scopes: ['repo']
                };
            }
        } catch (error) {
            console.error('Failed to validate config token:', error);
            // Continue to try other methods
        }
    }

    // If no config token or invalid, try stored token
    const storedToken = await Config.getGithubToken();
    if (storedToken) {
        try {
            githubToken = storedToken;
            const userInfo = await fetchUserInfo(storedToken);
            if (userInfo.login) {
                return {
                    accessToken: storedToken,
                    account: { label: userInfo.login, id: userInfo.login },
                    id: userInfo.login,
                    scopes: ['repo']
                };
            }
        } catch (error) {
            console.error('Failed to validate stored token:', error);
            // Continue to try other methods
        }
    }

    // If no stored token or invalid, try VSCode session
    try {
        const sessions = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
        if (sessions) {
            githubToken = sessions.accessToken;
            await Config.saveGithubToken(sessions.accessToken);
            return sessions;
        }
    } catch (error) {
        console.error('Failed to get VSCode GitHub session:', error);
    }
    
    return undefined;
}

/**
 * Signs in to GitHub with retry logic
 */
export async function signInToGitHub(): Promise<boolean> {
    let attempts = 0;
    let success = false;
    
    while (attempts < MAX_RETRY_ATTEMPTS && !success) {
        try {
            // Use clearSessionPreference on retries to force a new authentication flow
            if (attempts > 0) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                vscode.window.showInformationMessage(`Retrying GitHub sign-in (attempt ${attempts + 1}/${MAX_RETRY_ATTEMPTS})...`);
            }
            
            const session = await vscode.authentication.getSession('github', ['repo'], { 
                createIfNone: true,
                clearSessionPreference: attempts > 0 // Clear preference on retries
            });
            
            if (session) {
                githubToken = session.accessToken;
                await Config.saveGithubToken(session.accessToken);
                
                // Validate the token by making an API call
                try {
                    const userInfo = await fetchUserInfo(session.accessToken);
                    if (userInfo.login) {
                        vscode.window.showInformationMessage(`Signed in as ${session.account.label}`);
                        success = true;
                        return true;
                    }
                } catch (error) {
                    console.error('Token validation failed:', error);
                    // Will retry if attempts remain
                }
            }
        } catch (error) {
            console.error(`Sign-in attempt ${attempts + 1} failed:`, error);
        }
        
        attempts++;
    }
    
    if (!success) {
        vscode.window.showErrorMessage('GitHub login failed after multiple attempts. Please try again later.');
    }
    
    return success;
}

/**
 * Fetches user information from GitHub API with retry logic
 */
export async function fetchUserInfo(token: string): Promise<{ login?: string }> {
    let attempts = 0;
    
    while (attempts < MAX_RETRY_ATTEMPTS) {
        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'VSCode-Code-Tracking-Extension'
                }
            });
            
            if (response.ok) {
                return (await response.json()) as { login?: string };
            } else if (response.status === 401 || response.status === 403) {
                // Token is invalid or expired
                throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
            } else if (response.status === 429) {
                // Rate limited, wait and retry
                const retryAfter = response.headers.get('Retry-After');
                const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAY_MS;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                attempts++;
                continue;
            } else {
                throw new Error(`Failed to fetch user info: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            if (attempts >= MAX_RETRY_ATTEMPTS - 1) {
                throw error;
            }
            
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            attempts++;
        }
    }
    
    throw new Error('Failed to fetch user info after multiple attempts');
} 