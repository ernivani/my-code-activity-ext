import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { promisify } from "util";
import { exec } from "child_process";
import { Config } from "../utils/config";

const execAsync = promisify(exec);

const fileContentsCache: { [filePath: string]: string[] } = {};

interface FileChange {
  timestamp: Date;
  fileName: string;
  fileType: string;
  linesAdded: number;
  linesRemoved: number;
  projectName: string;
}

interface ProjectStats {
  totalLinesAdded: number;
  totalLinesRemoved: number;
  totalActiveTime: number;
  files: { [key: string]: FileChange[] };
}

interface DailyStats {
  date: string;
  projects: { [key: string]: ProjectStats };
}

let trackedChanges: FileChange[] = [];
let lastActivityTime: Date | null = null;
let activeTimeInMinutes = 0;

async function readExistingStats(): Promise<DailyStats | null> {
  try {
    const today = new Date().toLocaleDateString('en-CA');
    const activityJsonPath = path.join(
      Config.TRACKING_REPO_PATH,
      today,
      "activity.json",
    );
    const fileData = await fs.promises.readFile(activityJsonPath, "utf-8");
    return JSON.parse(fileData);
  } catch (error) {
    return null;
  }
}

export async function getTotalActiveTime(): Promise<number> {
  const existingStats = await readExistingStats();
  let totalTime = 0;

  if (existingStats) {
    totalTime = Object.values(existingStats.projects).reduce(
      (sum, p) => sum + p.totalActiveTime,
      0,
    );
  }

  return totalTime + activeTimeInMinutes; // Include current session time
}

