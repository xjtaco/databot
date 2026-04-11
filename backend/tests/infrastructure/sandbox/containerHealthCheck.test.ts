import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkContainerRunning, isDockerAvailable } from '../../../src/infrastructure/sandbox';
import { EventEmitter } from 'events';

// Mock ChildProcess class
class MockChildProcess extends EventEmitter {
  stdout: EventEmitter | null;
  stderr: EventEmitter | null;
  stdin: EventEmitter | null;
  pid: number | null;

  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.stdin = null;
    this.pid = null;
  }

  simulateExit(code: number | null) {
    this.emit('close', code, null);
  }

  simulateStdout(data: string) {
    if (this.stdout) {
      this.stdout.emit('data', Buffer.from(data));
    }
  }

  simulateStderr(data: string) {
    if (this.stderr) {
      this.stderr.emit('data', Buffer.from(data));
    }
  }

  simulateError(error: Error) {
    this.emit('error', error);
  }
}

let currentMockChild: MockChildProcess | null = null;

vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const mockChild = new MockChildProcess();
    mockChild.pid = Math.floor(Math.random() * 10000) + 1000;
    currentMockChild = mockChild;
    return mockChild;
  }),
}));

function getLastMockChildProcess(): MockChildProcess | null {
  return currentMockChild;
}

function clearMockSpawn() {
  currentMockChild = null;
}

describe('checkContainerRunning', () => {
  beforeEach(() => {
    clearMockSpawn();
  });

  it('should return running=true when container is running', async () => {
    const containerName = 'test-container';
    const resultPromise = checkContainerRunning(containerName);

    const mockChild = getLastMockChildProcess()!;
    setImmediate(() => {
      mockChild.simulateStdout('true');
      mockChild.simulateExit(0);
    });

    const result = await resultPromise;

    expect(result.running).toBe(true);
    expect(result.containerId).toBe(containerName);
    expect(result.error).toBeUndefined();
  });

  it('should return running=false when container is not running', async () => {
    const containerName = 'stopped-container';
    const resultPromise = checkContainerRunning(containerName);

    const mockChild = getLastMockChildProcess()!;
    setImmediate(() => {
      mockChild.simulateStdout('false');
      mockChild.simulateExit(0);
    });

    const result = await resultPromise;

    expect(result.running).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return running=false when container does not exist', async () => {
    const containerName = 'nonexistent-container';
    const resultPromise = checkContainerRunning(containerName);

    const mockChild = getLastMockChildProcess()!;
    setImmediate(() => {
      mockChild.simulateStderr('Error: No such container');
      mockChild.simulateExit(1);
    });

    const result = await resultPromise;

    expect(result.running).toBe(false);
    expect(result.error).toContain('No such container');
  });

  it('should return running=false when docker CLI is not available', async () => {
    const containerName = 'test-container';
    const resultPromise = checkContainerRunning(containerName);

    const mockChild = getLastMockChildProcess()!;
    setImmediate(() => {
      mockChild.simulateError(new Error('spawn docker ENOENT'));
    });

    const result = await resultPromise;

    expect(result.running).toBe(false);
    expect(result.error).toContain('Docker CLI not available');
  });
});

describe('isDockerAvailable', () => {
  beforeEach(() => {
    clearMockSpawn();
  });

  it('should return true when docker is available', async () => {
    const resultPromise = isDockerAvailable();

    const mockChild = getLastMockChildProcess()!;
    setImmediate(() => {
      mockChild.simulateExit(0);
    });

    const result = await resultPromise;

    expect(result).toBe(true);
  });

  it('should return false when docker command fails', async () => {
    const resultPromise = isDockerAvailable();

    const mockChild = getLastMockChildProcess()!;
    setImmediate(() => {
      mockChild.simulateExit(1);
    });

    const result = await resultPromise;

    expect(result).toBe(false);
  });

  it('should return false when docker is not installed', async () => {
    const resultPromise = isDockerAvailable();

    const mockChild = getLastMockChildProcess()!;
    setImmediate(() => {
      mockChild.simulateError(new Error('spawn docker ENOENT'));
    });

    const result = await resultPromise;

    expect(result).toBe(false);
  });
});
