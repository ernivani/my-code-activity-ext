import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Config } from "../utils/config";
import { getTotalActiveTime } from "./activity";

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private activationTime: Date;
  private readonly activationTimeFile: string;

  constructor() {
    this.activationTime = new Date();
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.text = "Code Tracking: Starting...";
    this.statusBarItem.show();

    // Set up the path for storing activation time
    const today = new Date().toISOString().slice(0, 10);
    this.activationTimeFile = path.join(
      Config.TRACKING_REPO_PATH,
      today,
      "activation_time.json",
    );
    this.loadActivationTime();
  }

  private async loadActivationTime() {
    try {
      // Create directory if it doesn't exist
      await fs.promises.mkdir(path.dirname(this.activationTimeFile), {
        recursive: true,
      });

      // Try to read existing activation time
      try {
        const data = await fs.promises.readFile(
          this.activationTimeFile,
          "utf-8",
        );
        const { activationTime } = JSON.parse(data);
        const savedDate = new Date(activationTime);

        // Only use saved time if it's from today
        if (
          savedDate.toISOString().slice(0, 10) ===
          new Date().toISOString().slice(0, 10)
        ) {
          this.activationTime = savedDate;
        }
      } catch (error) {
        // If file doesn't exist or is invalid, save current time
        await this.saveActivationTime();
      }
    } catch (error) {
      console.error("Error loading activation time:", error);
    }
  }

  private async saveActivationTime() {
    try {
      await fs.promises.mkdir(path.dirname(this.activationTimeFile), {
        recursive: true,
      });
      await fs.promises.writeFile(
        this.activationTimeFile,
        JSON.stringify({ activationTime: this.activationTime.toISOString() }),
        "utf-8",
      );
    } catch (error) {
      console.error("Error saving activation time:", error);
    }
  }

  public startUpdateInterval() {
    setInterval(() => this.update(), 60000);
    this.update();
  }

  public async update(isLoggedIn = false) {
    const minutes = await getTotalActiveTime();
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    let timeText = "";
    if (hours > 0) {
      timeText = `${hours}h ${remainingMinutes}m`;
    } else {
      timeText = `${remainingMinutes}m`;
    }

    const loginStatus = isLoggedIn ? "$(check)" : "$(x)";
    this.statusBarItem.text = `${loginStatus} Code Tracking: ${timeText}`;
    this.statusBarItem.tooltip = `Total active coding time today\n${isLoggedIn ? "Connected to GitHub" : "Not connected to GitHub"}`;
  }

  public dispose() {
    this.statusBarItem.dispose();
  }
}
