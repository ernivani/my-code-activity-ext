import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

export class Config {
  private static readonly configDir = path.join(
    os.homedir(),
    ".code-tracking-config",
  );
  private static readonly tokenFile = path.join(
    Config.configDir,
    "github-token.json",
  );
  public static readonly trackingRepoPath = path.join(
    os.homedir(),
    ".code-tracking",
  );

  public static async saveGithubToken(token: string): Promise<void> {
    try {
      await fs.promises.mkdir(Config.configDir, { recursive: true });
      await fs.promises.writeFile(
        Config.tokenFile,
        JSON.stringify({ token }, null, 2),
        "utf-8",
      );
    } catch (error) {
      console.error("Failed to save GitHub token:", error);
      throw error;
    }
  }

  public static async getGithubToken(): Promise<string | null> {
    try {
      const data = await fs.promises.readFile(Config.tokenFile, "utf-8");
      const { token } = JSON.parse(data);
      return token;
    } catch {
      return null;
    }
  }

  public static getCommitIntervalMs(): number {
    const config = vscode.workspace.getConfiguration("codeTracker");
    return (config.get<number>("commitInterval") || 5) * 60_000;
  }
}
