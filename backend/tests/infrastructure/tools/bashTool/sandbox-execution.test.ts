import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BashTool } from '../../../../src/infrastructure/tools/bashTool';
import { BashResultData } from '../../../../src/infrastructure/tools/types';

// Mock logger to prevent file operations
vi.mock('../../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock config for sandbox mode
vi.mock('../../../../src/base/config', () => ({
  config: {
    sandbox: {
      containerName: 'test-sandbox-container',
      defaultWorkDir: '/app/workfolder',
      user: 'agent',
      timeout: 5000,
    },
  },
}));

// Mock the sandbox module to avoid actual Docker calls
vi.mock('../../../../src/infrastructure/sandbox', () => ({
  executeInContainer: vi.fn(),
}));

describe('BashTool - Sandbox Execution', () => {
  let bashTool: BashTool;

  beforeEach(async () => {
    bashTool = new BashTool();
    vi.clearAllMocks();
  });

  describe('execute() - successful execution', () => {
    it('should execute command in sandbox container', async () => {
      const { executeInContainer } = await import('../../../../src/infrastructure/sandbox');
      vi.mocked(executeInContainer).mockResolvedValueOnce({
        success: true,
        stdout: 'hello\n',
        stderr: '(empty)',
        exitCode: 0,
        signal: null,
      });

      const result = await bashTool.execute({ command: 'echo hello' });

      expect(result.success).toBe(true);
      expect((result.data as BashResultData).stdout).toBe('hello\n');
      expect((result.data as BashResultData).exitCode).toBe(0);
    });

    it('should use default workDir when directory not provided', async () => {
      const { executeInContainer } = await import('../../../../src/infrastructure/sandbox');
      vi.mocked(executeInContainer).mockResolvedValueOnce({
        success: true,
        stdout: '(empty)',
        stderr: '(empty)',
        exitCode: 0,
        signal: null,
      });

      const result = await bashTool.execute({ command: 'pwd' });

      expect(vi.mocked(executeInContainer)).toHaveBeenCalledWith(
        expect.objectContaining({
          workDir: '/app/workfolder',
        })
      );
      expect((result.data as BashResultData).directory).toBe('/app/workfolder');
    });

    it('should use custom directory when provided', async () => {
      const { executeInContainer } = await import('../../../../src/infrastructure/sandbox');
      vi.mocked(executeInContainer).mockResolvedValueOnce({
        success: true,
        stdout: '(empty)',
        stderr: '(empty)',
        exitCode: 0,
        signal: null,
      });

      const customDir = '/custom/path';
      const result = await bashTool.execute({ command: 'pwd', directory: customDir });

      expect(vi.mocked(executeInContainer)).toHaveBeenCalledWith(
        expect.objectContaining({
          workDir: customDir,
        })
      );
      expect((result.data as BashResultData).directory).toBe(customDir);
    });

    it('should use default timeout from config when not provided', async () => {
      const { executeInContainer } = await import('../../../../src/infrastructure/sandbox');
      vi.mocked(executeInContainer).mockResolvedValueOnce({
        success: true,
        stdout: '(empty)',
        stderr: '(empty)',
        exitCode: 0,
        signal: null,
      });

      await bashTool.execute({ command: 'echo test' });

      expect(vi.mocked(executeInContainer)).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000, // config.sandbox.timeout from mock
        })
      );
    });

    it('should use custom timeout when provided (converted to milliseconds)', async () => {
      const { executeInContainer } = await import('../../../../src/infrastructure/sandbox');
      vi.mocked(executeInContainer).mockResolvedValueOnce({
        success: true,
        stdout: '(empty)',
        stderr: '(empty)',
        exitCode: 0,
        signal: null,
      });

      await bashTool.execute({ command: 'echo test', timeout: 30 }); // 30 seconds

      expect(vi.mocked(executeInContainer)).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000, // 30 seconds * 1000 = 30000ms
        })
      );
    });
  });

  describe('execute() - background commands', () => {
    it('should return error for background commands', async () => {
      const result = await bashTool.execute({ command: 'sleep 10 &' });

      expect(result.success).toBe(false);
      expect((result.data as BashResultData).error).toContain(
        'Background processes are not supported'
      );
    });

    it('should return error for command with trailing ampersand and spaces', async () => {
      const result = await bashTool.execute({ command: 'sleep 10 &  ' });

      expect(result.success).toBe(false);
      expect((result.data as BashResultData).error).toContain(
        'Background processes are not supported'
      );
    });
  });

  describe('execute() - error handling', () => {
    it('should return container not running error', async () => {
      const { executeInContainer } = await import('../../../../src/infrastructure/sandbox');
      vi.mocked(executeInContainer).mockResolvedValueOnce({
        success: false,
        stdout: '(empty)',
        stderr: '(empty)',
        exitCode: null,
        signal: null,
        error: 'Container test-container is not running',
      });

      const result = await bashTool.execute({ command: 'echo test' });

      expect(result.success).toBe(false);
      expect((result.data as BashResultData).error).toContain('is not running');
    });

    it('should handle command failure correctly', async () => {
      const { executeInContainer } = await import('../../../../src/infrastructure/sandbox');
      vi.mocked(executeInContainer).mockResolvedValueOnce({
        success: false,
        stdout: '(empty)',
        stderr: 'command not found',
        exitCode: 127,
        signal: null,
      });

      const result = await bashTool.execute({ command: 'nonexistent' });

      expect(result.success).toBe(false);
      expect((result.data as BashResultData).exitCode).toBe(127);
      expect((result.data as BashResultData).stderr).toBe('command not found');
    });

    it('should handle timeout correctly', async () => {
      const { executeInContainer } = await import('../../../../src/infrastructure/sandbox');
      vi.mocked(executeInContainer).mockResolvedValueOnce({
        success: false,
        stdout: '(empty)',
        stderr: '(empty)',
        exitCode: null,
        signal: 'SIGTERM',
        error: 'Command timed out after 5000ms',
        timedOut: true,
      });

      const result = await bashTool.execute({ command: 'sleep 100' });

      expect(result.success).toBe(false);
      expect((result.data as BashResultData).error).toContain('timed out');
    });
  });

  describe('execute() - directory formatting', () => {
    it('should format root directory correctly', async () => {
      const { executeInContainer } = await import('../../../../src/infrastructure/sandbox');
      vi.mocked(executeInContainer).mockResolvedValueOnce({
        success: true,
        stdout: '(empty)',
        stderr: '(empty)',
        exitCode: 0,
        signal: null,
      });

      const result = await bashTool.execute({ command: 'ls', directory: '/' });

      expect((result.data as BashResultData).directory).toBe('(root)');
    });
  });

  describe('execute() - result data structure', () => {
    it('should return all required fields in result data', async () => {
      const { executeInContainer } = await import('../../../../src/infrastructure/sandbox');
      vi.mocked(executeInContainer).mockResolvedValueOnce({
        success: true,
        stdout: 'test\n',
        stderr: '(empty)',
        exitCode: 0,
        signal: null,
      });

      const result = await bashTool.execute({ command: 'echo test' });
      const data = result.data as BashResultData;

      expect(data).toHaveProperty('command');
      expect(data).toHaveProperty('directory');
      expect(data).toHaveProperty('stdout');
      expect(data).toHaveProperty('stderr');
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('exitCode');
      expect(data).toHaveProperty('signal');
    });

    it('should include metadata with parameters', async () => {
      const { executeInContainer } = await import('../../../../src/infrastructure/sandbox');
      vi.mocked(executeInContainer).mockResolvedValueOnce({
        success: true,
        stdout: 'test\n',
        stderr: '(empty)',
        exitCode: 0,
        signal: null,
      });

      const params = { command: 'echo test', directory: '/tmp' };
      const result = await bashTool.execute(params);

      expect(result.metadata).toBeDefined();
      const metadata = result.metadata as { parameters: typeof params };
      expect(metadata.parameters).toBeDefined();
      expect(metadata.parameters.command).toBe('echo test');
      expect(metadata.parameters.directory).toBe('/tmp');
    });

    it('should include metadata with parameters for background command error', async () => {
      const params = { command: 'sleep 10 &' };
      const result = await bashTool.execute(params);

      expect(result.success).toBe(false);
      expect(result.metadata).toBeDefined();
      const metadata = result.metadata as { parameters: typeof params };
      expect(metadata.parameters).toBeDefined();
      expect(metadata.parameters.command).toBe('sleep 10 &');
    });
  });
});

