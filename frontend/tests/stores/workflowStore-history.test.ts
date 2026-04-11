import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorkflowStore } from '@/stores/workflowStore';
import * as workflowApi from '@/api/workflow';
import type { WorkflowRunInfo, WorkflowRunDetail } from '@/types/workflow';

vi.mock('@/api/workflow');

describe('workflowStore — history', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const makeRunInfo = (overrides: Partial<WorkflowRunInfo> = {}): WorkflowRunInfo => ({
    id: 'run-1',
    workflowId: 'wf-1',
    status: 'completed',
    startedAt: '2026-03-30T10:00:00Z',
    completedAt: '2026-03-30T10:00:05Z',
    errorMessage: null,
    ...overrides,
  });

  describe('fetchHistoryRuns', () => {
    it('should load paginated runs into history state', async () => {
      const run = makeRunInfo();
      vi.mocked(workflowApi.listRunsPaginated).mockResolvedValue({
        runs: [run],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      const store = useWorkflowStore();
      await store.fetchHistoryRuns('wf-1');

      expect(store.historyRuns).toEqual([run]);
      expect(store.historyTotal).toBe(1);
      expect(workflowApi.listRunsPaginated).toHaveBeenCalledWith('wf-1', {
        page: 1,
        pageSize: 20,
      });
    });

    it('should pass status filter when not "all"', async () => {
      vi.mocked(workflowApi.listRunsPaginated).mockResolvedValue({
        runs: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      const store = useWorkflowStore();
      store.historyStatusFilter = 'failed';
      await store.fetchHistoryRuns('wf-1');

      expect(workflowApi.listRunsPaginated).toHaveBeenCalledWith('wf-1', {
        page: 1,
        pageSize: 20,
        status: 'failed',
      });
    });

    it('should pass date range when set', async () => {
      vi.mocked(workflowApi.listRunsPaginated).mockResolvedValue({
        runs: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      const store = useWorkflowStore();
      store.historyDateRange = ['2026-03-01', '2026-03-31'];
      await store.fetchHistoryRuns('wf-1');

      expect(workflowApi.listRunsPaginated).toHaveBeenCalledWith('wf-1', {
        page: 1,
        pageSize: 20,
        startFrom: '2026-03-01',
        startTo: '2026-03-31',
      });
    });
  });

  describe('fetchRunDetailForHistory', () => {
    it('should fetch and cache run detail', async () => {
      const detail: WorkflowRunDetail = {
        ...makeRunInfo(),
        nodeRuns: [],
      };
      vi.mocked(workflowApi.getRunDetail).mockResolvedValue(detail);

      const store = useWorkflowStore();
      await store.fetchRunDetailForHistory('wf-1', 'run-1');

      expect(store.expandedRunDetails.get('run-1')).toEqual(detail);
    });

    it('should skip fetch if already cached', async () => {
      const detail: WorkflowRunDetail = {
        ...makeRunInfo(),
        nodeRuns: [],
      };

      const store = useWorkflowStore();
      store.expandedRunDetails.set('run-1', detail);
      await store.fetchRunDetailForHistory('wf-1', 'run-1');

      expect(workflowApi.getRunDetail).not.toHaveBeenCalled();
    });
  });

  describe('resetHistoryState', () => {
    it('should clear all history state', () => {
      const store = useWorkflowStore();
      store.historyRuns = [makeRunInfo()];
      store.historyTotal = 10;
      store.historyPage = 3;
      store.historyStatusFilter = 'failed';
      store.historyDateRange = ['2026-03-01', '2026-03-31'];
      store.expandedRunDetails.set('run-1', { ...makeRunInfo(), nodeRuns: [] });

      store.resetHistoryState();

      expect(store.historyRuns).toEqual([]);
      expect(store.historyTotal).toBe(0);
      expect(store.historyPage).toBe(1);
      expect(store.historyStatusFilter).toBe('all');
      expect(store.historyDateRange).toBeNull();
      expect(store.expandedRunDetails.size).toBe(0);
    });
  });
});
