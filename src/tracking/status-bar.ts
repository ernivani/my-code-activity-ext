import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../utils/config';
import { getTotalActiveTime } from './activity';

function formatTimestamp(date: Date): string {
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private activationTime: Date;
    private activationTimeFile: string;
    private currentDate: string;

    constructor() {
        this.activationTime = new Date();
        this.currentDate = new Date().toLocaleDateString('en-CA');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.text = "Code Tracking: Starting...";
        this.statusBarItem.show();

        // Set up the path for storing activation time
        this.activationTimeFile = this.getActivationTimeFilePath();
        this.loadActivationTime();
    }

    private getActivationTimeFilePath(): string {
        return path.join(Config.TRACKING_REPO_PATH, this.currentDate, 'activation_time.json');
    }

    private async loadActivationTime() {
        try {
            await fs.promises.mkdir(path.dirname(this.activationTimeFile), { recursive: true });

            try {
                const data = await fs.promises.readFile(this.activationTimeFile, 'utf-8');
                const { activationTime } = JSON.parse(data);
                const savedDate = new Date(activationTime);
                
                // Only use saved time if it's from today
                if (savedDate.toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')) {
                    this.activationTime = savedDate;
                }
            } catch (error) {
                await this.saveActivationTime();
            }
        } catch (error) {
            console.error('Error loading activation time:', error);
        }
    }

    private async saveActivationTime() {
        try {
            await fs.promises.mkdir(path.dirname(this.activationTimeFile), { recursive: true });
            await fs.promises.writeFile(
                this.activationTimeFile,
                JSON.stringify({ activationTime: this.activationTime.toISOString() }),
                'utf-8'
            );
        } catch (error) {
            console.error('Error saving activation time:', error);
        }
    }

    public startUpdateInterval() {
        setInterval(() => this.update(), 60000);
        this.update();
    }

    public async update(isLoggedIn: boolean = false) {
        const now = new Date();
        const newDate = now.toLocaleDateString('en-CA');

        // Check if day has changed
        if (this.currentDate !== newDate) {
            this.currentDate = newDate;
            this.activationTime = now;
            this.activationTimeFile = this.getActivationTimeFilePath();
            await this.saveActivationTime();
        }

        const minutes = await getTotalActiveTime();
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        
        let timeText = '';
        if (hours > 0) {
            timeText = `${hours}h ${remainingMinutes}m`;
        } else {
            timeText = `${remainingMinutes}m`;
        }
        
        const loginStatus = isLoggedIn ? '$(check)' : '$(x)';
        this.statusBarItem.text = `${loginStatus} Code Tracking: ${timeText}`;
        this.statusBarItem.tooltip = `Total active coding time today\n${isLoggedIn ? 'Connected to GitHub' : 'Not connected to GitHub'}`;
    }

    public dispose() {
        this.statusBarItem.dispose();
    }
} 