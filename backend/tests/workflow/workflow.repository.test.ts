import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockFindUnique = vi.fn();

vi.mock('../../src/infrastructure/database', () => ({
  getPrismaClient: () => ({
    workflowRun: {
      findMany: mockFindMany,
      count: mockCount,
      findUnique: mockFindUnique,
    },
    workflowNodeRun: {},
  }),
}));

import { findRunsByWorkflowId, findRunById } from '../../src/workflow/workflow.repository';

describe('findRunsByWorkflowId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRun = {
    id: 'run-1',
    workflowId: 'wf-1',
    status: 'completed',
    startedAt: new Date('2026-03-30T10:00:00Z'),
    completedAt: new Date('2026-03-30T10:00:05Z'),
    errorMessage: null,
    workFolder: '/tmp/wf_abc',
  };

  it('should return paginated results with defaults', async () => {
    mockFindMany.mockResolvedValue([mockRun]);
    mockCount.mockResolvedValue(1);

    const result = await findRunsByWorkflowId('wf-1', { page: 1, pageSize: 20 });

    expect(result.runs).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workflowId: 'wf-1' },
        skip: 0,
        take: 20,
        orderBy: { startedAt: 'desc' },
      })
    );
  });

  it('should apply page offset correctly', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(25);

    const result = await findRunsByWorkflowId('wf-1', { page: 2, pageSize: 10 });

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
  });

  it('should filter by status', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await findRunsByWorkflowId('wf-1', { page: 1, pageSize: 20, status: 'failed' });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workflowId: 'wf-1', status: 'failed' },
      })
    );
  });

  it('should filter by time range', async () => {
    const startFrom = new Date('2026-03-01');
    const startTo = new Date('2026-03-31T23:59:59.999Z');
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await findRunsByWorkflowId('wf-1', { page: 1, pageSize: 20, startFrom, startTo });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workflowId: 'wf-1',
          startedAt: { gte: startFrom, lte: startTo },
        },
      })
    );
  });

  it('should combine status and time range filters', async () => {
    const startFrom = new Date('2026-03-01');
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await findRunsByWorkflowId('wf-1', {
      page: 1,
      pageSize: 20,
      status: 'completed',
      startFrom,
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workflowId: 'wf-1',
          status: 'completed',
          startedAt: { gte: startFrom },
        },
      })
    );
  });
});

describe('findRunById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should include nodeName and nodeType in nodeRuns', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'run-1',
      workflowId: 'wf-1',
      status: 'completed',
      startedAt: new Date('2026-03-30T10:00:00Z'),
      completedAt: new Date('2026-03-30T10:00:05Z'),
      errorMessage: null,
      workFolder: '/tmp/wf_abc',
      nodeRuns: [
        {
          id: 'nr-1',
          runId: 'run-1',
          nodeId: 'node-1',
          status: 'completed',
          inputs: '{"key":"val"}',
          outputs: '{"result":"ok"}',
          errorMessage: null,
          startedAt: new Date('2026-03-30T10:00:01Z'),
          completedAt: new Date('2026-03-30T10:00:03Z'),
          node: { name: 'sql_query', type: 'sql' },
        },
      ],
    });

    const result = await findRunById('run-1');

    expect(result).not.toBeNull();
    expect(result!.nodeRuns[0].nodeName).toBe('sql_query');
    expect(result!.nodeRuns[0].nodeType).toBe('sql');
    expect(result!.nodeRuns[0].inputs).toEqual({ key: 'val' });
  });

  it('should return null when run not found', async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await findRunById('missing');
    expect(result).toBeNull();
  });
});
