# My Code Activity Extension

[![Version](https://img.shields.io/visual-studio-marketplace/v/ernicani.my-code-activity-ext)](https://marketplace.visualstudio.com/items?itemName=ernicani.my-code-activity-ext)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/ernicani.my-code-activity-ext)](https://marketplace.visualstudio.com/items?itemName=ernicani.my-code-activity-ext)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/ernicani.my-code-activity-ext)](https://marketplace.visualstudio.com/items?itemName=ernicani.my-code-activity-ext)

Track your coding activity automatically and build a comprehensive history of your development journey. This VS Code extension seamlessly records your coding sessions and commits them to a private GitHub repository, helping you maintain a detailed log of your programming activities.

## ✨ Key Features

- **🔄 Automatic Activity Tracking**
  - Tracks lines of code added/removed
  - Monitors active coding time
  - Records file modifications
  - Creates automatic commits at customizable intervals

- **📊 Comprehensive Statistics**
  - Daily activity breakdowns
  - Project-level analytics
  - File type statistics
  - Time distribution analytics

- **🔐 Secure & Private**
  - Secure GitHub authentication
  - Private repository storage
  - Full control over your data

- **⚡ Easy to Use**
  - One-click GitHub sign-in
  - Simple enable/disable toggle
  - Minimal configuration needed

## 🚀 Getting Started

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ernicani.my-code-activity-ext)
2. Open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Run `Sign in with GitHub` to authenticate
4. Start coding! The extension will automatically track your activity

## ⚙️ Configuration

Access settings through VS Code's settings (Ctrl+,):

\`\`\`json
{
  "codeTracker.commitInterval": 5 // Minutes between activity commits (default: 5)
}
\`\`\`

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
- GitHub account
- Internet connection for syncing

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

**Note**: Your activity data is stored in a private GitHub repository that only you can access. The extension never shares your coding activity without your explicit permission. 