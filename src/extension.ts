import * as vscode from "vscode";
import {
  signInToGitHub,
  tryGetExistingSession,
  fetchUserInfo,
} from "./github/auth";
import {
  ensureCodeTrackingRepo,
  ensureLocalRepo,
  commitAndPush,
} from "./github/repository";
import {
  trackChanges,
  createActivityLog,
  createSummary,
  ensureDailyDirectory,
} from "./tracking/activity";
import { StatusBarManager } from "./tracking/status-bar";
import { Config } from "./utils/config";
import { DashboardServer } from "./dashboard/server";
import * as fs from "fs";

let REMOTE_REPO_HTTPS_URL: string | undefined;

let outputChannel: vscode.OutputChannel;

let dashboardServer: DashboardServer | null = null;

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Code Tracking");

  const statusBar = new StatusBarManager();
  context.subscriptions.push(statusBar);
  statusBar.startUpdateInterval();

  const signInCommand = vscode.commands.registerCommand(
    "codeTracker.signInWithGitHub",
    async () => {
      outputChannel.appendLine("Attempting GitHub sign in...");
      if (await signInToGitHub()) {
        outputChannel.appendLine("Successfully signed in to GitHub");
        statusBar.update();
        await setupCodeTracking(context);
      } else {
        outputChannel.appendLine("Failed to sign in to GitHub");
        statusBar.update();
      }
    },
  );
  context.subscriptions.push(signInCommand);

  // Add custom token command
  const setCustomTokenCommand = vscode.commands.registerCommand(
    "codeTracker.setCustomToken",
    async () => {
      const token = await vscode.window.showInputBox({
        prompt: "Enter your custom token",
        password: true,
        placeHolder: "Your custom token"
      });

      if (token) {
        try {
          await Config.saveToken(token, true);
          outputChannel.appendLine("Custom token saved successfully");
          statusBar.update();
          await setupCodeTracking(context);
          vscode.window.showInformationMessage("Custom token set successfully");
        } catch (error) {
          outputChannel.appendLine(`Failed to save custom token: ${error}`);
          vscode.window.showErrorMessage(`Failed to save custom token: ${error}`);
        }
      }
    }
  );
  context.subscriptions.push(setCustomTokenCommand);

  // Add force push command
  const forcePushCommand = vscode.commands.registerCommand(
    "codeTracker.forcePush",
    async () => {
      outputChannel.appendLine("Force pushing code tracking data...");
      const { token } = await Config.getToken();
      if (token && REMOTE_REPO_HTTPS_URL) {
        try {
          await createActivityLog(Config.TRACKING_REPO_PATH);
          const summary = await createSummary();
          await commitAndPush(
            Config.TRACKING_REPO_PATH,
            summary,
            token,
            REMOTE_REPO_HTTPS_URL
          );
          vscode.window.showInformationMessage("Successfully force pushed code tracking data");
          outputChannel.appendLine("Force push completed successfully");
        } catch (error) {
          outputChannel.appendLine(`Force push failed: ${error}`);
          vscode.window.showErrorMessage(`Failed to push code tracking data: ${error}`);
        }
      } else {
        vscode.window.showErrorMessage("Please set up a token first to push code tracking data");
      }
    }
  );
  context.subscriptions.push(forcePushCommand);

  const openDashboard = vscode.commands.registerCommand('codeTracker.openDashboard', async () => {
    try {
      if (!dashboardServer) {
        dashboardServer = new DashboardServer();
        await dashboardServer.start();
      }
      vscode.env.openExternal(vscode.Uri.parse('http://localhost:5556'));
    } catch (error: unknown) {
      vscode.window.showErrorMessage('Failed to open dashboard: ' + (error instanceof Error ? error.message : String(error)));
    }
  });

  context.subscriptions.push(openDashboard);

  // First check for stored token
  outputChannel.appendLine("Checking for stored GitHub token...");
  const storedToken = await Config.getGithubToken();
  if (storedToken) {
    outputChannel.appendLine("Found stored token, validating...");
    try {
      const userInfo = await fetchUserInfo(storedToken);
      if (userInfo.login) {
        outputChannel.appendLine(
          `Valid token found for user: ${userInfo.login}`,
        );
        vscode.window.showInformationMessage(
          `Auto-signed in as ${userInfo.login}`,
        );
        statusBar.update();
        await setupCodeTracking(context);
        return;
      }
    } catch (error) {
      outputChannel.appendLine(
        "Stored token is invalid, will try other authentication methods",
      );
    }
  }

  // Only try GitHub session if no valid token or custom URL exists
  outputChannel.appendLine("Checking for existing GitHub session...");
  const session = await tryGetExistingSession();
  if (session) {
    outputChannel.appendLine(
      `Found existing session for user: ${session.account.label}`,
    );
    statusBar.update();
    await setupCodeTracking(context);
  } else {
    outputChannel.appendLine(
      "No existing GitHub session found. Please sign in or set a custom token.",
    );
    statusBar.update();
    if (await signInToGitHub()) {
      outputChannel.appendLine("Successfully signed in to GitHub");
      statusBar.update();
      await setupCodeTracking(context);
    } else {
      vscode.window
        .showInformationMessage(
          "Please sign in with GitHub for code tracking.",
          "Sign In",
        )
        .then((choice) => {
          if (choice === "Sign In") {
            vscode.commands.executeCommand("codeTracker.signInWithGitHub");
          }
        });
    }
  }
  
}

