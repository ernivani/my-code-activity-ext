const vscode = {
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn(),
            update: jest.fn()
        })
    },
    ExtensionContext: jest.fn(),
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        createStatusBarItem: jest.fn().mockReturnValue({
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        })
    }
};

module.exports = vscode; 