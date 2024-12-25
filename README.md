# My Code Activity Extension

A VS Code extension that automatically tracks your coding activity and commits it to GitHub. This extension helps developers maintain a record of their coding sessions by automatically creating commits at specified intervals.

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
git clone https://github.com/thomaslindeker/my-code-activity-ext.git
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

### Available Scripts
- `npm run compile`: Compile the TypeScript code
- `npm run watch`: Watch for changes and recompile
- `npm run lint`: Run ESLint
- `npm run clean`: Clean the build output

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 