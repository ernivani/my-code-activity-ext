import * as cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

export class GitDiffService {
    private static instance: GitDiffService;

    private constructor() {}

    public static getInstance(): GitDiffService {
        if (!GitDiffService.instance) {
            GitDiffService.instance = new GitDiffService();
        }
        return GitDiffService.instance;
    }

    public async getGitDiff(repoPath: string): Promise<string> {
        try {
            const { stdout } = await exec(`git -C ${repoPath} diff HEAD`);
            return stdout;
        } catch (error) {
            console.error('Error getting git diff:', error);
            return '';
        }
    }

    public async getModifiedFiles(repoPath: string): Promise<string[]> {
        try {
            const { stdout } = await exec(`git -C ${repoPath} status --porcelain`);
            return stdout
                .split('\n')
                .filter(line => line.trim() !== '')
                .map(line => line.substring(3));
        } catch (error) {
            console.error('Error getting modified files:', error);
            return [];
        }
    }

    public async getModifiedFunctions(repoPath: string): Promise<string[]> {
        try {
            const { stdout } = await exec(`git -C ${repoPath} diff --function-context HEAD`);
            const functionMatches = stdout.match(/@@ .* @@\s+(?:function|class|def|const|let|var)\s+(\w+)/g) || [];
            return functionMatches
                .map(match => match.split(/\s+/).pop() || '')
                .filter(name => name !== '');
        } catch (error) {
            console.error('Error getting modified functions:', error);
            return [];
        }
    }
} 