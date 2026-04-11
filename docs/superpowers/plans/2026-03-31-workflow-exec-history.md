# Workflow Execution History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated execution history view with filtering, pagination, and node-level detail expansion to the workflow system.

**Architecture:** Enhance the existing `GET /workflows/:id/runs` endpoint with pagination/filter query params, add `nodeName`/`nodeType` to run detail response, then build a new `WfRunHistoryView.vue` component accessible from the workflow list page via WorkflowPage's `activeView` state pattern.

**Tech Stack:** Express.js v5 + Prisma v7 (backend), Vue 3 + TypeScript + Pinia + Element Plus (frontend), Vitest (tests)

**Spec:** `docs/superpowers/specs/2026-03-31-workflow-exec-history-design.md`

---

## File Structure

| File | Purpose |
|------|---------|
| `backend/src/workflow/workflow.types.ts` | Add `ListRunsFilter` type and `nodeName`/`nodeType` to `WorkflowNodeRunInfo` |
| `backend/src/workflow/workflow.repository.ts` | Paginated `findRunsByWorkflowId`, `mapNodeRunInfoWithNode` for run detail |
| `backend/src/workflow/workflow.service.ts` | Pass filter params through `listRuns` |
| `backend/src/workflow/workflow.controller.ts` | Parse query params in `listRunsHandler` |
| `frontend/src/utils/time.ts` | Add `formatDuration` utility |
| `frontend/src/types/workflow.ts` | Add `ListRunsParams`, `ListRunsResponse`, `nodeName`/`nodeType` |
| `frontend/src/api/workflow.ts` | Rename `RunListResponse`, add `listRunsPaginated` |
| `frontend/src/stores/workflowStore.ts` | Add history state and actions |
| `frontend/src/locales/zh-CN.ts` | Add `workflow.history.*` keys |
| `frontend/src/locales/en-US.ts` | Add `workflow.history.*` keys |
| `frontend/src/components/workflow/WfListView.vue` | Add history button |
| `frontend/src/components/workflow/WorkflowPage.vue` | Add `'history'` view |
| `frontend/src/components/workflow/WfRunHistoryView.vue` | **New** — history page |
| `frontend/src/components/workflow/WfInfoPanel.vue` | Import `formatDuration` from utils |

---

### Task 1: Backend Types — Add `ListRunsFilter` and extend `WorkflowNodeRunInfo`

**Files:**
- Modify: `backend/src/workflow/workflow.types.ts:255-278`

- [ ] **Step 1: Add `ListRunsFilter` interface and make `nodeName`/`nodeType` optional on `WorkflowNodeRunInfo`**

In `backend/src/workflow/workflow.types.ts`, add `ListRunsFilter` after the `WorkflowRunInfo` interface (after line 262), and add optional fields to `WorkflowNodeRunInfo`:

```typescript
// Add after WorkflowRunInfo interface (line 262):

export interface ListRunsFilter {
  page: number;
  pageSize: number;
  status?: RunStatusValue;
  startFrom?: Date;
  startTo?: Date;
}

export interface ListRunsPage {
  runs: WorkflowRunInfo[];
  total: number;
  page: number;
  pageSize: number;
}
```

In the existing `WorkflowNodeRunInfo` interface, add two optional fields before the closing brace:

```typescript
export interface WorkflowNodeRunInfo {
  // ... existing fields stay ...
  nodeName?: string;
  nodeType?: string;
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/workflow/workflow.types.ts
git commit -m "feat(workflow): add ListRunsFilter, ListRunsPage types and nodeName/nodeType to WorkflowNodeRunInfo"
```

---

### Task 2: Backend Repository — Paginated `findRunsByWorkflowId` and `mapNodeRunInfoWithNode`

**Files:**
- Modify: `backend/src/workflow/workflow.repository.ts:1-30,111-121,399-420`
- Test: `backend/tests/workflow/workflow.repository.test.ts` (new)

- [ ] **Step 1: Write failing tests for paginated `findRunsByWorkflowId`**

Create `backend/tests/workflow/workflow.repository.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock database module
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockFindUnique = vi.fn();

vi.mock('../../src/infrastructure/database', () => ({
  getPrismaClient: () => ({
    workflowRun: {
      findMany: mockFindMany,
      count: mockCount,
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
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run tests/workflow/workflow.repository.test.ts`
Expected: FAIL — `findRunsByWorkflowId` does not accept a second argument

- [ ] **Step 3: Implement paginated `findRunsByWorkflowId`**

In `backend/src/workflow/workflow.repository.ts`:

1. Add imports at the top: `ListRunsFilter, ListRunsPage` from `./workflow.types`
2. Replace the existing `findRunsByWorkflowId` function (lines 399-407):

