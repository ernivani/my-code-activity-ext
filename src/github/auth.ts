import * as vscode from 'vscode';
import fetch from 'node-fetch';
import { Config } from '../utils/config';

let githubToken: string | undefined;

export function getGithubToken(): string | undefined {
    return githubToken;
}

export async function tryGetExistingSession(): Promise<vscode.AuthenticationSession | undefined> {
    // First try to get from stored token
    const storedToken = await Config.getGithubToken();
    if (storedToken) {
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
    }

    // If no stored token or invalid, try VSCode session
    const sessions = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
    if (sessions) {
        githubToken = sessions.accessToken;
        await Config.saveGithubToken(sessions.accessToken);
    }
    return sessions ?? undefined;
}

export async function signInToGitHub(): Promise<boolean> {
    try {
        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
        if (session) {
            githubToken = session.accessToken;
            await Config.saveGithubToken(session.accessToken);
            vscode.window.showInformationMessage(`Signed in as ${session.account.label}`);
            return true;
        }
    } catch (error) {
        console.error('Failed to sign in:', error);
        vscode.window.showErrorMessage('GitHub login failed. Please try again.');
    }
    return false;
}

export async function fetchUserInfo(token: string): Promise<{ login?: string }> {
    const response = await fetch('https://api.github.com/user', {
        headers: {
            Authorization: `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as { login?: string };
} 