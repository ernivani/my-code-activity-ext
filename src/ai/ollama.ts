import fetch from 'node-fetch';
import * as vscode from 'vscode';
import { Config } from '../utils/config';

interface OllamaResponse {
    response: string;
    done: boolean;
}

export class OllamaService {
    private static instance: OllamaService;
    private baseUrl: string;

    private constructor() {
        this.baseUrl = Config.getOllamaUrl();
    }

    public static getInstance(): OllamaService {
        if (!OllamaService.instance) {
            OllamaService.instance = new OllamaService();
        }
        return OllamaService.instance;
    }

    public async generateCommitMessage(diff: string, files: string[]): Promise<string> {
        try {
            const model = Config.getOllamaModel();
            const prompt = this.createPrompt(diff, files);

            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    prompt,
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to generate commit message: ${response.statusText}`);
            }

            const data = await response.json() as OllamaResponse;
            return this.formatCommitMessage(data.response);
        } catch (error) {
            console.error('Error generating commit message:', error);
            return this.generateFallbackMessage(files);
        }
    }

    private createPrompt(diff: string, files: string[]): string {
        return `Generate a concise commit message based on the following git diff and modified files.
Focus on the main changes and affected functionality.
Format the message as follows:
type(scope): brief summary

- Modified functions: list of changed functions
- Files changed: list of files
- Activity duration: X minutes

Git diff:
${diff}

Modified files:
${files.join(', ')}

Keep the message clear and descriptive, focusing on WHAT changed and WHY.
Use conventional commit types (feat, fix, refactor, etc.).`;
    }

    private formatCommitMessage(aiResponse: string): string {
        // Clean up and format the AI response
        // Remove any extra whitespace or unwanted characters
        return aiResponse.trim()
            .replace(/[\r\n]+/g, '\n')
            .replace(/\n\s+/g, '\n')
            .replace(/^\s+|\s+$/gm, '');
    }

    private generateFallbackMessage(files: string[]): string {
        const timestamp = new Date().toLocaleString();
        return `chore(tracking): Update activity log

- Files changed: ${files.join(', ')}
- Timestamp: ${timestamp}`;
    }
} 