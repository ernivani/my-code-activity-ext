import * as express from 'express';
import * as path from 'path';
import { Server } from 'http';
import { readStatsInRange } from '../tracking/activity';

interface TimeStats {
    totalActiveTime: number;
    totalProjects: number;
    totalFiles: number;
    projectTimes: { [key: string]: number };
    languageTimes: { [key: string]: number };
    mostActiveHours: number[];
    mostUsedLanguages: string[];
    dailyActivity: { [date: string]: number };
    hourlyActivity: { [hour: string]: number };
    previousPeriodTime?: number;
}

interface ActivityResponse {
    commits: Array<{
        projectName: string;
        fileName: string;
        timestamp: Date;
        duration: number;
        language: string;
    }>;
    timeStats: TimeStats;
    charts: {
        daily: {
            labels: string[];
            data: number[];
        };
        hourly: {
            labels: string[];
            data: number[];
        };
        projects: {
            labels: string[];
            data: number[];
        };
        languages: {
            labels: string[];
            data: number[];
        };
    };
}

export class DashboardServer {
    private app: express.Application;
    private server: Server | null;
    private port: number;

    constructor() {
        this.app = express();
        this.port = 5556;
        this.server = null;
        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware(): void {
        this.app.use(express.static(path.join(__dirname, 'public')));
        this.app.use(express.json());
    }

    private setupRoutes(): void {
        // Serve the main dashboard page
        this.app.get('/', (req: express.Request, res: express.Response) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // API endpoint for activity data
        this.app.post('/api/activity', async (req: express.Request, res: express.Response) => {
            try {
                const { timeRange } = req.body;
                
                // Calculate date range based on timeRange
                const now = new Date();
                const startDate = new Date(now);
                const previousStartDate = new Date(startDate);
                
                switch (timeRange) {
                    case 'day':
                        startDate.setHours(0, 0, 0, 0);
                        startDate.setDate(now.getDate());
                        previousStartDate.setHours(0, 0, 0, 0);
                        previousStartDate.setDate(now.getDate() - 1);
                        break;
                    case 'week':
                        startDate.setHours(0, 0, 0, 0);
                        startDate.setDate(now.getDate() - 6);
                        previousStartDate.setHours(0, 0, 0, 0);
                        previousStartDate.setDate(startDate.getDate() - 7);
                        break;
                    case 'month':
                        startDate.setHours(0, 0, 0, 0);
                        startDate.setDate(now.getDate());
                        startDate.setMonth(now.getMonth() - 1);
                        previousStartDate.setHours(0, 0, 0, 0);
                        previousStartDate.setDate(now.getDate());
                        previousStartDate.setMonth(now.getMonth() - 2);
                        break;
                    default:
                        break;
                }

                // Get stats for current and previous period
                const [currentStats, previousStats] = await Promise.all([
                    readStatsInRange(startDate, now),
                    readStatsInRange(previousStartDate, startDate)
                ]);
                
                if (!currentStats.length) {
                    return res.json(createEmptyResponse());
                }

                // Aggregate stats from all days
                const commits: ActivityResponse['commits'] = [];
                const projectTimes: { [key: string]: number } = {};
                const languageTimes: { [key: string]: number } = {};
                const dailyActivity: { [date: string]: number } = {};
                const hourlyActivity: { [hour: string]: number } = {};
                let totalActiveTime = 0;
                let previousPeriodTime = 0;
                const projectSet = new Set<string>();
                const fileSet = new Set<string>();

                // Calculate previous period total time
                previousStats.forEach(stat => {
                    previousPeriodTime += stat.totalActiveTime;
                });

                // Process current period stats
                for (const dailyStats of currentStats) {
                    const date = new Date(dailyStats.date).toLocaleDateString('en-US', { weekday: 'short' });
                    dailyActivity[date] = (dailyActivity[date] || 0) + dailyStats.totalActiveTime;
                    totalActiveTime += dailyStats.totalActiveTime;

                    // Aggregate project data
                    for (const [projectName, projectStats] of Object.entries(dailyStats.projects)) {
                        projectSet.add(projectName);
                        projectTimes[projectName] = (projectTimes[projectName] || 0) + projectStats.totalActiveTime;
                        
                        // Aggregate file changes
                        for (const [fileName, changes] of Object.entries(projectStats.files)) {
                            fileSet.add(fileName);
                            
                            // Add commits with duration
                            commits.push(...changes.map(change => {
                                const hour = new Date(change.timestamp).getHours().toString().padStart(2, '0');
                                hourlyActivity[hour] = (hourlyActivity[hour] || 0) + (change.duration || 0);
                                
                                return {
                                    projectName,
                                    fileName,
                                    timestamp: change.timestamp,
                                    duration: change.duration || 0,
                                    language: change.language || path.extname(fileName).replace('.', '') || 'unknown'
                                };
                            }));

                            // Aggregate language times
                            for (const change of changes) {
                                const lang = change.language || path.extname(fileName).replace('.', '') || 'unknown';
                                languageTimes[lang] = (languageTimes[lang] || 0) + (change.duration || 0);
                            }
                        }
                    }
                }

                // Sort and prepare chart data
                const sortedProjects = Object.entries(projectTimes)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 8);

                const sortedLanguages = Object.entries(languageTimes)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 8);

                const response: ActivityResponse = {
                    commits,
                    timeStats: {
                        totalActiveTime,
                        totalProjects: projectSet.size,
                        totalFiles: fileSet.size,
                        projectTimes,
                        languageTimes,
                        dailyActivity,
                        hourlyActivity,
                        previousPeriodTime,
                        mostActiveHours: Object.entries(hourlyActivity)
                            .sort(([,a], [,b]) => b - a)
                            .slice(0, 5)
                            .map(([hour]) => parseInt(hour)),
                        mostUsedLanguages: sortedLanguages.map(([lang]) => lang)
                    },
                    charts: {
                        daily: {
                            labels: Object.keys(dailyActivity),
                            data: Object.values(dailyActivity)
                        },
                        hourly: {
                            labels: Array.from({ length: 24 }, (unused, i) => i.toString().padStart(2, '0')),
                            data: Array.from({ length: 24 }, (unused, i) => {
                                const hour = i.toString().padStart(2, '0');
                                return hourlyActivity[hour] || 0;
                            })
                        },
                        projects: {
                            labels: sortedProjects.map(([name]) => name),
                            data: sortedProjects.map(([,value]) => value)
                        },
                        languages: {
                            labels: sortedLanguages.map(([name]) => name),
                            data: sortedLanguages.map(([,value]) => value)
                        }
                    }
                };

                res.json(response);
            } catch (error) {
                console.error('Error fetching activity data:', error);
                res.status(500).json({ error: 'Failed to fetch activity data' });
            }
        });
    }

    public start(): Promise<number> {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    resolve(this.port);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    public stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server) {
                this.server.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }
}

function createEmptyResponse(): ActivityResponse {
    return {
        commits: [],
        timeStats: {
            totalActiveTime: 0,
            totalProjects: 0,
            totalFiles: 0,
            projectTimes: {},
            languageTimes: {},
            dailyActivity: {},
            hourlyActivity: {},
            mostActiveHours: [],
            mostUsedLanguages: [],
            previousPeriodTime: 0
        },
        charts: {
            daily: { labels: [], data: [] },
            hourly: {
                labels: Array.from({ length: 24 }, (unused, i) => i.toString().padStart(2, '0')),
                data: new Array(24).fill(0)
            },
            projects: { labels: [], data: [] },
            languages: { labels: [], data: [] }
        }
    };
} 