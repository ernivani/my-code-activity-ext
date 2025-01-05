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
          statusBar.update(true);
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
        statusBar.update(true);
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
    statusBar.update(false);
    if (await signInToGitHub()) {
      outputChannel.appendLine("Successfully signed in to GitHub");
      statusBar.update(true);
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
  
  try {
    // Get token and check if it's a custom token
    const { token, isCustom } = await Config.getToken();
    if (!token) {
      outputChannel.appendLine("No token found");
      vscode.window.showWarningMessage("Please set up a token first.");
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
      const userInfo = await fetchUserInfo(token);
      if (!userInfo.login) {
        outputChannel.appendLine("Failed to get GitHub username");
        vscode.window.showErrorMessage("Could not determine GitHub username.");
        return;
      }
      outputChannel.appendLine(`GitHub username: ${userInfo.login}`);

      outputChannel.appendLine("Ensuring code-tracking repository exists...");
      remoteUrl = await ensureCodeTrackingRepo(token, userInfo.login);
    }

    REMOTE_REPO_HTTPS_URL = remoteUrl;
    outputChannel.appendLine("Remote repository URL is configured");

    outputChannel.appendLine(
      `Setting up local repository at ${Config.TRACKING_REPO_PATH}...`,
    );
    await ensureLocalRepo(
      Config.TRACKING_REPO_PATH,
      remoteUrl,
      token,
    );
    outputChannel.appendLine("Local repository is ready");

    outputChannel.appendLine("Creating daily directory...");
    await ensureDailyDirectory(Config.TRACKING_REPO_PATH);
    outputChannel.appendLine("Daily directory is ready");

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
    }, Config.getCommitIntervalMs());

    context.subscriptions.push({
      dispose: () => {
        clearInterval(timer);
        outputChannel.appendLine("Auto-commit timer stopped");
      },
    });

    outputChannel.appendLine("Code tracking setup complete");
  } catch (error) {
    outputChannel.appendLine(`Error during setup: ${error}`);
    vscode.window.showErrorMessage(`Failed to set up code tracking: ${error}`);
  }
}