```typescript
export async function findRunsByWorkflowId(
  workflowId: string,
  filter: ListRunsFilter
): Promise<ListRunsPage> {
  const prisma = getPrismaClient();

  const where: Prisma.WorkflowRunWhereInput = { workflowId };
  if (filter.status) {
    where.status = filter.status;
  }
  if (filter.startFrom || filter.startTo) {
    where.startedAt = {};
    if (filter.startFrom) {
      where.startedAt.gte = filter.startFrom;
    }
    if (filter.startTo) {
      where.startedAt.lte = filter.startTo;
    }
  }

  const [runs, total] = await Promise.all([
    prisma.workflowRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    }),
    prisma.workflowRun.count({ where }),
  ]);

  return {
    runs: runs.map(mapRunInfo),
    total,
    page: filter.page,
    pageSize: filter.pageSize,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/workflow/workflow.repository.test.ts`
Expected: PASS

- [ ] **Step 5: Add `mapNodeRunInfoWithNode` and update `findRunById`**

In `backend/src/workflow/workflow.repository.ts`:

1. Add a Prisma payload type near the top (after line 27):

```typescript
type PrismaNodeRunWithNode = Prisma.WorkflowNodeRunGetPayload<{
  include: { node: { select: { name: true; type: true } } };
}>;
```

2. Add a new mapper function after `mapNodeRunInfo` (after line 122):

```typescript
function mapNodeRunInfoWithNode(nr: PrismaNodeRunWithNode): WorkflowNodeRunInfo {
  return {
    ...mapNodeRunInfo(nr),
    nodeName: nr.node.name,
    nodeType: nr.node.type,
  };
}
```

3. Update `findRunById` to include node relation:

```typescript
export async function findRunById(runId: string): Promise<WorkflowRunDetail | null> {
  const prisma = getPrismaClient();
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: { nodeRuns: { include: { node: { select: { name: true, type: true } } } } },
  });
  if (!run) return null;
  return {
    ...mapRunInfo(run),
    nodeRuns: run.nodeRuns.map(mapNodeRunInfoWithNode),
  };
}
```

- [ ] **Step 6: Verify types compile**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add backend/src/workflow/workflow.repository.ts backend/tests/workflow/workflow.repository.test.ts
git commit -m "feat(workflow): paginated findRunsByWorkflowId and node name/type in run detail"
```

---

### Task 3: Backend Service & Controller — Pass filter params and parse query params

**Files:**
- Modify: `backend/src/workflow/workflow.service.ts:131-137`
- Modify: `backend/src/workflow/workflow.controller.ts:70-74`
- Test: `backend/tests/workflow/workflow.service.test.ts` (update existing)

- [ ] **Step 1: Update `listRuns` in service to accept and pass filter**

In `backend/src/workflow/workflow.service.ts`, update the import to include `ListRunsFilter, ListRunsPage`, then update `listRuns`:

```typescript
export async function listRuns(
  workflowId: string,
  filter: ListRunsFilter
): Promise<ListRunsPage> {
  const existing = await repository.findWorkflowById(workflowId);
  if (!existing) {
    throw new WorkflowNotFoundError('Workflow not found');
  }
  return repository.findRunsByWorkflowId(workflowId, filter);
}
```

- [ ] **Step 2: Update `listRunsHandler` in controller to parse query params**

In `backend/src/workflow/workflow.controller.ts`, add import for `RunStatus` from `./workflow.types`, then update `listRunsHandler`:

```typescript
export async function listRunsHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');

  // Parse pagination
  const rawPage = Number(req.query.page);
  const rawPageSize = Number(req.query.pageSize);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize >= 1
    ? Math.min(Math.floor(rawPageSize), 100)
    : 20;

  // Parse status filter
  const validStatuses = new Set(Object.values(RunStatus));
  const rawStatus = req.query.status;
  const status = typeof rawStatus === 'string' && validStatuses.has(rawStatus as RunStatusValue)
    ? (rawStatus as RunStatusValue)
    : undefined;

  // Parse time range
  const rawFrom = req.query.startFrom;
  const rawTo = req.query.startTo;
  const startFrom = typeof rawFrom === 'string' && !isNaN(Date.parse(rawFrom))
    ? new Date(rawFrom)
    : undefined;
  // End-of-day: append T23:59:59.999Z so runs on the end date are included
  const startTo = typeof rawTo === 'string' && !isNaN(Date.parse(rawTo))
    ? new Date(rawTo + 'T23:59:59.999Z')
    : undefined;

  const result = await workflowService.listRuns(id, { page, pageSize, status, startFrom, startTo });
  res.json(result);
}
```

Also update the import line at the top to include `RunStatus` and `RunStatusValue`:

```typescript
import { SaveWorkflowInput, RunWorkflowInput, RunStatus, RunStatusValue } from './workflow.types';
```

- [ ] **Step 3: Update existing service test mock call sites**

In `backend/tests/workflow/workflow.service.test.ts`, the existing `listRuns` test calls `listRuns(id)` without a filter. Update the mock setup and test:

Find the test for `listRuns` and update it to pass a filter argument. The mock `mockFindRunsByWorkflowId` also needs to return the paginated structure. Update:

```typescript
describe('listRuns', () => {
  it('should return paginated runs for existing workflow', async () => {
    mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());
    const page = {
      runs: [{ id: 'run-1', workflowId: 'wf-1', status: 'completed', startedAt: now, completedAt: now, errorMessage: null }],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    mockFindRunsByWorkflowId.mockResolvedValue(page);

    const filter = { page: 1, pageSize: 20 };
    const result = await listRuns('wf-1', filter);
    expect(result).toEqual(page);
    expect(mockFindRunsByWorkflowId).toHaveBeenCalledWith('wf-1', filter);
  });

  it('should throw WorkflowNotFoundError when workflow does not exist', async () => {
    mockFindWorkflowById.mockResolvedValue(null);

    await expect(listRuns('missing', { page: 1, pageSize: 20 })).rejects.toThrow(WorkflowNotFoundError);
  });
});
```

- [ ] **Step 4: Run all backend tests**

Run: `cd backend && npx vitest run tests/workflow/workflow.service.test.ts tests/workflow/workflow.repository.test.ts`
Expected: PASS

- [ ] **Step 5: Run backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS (lint + tsc + build)

- [ ] **Step 6: Commit**

```bash
git add backend/src/workflow/workflow.service.ts backend/src/workflow/workflow.controller.ts backend/tests/workflow/workflow.service.test.ts
git commit -m "feat(workflow): paginated listRuns API with status/time-range filters"
```

---

### Task 4: Frontend Shared Utility — Extract `formatDuration`

**Files:**
- Modify: `frontend/src/utils/time.ts`
- Modify: `frontend/src/components/workflow/WfInfoPanel.vue:91-99`

- [ ] **Step 1: Add `formatDuration` to `frontend/src/utils/time.ts`**

Append to the end of the file:

```typescript
/**
 * Format duration between two ISO timestamps.
 * Returns '--' if endIso is null (still running).
 */
