import { commitAndPush, ensureCodeTrackingRepo, ensureLocalRepo } from '../repository';
import { Config } from '../../utils/config';
import { GitDiffService } from '../../git/diff-service';
import { OllamaService } from '../../ai/ollama';
import * as cp from 'child_process';
import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';

// Create a type for the mocked exec function
type MockExec = jest.Mock<void, [string, (error: Error | null, result: { stdout: string, stderr: string }) => void]>;

jest.mock('child_process', () => ({
  exec: jest.fn((cmd, callback) => callback(null, { stdout: '', stderr: '' }))
}));
jest.mock('../../utils/config');
jest.mock('../../git/diff-service');
jest.mock('../../ai/ollama');
jest.mock('node-fetch');

// Mock the entire fs module
const mockFiles = new Map<string, string>();
jest.mock('fs', () => ({
  existsSync: jest.fn((path: string) => mockFiles.has(path)),
  writeFileSync: jest.fn((path: string, content: string) => {
    mockFiles.set(path, content);
  }),
  readFileSync: jest.fn((path: string) => mockFiles.get(path) || ''),
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined)
  }
}));

describe('repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFiles.clear();
  });

  describe('ensureCodeTrackingRepo', () => {
    beforeEach(() => {
      (Config.getCustomRemoteUrl as jest.Mock).mockReturnValue(null);
    });

    it('should use custom remote URL if configured', async () => {
      const customUrl = 'https://custom.git.url';
      (Config.getCustomRemoteUrl as jest.Mock).mockReturnValue(customUrl);

      const result = await ensureCodeTrackingRepo('token', 'username');
      expect(result).toBe(customUrl);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should return existing repository URL if found', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ clone_url: 'https://github.com/username/code-tracking.git' })
      };
      (fetch as unknown as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await ensureCodeTrackingRepo('token', 'username');

      expect(result).toBe('https://github.com/username/code-tracking.git');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/username/code-tracking',
        expect.any(Object)
      );
    });

    it('should create new repository if not found', async () => {
      const notFoundResponse = { ok: false };
      const createResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ clone_url: 'https://github.com/username/code-tracking.git' })
      };
      const readmeResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ sha: 'existing-sha' })
      };
      const updateReadmeResponse = { ok: true };

      (fetch as unknown as jest.Mock)
        .mockResolvedValueOnce(notFoundResponse)
        .mockResolvedValueOnce(createResponse)
        .mockResolvedValueOnce(readmeResponse)
        .mockResolvedValueOnce(updateReadmeResponse);

      const result = await ensureCodeTrackingRepo('token', 'username');

      expect(result).toBe('https://github.com/username/code-tracking.git');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/user/repos',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('code-tracking')
        })
      );
    });

    it('should throw error if repository creation fails', async () => {
      const notFoundResponse = { ok: false };
      const createResponse = {
        ok: false,
        text: jest.fn().mockResolvedValue('Creation failed')
      };

      (fetch as unknown as jest.Mock)
        .mockResolvedValueOnce(notFoundResponse)
        .mockResolvedValueOnce(createResponse);

      await expect(ensureCodeTrackingRepo('token', 'username'))
        .rejects
        .toThrow('Failed to create code-tracking repo: Creation failed');
    });
  });

  describe('ensureLocalRepo', () => {
    beforeEach(() => {
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => mockFiles.has(p));
      (fs.writeFileSync as jest.Mock).mockImplementation((p: string, content: string) => {
        mockFiles.set(p, content);
      });
      (Config.getBranchName as jest.Mock).mockReturnValue('main');
    });

    it('should create new repository if it does not exist', async () => {
      await ensureLocalRepo('/test/path', 'remote-url', 'token');

      const mockExec = cp.exec as unknown as MockExec;
      const execCalls = mockExec.mock.calls.map(call => call[0]);

      expect(fs.promises.mkdir).toHaveBeenCalledWith('/test/path', { recursive: true });
      expect(execCalls).toContain('git init /test/path');
      expect(execCalls).toContain('git -C /test/path remote add origin remote-url');
    });

    it('should configure git user if not configured', async () => {
      await ensureLocalRepo('/test/path', 'remote-url', 'token');

      const mockExec = cp.exec as unknown as MockExec;
      const execCalls = mockExec.mock.calls.map(call => call[0]);

      expect(execCalls).toContain('git -C /test/path config user.email || git -C /test/path config user.email "code-tracker@example.com"');
      expect(execCalls).toContain('git -C /test/path config user.name || git -C /test/path config user.name "Code Tracker"');
    });

    it('should create and checkout branch', async () => {
      (Config.getBranchName as jest.Mock).mockReturnValue('test-branch');
      const mockExec = cp.exec as unknown as MockExec;

      // Set up sequential responses for git commands
      let commandIndex = 0;
      mockExec.mockImplementation((cmd: string, callback) => {
        // Make rev-parse fail to trigger branch creation
        if (cmd.includes('rev-parse --verify test-branch')) {
          callback(new Error('branch not found'), { stdout: '', stderr: 'error' });
        }
        // Make pull fail to avoid complications
        else if (cmd.includes('pull origin test-branch')) {
          callback(new Error('remote branch not found'), { stdout: '', stderr: 'error' });
        }
        // Make the branch creation succeed
        else if (cmd.includes('checkout -b test-branch')) {
          callback(null, { stdout: 'Switched to a new branch', stderr: '' });
        }
        // Default success response for other commands
        else {
          callback(null, { stdout: '', stderr: '' });
        }
        commandIndex++;
      });

      await ensureLocalRepo('/test/path', 'remote-url', 'token');

      const execCalls = mockExec.mock.calls.map(call => call[0]);
      const branchCreationCall = execCalls.find(call => call.includes('checkout -b test-branch'));
      expect(branchCreationCall).toBe('git -C /test/path checkout -b test-branch');
    });

    it('should handle existing repository', async () => {
      mockFiles.set('/test/path', ''); // Mark repository as existing
      mockFiles.set(path.join('/test/path', 'README.md'), 'Existing README'); // Mark README as existing

      await ensureLocalRepo('/test/path', 'remote-url', 'token');

      expect(fs.promises.mkdir).not.toHaveBeenCalled();
      const mockExec = cp.exec as unknown as MockExec;
      const initCall = mockExec.mock.calls.find(call => call[0].includes('git init'));
      expect(initCall).toBeUndefined();
    });

    it('should create README.md if it does not exist', async () => {
      await ensureLocalRepo('/test/path', 'remote-url', 'token');

      const readmePath = path.join('/test/path', 'README.md');
      expect(mockFiles.has(readmePath)).toBe(true);
      expect(mockFiles.get(readmePath)).toContain('Welcome to Code Tracking Repository');
    });
  });

  describe('commitAndPush', () => {
    const mockGitDiff = jest.fn();
    const mockModifiedFiles = jest.fn();
    const mockModifiedFunctions = jest.fn();
    const mockGenerateCommitMessage = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
      
      // Mock Config
      (Config.getBranchName as jest.Mock).mockReturnValue('main');
      (Config.isAiCommitEnabled as jest.Mock).mockReturnValue(true);

      // Mock GitDiffService
      (GitDiffService.getInstance as jest.Mock).mockReturnValue({
        getGitDiff: mockGitDiff,
        getModifiedFiles: mockModifiedFiles,
        getModifiedFunctions: mockModifiedFunctions
      });

      // Mock OllamaService
      (OllamaService.getInstance as jest.Mock).mockReturnValue({
        generateCommitMessage: mockGenerateCommitMessage
      });

      mockGitDiff.mockResolvedValue('mock diff');
      mockModifiedFiles.mockResolvedValue(['file1.ts', 'file2.ts']);
      mockModifiedFunctions.mockResolvedValue(['function1', 'function2']);
      mockGenerateCommitMessage.mockResolvedValue('AI generated commit message');
    });

    it('should use AI generated commit message when AI commits are enabled', async () => {
      await commitAndPush('/test/path', 'original message', 'token', 'remote-url');

      expect(mockGitDiff).toHaveBeenCalledWith('/test/path');
      expect(mockModifiedFiles).toHaveBeenCalledWith('/test/path');
      expect(mockGenerateCommitMessage).toHaveBeenCalledWith('mock diff', ['file1.ts', 'file2.ts']);
      
      const mockExec = cp.exec as unknown as MockExec;
      const commitCalls = mockExec.mock.calls;
      const commitCall = commitCalls.find(call => 
        call[0].includes('git -C /test/path commit -m')
      );
      expect(commitCall?.[0]).toContain('AI generated commit message');
    });

    it('should use original message when AI commit generation fails', async () => {
      mockGenerateCommitMessage.mockRejectedValue(new Error('AI error'));

      await commitAndPush('/test/path', 'original message', 'token', 'remote-url');

      const mockExec = cp.exec as unknown as MockExec;
      const commitCalls = mockExec.mock.calls;
      const commitCall = commitCalls.find(call => 
        call[0].includes('git -C /test/path commit -m')
      );
      expect(commitCall?.[0]).toContain('original message');
    });

    it('should use original message when AI commits are disabled', async () => {
      (Config.isAiCommitEnabled as jest.Mock).mockReturnValue(false);

      await commitAndPush('/test/path', 'original message', 'token', 'remote-url');

      expect(mockGenerateCommitMessage).not.toHaveBeenCalled();
      const mockExec = cp.exec as unknown as MockExec;
      const commitCalls = mockExec.mock.calls;
      const commitCall = commitCalls.find(call => 
        call[0].includes('git -C /test/path commit -m')
      );
      expect(commitCall?.[0]).toContain('original message');
    });

    it('should handle git commands in correct order', async () => {
      const execCalls: string[] = [];
      const mockExec = cp.exec as unknown as MockExec;
      mockExec.mockImplementation((cmd: string, callback) => {
        execCalls.push(cmd);
        callback(null, { stdout: '', stderr: '' });
      });

      await commitAndPush('/test/path', 'test message', 'token', 'remote-url');

      expect(execCalls[0]).toContain('git -C /test/path add .');
      expect(execCalls[1]).toContain('git -C /test/path commit');
      expect(execCalls[2]).toContain('git -C /test/path push');
    });
  });
}); 