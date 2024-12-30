# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.0.7   | :white_check_mark: |
| < 0.0.7 | :x:               |

## Reporting a Vulnerability

We take the security of VS Code Activity Extension seriously. If you believe you have found a security vulnerability, please follow these steps:

1. **Do Not** disclose the vulnerability publicly
2. Send a description of the vulnerability to [your-email]
   - Include steps to reproduce
   - Include the version where you found the vulnerability
   - Include any potential solutions if you have them
3. You can expect an initial response within 48 hours
4. Please allow up to 1 week for us to release a fix

## Security Measures

The extension implements the following security measures:

- All activity data is stored locally on your machine
- No data is sent to external servers without explicit user consent
- GitHub authentication is handled securely through VS Code's built-in authentication provider
- No sensitive information is logged

## Best Practices

To ensure the security of your data:

1. Keep your VS Code installation up to date
2. Keep the extension updated to the latest version
3. Review the extension's permissions during installation
4. Do not share your GitHub tokens or credentials

## Third-Party Dependencies

We regularly monitor and update our dependencies to patch any known vulnerabilities. Our dependency security is managed through:

- GitHub's Dependabot alerts
- Regular manual security audits
- npm audit checks

## Acknowledgments

We would like to thank the following individuals who have reported security issues:

[List will be updated as security researchers report issues] 