export function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return '--';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remainSecs}s`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}
```

- [ ] **Step 2: Update `WfInfoPanel.vue` to import from shared utility**

In `frontend/src/components/workflow/WfInfoPanel.vue`, add import at the top of `<script setup>`:

```typescript
import { formatDuration } from '@/utils/time';
```

Then remove the local `formatDuration` function (lines 91-99).

- [ ] **Step 3: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/time.ts frontend/src/components/workflow/WfInfoPanel.vue
git commit -m "refactor(workflow): extract formatDuration to shared utils/time"
```

---

### Task 5: Frontend Types & API — Add paginated run types and `listRunsPaginated`

**Files:**
- Modify: `frontend/src/types/workflow.ts:160-183`
- Modify: `frontend/src/api/workflow.ts:21-23,107-110`

- [ ] **Step 1: Update frontend types**

In `frontend/src/types/workflow.ts`:

1. Add `nodeName` and `nodeType` as optional fields to `WorkflowNodeRunInfo` (after line 178):

```typescript
export interface WorkflowNodeRunInfo {
  id: string;
  runId: string;
  nodeId: string;
  status: ExecutionStatus;
  inputs: Record<string, unknown> | null;
  outputs: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  nodeName?: string;
  nodeType?: string;
}
```

2. Add new interfaces after `WorkflowRunDetail` (after line 183):

```typescript
export interface ListRunsParams {
  page?: number;
  pageSize?: number;
  status?: ExecutionStatus;
  startFrom?: string;
  startTo?: string;
}

export interface ListRunsResponse {
  runs: WorkflowRunInfo[];
  total: number;
  page: number;
  pageSize: number;
}
```

- [ ] **Step 2: Update frontend API**

In `frontend/src/api/workflow.ts`:

1. Add imports for the new types:

```typescript
import type {
  // ... existing imports ...
  ListRunsParams,
  ListRunsResponse,
} from '@/types/workflow';
```

2. Rename `RunListResponse` to `ListRunsResponse` (lines 21-23) and extend with pagination fields:

```typescript
interface ListRunsResponse {
  runs: WorkflowRunInfo[];
  total: number;
  page: number;
  pageSize: number;
}
```

Update the existing `listRuns` function to use the new name:

```typescript
export async function listRuns(workflowId: string): Promise<WorkflowRunInfo[]> {
  const res = await http.get<ListRunsResponse>(`/workflows/${workflowId}/runs`);
  return res.runs;
}
```

3. Add `listRunsPaginated` function after the existing `listRuns` (after line 110):

```typescript
export async function listRunsPaginated(
  workflowId: string,
  params: ListRunsParams
): Promise<ListRunsResponse> {
  return http.get<ListRunsResponse>(`/workflows/${workflowId}/runs`, { params });
}
```

- [ ] **Step 3: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/workflow.ts frontend/src/api/workflow.ts
git commit -m "feat(workflow): add ListRunsParams, ListRunsResponse types and listRunsPaginated API"
```

---

### Task 6: Frontend i18n — Add `workflow.history.*` keys

