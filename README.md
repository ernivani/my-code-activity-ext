# My Code Activity Extension

A VS Code extension that automatically tracks your coding activity and commits it to GitHub. This extension helps developers maintain a record of their coding sessions by automatically creating commits at specified intervals.

## Global Statistics

This extension tracks and provides detailed statistics about your coding activity:

### Activity Metrics
- **Lines of Code**: Tracks added and removed lines across all files
- **Active Time**: Measures your actual coding time (excluding idle periods > 5 minutes)
- **File Changes**: Records every file modification with timestamps

### Daily Breakdown
- Detailed daily activity logs organized by project
- Hourly activity distribution
- File type statistics with visualizations

### Project-Level Analytics
- Per-project statistics including:
  - Total lines added/removed
  - Net code changes
  - Active coding time
  - Modified files list
- Visual representations using Mermaid charts for:
  - Code changes by file type
  - Activity distribution by hour

## Features

- 🔄 Automatic tracking of coding activity
- ⏱️ Configurable commit intervals
- 🔐 Secure GitHub authentication
- 🎯 Easy to enable/disable tracking

## Installation

1. Download the `.vsix` file from the latest release
2. Open VS Code
3. Go to the Extensions view (Ctrl+Shift+X)
4. Click on the "..." menu in the top-right
5. Select "Install from VSIX..." and choose the downloaded file

## Usage

1. After installation, use the command palette (Ctrl+Shift+P) to:
   - Sign in with GitHub using `Sign in with GitHub`
   - Toggle tracking with `Toggle Code Tracking`

2. Configure the commit interval in VS Code settings:
   ```json
   {
     "codeTracker.commitInterval": 1 // Interval in minutes between commits
   }
   ```

## Requirements

- VS Code version 1.75.0 or higher
- GitHub account for authentication
- Git installed on your system

## Extension Settings

This extension contributes the following settings:

* `codeTracker.commitInterval`: Set the interval (in minutes) between activity commits

## Commands

- `codeTracker.signInWithGitHub`: Authenticate with your GitHub account
- `codeTracker.toggleTracking`: Enable or disable code activity tracking

## Development

### Prerequisites
- Node.js
- npm

### Setup
1. Clone the repository
```bash
git clone https://github.com/ernivani/my-code-activity-ext.git
cd my-code-activity-ext
```

2. Install dependencies
```bash
npm install
```

3. Build the extension
```bash
npm run compile
```

4. Package the extension
```bash
vsce package
```

5. Install the extension
```bash
code --install-extension my-code-activity-ext-0.0.1.vsix
```

### Available Scripts
- `npm run compile`: Compile the TypeScript code
- `npm run watch`: Watch for changes and recompile
- `npm run lint`: Run ESLint
- `npm run clean`: Clean the build output

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 