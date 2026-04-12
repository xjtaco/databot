import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mockReadFileSync = vi.fn();
const mockRealpathSync = vi.fn();

vi.mock('fs', () => ({
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  realpathSync: (...args: unknown[]) => mockRealpathSync(...args),
}));

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/workflow/workflow.service', () => ({
  createWorkflow: vi.fn(),
  listWorkflows: vi.fn(),
  getWorkflow: vi.fn(),
  saveWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  cloneWorkflow: vi.fn(),
  exportWorkflow: vi.fn(),
  importWorkflow: vi.fn(),
  listRuns: vi.fn(),
  getRunDetail: vi.fn(),
}));

vi.mock('../../src/utils/routeParams', () => ({
  getValidatedUuid: vi.fn(),
}));

vi.mock('../../src/base/config', () => ({
  config: {
    work_folder: '/app/databot/workfolder',
  },
}));

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    query: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response {
  const res = {
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('workflow.controller file handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('rejects file preview when symlink target resolves outside work folder', async () => {
    const { filePreviewHandler } = await import('../../src/workflow/workflow.controller');
    const { ValidationError } = await import('../../src/errors/types');

    mockRealpathSync.mockImplementation((target: string) => {
      if (target === '/app/databot/workfolder') {
        return '/app/databot/workfolder';
      }
      return '/etc/passwd';
    });

    const req = makeReq({
      query: { path: '/app/databot/workfolder/link.txt' },
    });
    const res = makeRes();

    await expect(filePreviewHandler(req, res)).rejects.toBeInstanceOf(ValidationError);
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  it('rejects raw file access when symlink target resolves outside work folder', async () => {
    const { fileRawHandler } = await import('../../src/workflow/workflow.controller');
    const { ValidationError } = await import('../../src/errors/types');

    mockRealpathSync.mockImplementation((target: string) => {
      if (target === '/app/databot/workfolder') {
        return '/app/databot/workfolder';
      }
      return '/etc/passwd';
    });

    const req = makeReq({
      query: { path: '/app/databot/workfolder/link.txt' },
    });
    const res = makeRes();

    await expect(fileRawHandler(req, res)).rejects.toBeInstanceOf(ValidationError);
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });
});
