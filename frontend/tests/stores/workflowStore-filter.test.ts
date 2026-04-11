import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorkflowStore } from '@/stores/workflowStore';
import * as workflowApi from '@/api/workflow';
import type { WorkflowListItem } from '@/types/workflow';

vi.mock('@/api/workflow');

function makeListItem(overrides: Partial<WorkflowListItem> = {}): WorkflowListItem {
  return {
    id: 'wf-1',
    name: 'Test Workflow',
    description: 'A test workflow',
    nodeCount: 3,
    lastRunAt: null,
    lastRunStatus: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    creatorName: null,
    ...overrides,
  };
}

describe('workflowStore - filteredWorkflows', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('returns all workflows when no filter/search is active', async () => {
    const items = [makeListItem({ id: '1' }), makeListItem({ id: '2' })];
    vi.mocked(workflowApi.listWorkflows).mockResolvedValue(items);

    const store = useWorkflowStore();
    await store.fetchWorkflows();

    expect(store.filteredWorkflows).toHaveLength(2);
  });

  it('filters by search query matching name', async () => {
    const items = [
      makeListItem({ id: '1', name: 'Daily Report' }),
      makeListItem({ id: '2', name: 'Customer Analysis' }),
    ];
    vi.mocked(workflowApi.listWorkflows).mockResolvedValue(items);

    const store = useWorkflowStore();
    await store.fetchWorkflows();
    store.searchQuery = 'daily';

    expect(store.filteredWorkflows).toHaveLength(1);
    expect(store.filteredWorkflows[0].name).toBe('Daily Report');
  });

  it('filters by search query matching description', async () => {
    const items = [
      makeListItem({ id: '1', name: 'WF1', description: 'weekly data summary' }),
      makeListItem({ id: '2', name: 'WF2', description: 'other stuff' }),
    ];
    vi.mocked(workflowApi.listWorkflows).mockResolvedValue(items);

    const store = useWorkflowStore();
    await store.fetchWorkflows();
    store.searchQuery = 'summary';

    expect(store.filteredWorkflows).toHaveLength(1);
    expect(store.filteredWorkflows[0].id).toBe('1');
  });

  it('filters by status', async () => {
    const items = [
      makeListItem({ id: '1', lastRunStatus: 'completed' }),
      makeListItem({ id: '2', lastRunStatus: 'failed' }),
      makeListItem({ id: '3', lastRunStatus: null }),
    ];
    vi.mocked(workflowApi.listWorkflows).mockResolvedValue(items);

    const store = useWorkflowStore();
    await store.fetchWorkflows();
    store.statusFilter = 'completed';

    expect(store.filteredWorkflows).toHaveLength(1);
    expect(store.filteredWorkflows[0].id).toBe('1');
  });

  it('filters by never_run status', async () => {
    const items = [
      makeListItem({ id: '1', lastRunStatus: 'completed' }),
      makeListItem({ id: '2', lastRunStatus: null }),
    ];
    vi.mocked(workflowApi.listWorkflows).mockResolvedValue(items);

    const store = useWorkflowStore();
    await store.fetchWorkflows();
    store.statusFilter = 'never_run';

    expect(store.filteredWorkflows).toHaveLength(1);
    expect(store.filteredWorkflows[0].id).toBe('2');
  });

  it('combines search and status filter', async () => {
    const items = [
      makeListItem({ id: '1', name: 'Daily Report', lastRunStatus: 'completed' }),
      makeListItem({ id: '2', name: 'Daily Analysis', lastRunStatus: 'failed' }),
      makeListItem({ id: '3', name: 'Weekly Report', lastRunStatus: 'completed' }),
    ];
    vi.mocked(workflowApi.listWorkflows).mockResolvedValue(items);

    const store = useWorkflowStore();
    await store.fetchWorkflows();
    store.searchQuery = 'daily';
    store.statusFilter = 'completed';

    expect(store.filteredWorkflows).toHaveLength(1);
    expect(store.filteredWorkflows[0].id).toBe('1');
  });

  it('search is case insensitive', async () => {
    const items = [makeListItem({ id: '1', name: 'Daily REPORT' })];
    vi.mocked(workflowApi.listWorkflows).mockResolvedValue(items);

    const store = useWorkflowStore();
    await store.fetchWorkflows();
    store.searchQuery = 'daily report';

    expect(store.filteredWorkflows).toHaveLength(1);
  });
});
