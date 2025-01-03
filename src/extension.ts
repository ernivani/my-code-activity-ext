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

let REMOTE_REPO_HTTPS_URL: string | undefined;

let outputChannel: vscode.OutputChannel;

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
        statusBar.update(true);
        await setupCodeTracking(context);
      } else {
        outputChannel.appendLine("Failed to sign in to GitHub");
        statusBar.update(false);
      }
    },
  );
  context.subscriptions.push(signInCommand);

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

  // If no valid stored token, try existing session
  outputChannel.appendLine("Checking for existing GitHub session...");
  const session = await tryGetExistingSession();
  if (session) {
    outputChannel.appendLine(
      `Found existing session for user: ${session.account.label}`,
    );
    vscode.window.showInformationMessage(
      `Auto-signed in as ${session.account.label}`,
    );
    statusBar.update(true);
    await setupCodeTracking(context);
  } else {
    outputChannel.appendLine(
      "No existing GitHub session found. Attempting automatic sign-in...",
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

export function deactivate() {
  outputChannel.appendLine("Code Tracking Extension is shutting down...");
  outputChannel.appendLine(`Time: ${new Date().toLocaleString()}`);
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
          REMOTE_REPO_HTTPS_URL,
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