export async function trackChanges(fileName: string) {
  try {
    const fileType = path.extname(fileName) || "unknown";
    const projectName =
      vscode.workspace.name || path.basename(path.dirname(fileName));
    const now = new Date();

    const { linesAdded, linesRemoved } = await getGitDiffStats(fileName);

    if (linesAdded === 0 && linesRemoved === 0) {
      console.log("No changes detected for file:", fileName);
      return;
    }

    const change: FileChange = {
      timestamp: now,
      fileName,
      fileType,
      linesAdded,
      linesRemoved,
      projectName,
    };

    trackedChanges.push(change);
    updateActiveTime(now);
    console.log(
      "File changed:",
      fileName,
      `(+${linesAdded}, -${linesRemoved})`,
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to track changes for file: ${fileName}`,
    );
    console.error("Error tracking changes:", error);
  }
}

async function getGitDiffStats(
  fileName: string,
): Promise<{ linesAdded: number; linesRemoved: number }> {
  try {
    const { stdout } = await execAsync(`git diff --numstat ${fileName}`);
    if (!stdout.trim()) {
      return fallbackDiff(fileName);
    }

    const [added, removed] = stdout.trim().split("\t").map(Number);
    const linesAdded = isNaN(added) ? 0 : added;
    const linesRemoved = isNaN(removed) ? 0 : removed;

    return { linesAdded, linesRemoved };
  } catch (error) {
    return fallbackDiff(fileName);
  }
}

async function fallbackDiff(
  fileName: string,
): Promise<{ linesAdded: number; linesRemoved: number }> {
  try {
    const fileContent = await fs.promises.readFile(fileName, "utf-8");
    const newLines = fileContent.split("\n");

    const oldLines = fileContentsCache[fileName] || [];

    const linesAdded = Math.max(0, newLines.length - oldLines.length);
    const linesRemoved = Math.max(0, oldLines.length - newLines.length);

    fileContentsCache[fileName] = newLines;

    return { linesAdded, linesRemoved };
  } catch (e) {
    console.error(`fallbackDiff: Unable to read file ${fileName}`, e);
    return { linesAdded: 0, linesRemoved: 0 };
  }
}

function updateActiveTime(now: Date) {
  if (!lastActivityTime) {
    lastActivityTime = now;
    return;
  }
  const timeDiff = now.getTime() - lastActivityTime.getTime();
  // Incrémenter si l'inactivité est <= 5 minutes
  if (timeDiff <= 5 * 60 * 1000) {
    activeTimeInMinutes += Math.ceil(timeDiff / (60 * 1000));
  }
  lastActivityTime = now;
}

export async function ensureDailyDirectory(
  trackingRepoPath: string,
): Promise<string> {
  const today = new Date().toLocaleDateString('en-CA');
  const dayFolderPath = path.join(trackingRepoPath, today);

  try {
    await fs.promises.mkdir(dayFolderPath, { recursive: true });
    console.log(`Daily directory created/verified: ${dayFolderPath}`);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create daily directory: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(`Failed to create daily directory: ${error}`);
    throw error;
  }

  return dayFolderPath;
}

export async function createActivityLog(
  trackingRepoPath: string,
): Promise<void> {
  if (trackedChanges.length === 0 && activeTimeInMinutes === 0) {
    console.log("No new activity to log");
    return;
  }

  try {
    const dayFolderPath = await ensureDailyDirectory(trackingRepoPath);
    const activityJsonPath = path.join(dayFolderPath, "activity.json");
    let oldStats: DailyStats | null = null;

    try {
      const fileData = await fs.promises.readFile(activityJsonPath, "utf-8");
      oldStats = JSON.parse(fileData);
    } catch (readError) {
      // Pas de fichier existant, ce n'est pas forcément une erreur
    }

    const newStats = aggregateStats();
    const mergedStats = oldStats
      ? mergeDailyStats(oldStats, newStats)
      : newStats;

    if (isEmptyStats(mergedStats)) {
      console.log("No cumulative changes found, skipping write.");
      return;
    }

    for (const [projectName, projectStats] of Object.entries(
      mergedStats.projects,
    )) {
      const projectPath = path.join(
        dayFolderPath,
        sanitizeFileName(projectName),
      );
      await fs.promises.mkdir(projectPath, { recursive: true });
      await updateProjectReadme(projectPath, projectName, projectStats);
    }

    await fs.promises.writeFile(
      activityJsonPath,
      JSON.stringify(mergedStats, null, 2),
      "utf-8",
    );

    // Réinitialiser pour la prochaine session
    trackedChanges = [];
    activeTimeInMinutes = 0;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create activity log: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error("Error creating activity log:", error);
  }
}

function aggregateStats(): DailyStats {
  const today = new Date().toLocaleDateString('en-CA');
  const stats: DailyStats = {
    date: today,
    projects: {},
  };

  for (const change of trackedChanges) {
    if (!stats.projects[change.projectName]) {
      stats.projects[change.projectName] = {
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
        totalActiveTime: 0,
        files: {},
      };
    }

    const project = stats.projects[change.projectName];
    project.totalLinesAdded += change.linesAdded;
    project.totalLinesRemoved += change.linesRemoved;

    if (!project.files[change.fileName]) {
      project.files[change.fileName] = [];
    }
    project.files[change.fileName].push(change);
  }

  const projectNames = Object.keys(stats.projects);
  if (projectNames.length > 0) {
    // Répartition simple du temps actif pour chaque projet
    const timePerProject = Math.floor(
      activeTimeInMinutes / projectNames.length,
    );
    for (const name of projectNames) {
      stats.projects[name].totalActiveTime = timePerProject;
    }
  }

  return stats;
}

function mergeDailyStats(
  oldStats: DailyStats,
  newStats: DailyStats,
): DailyStats {
  if (oldStats.date !== newStats.date) {
    return newStats;
  }

  // On clone l'ancien stats
  const merged: DailyStats = JSON.parse(JSON.stringify(oldStats));

  // Merge chaque projet
  for (const [projName, newProjectStats] of Object.entries(newStats.projects)) {
    if (!merged.projects[projName]) {
      merged.projects[projName] = newProjectStats;
      continue;
    }
    const oldProj = merged.projects[projName];
    oldProj.totalLinesAdded += newProjectStats.totalLinesAdded;
    oldProj.totalLinesRemoved += newProjectStats.totalLinesRemoved;
    oldProj.totalActiveTime += newProjectStats.totalActiveTime;

    for (const [fileName, changesArr] of Object.entries(
      newProjectStats.files,
    )) {
      if (!oldProj.files[fileName]) {
        oldProj.files[fileName] = changesArr;
      } else {
        oldProj.files[fileName].push(...changesArr);
      }
    }
  }

  return merged;
}

function isEmptyStats(stats: DailyStats): boolean {
  const projectList = Object.values(stats.projects);
  if (projectList.length === 0) return true;

  return projectList.every(
    (p) =>
      p.totalLinesAdded === 0 &&
      p.totalLinesRemoved === 0 &&
      p.totalActiveTime === 0,
  );
}

/**
 * Génère deux graphiques Mermaid :
 * - Répartition du total de lignes modifiées par type de fichier (pie)
 * - Répartition du nombre de commits/changes par heure (pie)
 */
function generateMermaidCharts(projectStats: ProjectStats): string {
  // 1. Agréger les lignes modifiées (ajoutées + supprimées) par extension
  const fileTypeLinesMap: Record<string, number> = {};
  for (const [fileName, changesArray] of Object.entries(projectStats.files)) {
    const ext = path.extname(fileName) || "unknown";
    const totalLines = changesArray.reduce(
      (sum, c) => sum + c.linesAdded + c.linesRemoved,
      0,
    );
    fileTypeLinesMap[ext] = (fileTypeLinesMap[ext] || 0) + totalLines;
  }

  // 2. Agréger l'activité horaire : chaque changement compte comme 1
  const hourlyActivityMap: Record<number, number> = {};
  for (const changesArray of Object.values(projectStats.files)) {
    for (const change of changesArray) {
      // Ensure timestamp is a Date object
      const timestamp =
        change.timestamp instanceof Date
          ? change.timestamp
          : new Date(change.timestamp);
      const hour = timestamp.getHours();
      hourlyActivityMap[hour] = (hourlyActivityMap[hour] || 0) + 1;
    }
  }

  // 3. Construire le diagramme en secteurs (pie) pour la répartition par type de fichier
  const fileTypePieData = Object.entries(fileTypeLinesMap)
    .map(([ext, total]) => `"${ext}" : ${total}`)
    .join("\n");

  // 4. Construire le diagramme en secteurs (pie) pour l'activité par heure
  const hourlyPieData = Object.entries(hourlyActivityMap)
    .map(([hour, count]) => `"${String(hour).padStart(2, "0")}h" : ${count}`)
    .join("\n");

  // 5. Retourner l'ensemble sous forme de blocs Markdown
  return `
### By File Type (Lines Changed)

\`\`\`mermaid
pie showData
title Lines changed by file type
${fileTypePieData}
\`\`\`

### By Hour (Estimated Activity Count)

\`\`\`mermaid
pie showData
title Coding activity by hour (count of changes)
${hourlyPieData}
\`\`\`
`;
}

async function updateProjectReadme(
  projectPath: string,
  projectName: string,
  stats: ProjectStats,
) {
  const readmePath = path.join(projectPath, "README.md");

  // Tableau Markdown pour les stats principales
  const statsTable = `
| Stat                   | Value                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| **Lines Added** (➕)   | ${stats.totalLinesAdded}                                          |
| **Lines Removed** (➖) | ${stats.totalLinesRemoved}                                        |
| **Net Change** (↕)    | ${stats.totalLinesAdded - stats.totalLinesRemoved}                |
| **Active Time** (⌚)   | ${stats.totalActiveTime} minute${stats.totalActiveTime > 1 ? "s" : ""} |
`;

  // Liste des fichiers modifiés
  const filesList = Object.entries(stats.files)
    .map(([file, changes]) => {
      const totalAdded = changes.reduce((sum, c) => sum + c.linesAdded, 0);
      const totalRemoved = changes.reduce((sum, c) => sum + c.linesRemoved, 0);
      return `- **${path.basename(file)}** (+${totalAdded}, -${totalRemoved})`;
    })
    .join("\n");

  // Générer les graphiques Mermaid
  const mermaidCharts = generateMermaidCharts(stats);

  const content = `# ${projectName} - Activity Summary 

## Overall Statistics
${statsTable}

## Modified Files
${filesList || "_No files changed yet._"}

## Visualizations
${mermaidCharts}

> **Last Updated:** ${new Date().toLocaleString()}`;

  await fs.promises.writeFile(readmePath, content, "utf-8");
}

export async function createHourlyLogs(
  projectPath: string,
  projectStats: ProjectStats,
) {
  const changesByHour: { [key: string]: FileChange[] } = {};

  for (const fileChanges of Object.values(projectStats.files)) {
    for (const change of fileChanges) {
      // Ensure timestamp is a Date object and use local time
      const timestamp =
        change.timestamp instanceof Date
          ? change.timestamp
          : new Date(change.timestamp);
      const hour = timestamp.getHours().toString().padStart(2, "0");
      if (!changesByHour[hour]) {
        changesByHour[hour] = [];
      }
      changesByHour[hour].push({
        ...change,
        timestamp,
      });
    }
  }

  const today = new Date().toLocaleDateString('en-CA'); // Use local date consistently

  for (const [hour, changes] of Object.entries(changesByHour)) {
    const hourMdPath = path.join(projectPath, `${today}-${hour}.md`);
    const linesAdded = changes.reduce((sum, c) => sum + c.linesAdded, 0);
    const linesRemoved = changes.reduce((sum, c) => sum + c.linesRemoved, 0);

    const hourContent = `# Activity for hour ${hour}:00

- Total files changed: ${changes.length}
- Lines Added: ${linesAdded}
- Lines Removed: ${linesRemoved}

## Details
${changes
  .map((change) => {
    const timestamp =
      change.timestamp instanceof Date
        ? change.timestamp
        : new Date(change.timestamp);
    return `- [${timestamp.toLocaleTimeString()}] ${path.basename(change.fileName)} (+${change.linesAdded}, -${change.linesRemoved})`;
  })
  .join("\n")}
`;

    await fs.promises.writeFile(hourMdPath, hourContent, "utf-8");
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-z0-9-]/gi, "_").toLowerCase();
}

export async function createSummary(): Promise<string> {
  if (trackedChanges.length === 0) {
    return "No changes in the last period.";
  }

  const stats = aggregateStats();
  const totalAdded = Object.values(stats.projects).reduce(
    (sum, p) => sum + p.totalLinesAdded,
    0,
  );
  const totalRemoved = Object.values(stats.projects).reduce(
    (sum, p) => sum + p.totalLinesRemoved,
    0,
  );

  return (
    `Changed ${trackedChanges.length} files across ${Object.keys(stats.projects).length} projects. ` +
    `Added ${totalAdded} lines, removed ${totalRemoved} lines. ` +
    `Active coding time: ${activeTimeInMinutes} minute${activeTimeInMinutes > 1 ? "s" : ""}.`
  );
}
