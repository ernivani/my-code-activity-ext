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
  content: {
    added: string[];
    removed: string[];
  };
  duration?: number;  // Time spent on this change in seconds
  changeType?: 'create' | 'modify' | 'delete';
  language?: string;  // Programming language based on file extension
  functionChanges?: {
    added: string[];
    modified: string[];
    removed: string[];
  };
}

interface ProjectStats {
  totalLinesAdded: number;
  totalLinesRemoved: number;
  totalActiveTime: number;
  files: { [key: string]: FileChange[] };
  languageStats: { [language: string]: number };  // Lines of code per language
  changeFrequency: { [hour: number]: number };    // Changes per hour
  topFiles: string[];                             // Most frequently modified files
  averageChangeSize: number;                      // Average lines changed per modification
}

interface DailyStats {
  date: string;
  projects: { [key: string]: ProjectStats };
  totalActiveTime: number;
  totalProjects: number;
  totalFiles: number;
  mostActiveHours: number[];
  mostUsedLanguages: string[];
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
    // Add check for file existence
    if (!fs.existsSync(fileName)) {
      console.error(`File does not exist: ${fileName}`);
      return;
    }

    // Skip README files that haven't been directly edited
    if (fileName.toLowerCase().includes('readme') || fileName.toLowerCase().endsWith('.md')) {
      const { linesAdded, linesRemoved } = await getGitDiffStats(fileName);
      if (linesAdded === 0 && linesRemoved === 0) {
        console.log("Skipping README/markdown file with no changes:", fileName);
        return;
      }
    }

    const fileType = path.extname(fileName) || "unknown";
    const projectName = vscode.workspace.name || path.basename(path.dirname(fileName));
    const now = new Date();

