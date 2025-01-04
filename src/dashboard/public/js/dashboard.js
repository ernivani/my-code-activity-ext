class Dashboard {
    constructor() {
        this.timeRange = document.getElementById('timeRange');
        this.setupEventListeners();
        this.loadData();
    }

    setupEventListeners() {
        this.timeRange.addEventListener('change', () => this.loadData());
    }

    async loadData() {
        try {
            const response = await fetch('/api/activity');
            const data = await response.json();
            this.updateDashboard(data);
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    updateDashboard(data) {
        this.updateCommitActivity(data.commits);
        this.updateLanguageStats(data.languages);
        this.updateTimeStats(data.timeStats);
    }

    updateCommitActivity(commits) {
        const container = document.querySelector('#commitActivity .chart-container');
        container.innerHTML = '<div class="placeholder">Commit activity visualization coming soon</div>';
    }

    updateLanguageStats(languages) {
        const container = document.querySelector('#languageStats .chart-container');
        container.innerHTML = '<div class="placeholder">Language distribution visualization coming soon</div>';
    }

    updateTimeStats(timeStats) {
        const container = document.querySelector('#timeStats .stats-container');
        container.innerHTML = `
            <div class="stat-item">
                <div class="stat-value">0</div>
                <div class="stat-label">Total Hours</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">0</div>
                <div class="stat-label">Active Days</div>
            </div>
        `;
    }
}

// Initialize dashboard when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
}); 