**Files:**
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`

- [ ] **Step 1: Add Chinese locale keys**

In `frontend/src/locales/zh-CN.ts`, inside the `workflow` object, add a `history` block after the `status` block (before the closing `},` of workflow, around line 476):

```typescript
    history: {
      title: '执行历史',
      back: '返回',
      status: '状态',
      startedAt: '开始时间',
      duration: '耗时',
      errorMessage: '错误信息',
      nodeDetails: '节点详情',
      inputs: '输入',
      outputs: '输出',
      noRuns: '暂无执行记录',
      dateRange: '时间范围',
      filterAll: '全部状态',
      loadError: '加载失败',
      retry: '重试',
    },
```

- [ ] **Step 2: Add English locale keys**

In `frontend/src/locales/en-US.ts`, inside the `workflow` object, add a `history` block after the `status` block (before the closing `},` of workflow, around line 482):

```typescript
    history: {
      title: 'Execution History',
      back: 'Back',
      status: 'Status',
      startedAt: 'Started At',
      duration: 'Duration',
      errorMessage: 'Error Message',
      nodeDetails: 'Node Details',
      inputs: 'Inputs',
      outputs: 'Outputs',
      noRuns: 'No execution records',
      dateRange: 'Date Range',
      filterAll: 'All Statuses',
      loadError: 'Failed to load',
      retry: 'Retry',
    },
```

- [ ] **Step 3: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/locales/zh-CN.ts frontend/src/locales/en-US.ts
git commit -m "feat(i18n): add workflow.history locale keys for zh-CN and en-US"
```

---

### Task 7: Frontend Store — Add history state and actions

**Files:**
- Modify: `frontend/src/stores/workflowStore.ts`
- Test: `frontend/tests/stores/workflowStore-history.test.ts` (new)

- [ ] **Step 1: Write failing store tests**

Create `frontend/tests/stores/workflowStore-history.test.ts`:

```typescript
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
    it('should clear all history state', async () => {
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/stores/workflowStore-history.test.ts`
Expected: FAIL — `fetchHistoryRuns` etc. not defined on store

- [ ] **Step 3: Implement history state and actions in store**

In `frontend/src/stores/workflowStore.ts`:

1. Add import for `ListRunsParams` to the type imports (line 4-17):

```typescript
import type {
  // ... existing imports ...
  ListRunsParams,
} from '@/types/workflow';
```

2. Add history state after the existing `runs` ref (after line 38):

```typescript
  // ── History State ──────────────────────────────────
  const historyRuns = ref<WorkflowRunInfo[]>([]);
  const historyTotal = ref(0);
  const historyPage = ref(1);
  const historyPageSize = ref(20);
  const historyStatusFilter = ref<ExecutionStatus | 'all'>('all');
  const historyDateRange = ref<[string, string] | null>(null);
  const historyLoading = ref(false);
  const expandedRunDetails = reactive<Map<string, WorkflowRunDetail>>(new Map());
  const expandedRunLoading = ref<string | null>(null);
```

3. Add history actions after the existing `fetchRuns` function (after line 408):

```typescript
  // ── History Actions ─────────────────────────────────
  async function fetchHistoryRuns(workflowId: string): Promise<void> {
    historyLoading.value = true;
    try {
      const params: ListRunsParams = {
        page: historyPage.value,
        pageSize: historyPageSize.value,
      };
      if (historyStatusFilter.value !== 'all') {
        params.status = historyStatusFilter.value;
      }
      if (historyDateRange.value) {
        params.startFrom = historyDateRange.value[0];
        params.startTo = historyDateRange.value[1];
      }
      const result = await workflowApi.listRunsPaginated(workflowId, params);
      historyRuns.value = result.runs;
      historyTotal.value = result.total;
    } finally {
      historyLoading.value = false;
    }
  }

  async function fetchRunDetailForHistory(workflowId: string, runId: string): Promise<void> {
    if (expandedRunDetails.has(runId)) return;
    expandedRunLoading.value = runId;
    try {
      const detail = await workflowApi.getRunDetail(workflowId, runId);
      expandedRunDetails.set(runId, detail);
    } finally {
      expandedRunLoading.value = null;
    }
  }

  function resetHistoryState(): void {
    historyRuns.value = [];
    historyTotal.value = 0;
    historyPage.value = 1;
    historyPageSize.value = 20;
    historyStatusFilter.value = 'all';
    historyDateRange.value = null;
    historyLoading.value = false;
    expandedRunDetails.clear();
    expandedRunLoading.value = null;
  }
```

4. Add the new state and actions to the `return` object (in the return block around line 437-486):

```typescript
    // History
    historyRuns,
    historyTotal,
    historyPage,
    historyPageSize,
    historyStatusFilter,
    historyDateRange,
    historyLoading,
    expandedRunDetails,
    expandedRunLoading,
    fetchHistoryRuns,
    fetchRunDetailForHistory,
    resetHistoryState,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/stores/workflowStore-history.test.ts`
Expected: PASS

