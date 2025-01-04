import * as express from 'express';
import * as path from 'path';
import { Server } from 'http';

export class DashboardServer {
    private app: express.Application;
    private server: Server | null;
    private port: number;

    constructor() {
        this.app = express();
        this.port = 3000;
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
        this.app.get('/api/activity', (req: express.Request, res: express.Response) => {
            // TODO: Implement actual data gathering
            res.json({
                commits: [],
                languages: {},
                timeStats: {}
            });
        });
    }

    public start(): Promise<number> {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    console.log(`Dashboard server running at http://localhost:${this.port}`);
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