    // Add more detailed error handling for git diff
    try {
      const { stdout: diffContent } = await execAsync(`git diff ${fileName}`);
      const contentChanges = parseDiffContent(diffContent);
      
      // Skip if no actual changes
      if (contentChanges.added.length === 0 && contentChanges.removed.length === 0) {
        console.log("No content changes detected for file:", fileName);
        return;
      }

      const change: FileChange = {
        timestamp: now,
        fileName,
        fileType,
        linesAdded: contentChanges.added.length,
        linesRemoved: contentChanges.removed.length,
        projectName,
        content: contentChanges
      };

      // Only add if there are actual changes
      if (change.linesAdded > 0 || change.linesRemoved > 0) {
        trackedChanges.push(change);
        updateActiveTime(now);
        console.log(
          "Successfully tracked changes for:",
          fileName,
          `(+${change.linesAdded}, -${change.linesRemoved})`
        );
      }
    } catch (gitError) {
      console.error("Git diff failed:", gitError);
      // Fallback to basic diff if git fails
      const { linesAdded, linesRemoved } = await fallbackDiff(fileName);
      
      // Only create entry if there are actual changes
      if (linesAdded > 0 || linesRemoved > 0) {
        const change: FileChange = {
          timestamp: now,
          fileName,
          fileType,
          linesAdded,
          linesRemoved,
          projectName,
          content: { added: [], removed: [] }
        };
        trackedChanges.push(change);
        updateActiveTime(now);
        console.log(
          "Tracked changes using fallback method:",
          fileName,
          `(+${linesAdded}, -${linesRemoved})`
        );
      }
    }
  } catch (error) {
    console.error("Detailed error tracking changes:", {
      error,
      fileName,
      workspace: vscode.workspace.name,
      cwd: process.cwd()
    });
    vscode.window.showErrorMessage(
      `Failed to track changes for file: ${fileName}. Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function parseDiffContent(diffContent: string): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];

  const lines = diffContent.split('\n');
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added.push(line.substring(1).trim());
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removed.push(line.substring(1).trim());
    }
  }

  return { added, removed };
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

    const newStats = await aggregateStats();
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
      // Only update README if there are new changes in this session
      if (Object.keys(newStats.projects).includes(projectName)) {
        const projectPath = path.join(
          dayFolderPath,
          sanitizeFileName(projectName),
        );
        await fs.promises.mkdir(projectPath, { recursive: true });
        await updateProjectReadme(projectPath, projectName, projectStats);
      }
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

async function aggregateStats(): Promise<DailyStats> {
  const today = new Date().toLocaleDateString('en-CA');
  const stats: DailyStats = {
    date: today,
    projects: {},
    totalActiveTime: activeTimeInMinutes,
    totalProjects: 0,
    totalFiles: 0,
    mostActiveHours: [],
    mostUsedLanguages: []
  };

  // First, consolidate changes by file and timestamp window
  const consolidatedChanges = new Map<string, FileChange[]>();
  const hourlyActivity = new Map<number, number>();
  const languageUsage = new Map<string, number>();
  
  for (const change of trackedChanges) {
    if (change.linesAdded === 0 && change.linesRemoved === 0) {
      continue;
    }

    // Track hourly activity
    const hour = new Date(change.timestamp).getHours();
    hourlyActivity.set(hour, (hourlyActivity.get(hour) || 0) + 1);

    // Track language usage
    const language = change.fileType.replace('.', '') || 'unknown';
    languageUsage.set(language, (languageUsage.get(language) || 0) + change.linesAdded + change.linesRemoved);

    const key = change.fileName;
    if (!consolidatedChanges.has(key)) {
      consolidatedChanges.set(key, []);
    }
    
    const fileChanges = consolidatedChanges.get(key)!;
    const lastChange = fileChanges[fileChanges.length - 1];
    
    if (lastChange && 
        Math.abs(new Date(change.timestamp).getTime() - new Date(lastChange.timestamp).getTime()) <= 5000) {
      lastChange.linesAdded += change.linesAdded;
      lastChange.linesRemoved += change.linesRemoved;
      if (change.content && lastChange.content) {
        lastChange.content.added.push(...change.content.added);
        lastChange.content.removed.push(...change.content.removed);
      }
      // Update duration if available
      if (lastChange.duration && change.duration) {
        lastChange.duration += change.duration;
      }
    } else {
      // Enhance the change object with additional data
      const enhancedChange = {
        ...change,
        language: change.fileType.replace('.', '') || 'unknown',
        changeType: getChangeType(change),
        functionChanges: await extractFunctionChanges(change)
      };
      fileChanges.push(enhancedChange);
    }
  }

  // Build stats with enhanced analytics
  for (const [_, changes] of consolidatedChanges) {
    for (const change of changes) {
      if (!stats.projects[change.projectName]) {
        stats.projects[change.projectName] = {
          totalLinesAdded: 0,
          totalLinesRemoved: 0,
          totalActiveTime: 0,
          files: {},
          languageStats: {},
          changeFrequency: {},
          topFiles: [],
          averageChangeSize: 0
        };
      }

      const project = stats.projects[change.projectName];
      project.totalLinesAdded += change.linesAdded;
      project.totalLinesRemoved += change.linesRemoved;

      // Update language stats
      const language = change.language || 'unknown';
      project.languageStats[language] = (project.languageStats[language] || 0) + change.linesAdded + change.linesRemoved;

      // Update change frequency
      const hour = new Date(change.timestamp).getHours();
      project.changeFrequency[hour] = (project.changeFrequency[hour] || 0) + 1;

      if (!project.files[change.fileName]) {
        project.files[change.fileName] = [];
      }
      project.files[change.fileName].push(change);
    }
  }

  // Calculate summary statistics
  stats.totalProjects = Object.keys(stats.projects).length;
  stats.totalFiles = Array.from(consolidatedChanges.keys()).length;
  stats.mostActiveHours = getMostActiveHours(hourlyActivity);
  stats.mostUsedLanguages = getMostUsedLanguages(languageUsage);

  // Distribute active time
  if (stats.totalProjects > 0) {
    const timePerProject = Math.floor(activeTimeInMinutes / stats.totalProjects);
    for (const name of Object.keys(stats.projects)) {
      stats.projects[name].totalActiveTime = timePerProject;
      
      // Calculate average change size
      const project = stats.projects[name];
      const totalChanges = Object.values(project.files).flat().length;
      project.averageChangeSize = totalChanges > 0 
        ? (project.totalLinesAdded + project.totalLinesRemoved) / totalChanges 
        : 0;
      
      // Update top files
      project.topFiles = Object.entries(project.files)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 5)
        .map(([file]) => file);
    }
  }

  return stats;
}

function getChangeType(change: FileChange): 'create' | 'modify' | 'delete' {
  if (change.linesAdded > 0 && change.linesRemoved === 0) return 'create';
  if (change.linesAdded === 0 && change.linesRemoved > 0) return 'delete';
  return 'modify';
}

async function extractFunctionChanges(change: FileChange): Promise<{ added: string[], modified: string[], removed: string[] }> {
  try {
    const { stdout } = await execAsync(`git diff --function-context ${change.fileName}`);
    const functionMatches = stdout.match(/@@ .* @@\s+(?:function|class|def|const|let|var)\s+(\w+)/g) || [];
    const functions = functionMatches.map(match => match.split(/\s+/).pop() || '').filter(Boolean);
    
    return {
      added: functions.filter(f => change.content.added.some(line => line.includes(f))),
      modified: functions.filter(f => 
        change.content.added.some(line => line.includes(f)) && 
        change.content.removed.some(line => line.includes(f))
      ),
      removed: functions.filter(f => change.content.removed.some(line => line.includes(f)))
    };
  } catch {
    return { added: [], modified: [], removed: [] };
  }
}

function getMostActiveHours(hourlyActivity: Map<number, number>): number[] {
  return Array.from(hourlyActivity.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hour]) => hour);
}

function getMostUsedLanguages(languageUsage: Map<string, number>): string[] {
  return Array.from(languageUsage.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([language]) => language);
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

  const today = new Date().toLocaleDateString('en-CA');

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
    return `### ${path.basename(change.fileName)} (${timestamp.toLocaleTimeString()})
    
#### Added Lines:
\`\`\`${change.fileType.replace('.', '')}
${change.content?.added.join('\n') || 'No lines added'}
\`\`\`

#### Removed Lines:
\`\`\`${change.fileType.replace('.', '')}
${change.content?.removed.join('\n') || 'No lines removed'}
\`\`\`
`;
  })
  .join('\n\n')}
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

  const stats = await aggregateStats();
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
