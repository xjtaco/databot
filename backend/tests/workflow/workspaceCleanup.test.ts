import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const mockFs = vi.hoisted(() => ({
  access: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  rm: vi.fn(),
}));

vi.mock('fs', () => ({
  promises: {
    access: mockFs.access,
    readdir: mockFs.readdir,
    stat: mockFs.stat,
    rm: mockFs.rm,
  },
}));

vi.mock('../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../src/base/config', () => ({
  config: {
    work_folder: '/tmp/test-work',
    workspaceCleanup: {
      intervalMs: 21600000,
      maxAgeMs: 2592000000,
    },
  },
}));

import { cleanupWorkspaces } from '../../src/workflow/workspaceCleanup';

const NOW = new Date('2026-04-13T00:00:00Z').valueOf();
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 30 * DAY_MS;

describe('cleanupWorkspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.stat.mockResolvedValue({ mtimeMs: NOW } as never);
    mockFs.rm.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('only considers directories with the wf_ prefix', async () => {
    mockFs.readdir.mockResolvedValue([
      { name: 'wf_old', isDirectory: () => true },
      { name: 'tmp_old', isDirectory: () => true },
      { name: 'wf_file', isDirectory: () => false },
    ]);
    mockFs.stat.mockImplementation(async (dirPath: string) => {
      if (dirPath === '/tmp/test-work/wf_old') {
        return { mtimeMs: NOW - RETENTION_MS - DAY_MS } as never;
      }
      throw new Error(`Unexpected stat call for ${dirPath}`);
    });

    await cleanupWorkspaces();

    expect(mockFs.stat).toHaveBeenCalledTimes(1);
    expect(mockFs.stat).toHaveBeenCalledWith('/tmp/test-work/wf_old');
    expect(mockFs.rm).toHaveBeenCalledWith('/tmp/test-work/wf_old', {
      recursive: true,
      force: true,
    });
  });

  it('retains wf_ directories newer than 30 days', async () => {
    mockFs.readdir.mockResolvedValue([{ name: 'wf_recent', isDirectory: () => true }]);
    mockFs.stat.mockResolvedValue({ mtimeMs: NOW - RETENTION_MS + DAY_MS } as never);

    await cleanupWorkspaces();

    expect(mockFs.stat).toHaveBeenCalledWith('/tmp/test-work/wf_recent');
    expect(mockFs.rm).not.toHaveBeenCalled();
  });

  it('deletes wf_ directories older than 30 days recursively', async () => {
    mockFs.readdir.mockResolvedValue([{ name: 'wf_ancient', isDirectory: () => true }]);
    mockFs.stat.mockResolvedValue({ mtimeMs: NOW - RETENTION_MS - DAY_MS } as never);

    await cleanupWorkspaces();

    expect(mockFs.rm).toHaveBeenCalledWith('/tmp/test-work/wf_ancient', {
      recursive: true,
      force: true,
    });
  });

  it('does not remove non-matching sibling directories', async () => {
    mockFs.readdir.mockResolvedValue([{ name: 'archive', isDirectory: () => true }]);

    await cleanupWorkspaces();

    expect(mockFs.stat).not.toHaveBeenCalled();
    expect(mockFs.rm).not.toHaveBeenCalled();
  });
});