export async function deactivate() {
  outputChannel.appendLine("Code Tracking Extension is shutting down...");
  outputChannel.appendLine(`Time: ${new Date().toLocaleString()}`);
  
  // Push any remaining changes before deactivating
  const { token } = await Config.getToken();
  if (token && REMOTE_REPO_HTTPS_URL) {
    outputChannel.appendLine("Pushing final changes before shutdown...");
    createActivityLog(Config.TRACKING_REPO_PATH)
      .then(() => createSummary())
      .then(summary => {
        if (!REMOTE_REPO_HTTPS_URL) {
          throw new Error('Remote URL is not configured');
        }
        return commitAndPush(
          Config.TRACKING_REPO_PATH,
          summary,
          token,
          REMOTE_REPO_HTTPS_URL
        );
      })
      .then(() => outputChannel.appendLine("Final push completed successfully"))
      .catch(error => outputChannel.appendLine(`Final push failed: ${error}`));
  }

  if (dashboardServer) {
    return dashboardServer.stop();
  }
  return Promise.resolve();
}

async function setupCodeTracking(context: vscode.ExtensionContext) {
  outputChannel.appendLine("Setting up code tracking...");
  
  // Track setup attempts to prevent infinite loops
  const setupAttemptKey = 'codeTracker.setupAttempts';
  const setupAttempts = context.globalState.get(setupAttemptKey, 0) as number;
  
  // Reset attempts if it's been more than 24 hours since the last attempt
  const lastSetupTimestampKey = 'codeTracker.lastSetupTimestamp';
  const lastSetupTimestamp = context.globalState.get(lastSetupTimestampKey, 0) as number;
  const now = Date.now();
  
  if (now - lastSetupTimestamp > 24 * 60 * 60 * 1000) {
    // Reset if more than 24 hours
    await context.globalState.update(setupAttemptKey, 0);
    await context.globalState.update(lastSetupTimestampKey, now);
  } else if (setupAttempts >= 3) {
    // If we've tried 3 times in the last 24 hours, wait before trying again
    outputChannel.appendLine(`Setup has been attempted ${setupAttempts} times in the last 24 hours. Waiting before trying again.`);
    vscode.window.showWarningMessage(
      'Multiple setup attempts detected. Please try signing out and signing in again.',
      'Sign Out and In'
    ).then(selection => {
      if (selection === 'Sign Out and In') {
        vscode.commands.executeCommand('codeTracker.signInWithGitHub');
      }
    });
    return;
  }
  
  // Update attempt counter
  await context.globalState.update(setupAttemptKey, setupAttempts + 1);
  await context.globalState.update(lastSetupTimestampKey, now);
  
  try {
    // Get token and check if it's a custom token
    const { token, isCustom } = await Config.getToken();
    if (!token) {
      outputChannel.appendLine("No token found");
      vscode.window.showWarningMessage(
        "Please set up a token first.",
        "Sign in with GitHub"
      ).then(selection => {
        if (selection === "Sign in with GitHub") {
          vscode.commands.executeCommand('codeTracker.signInWithGitHub');
        }
      });
      return;
    }

    let remoteUrl: string;
    if (isCustom) {
      // For custom tokens, we must have a custom remote URL
      const customUrl = Config.getCustomRemoteUrl();
      if (!customUrl) {
        outputChannel.appendLine("No custom remote URL configured");
        vscode.window.showErrorMessage("Please configure a custom remote URL in settings (codeTracker.customRemoteUrl).");
        return;
      }
      remoteUrl = customUrl;
      outputChannel.appendLine(`Using custom remote URL: ${customUrl}`);
    } else {
      // For GitHub tokens, get user info and ensure repo exists
      outputChannel.appendLine("Using GitHub token, fetching user info...");
      let userInfo;
      try {
        userInfo = await fetchUserInfo(token);
        if (!userInfo.login) {
          throw new Error("No login information returned");
        }
      } catch (error) {
        outputChannel.appendLine(`Failed to get GitHub username: ${error}`);
        vscode.window.showErrorMessage(
          "Could not validate GitHub credentials. Would you like to try signing in again?",
          "Sign in Again"
        ).then(selection => {
          if (selection === "Sign in Again") {
            vscode.commands.executeCommand('codeTracker.signInWithGitHub');
          }
        });
        return;
      }
      
      outputChannel.appendLine(`GitHub username: ${userInfo.login}`);

      outputChannel.appendLine("Ensuring code-tracking repository exists...");
      try {
        remoteUrl = await ensureCodeTrackingRepo(token, userInfo.login);
      } catch (error) {
        outputChannel.appendLine(`Failed to ensure code tracking repository: ${error}`);
        vscode.window.showErrorMessage(
          "Failed to set up code tracking repository. Would you like to try again?",
          "Try Again"
        ).then(selection => {
          if (selection === "Try Again") {
            setupCodeTracking(context);
          }
        });
        return;
      }
    }

    REMOTE_REPO_HTTPS_URL = remoteUrl;
    outputChannel.appendLine("Remote repository URL is configured");

    outputChannel.appendLine(
      `Setting up local repository at ${Config.TRACKING_REPO_PATH}...`,
    );
    
    try {
      await ensureLocalRepo(
        Config.TRACKING_REPO_PATH,
        remoteUrl,
        token,
      );
      outputChannel.appendLine("Local repository is ready");
    } catch (error) {
      outputChannel.appendLine(`Failed to set up local repository: ${error}`);
      
      // Check if the directory exists but might be corrupted
      if (fs.existsSync(Config.TRACKING_REPO_PATH)) {
        const backupDir = `${Config.TRACKING_REPO_PATH}_backup_${Date.now()}`;
        outputChannel.appendLine(`Attempting to backup and recreate local repository...`);
        
        try {
          // Rename the existing directory to a backup
          fs.renameSync(Config.TRACKING_REPO_PATH, backupDir);
          outputChannel.appendLine(`Backed up existing repository to ${backupDir}`);
          
          // Try again with a fresh directory
          await ensureLocalRepo(
            Config.TRACKING_REPO_PATH,
            remoteUrl,
            token,
          );
          outputChannel.appendLine("Local repository recreated successfully");
        } catch (backupError) {
          outputChannel.appendLine(`Failed to backup and recreate repository: ${backupError}`);
          vscode.window.showErrorMessage("Failed to set up local repository. Please restart VS Code and try again.");
          return;
        }
      } else {
        vscode.window.showErrorMessage("Failed to set up local repository. Please restart VS Code and try again.");
        return;
      }
    }

    outputChannel.appendLine("Creating daily directory...");
    try {
      await ensureDailyDirectory(Config.TRACKING_REPO_PATH);
      outputChannel.appendLine("Daily directory is ready");
    } catch (error) {
      outputChannel.appendLine(`Failed to create daily directory: ${error}`);
      // This is not critical, we can continue
    }

    outputChannel.appendLine("Starting file change tracking...");
    const changeDisposable = vscode.workspace.onDidChangeTextDocument(
      (event) => {
        trackChanges(event.document.fileName);
      },
    );
    context.subscriptions.push(changeDisposable);

    outputChannel.appendLine(
      `Setting up auto-commit timer (interval: ${Config.getCommitIntervalMs()}ms)...`,
    );
    const timer = setInterval(async () => {
      try {
        const { token } = await Config.getToken();
        if (token && REMOTE_REPO_HTTPS_URL) {
          outputChannel.appendLine("Creating activity log...");
          await createActivityLog(Config.TRACKING_REPO_PATH);
          const summary = await createSummary();
          outputChannel.appendLine("Committing and pushing changes...");
          await commitAndPush(
            Config.TRACKING_REPO_PATH,
            summary,
            token,
            REMOTE_REPO_HTTPS_URL
          );
        }
      } catch (error) {
        outputChannel.appendLine(`Auto-commit error: ${error}`);
        // Don't show error message for auto-commits to avoid spamming the user
      }
    }, Config.getCommitIntervalMs());

    context.subscriptions.push({
      dispose: () => {
        clearInterval(timer);
        outputChannel.appendLine("Auto-commit timer stopped");
      },
    });

    // Reset setup attempts on successful setup
    await context.globalState.update(setupAttemptKey, 0);
    outputChannel.appendLine("Code tracking setup complete");
    
    // Show success message to the user
    vscode.window.showInformationMessage("Code tracking setup complete. Your coding activity is now being tracked.");
  } catch (error) {
    outputChannel.appendLine(`Error during setup: ${error}`);
    vscode.window.showErrorMessage(`Failed to set up code tracking: ${error}`);
  }
}
