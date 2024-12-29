import * as vscode from "vscode";
import fetch from "node-fetch";
import { Config } from "../utils/config";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

let githubToken: string | undefined;

export async function getGithubToken(): Promise<string | undefined> {
  if (!githubToken) {
    try {
      const homeDir = os.homedir();
      const tokenPath = path.join(
        homeDir,
        ".code-tracking-config",
        "github-token.json",
      );
      if (fs.existsSync(tokenPath)) {
        const tokenFile = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
        // Validate the token by attempting to fetch user info
        try {
          await fetchUserInfo(tokenFile.token);
          githubToken = tokenFile.token;
        } catch (error) {
          console.error("Invalid token in config file:", error);
        }
      }
    } catch (error) {
      console.error("Error reading github token file:", error);
    }
  }
  return githubToken;
}

export async function tryGetExistingSession(): Promise<
  vscode.AuthenticationSession | undefined
> {
  // First try to get from config file
  const configToken = await getGithubToken();
  if (configToken) {
    const userInfo = await fetchUserInfo(configToken);
    if (userInfo.login) {
      return {
        accessToken: configToken,
        account: { label: userInfo.login, id: userInfo.login },
        id: userInfo.login,
        scopes: ["repo"],
      };
    }
  }

  // If no config token or invalid, try stored token
  const storedToken = await Config.getGithubToken();
  if (storedToken) {
    githubToken = storedToken;
    const userInfo = await fetchUserInfo(storedToken);
    if (userInfo.login) {
      return {
        accessToken: storedToken,
        account: { label: userInfo.login, id: userInfo.login },
        id: userInfo.login,
        scopes: ["repo"],
      };
    }
  }

  // If no stored token or invalid, try VSCode session
  const sessions = await vscode.authentication.getSession("github", ["repo"], {
    createIfNone: false,
  });
  if (sessions) {
    githubToken = sessions.accessToken;
    await Config.saveGithubToken(sessions.accessToken);
  }
  return sessions ?? undefined;
}

export async function signInToGitHub(): Promise<boolean> {
  try {
    const session = await vscode.authentication.getSession("github", ["repo"], {
      createIfNone: true,
    });
    if (session) {
      githubToken = session.accessToken;
      await Config.saveGithubToken(session.accessToken);
      vscode.window.showInformationMessage(
        `Signed in as ${session.account.label}`,
      );
      return true;
    }
  } catch (error) {
    console.error("Failed to sign in:", error);
    vscode.window.showErrorMessage("GitHub login failed. Please try again.");
  }
  return false;
}

export async function fetchUserInfo(
  token: string,
): Promise<{ login?: string }> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github.v3+json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch user info: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as { login?: string };
}