- [ ] **Step 5: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/workflowStore.ts frontend/tests/stores/workflowStore-history.test.ts
git commit -m "feat(workflow): add history state and actions to workflowStore"
```

---

### Task 8: Frontend — WfListView history button

**Files:**
- Modify: `frontend/src/components/workflow/WfListView.vue`

- [ ] **Step 1: Add history button to desktop table and mobile cards**

In `frontend/src/components/workflow/WfListView.vue`:

1. Add `Clock` icon import (add to the `@element-plus/icons-vue` import line 208-216):

```typescript
import {
  Search,
  Plus,
  Edit as EditIcon,
  VideoPlay,
  CopyDocument,
  Download,
  Delete as DeleteIcon,
  Clock,
} from '@element-plus/icons-vue';
```

2. Add `history` to the emit definition (around line 240-243):

```typescript
const emit = defineEmits<{
  edit: [id: string];
  created: [id: string];
  history: [id: string];
}>();
```

3. In the desktop table actions column (around line 80-107), add a history button after the export button and before the delete button:

```html
            <el-tooltip :content="t('workflow.history.title')" placement="top">
              <el-button size="small" :icon="Clock" circle @click="emit('history', row.id)" />
            </el-tooltip>
```

4. In the mobile card actions (around line 127-155), add the same button after the export button and before the delete button:

```html
          <el-tooltip :content="t('workflow.history.title')" placement="top">
            <el-button size="small" :icon="Clock" circle @click="emit('history', wf.id)" />
          </el-tooltip>
```

- [ ] **Step 2: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workflow/WfListView.vue
git commit -m "feat(workflow): add history button to workflow list view"
```

---

### Task 9: Frontend — WfRunHistoryView component

