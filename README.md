# My Code Activity Extension

[![Version](https://img.shields.io/visual-studio-marketplace/v/ernicani.my-code-activity-ext)](https://marketplace.visualstudio.com/items?itemName=ernicani.my-code-activity-ext)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/ernicani.my-code-activity-ext)](https://marketplace.visualstudio.com/items?itemName=ernicani.my-code-activity-ext)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/ernicani.my-code-activity-ext)](https://marketplace.visualstudio.com/items?itemName=ernicani.my-code-activity-ext)

Track your coding activity automatically and build a comprehensive history of your development journey. This VS Code extension seamlessly records your coding sessions and commits them to a GitHub repository, helping you maintain a detailed log of your programming activities.

## ✨ Key Features

- **🔄 Automatic Activity Tracking**

  - Tracks lines of code added/removed
  - Monitors active coding time
  - Records file modifications
  - Creates automatic commits at customizable intervals

- **🤖 AI-Powered Commit Messages**

  - Generate meaningful commit messages using AI
  - Local LLM support via Ollama for privacy
  - Context-aware messages based on code changes
  - Fallback to timestamp format if needed

- **📊 Comprehensive Statistics**

  - Daily activity breakdowns
  - Project-level analytics
  - File type statistics
  - Time distribution analytics

- **🔐 Secure & Private**

  - Secure GitHub authentication
  - Support for custom Git repositories
  - Support for GitHub Enterprise
  - Full control over your data

- **⚡ Easy to Use**
  - One-click GitHub sign-in
  - Simple enable/disable toggle
  - Flexible configuration options
  - Minimal setup needed

## 🚀 Example Usage

Here's an example of the activity summary that gets generated:

# my-code-activity-ext - Activity Summary 

## Overall Statistics

| Stat                   | Value                                |
| ---------------------- | ------------------------------------ |
| **Lines Added** (➕)   | 3,847                               |
| **Lines Removed** (➖) | 1,256                               |
| **Net Change** (↕)    | +2,591                              |
| **Active Time** (⌚)   | 6 hours 45 minutes                  |


## Modified Files
- **src/features/dashboard/components/AnalyticsChart.tsx** (+856, -234)
- **src/api/activityTracker.ts** (+745, -122)
- **src/hooks/useActivityMetrics.ts** (+523, -89)
- **styles/dashboard.scss** (+367, -156)
- **src/utils/dataTransformers.ts** (+312, -45)
- **tests/integration/tracking.test.ts** (+289, -0)
- **src/store/activitySlice.ts** (+278, -167)
- **public/assets/icons/activity.svg** (+156, -98)
- **README.md** (+178, -145)
- **package.json** (+143, -200)

## Visualizations

### By File Type (Lines Changed)

```mermaid
pie showData
title Lines changed by file type
".tsx" : 1090
".ts" : 2147
".scss" : 523
".svg" : 254
".md" : 323
".json" : 343
```

### By Hour (Estimated Activity Count)

```mermaid
pie showData
title Coding activity by hour (count of changes)
"09h" : 450
"10h" : 785
"11h" : 923
"13h" : 654
"14h" : 589
"15h" : 446
```

### Top Languages

| Language    | Percentage |
|------------|------------|
| TypeScript | 62.8%      |
| SCSS       | 15.4%      |
| SVG        | 8.7%       |
| JSON       | 7.2%       |
| Markdown   | 5.9%       |

> **Last Updated:** 30/12/2024 15:45:23

The extension automatically commits these summaries to your GitHub repository, providing a detailed history of your coding activity. You can view these summaries directly on GitHub, and they include:
- Detailed statistics about lines added/removed
- List of modified files with change counts
- Visual charts showing distribution by file type
- Hourly activity breakdowns
- Automatic timestamps for tracking

## 🚀 Getting Started

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ernicani.my-code-activity-ext)
2. Open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Run `Sign in with GitHub` to authenticate
4. Start coding! The extension will automatically track your activity

## ⚙️ Configuration

Access settings through VS Code's settings (Ctrl+,):

\`\`\`json
{
"codeTracker.commitInterval": 5,          // Minutes between activity commits (default: 5)
"codeTracker.customRemoteUrl": "",        // Custom Git remote URL (optional)
"codeTracker.branchName": "main",         // Git branch name for tracking data
"codeTracker.enableAiCommits": false,     // Enable AI-generated commit messages
"codeTracker.ollamaUrl": "localhost:11434", // Ollama server URL
"codeTracker.ollamaModel": "codellama"    // Ollama model for commit messages
}
\`\`\`

### AI Commit Messages

The extension can generate meaningful commit messages using AI:

1. Install [Ollama](https://ollama.ai/) on your system
2. Pull the codellama model: `ollama pull codellama`
3. Enable AI commits in VS Code settings
4. The extension will now generate context-aware commit messages

Example AI-generated commit message:
```
feat(tracking): update dashboard components and analytics

- Modified functions: updateChartData, calculateMetrics
- Files: AnalyticsChart.tsx, activityTracker.ts
- Activity duration: 15 minutes
```

### Custom Git Repository

You can use your own Git repository:

1. Create a repository (GitHub, GitHub Enterprise, or any Git server)
2. Set the `customRemoteUrl` in settings to your repository URL
3. Configure the branch name if needed
4. The extension will use your repository for activity tracking

## 📋 Available Commands

- `Sign in with GitHub`: Connect your GitHub account
- `Toggle Code Tracking`: Enable/disable activity tracking

## 📊 Activity Tracking Details

The extension tracks:

- Lines of code added/removed
- Active coding time (excluding idle periods)
- File modifications with timestamps
- Project-specific statistics
- Language and file type analytics

## 🔧 System Requirements

- VS Code 1.75.0 or higher
- Git installed on your system
- GitHub account (or custom Git repository)
- Internet connection for syncing
- Ollama (optional, for AI commit messages)

## 🤝 Contributing

Contributions are welcome! Feel free to:

- Submit bug reports
- Propose new features
- Create pull requests

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ernicani.my-code-activity-ext)
- [GitHub Repository](https://github.com/ernivani/my-code-activity-ext)
- [Issue Tracker](https://github.com/ernivani/my-code-activity-ext/issues)

---

**Note**: Your activity data is stored in a Git repository that you control. The extension never shares your coding activity without your explicit permission.
