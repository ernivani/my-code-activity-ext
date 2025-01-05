# Contributing to My Code Activity Extension

Thank you for your interest in contributing to My Code Activity Extension! This document provides guidelines and steps for contributing to the project.

## Development Setup

1. **Prerequisites**
   - Node.js (latest LTS version)
   - VS Code (v1.75.0 or higher)
   - Git
   - Ollama (optional, for AI features)

2. **Local Development**
   ```bash
   # Clone the repository
   git clone https://github.com/ernivani/my-code-activity-ext.git
   cd my-code-activity-ext

   # Install dependencies
   npm install

   # Start the compilation in watch mode
   npm run watch

   # Or for a one-time build
   npm run compile
   ```

3. **Available Scripts**
   ```bash
   # Run tests
   npm run test

   # Lint the code
   npm run lint

   # Format code with Prettier
   npm run pretty

   # Clean build output
   npm run clean

   # Prepare for VS Code publishing
   npm run vscode:prepublish
   # or
   vsce package

   # Install the extension in VS Code
   code --install-extension my-code-activity-ext-*.vsix | sort -V | tail -n 1
   ```

## Development Workflow

1. **Create a new branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Commit Guidelines**
   - Use conventional commits format:
     - `feat:` for new features
     - `fix:` for bug fixes
     - `docs:` for documentation changes
     - `test:` for test changes
     - `refactor:` for code refactoring
     - `style:` for code style changes
     - `chore:` for other changes

3. **Code Style**
   - Follow TypeScript best practices
   - Use ESLint and Prettier for code formatting
   - Maintain existing code style
   - Add comments for complex logic
   - Update tests when modifying features

## Extension Development

1. **Configuration Settings**
   The extension supports the following settings:
   - `codeTracker.commitInterval`: Interval in minutes between activity commits (default: 5)
   - `codeTracker.customRemoteUrl`: Custom Git remote URL
   - `codeTracker.branchName`: Git branch name for tracking data (default: "main")
   - `codeTracker.enableAiCommits`: Enable AI-generated commit messages
   - `codeTracker.ollamaUrl`: Ollama server URL (default: "http://localhost:11434")
   - `codeTracker.ollamaModel`: Ollama model for commit messages (default: "codellama")

2. **Commands**
   The extension provides these commands:
   - `codeTracker.signInWithGitHub`: Sign in with GitHub
   - `codeTracker.toggleTracking`: Toggle code tracking
   - `codeTracker.forcePush`: Force push code tracking data

## Testing

- Write unit tests using Jest
- Run tests with `npm test`
- Tests are automatically run before publishing
- Update test files in `src/__tests__` directory

## Pull Request Process

1. **Before Submitting**
   - Ensure all tests pass (`npm test`)
   - Run linting (`npm run lint`)
   - Format code (`npm run pretty`)
   - Update documentation if needed
   - Add tests for new features

2. **PR Description**
   - Clearly describe the changes
   - Reference related issues
   - List any breaking changes
   - Include screenshots for UI changes

3. **Review Process**
   - PRs require at least one review
   - Address review comments
   - Keep PR scope focused

## Feature Requests and Bug Reports

- Use the GitHub issue templates
- Provide clear reproduction steps for bugs
- Include VS Code and extension versions
- Attach relevant logs or screenshots

## Documentation

- Update README.md for new features
- Add JSDoc comments for new functions
- Update configuration documentation
- Include examples where appropriate

## Community

- Be respectful and inclusive
- Follow the Code of Conduct
- Help others in discussions
- Share knowledge and improvements

## Questions?

Feel free to:
- Open an issue for questions
- Join discussions
- Reach out to maintainers

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.