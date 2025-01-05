import * as vscode from "vscode";
import {
  getGithubToken,
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

  // Add force push command
  const forcePushCommand = vscode.commands.registerCommand(
    "codeTracker.forcePush",
    async () => {
      outputChannel.appendLine("Force pushing code tracking data...");
      const currentToken = await getGithubToken();
      if (currentToken && REMOTE_REPO_HTTPS_URL) {
        try {
          await createActivityLog(Config.TRACKING_REPO_PATH);
          const summary = await createSummary();
          await commitAndPush(
            Config.TRACKING_REPO_PATH,
            summary,
            currentToken,
            REMOTE_REPO_HTTPS_URL as string
          );
          vscode.window.showInformationMessage("Successfully pushed code tracking data");
          outputChannel.appendLine("Force push completed successfully");
        } catch (error) {
          outputChannel.appendLine(`Force push failed: ${error}`);
          vscode.window.showErrorMessage(`Failed to push code tracking data: ${error}`);
        }
      } else {
        vscode.window.showErrorMessage("Please sign in first to push code tracking data");
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
      vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000'));
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

  // If no valid stored token, try existing session
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
      "No existing GitHub session found. Attempting automatic sign-in...",
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
  const token = await Config.getGithubToken();
  if (token && REMOTE_REPO_HTTPS_URL) {
    outputChannel.appendLine("Pushing final changes before shutdown...");
    createActivityLog(Config.TRACKING_REPO_PATH)
      .then(() => createSummary())
      .then(summary => 
        commitAndPush(
          Config.TRACKING_REPO_PATH,
          summary,
          token,
          REMOTE_REPO_HTTPS_URL as string
        )
      )
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
  const token = await getGithubToken();
  if (!token) {
    outputChannel.appendLine("No GitHub token found");
    vscode.window.showWarningMessage("Please sign in first.");
    return;
  }

  try {
    outputChannel.appendLine("Fetching GitHub user info...");
    const userInfo = await fetchUserInfo(token);
    if (!userInfo.login) {
      outputChannel.appendLine("Failed to get GitHub username");
      vscode.window.showErrorMessage("Could not determine GitHub username.");
      return;
    }
    outputChannel.appendLine(`GitHub username: ${userInfo.login}`);

    outputChannel.appendLine("Ensuring code-tracking repository exists...");
    REMOTE_REPO_HTTPS_URL = await ensureCodeTrackingRepo(token, userInfo.login);
    outputChannel.appendLine("Code tracking repository is ready");

    outputChannel.appendLine(
      `Setting up local repository at ${Config.TRACKING_REPO_PATH}...`,
    );
    await ensureLocalRepo(
      Config.TRACKING_REPO_PATH,
      REMOTE_REPO_HTTPS_URL,
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
      const currentToken = await getGithubToken();
      if (currentToken && REMOTE_REPO_HTTPS_URL) {
        outputChannel.appendLine("Creating activity log...");
        await createActivityLog(Config.TRACKING_REPO_PATH);
        const summary = await createSummary();
        outputChannel.appendLine("Committing and pushing changes...");
        await commitAndPush(
          Config.TRACKING_REPO_PATH,
          summary,
          currentToken,
          REMOTE_REPO_HTTPS_URL as string
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
