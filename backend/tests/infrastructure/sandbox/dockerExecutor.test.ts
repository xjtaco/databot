import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// Create mock class using hoisted pattern
const MockChildProcess = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('events');

  return class extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    pid = 12345;
    killed = false;

    kill(): boolean {
      this.killed = true;
      this.emit('close', null, 'SIGTERM');
      return true;
    }
  };
});

// Mock child_process at the top level
vi.mock('child_process', () => ({
  spawn: vi.fn(() => new MockChildProcess()),
}));

interface MockProcess extends EventEmitter {
  stdout: EventEmitter | null;
  stderr: EventEmitter | null;
  pid: number;
  kill: () => boolean;
}

function createMockProcess(): ChildProcess {
  const proc = new EventEmitter() as MockProcess;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = 12345;
  proc.kill = vi.fn(() => true);
  // Cast to ChildProcess - we only need the parts that the tests use
  return proc as unknown as ChildProcess;
}

describe('executeInContainer', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should throw SandboxContainerError when Docker CLI fails', async () => {
    // Override spawn to simulate docker not being available
    const { spawn } = await import('child_process');
    vi.mocked(spawn).mockImplementationOnce(() => {
      const proc = createMockProcess();

      // Simulate spawn error
      setImmediate(() => proc.emit('error', new Error('spawn docker ENOENT')));

      return proc;
    });

    const { executeInContainer } = await import('../../../src/infrastructure/sandbox');

    await expect(
      executeInContainer({
        containerName: 'test-container',
        command: 'echo hello',
        workDir: '/app',
        user: 'agent',
        timeout: 5000,
      })
    ).rejects.toThrow('Docker CLI is not available');
  });

  it('should return container not running error when inspect fails', async () => {
    const { spawn } = await import('child_process');
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      const proc = createMockProcess();

      callCount++;
      const currentCall = callCount;

      setImmediate(() => {
        if (currentCall === 1) {
          // First call: docker version check - success
          proc.emit('close', 0, null);
        } else if (currentCall === 2) {
          // Second call: docker inspect - container not found
          (proc as MockProcess).stderr!.emit('data', Buffer.from('Error: No such container'));
          proc.emit('close', 1, null);
        }
      });

      return proc;
    });

    const { executeInContainer } = await import('../../../src/infrastructure/sandbox');

    const result = await executeInContainer({
      containerName: 'nonexistent-container',
      command: 'echo hello',
      workDir: '/app',
      user: 'agent',
      timeout: 5000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No such container');
  });

  it('should execute command successfully', async () => {
    const { spawn } = await import('child_process');
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      const proc = createMockProcess();

      callCount++;
      const currentCall = callCount;

      setImmediate(() => {
        if (currentCall === 1) {
          // First call: docker version check - success
          proc.emit('close', 0, null);
        } else if (currentCall === 2) {
          // Second call: docker inspect - container running
          (proc as MockProcess).stdout!.emit('data', Buffer.from('true'));
          proc.emit('close', 0, null);
        } else if (currentCall === 3) {
          // Third call: docker exec - command execution
          (proc as MockProcess).stdout!.emit('data', Buffer.from('hello\n'));
          proc.emit('close', 0, null);
        }
      });

      return proc;
    });

    const { executeInContainer } = await import('../../../src/infrastructure/sandbox');

    const result = await executeInContainer({
      containerName: 'test-container',
      command: 'echo hello',
      workDir: '/app',
      user: 'agent',
      timeout: 5000,
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('hello\n');
    expect(result.exitCode).toBe(0);
  });

  it('should return success=false for non-zero exit code', async () => {
    const { spawn } = await import('child_process');
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      const proc = createMockProcess();

      callCount++;
      const currentCall = callCount;

      setImmediate(() => {
        if (currentCall === 1) {
          // Docker version check
          proc.emit('close', 0, null);
        } else if (currentCall === 2) {
          // Docker inspect
          (proc as MockProcess).stdout!.emit('data', Buffer.from('true'));
          proc.emit('close', 0, null);
        } else if (currentCall === 3) {
          // Command execution fails
          (proc as MockProcess).stderr!.emit('data', Buffer.from('command failed'));
          proc.emit('close', 1, null);
        }
      });

      return proc;
    });

    const { executeInContainer } = await import('../../../src/infrastructure/sandbox');

    const result = await executeInContainer({
      containerName: 'test-container',
      command: 'false',
      workDir: '/app',
      user: 'agent',
      timeout: 5000,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('command failed');
  });

  it('should return (empty) for empty output', async () => {
    const { spawn } = await import('child_process');
    let callCount = 0;

    vi.mocked(spawn).mockImplementation(() => {
      const proc = createMockProcess();

      callCount++;
      const currentCall = callCount;

      setImmediate(() => {
        if (currentCall === 1) {
          proc.emit('close', 0, null);
        } else if (currentCall === 2) {
          (proc as MockProcess).stdout!.emit('data', Buffer.from('true'));
          proc.emit('close', 0, null);
        } else if (currentCall === 3) {
          proc.emit('close', 0, null);
        }
      });

      return proc;
    });

    const { executeInContainer } = await import('../../../src/infrastructure/sandbox');

    const result = await executeInContainer({
      containerName: 'test-container',
      command: 'true',
      workDir: '/app',
      user: 'agent',
      timeout: 5000,
    });

    expect(result.stdout).toBe('(empty)');
    expect(result.stderr).toBe('(empty)');
  });

  it('should truncate stdout exceeding 2KB', async () => {
    const { spawn } = await import('child_process');
    let callCount = 0;

    // Generate output larger than 2KB (2048 bytes)
    const largeOutput = 'x'.repeat(3000);

    vi.mocked(spawn).mockImplementation(() => {
      const proc = createMockProcess();

      callCount++;
      const currentCall = callCount;

      setImmediate(() => {
        if (currentCall === 1) {
          proc.emit('close', 0, null);
        } else if (currentCall === 2) {
          (proc as MockProcess).stdout!.emit('data', Buffer.from('true'));
          proc.emit('close', 0, null);
        } else if (currentCall === 3) {
          (proc as MockProcess).stdout!.emit('data', Buffer.from(largeOutput));
          proc.emit('close', 0, null);
        }
      });

      return proc;
    });

    const { executeInContainer } = await import('../../../src/infrastructure/sandbox');

    const result = await executeInContainer({
      containerName: 'test-container',
      command: 'echo large',
      workDir: '/app',
      user: 'agent',
      timeout: 5000,
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toContain('...(truncated)');
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThan(3000);
  });

  it('should truncate stderr exceeding 2KB', async () => {
    const { spawn } = await import('child_process');
    let callCount = 0;

    // Generate error output larger than 2KB
    const largeError = 'e'.repeat(3000);

    vi.mocked(spawn).mockImplementation(() => {
      const proc = createMockProcess();

      callCount++;
      const currentCall = callCount;

      setImmediate(() => {
        if (currentCall === 1) {
          proc.emit('close', 0, null);
        } else if (currentCall === 2) {
          (proc as MockProcess).stdout!.emit('data', Buffer.from('true'));
          proc.emit('close', 0, null);
        } else if (currentCall === 3) {
          (proc as MockProcess).stderr!.emit('data', Buffer.from(largeError));
          proc.emit('close', 1, null);
        }
      });

      return proc;
    });

    const { executeInContainer } = await import('../../../src/infrastructure/sandbox');

    const result = await executeInContainer({
      containerName: 'test-container',
      command: 'error_cmd',
      workDir: '/app',
      user: 'agent',
      timeout: 5000,
    });

    expect(result.success).toBe(false);
    expect(result.stderr).toContain('...(truncated)');
    expect(Buffer.byteLength(result.stderr, 'utf8')).toBeLessThan(3000);
  });

  it('should not truncate output under 2KB', async () => {
    const { spawn } = await import('child_process');
    let callCount = 0;

    // Generate output under 2KB
    const smallOutput = 'y'.repeat(1000);

    vi.mocked(spawn).mockImplementation(() => {
      const proc = createMockProcess();

      callCount++;
      const currentCall = callCount;

      setImmediate(() => {
        if (currentCall === 1) {
          proc.emit('close', 0, null);
        } else if (currentCall === 2) {
          (proc as MockProcess).stdout!.emit('data', Buffer.from('true'));
          proc.emit('close', 0, null);
        } else if (currentCall === 3) {
          (proc as MockProcess).stdout!.emit('data', Buffer.from(smallOutput));
          proc.emit('close', 0, null);
        }
      });

      return proc;
    });

    const { executeInContainer } = await import('../../../src/infrastructure/sandbox');

    const result = await executeInContainer({
      containerName: 'test-container',
      command: 'echo small',
      workDir: '/app',
      user: 'agent',
      timeout: 5000,
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toBe(smallOutput);
    expect(result.stdout).not.toContain('truncated');
  });
});