**Files:**
- Create: `frontend/src/components/workflow/WfRunHistoryView.vue`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/workflow/WfRunHistoryView.vue`:

```vue
<template>
  <div class="wf-history" :class="{ 'wf-history--mobile': isMobile }">
    <!-- Header -->
    <div class="wf-history__header">
      <button class="wf-history__back-btn" @click="emit('back')">
        <ArrowLeft :size="18" />
      </button>
      <h2 class="wf-history__title">
        {{ workflowName }} — {{ t('workflow.history.title') }}
      </h2>
    </div>

    <!-- Filters -->
    <div class="wf-history__filters">
      <el-select v-model="store.historyStatusFilter" class="wf-history__status-filter">
        <el-option :label="t('workflow.history.filterAll')" value="all" />
        <el-option :label="t('workflow.status.completed')" value="completed" />
        <el-option :label="t('workflow.status.failed')" value="failed" />
        <el-option :label="t('workflow.status.running')" value="running" />
        <el-option :label="t('workflow.status.pending')" value="pending" />
        <el-option :label="t('workflow.status.cancelled')" value="cancelled" />
        <el-option :label="t('workflow.status.skipped')" value="skipped" />
      </el-select>
      <el-date-picker
        v-model="store.historyDateRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        :start-placeholder="t('workflow.history.dateRange')"
        :end-placeholder="t('workflow.history.dateRange')"
        clearable
        class="wf-history__date-filter"
      />
    </div>

    <!-- Error state -->
    <div v-if="loadError" class="wf-history__error">
      <p>{{ t('workflow.history.loadError') }}</p>
      <el-button type="primary" size="small" @click="reload">
        {{ t('workflow.history.retry') }}
      </el-button>
    </div>

    <!-- Desktop: Table -->
    <template v-else-if="!isMobile && store.historyRuns.length > 0">
      <el-table
        v-loading="store.historyLoading"
        :data="store.historyRuns"
        row-key="id"
        class="wf-history__table"
        @expand-change="handleExpandChange"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div v-if="store.expandedRunLoading === row.id" class="wf-history__node-loading">
              <el-skeleton :rows="3" animated />
            </div>
            <div v-else-if="store.expandedRunDetails.get(row.id)" class="wf-history__node-list">
              <div
                v-for="nr in store.expandedRunDetails.get(row.id)!.nodeRuns"
                :key="nr.id"
                class="wf-history__node-item"
              >
                <div class="wf-history__node-header">
                  <span
                    :class="['wf-status-badge', 'wf-status-badge--' + nr.status]"
                  >{{ t(`workflow.status.${nr.status}`) }}</span>
                  <span class="wf-history__node-name">{{ nr.nodeName ?? nr.nodeId }}</span>
                  <span class="wf-history__node-duration">
                    {{ nr.startedAt ? formatDuration(nr.startedAt, nr.completedAt) : '--' }}
                  </span>
                </div>
                <div v-if="nr.errorMessage" class="wf-history__node-error">
                  {{ nr.errorMessage }}
                </div>
                <details v-if="nr.inputs" class="wf-history__node-io">
                  <summary>{{ t('workflow.history.inputs') }}</summary>
                  <pre>{{ JSON.stringify(nr.inputs, null, 2) }}</pre>
                </details>
                <details v-if="nr.outputs" class="wf-history__node-io">
                  <summary>{{ t('workflow.history.outputs') }}</summary>
                  <pre>{{ JSON.stringify(nr.outputs, null, 2) }}</pre>
                </details>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('workflow.history.status')" width="120">
          <template #default="{ row }">
            <span :class="['wf-status-badge', 'wf-status-badge--' + row.status]">
              {{ t(`workflow.status.${row.status}`) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column :label="t('workflow.history.startedAt')" width="180">
          <template #default="{ row }">
            {{ new Date(row.startedAt).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column :label="t('workflow.history.duration')" width="120">
          <template #default="{ row }">
            {{ formatDuration(row.startedAt, row.completedAt) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('workflow.history.errorMessage')">
          <template #default="{ row }">
            <span v-if="row.errorMessage" class="wf-history__error-text">
              {{ row.errorMessage }}
            </span>
            <span v-else class="wf-history__no-error">—</span>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- Mobile: Cards -->
    <div v-else-if="isMobile && store.historyRuns.length > 0" v-loading="store.historyLoading" class="wf-history__cards">
      <div
        v-for="run in store.historyRuns"
        :key="run.id"
        class="wf-history__card"
        @click="toggleMobileExpand(run.id)"
      >
        <div class="wf-history__card-header">
          <span :class="['wf-status-badge', 'wf-status-badge--' + run.status]">
            {{ t(`workflow.status.${run.status}`) }}
          </span>
          <span class="wf-history__card-time">
            {{ new Date(run.startedAt).toLocaleString() }}
          </span>
        </div>
        <div class="wf-history__card-meta">
          <span>{{ t('workflow.history.duration') }}: {{ formatDuration(run.startedAt, run.completedAt) }}</span>
        </div>
        <div v-if="run.errorMessage" class="wf-history__card-error">
          {{ run.errorMessage }}
        </div>
        <!-- Expanded node details -->
        <div v-if="mobileExpandedId === run.id" class="wf-history__card-nodes">
          <div v-if="store.expandedRunLoading === run.id" class="wf-history__node-loading">
            <el-skeleton :rows="2" animated />
          </div>
          <template v-else-if="store.expandedRunDetails.get(run.id)">
            <div
              v-for="nr in store.expandedRunDetails.get(run.id)!.nodeRuns"
              :key="nr.id"
              class="wf-history__node-item"
            >
              <div class="wf-history__node-header">
                <span :class="['wf-status-badge', 'wf-status-badge--' + nr.status]">
                  {{ t(`workflow.status.${nr.status}`) }}
                </span>
                <span class="wf-history__node-name">{{ nr.nodeName ?? nr.nodeId }}</span>
                <span class="wf-history__node-duration">
                  {{ nr.startedAt ? formatDuration(nr.startedAt, nr.completedAt) : '--' }}
                </span>
              </div>
              <div v-if="nr.errorMessage" class="wf-history__node-error">
                {{ nr.errorMessage }}
              </div>
              <details v-if="nr.inputs" class="wf-history__node-io">
                <summary>{{ t('workflow.history.inputs') }}</summary>
                <pre>{{ JSON.stringify(nr.inputs, null, 2) }}</pre>
              </details>
              <details v-if="nr.outputs" class="wf-history__node-io">
                <summary>{{ t('workflow.history.outputs') }}</summary>
                <pre>{{ JSON.stringify(nr.outputs, null, 2) }}</pre>
              </details>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <el-empty
      v-if="!store.historyLoading && !loadError && store.historyRuns.length === 0"
      :description="t('workflow.history.noRuns')"
    />

    <!-- Pagination -->
    <div v-if="store.historyTotal > 0" class="wf-history__pagination">
      <el-pagination
        v-model:current-page="store.historyPage"
        v-model:page-size="store.historyPageSize"
        :total="store.historyTotal"
        :page-sizes="[10, 20, 50]"
        :small="isMobile"
        layout="total, sizes, prev, pager, next"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft } from 'lucide-vue-next';
import { useWorkflowStore } from '@/stores/workflowStore';
import { formatDuration } from '@/utils/time';
import type { WorkflowRunInfo } from '@/types/workflow';

const props = defineProps<{
  workflowId: string;
  workflowName: string;
  isMobile?: boolean;
}>();

const emit = defineEmits<{
  back: [];
}>();

const { t } = useI18n();
const store = useWorkflowStore();
const loadError = ref(false);
const mobileExpandedId = ref<string | null>(null);

async function reload(): Promise<void> {
  loadError.value = false;
  try {
    await store.fetchHistoryRuns(props.workflowId);
  } catch {
    loadError.value = true;
  }
}

onMounted(() => {
  reload();
});

// Reset to page 1 when filters change (not when page/pageSize change)
watch(
  [() => store.historyStatusFilter, () => store.historyDateRange],
  () => {
    store.historyPage = 1;
  }
);

// Re-fetch when page, pageSize, or filters change
watch(
  [() => store.historyPage, () => store.historyPageSize, () => store.historyStatusFilter, () => store.historyDateRange],
  () => {
    reload();
  }
);

function handleExpandChange(row: WorkflowRunInfo, expandedRows: WorkflowRunInfo[]): void {
  const isExpanding = expandedRows.some((r) => r.id === row.id);
  if (isExpanding) {
    store.fetchRunDetailForHistory(props.workflowId, row.id);
  }
}

function toggleMobileExpand(runId: string): void {
  if (mobileExpandedId.value === runId) {
    mobileExpandedId.value = null;
  } else {
    mobileExpandedId.value = runId;
    store.fetchRunDetailForHistory(props.workflowId, runId);
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-history {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  padding: $spacing-lg;
  overflow-y: auto;

  &--mobile {
    padding: $spacing-md;
  }

  &__header {
    display: flex;
    align-items: center;
    gap: $spacing-md;
    margin-bottom: $spacing-lg;
  }

  &__back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: $radius-md;
    background: none;
    border: none;
    cursor: pointer;
    color: $text-muted;
    transition: all $transition-fast;

    &:hover {
      background-color: $bg-elevated;
      color: $text-secondary-color;
    }
  }

  &__title {
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
    margin: 0;
  }

  &__filters {
    display: flex;
    gap: $spacing-md;
    margin-bottom: $spacing-lg;
    flex-wrap: wrap;
  }

  &__status-filter {
    width: 160px;
  }

  &__date-filter {
    width: 280px;
  }

  &__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: $spacing-sm;
    padding: $spacing-xl;
    color: $text-muted;
  }

  &__table {
    flex: 1;
  }

  &__pagination {
    display: flex;
    justify-content: center;
    padding-top: $spacing-lg;
  }

  // Node detail styles (shared desktop & mobile)
  &__node-loading {
    padding: $spacing-md;
  }

  &__node-list {
    padding: $spacing-sm $spacing-lg;
  }

  &__node-item {
    padding: $spacing-sm 0;
    border-bottom: 1px solid $border-dark;

    &:last-child {
      border-bottom: none;
    }
  }

  &__node-header {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }

  &__node-name {
    font-weight: $font-weight-medium;
    color: $text-primary-color;
  }

  &__node-duration {
    color: $text-muted;
    font-size: $font-size-sm;
    margin-left: auto;
  }

  &__node-error {
    color: #ef4444;
    font-size: $font-size-sm;
    padding: $spacing-xs 0;
  }

  &__node-io {
    margin-top: $spacing-xs;
    font-size: $font-size-sm;

    summary {
      cursor: pointer;
      color: $text-secondary-color;
      user-select: none;
    }

    pre {
      margin: $spacing-xs 0;
      padding: $spacing-sm;
      background: $bg-deeper;
      border-radius: $radius-sm;
      overflow-x: auto;
      font-size: 12px;
      max-height: 200px;
      overflow-y: auto;
    }
  }

  &__error-text {
    color: #ef4444;
    font-size: $font-size-sm;
  }

  &__no-error {
    color: $text-muted;
  }

  // Mobile card styles
  &__cards {
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
  }

  &__card {
    background: $bg-elevated;
    border: 1px solid $border-dark;
    border-radius: $radius-md;
    padding: $spacing-md;
    cursor: pointer;
    transition: border-color $transition-fast;

    &:active {
      border-color: $border-elevated;
    }
  }

  &__card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $spacing-xs;
  }

  &__card-time {
    font-size: $font-size-sm;
    color: $text-muted;
  }

  &__card-meta {
    font-size: $font-size-sm;
    color: $text-secondary-color;
    margin-bottom: $spacing-xs;
  }

  &__card-error {
    color: #ef4444;
    font-size: $font-size-sm;
    margin-bottom: $spacing-sm;
  }

  &__card-nodes {
    margin-top: $spacing-sm;
    border-top: 1px solid $border-dark;
    padding-top: $spacing-sm;
  }
}

// Reuse status badge styles from WfListView
.wf-status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;

  &--completed {
    background-color: rgba(34, 197, 94, 0.1);
    color: #22c55e;
  }
  &--failed {
    background-color: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }
  &--running,
  &--pending {
    background-color: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
  }
  &--skipped {
    background-color: rgba(249, 115, 22, 0.1);
    color: #f97316;
  }
  &--cancelled,
  &--none {
    background-color: rgba(107, 114, 128, 0.1);
    color: #6b7280;
  }
}
</style>
```

- [ ] **Step 2: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workflow/WfRunHistoryView.vue
git commit -m "feat(workflow): add WfRunHistoryView component with filters, pagination, and node detail"
```

---

### Task 10: Frontend — WorkflowPage integration

**Files:**
- Modify: `frontend/src/components/workflow/WorkflowPage.vue`

- [ ] **Step 1: Add history view to WorkflowPage**

In `frontend/src/components/workflow/WorkflowPage.vue`:

1. Add import for `WfRunHistoryView` (after the other imports around line 210):

```typescript
import WfRunHistoryView from './WfRunHistoryView.vue';
```

2. Change `activeView` type (line 225):

```typescript
const activeView = ref<'list' | 'editor' | 'history'>('list');
```

3. Add `historyWorkflowId` and `historyWorkflowName` refs (after `activeView`):

```typescript
const historyWorkflowId = ref('');
const historyWorkflowName = ref('');
```

4. In the desktop template (lines 4-73), change `<template v-else>` to `<template v-else-if="activeView === 'editor'">` and add a history view block after it (before the closing `</template>` of the desktop section):

```html
      <!-- History view -->
      <template v-else-if="activeView === 'history'">
        <WfRunHistoryView
          :workflow-id="historyWorkflowId"
          :workflow-name="historyWorkflowName"
          @back="handleHistoryBack"
        />
      </template>
```

5. In the mobile template (lines 77-163), similarly change `<template v-else>` to `<template v-else-if="activeView === 'editor'">` and add:

```html
      <!-- Mobile history view -->
      <template v-else-if="activeView === 'history'">
        <WfRunHistoryView
          :workflow-id="historyWorkflowId"
          :workflow-name="historyWorkflowName"
          :is-mobile="true"
          @back="handleHistoryBack"
        />
      </template>
```

6. Add `@history` to both WfListView usages (lines 7 and 80):

```html
<WfListView :is-mobile="false" @edit="handleEdit" @created="handleCreated" @history="handleHistory" />
```

```html
<WfListView :is-mobile="true" @edit="handleEdit" @created="handleCreated" @history="handleHistory" />
```

7. Add handler functions (after `handleEditorBack` around line 306):

```typescript
function handleHistory(id: string): void {
  const wf = store.workflows.find((w) => w.id === id);
  historyWorkflowId.value = id;
  historyWorkflowName.value = wf?.name ?? '';
  activeView.value = 'history';
}

function handleHistoryBack(): void {
  store.resetHistoryState();
  activeView.value = 'list';
}
```

- [ ] **Step 2: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workflow/WorkflowPage.vue
git commit -m "feat(workflow): integrate WfRunHistoryView into WorkflowPage with history view switching"
```

---

### Task 11: Missing Tests — findRunById, WfListView, WfRunHistoryView

**Files:**
- Modify: `backend/tests/workflow/workflow.repository.test.ts` (add findRunById test)
- Create: `frontend/tests/components/workflow/WfRunHistoryView.test.ts`

- [ ] **Step 1: Add findRunById test with nodeName/nodeType to repository tests**

Append to `backend/tests/workflow/workflow.repository.test.ts`. First, update the mock setup to include `workflowRun.findUnique`:

```typescript
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
```

Then add the test:

```typescript
describe('findRunById', () => {
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
```

- [ ] **Step 2: Run backend repository tests**

Run: `cd backend && npx vitest run tests/workflow/workflow.repository.test.ts`
Expected: PASS

- [ ] **Step 3: Create WfRunHistoryView component test**

Create `frontend/tests/components/workflow/WfRunHistoryView.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useWorkflowStore } from '@/stores/workflowStore';
import * as workflowApi from '@/api/workflow';
import WfRunHistoryView from '@/components/workflow/WfRunHistoryView.vue';

vi.mock('@/api/workflow');

// Mock Element Plus components
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus');
  return actual;
});

describe('WfRunHistoryView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(workflowApi.listRunsPaginated).mockResolvedValue({
      runs: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mountComponent(props = {}) {
    return mount(WfRunHistoryView, {
      props: {
        workflowId: 'wf-1',
        workflowName: 'Test Workflow',
        ...props,
      },
      global: {
        stubs: {
          'el-table': { template: '<div><slot /></div>' },
          'el-table-column': { template: '<div><slot /></div>' },
          'el-select': { template: '<div><slot /></div>' },
          'el-option': { template: '<div />' },
          'el-date-picker': { template: '<div />' },
          'el-pagination': { template: '<div />' },
          'el-empty': { template: '<div class="el-empty" />' },
          'el-skeleton': { template: '<div />' },
        },
      },
    });
  }

  it('should render header with workflow name', () => {
    const wrapper = mountComponent();
    expect(wrapper.text()).toContain('Test Workflow');
  });

  it('should emit back event when back button clicked', async () => {
    const wrapper = mountComponent();
    await wrapper.find('.wf-history__back-btn').trigger('click');
    expect(wrapper.emitted('back')).toHaveLength(1);
  });

  it('should call fetchHistoryRuns on mount', () => {
    mountComponent();
    expect(workflowApi.listRunsPaginated).toHaveBeenCalledWith('wf-1', {
      page: 1,
      pageSize: 20,
    });
  });

  it('should show empty state when no runs', async () => {
    const wrapper = mountComponent();
    await vi.dynamicImportSettled();
    // After loading completes, empty state should be visible
    const store = useWorkflowStore();
    store.historyLoading = false;
    store.historyRuns = [];
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.el-empty').exists()).toBe(true);
  });
});
```

- [ ] **Step 4: Run frontend component tests**

Run: `cd frontend && npx vitest run tests/components/workflow/WfRunHistoryView.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tests/workflow/workflow.repository.test.ts frontend/tests/components/workflow/WfRunHistoryView.test.ts
git commit -m "test(workflow): add findRunById and WfRunHistoryView tests"
```

---

### Task 12: Final Verification & Preflight

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 2: Run full frontend test suite**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Verify no regressions in existing tests**

Run: `cd backend && npx vitest run` and `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Final commit if any cleanup needed, then done**
