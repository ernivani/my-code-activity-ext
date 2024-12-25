import * as vscode from 'vscode';

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

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private activationTime: Date;

    constructor() {
        this.activationTime = new Date();
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.text = "Code Tracking: Starting...";
        this.statusBarItem.show();
    }

    public startUpdateInterval() {
        setInterval(() => this.update(), 60000);
        this.update();
    }

    public update(isLoggedIn: boolean = false) {
        const now = new Date();
        const elapsedMs = now.getTime() - this.activationTime.getTime();
        const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
        const minutes = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
        
        let timeText = '';
        if (hours > 0) {
            timeText = `${hours}h ${minutes}m`;
        } else {
            timeText = `${minutes}m`;
        }
        
        const loginStatus = isLoggedIn ? '$(check)' : '$(x)';
        this.statusBarItem.text = `${loginStatus} Code Tracking: ${timeText}`;
        this.statusBarItem.tooltip = `Tracking since ${formatTimestamp(this.activationTime)}\n${isLoggedIn ? 'Connected to GitHub' : 'Not connected to GitHub'}`;
    }

    public dispose() {
        this.statusBarItem.dispose();
    }
} 