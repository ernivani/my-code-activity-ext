import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export class Config {
    private static readonly CONFIG_DIR = path.join(os.homedir(), '.code-tracking-config');
    private static readonly TOKEN_FILE = path.join(Config.CONFIG_DIR, 'github-token.json');
    public static readonly TRACKING_REPO_PATH = path.join(os.homedir(), '.code-tracking');

    public static async saveToken(token: string, isCustom: boolean = false): Promise<void> {
        try {
            await fs.promises.mkdir(Config.CONFIG_DIR, { recursive: true });
            await fs.promises.writeFile(Config.TOKEN_FILE, JSON.stringify({ 
                token,
                isCustom
            }, null, 2), 'utf-8');
        } catch (error) {
            console.error('Failed to save token:', error);
            throw error;
        }
    }

    public static async getToken(): Promise<{ token: string | null, isCustom: boolean }> {
        try {
            const data = await fs.promises.readFile(Config.TOKEN_FILE, 'utf-8');
            const { token, isCustom = false } = JSON.parse(data);
            return { token, isCustom };
        } catch {
            return { token: null, isCustom: false };
        }
    }

    public static async saveGithubToken(token: string): Promise<void> {
        return Config.saveToken(token, false);
    }

    public static async getGithubToken(): Promise<string | null> {
        const { token, isCustom } = await Config.getToken();
        return isCustom ? null : token;
    }

    public static getCommitIntervalMs(): number {
        const config = vscode.workspace.getConfiguration('codeTracker');
        return (config.get<number>('commitInterval') || 5) * 60_000;
    }

    public static getCustomRemoteUrl(): string | undefined {
        const config = vscode.workspace.getConfiguration('codeTracker');
        return config.get<string>('customRemoteUrl');
    }

    public static getBranchName(): string {
        const config = vscode.workspace.getConfiguration('codeTracker');
        return config.get<string>('branchName') || 'main';
    }

    public static getOllamaUrl(): string {
        const config = vscode.workspace.getConfiguration('codeTracker');
        return config.get<string>('ollamaUrl') || 'http://localhost:11434';
    }

    public static getOllamaModel(): string {
        const config = vscode.workspace.getConfiguration('codeTracker');
        return config.get<string>('ollamaModel') || 'codellama';
    }

    public static isAiCommitEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('codeTracker');
        return config.get<boolean>('enableAiCommits') || false;
    }
} 