describe('BashTool.validate()', () => {
  let bashTool: BashTool;

  beforeEach(() => {
    bashTool = new BashTool();
  });

  it('should return true for valid command', () => {
    expect(bashTool.validate({ command: 'echo hello' })).toBe(true);
  });

  it('should return true for command with valid directory', () => {
    expect(bashTool.validate({ command: 'pwd', directory: '/tmp' })).toBe(true);
  });

  it('should return false for missing command', () => {
    expect(bashTool.validate({})).toBe(false);
  });

  it('should return false for null command', () => {
    expect(bashTool.validate({ command: null })).toBe(false);
  });

  it('should return false for undefined command', () => {
    expect(bashTool.validate({ command: undefined })).toBe(false);
  });

  it('should return false for non-string command', () => {
    expect(bashTool.validate({ command: 123 })).toBe(false);
  });

  it('should return false for non-string directory', () => {
    expect(bashTool.validate({ command: 'pwd', directory: 123 })).toBe(false);
  });

  it('should return true for valid timeout', () => {
    expect(bashTool.validate({ command: 'echo test', timeout: 30 })).toBe(true);
  });

  it('should return false for non-number timeout', () => {
    expect(bashTool.validate({ command: 'echo test', timeout: '30' })).toBe(false);
  });

  it('should return false for zero timeout', () => {
    expect(bashTool.validate({ command: 'echo test', timeout: 0 })).toBe(false);
  });

  it('should return false for negative timeout', () => {
    expect(bashTool.validate({ command: 'echo test', timeout: -10 })).toBe(false);
  });
});
