# Workflow List View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blank workflow main area with a full-width list view (table on desktop, cards on mobile) showing workflow summaries, with edit/run/clone/export/delete actions.

**Architecture:** `WorkflowPage.vue` switches between `list` and `editor` views. New `WfListView.vue` renders the list with search/filter. Backend gains `lastRunStatus` on list items plus clone/export APIs.

**Tech Stack:** Vue 3 + TypeScript + Element Plus, Express.js v5 + Prisma v7, Pinia, Vitest

**Spec:** `docs/superpowers/specs/2026-03-28-workflow-list-view-design.md`

---

### Task 1: Backend — Add `lastRunStatus` to workflow list

**Files:**
- Modify: `backend/src/workflow/workflow.types.ts:170-178`
- Modify: `backend/src/workflow/workflow.repository.ts:25-27,73-84,139-149`

- [ ] **Step 1: Update backend `WorkflowListItem` type**

In `backend/src/workflow/workflow.types.ts`, add `lastRunStatus` to the interface:

```typescript
// line 170
export interface WorkflowListItem {
  id: string;
  name: string;
  description: string | null;
  nodeCount: number;
  lastRunAt: Date | null;
  lastRunStatus: RunStatusValue | null;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Update Prisma type and query in repository**

In `backend/src/workflow/workflow.repository.ts`:

Update `PrismaWorkflowForList` (line 25-27):
```typescript
type PrismaWorkflowForList = Prisma.WorkflowGetPayload<{
  include: { nodes: { select: { id: true } }; runs: { select: { startedAt: true; status: true } } };
}>;
```

Update `findAllWorkflows` query (line 139-149):
```typescript
export async function findAllWorkflows(): Promise<WorkflowListItem[]> {
  const prisma = getPrismaClient();
  const workflows = await prisma.workflow.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      nodes: { select: { id: true } },
      runs: { select: { startedAt: true, status: true }, orderBy: { startedAt: 'desc' }, take: 1 },
    },
  });
  return workflows.map(mapWorkflowListItem);
}
```

Update `mapWorkflowListItem` (line 73-84):
```typescript
function mapWorkflowListItem(wf: PrismaWorkflowForList): WorkflowListItem {
  const lastRun = wf.runs.length > 0 ? wf.runs[0] : null;
  return {
    id: wf.id,
    name: wf.name,
    description: wf.description,
    nodeCount: wf.nodes.length,
    lastRunAt: lastRun?.startedAt ?? null,
    lastRunStatus: (lastRun?.status as RunStatusValue) ?? null,
    createdAt: wf.createdAt,
    updatedAt: wf.updatedAt,
  };
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd backend/ && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/workflow/workflow.types.ts backend/src/workflow/workflow.repository.ts
git commit -m "feat(workflow): add lastRunStatus to workflow list API"
```

---

### Task 2: Backend — Add clone and export APIs

**Files:**
- Modify: `backend/src/errors/errorCode.ts:3,39`
- Modify: `backend/src/errors/types.ts` (after line 231)
- Modify: `backend/src/workflow/workflow.types.ts` (after line 178)
- Modify: `backend/src/workflow/workflow.repository.ts`
- Modify: `backend/src/workflow/workflow.service.ts`
- Modify: `backend/src/workflow/workflow.controller.ts`
- Modify: `backend/src/workflow/workflow.routes.ts`

- [ ] **Step 1: Add error code for clone failure**

In `backend/src/errors/errorCode.ts`, update `LAST_USED_CODE` comment to `E00035` and add:
```typescript
WORKFLOW_CLONE_ERROR: 'E00035',
```

In `backend/src/errors/types.ts`, after `CustomNodeTemplateNotFoundError` class (after line 231):
```typescript
export class WorkflowCloneError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.WORKFLOW_CLONE_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, WorkflowCloneError.prototype);
  }
}
```

Also add the import for `WORKFLOW_CLONE_ERROR` if `ErrorCode` is imported at the top (it already imports all of `ErrorCode`).

- [ ] **Step 2: Add `ExportedWorkflow` type**

In `backend/src/workflow/workflow.types.ts`, after the `WorkflowListItem` interface:

```typescript
export interface ExportedWorkflowNode {
  name: string;
  description: string | null;
  type: WorkflowNodeTypeValue;
  config: NodeConfig;
  positionX: number;
  positionY: number;
}

export interface ExportedWorkflowEdge {
  sourceNodeName: string;
  targetNodeName: string;
}

export interface ExportedWorkflow {
  name: string;
  description: string | null;
  nodes: ExportedWorkflowNode[];
  edges: ExportedWorkflowEdge[];
}
```

- [ ] **Step 3: Add repository functions for clone and export**

In `backend/src/workflow/workflow.repository.ts`:

Add import for `ExportedWorkflow, ExportedWorkflowNode, ExportedWorkflowEdge` from `./workflow.types`.

Add after `deleteWorkflow` function:

```typescript
export async function cloneWorkflow(
  sourceId: string,
  newName: string
): Promise<WorkflowListItem> {
  const prisma = getPrismaClient();

  const source = await prisma.workflow.findUnique({
    where: { id: sourceId },
    include: { nodes: true, edges: true },
  });
  if (!source) {
    throw new Error('Source workflow not found');
  }

  // Build node ID mapping: oldId → newId (generated by Prisma)
  const nodeIdMap = new Map<string, string>();

  const result = await prisma.$transaction(async (tx) => {
    // Create new workflow
    const newWf = await tx.workflow.create({
      data: { name: newName, description: source.description },
    });

    // Clone nodes
    for (const node of source.nodes) {
      const newNode = await tx.workflowNode.create({
        data: {
          workflowId: newWf.id,
          name: node.name,
          description: node.description,
          type: node.type,
          config: node.config,
          positionX: node.positionX,
          positionY: node.positionY,
        },
      });
      nodeIdMap.set(node.id, newNode.id);
    }

    // Clone edges with mapped IDs
    for (const edge of source.edges) {
      const newSourceId = nodeIdMap.get(edge.sourceNodeId);
      const newTargetId = nodeIdMap.get(edge.targetNodeId);
      if (newSourceId && newTargetId) {
        await tx.workflowEdge.create({
          data: {
            workflowId: newWf.id,
            sourceNodeId: newSourceId,
            targetNodeId: newTargetId,
          },
        });
      }
    }

    // Fetch the new workflow for list item mapping
    return tx.workflow.findUniqueOrThrow({
      where: { id: newWf.id },
      include: {
        nodes: { select: { id: true } },
        runs: { select: { startedAt: true, status: true }, orderBy: { startedAt: 'desc' }, take: 1 },
      },
    });
  });

  return mapWorkflowListItem(result);
}

export async function exportWorkflow(id: string): Promise<ExportedWorkflow | null> {
  const prisma = getPrismaClient();
  const wf = await prisma.workflow.findUnique({
    where: { id },
    include: { nodes: true, edges: true },
  });
  if (!wf) return null;

  const nodeNameMap = new Map<string, string>();
  for (const node of wf.nodes) {
    nodeNameMap.set(node.id, node.name);
  }

  const nodes: ExportedWorkflowNode[] = wf.nodes.map((n) => ({
    name: n.name,
    description: n.description,
    type: n.type as WorkflowNodeTypeValue,
    config: parseNodeConfig(n.config),
    positionX: n.positionX,
    positionY: n.positionY,
  }));

  const edges: ExportedWorkflowEdge[] = wf.edges
    .map((e) => {
      const sourceName = nodeNameMap.get(e.sourceNodeId);
      const targetName = nodeNameMap.get(e.targetNodeId);
      if (!sourceName || !targetName) return null;
      return { sourceNodeName: sourceName, targetNodeName: targetName };
    })
    .filter((e): e is ExportedWorkflowEdge => e !== null);

  return {
    name: wf.name,
    description: wf.description,
    nodes,
    edges,
  };
}
```

Add import for `WorkflowCloneError` from `@/errors/types` if needed (actually the error is thrown from service, not repository — the repository throws a plain Error which the service catches).

- [ ] **Step 4: Add service functions**

In `backend/src/workflow/workflow.service.ts`:

Add imports:
```typescript
import { WorkflowNotFoundError, WorkflowValidationError, WorkflowCloneError } from '@/errors/types';
import {
  WorkflowListItem,
  WorkflowDetail,
  SaveWorkflowInput,
  WorkflowRunInfo,
  WorkflowRunDetail,
  ExportedWorkflow,
  isValidNodeType,
} from './workflow.types';
```

Add after `deleteWorkflow`:

```typescript
export async function cloneWorkflow(id: string, name: string): Promise<WorkflowListItem> {
  validateWorkflowName(name);
  try {
    const cloned = await repository.cloneWorkflow(id, name);
    logger.info('Cloned workflow', { sourceId: id, newId: cloned.id, name });
    return cloned;
  } catch (error) {
    if (error instanceof Error && error.message === 'Source workflow not found') {
      throw new WorkflowNotFoundError('Source workflow not found');
    }
    throw new WorkflowCloneError('Failed to clone workflow', undefined, error instanceof Error ? error : undefined);
  }
}

export async function exportWorkflow(id: string): Promise<ExportedWorkflow> {
  const exported = await repository.exportWorkflow(id);
  if (!exported) {
    throw new WorkflowNotFoundError('Workflow not found');
  }
  return exported;
}
```

- [ ] **Step 5: Add controller handlers**

In `backend/src/workflow/workflow.controller.ts`, add after `deleteWorkflowHandler`:

```typescript
export async function cloneWorkflowHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const { name } = req.body as { name?: string };
  if (!name || typeof name !== 'string') {
    throw new ValidationError('Name is required');
  }
  const workflow = await workflowService.cloneWorkflow(id, name);
  res.status(HttpStatusCode.CREATED).json({ workflow });
}

export async function exportWorkflowHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const exported = await workflowService.exportWorkflow(id);
  res.json(exported);
}
```

- [ ] **Step 6: Add routes**

In `backend/src/workflow/workflow.routes.ts`:

Add imports for `cloneWorkflowHandler, exportWorkflowHandler`.

Add routes before `router.post('/:id/validate', ...)`:
```typescript
router.post('/:id/clone', cloneWorkflowHandler);
router.get('/:id/export', exportWorkflowHandler);
```

- [ ] **Step 7: Verify it compiles**

Run: `cd backend/ && pnpm run preflight`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/errors/errorCode.ts backend/src/errors/types.ts backend/src/workflow/
git commit -m "feat(workflow): add clone and export APIs"
```

---

### Task 3: Backend — Unit tests for clone and export

**Files:**
- Create: `backend/tests/workflow/workflow.clone-export.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as workflowService from '@/workflow/workflow.service';
import * as repository from '@/workflow/workflow.repository';
import { WorkflowNotFoundError } from '@/errors/types';
import type { WorkflowListItem, ExportedWorkflow } from '@/workflow/workflow.types';

vi.mock('@/workflow/workflow.repository');

describe('workflow clone/export service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cloneWorkflow', () => {
    it('should clone a workflow with valid name', async () => {
      const cloned: WorkflowListItem = {
        id: 'new-id',
        name: 'Test (copy)',
        description: null,
        nodeCount: 2,
        lastRunAt: null,
        lastRunStatus: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(repository.cloneWorkflow).mockResolvedValue(cloned);

      const result = await workflowService.cloneWorkflow('source-id', 'Test (copy)');
      expect(result).toEqual(cloned);
      expect(repository.cloneWorkflow).toHaveBeenCalledWith('source-id', 'Test (copy)');
    });

    it('should throw WorkflowNotFoundError when source not found', async () => {
      vi.mocked(repository.cloneWorkflow).mockRejectedValue(
        new Error('Source workflow not found')
      );

      await expect(workflowService.cloneWorkflow('bad-id', 'name'))
        .rejects.toThrow(WorkflowNotFoundError);
    });

    it('should reject empty name', async () => {
      await expect(workflowService.cloneWorkflow('id', ''))
        .rejects.toThrow('Workflow name must not be empty');
    });
  });

  describe('exportWorkflow', () => {
    it('should return exported workflow structure', async () => {
      const exported: ExportedWorkflow = {
        name: 'Test',
        description: 'desc',
        nodes: [
          { name: 'sql_1', description: null, type: 'sql', config: { nodeType: 'sql', datasourceId: '', sql: '', outputVariable: 'r' }, positionX: 0, positionY: 0 },
        ],
        edges: [{ sourceNodeName: 'sql_1', targetNodeName: 'python_1' }],
      };
      vi.mocked(repository.exportWorkflow).mockResolvedValue(exported);

      const result = await workflowService.exportWorkflow('wf-id');
      expect(result).toEqual(exported);
    });

    it('should throw WorkflowNotFoundError when not found', async () => {
      vi.mocked(repository.exportWorkflow).mockResolvedValue(null);

      await expect(workflowService.exportWorkflow('bad-id'))
        .rejects.toThrow(WorkflowNotFoundError);
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd backend/ && pnpm vitest run tests/workflow/workflow.clone-export.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/workflow/workflow.clone-export.test.ts
git commit -m "test(workflow): add clone and export service tests"
```

---

### Task 4: Frontend — Update types and API

**Files:**
- Modify: `frontend/src/types/workflow.ts:11-19`
- Modify: `frontend/src/api/workflow.ts`

- [ ] **Step 1: Add `lastRunStatus` to frontend `WorkflowListItem`**

In `frontend/src/types/workflow.ts`, update `WorkflowListItem` (line 11-19):

```typescript
export interface WorkflowListItem {
  id: string;
  name: string;
  description: string | null;
  nodeCount: number;
  lastRunAt: string | null;
  lastRunStatus: ExecutionStatus | null;
  createdAt: string;
  updatedAt: string;
}
```

Add `ExportedWorkflow` type after `WorkflowListItem`:

```typescript
export interface ExportedWorkflowNode {
  name: string;
  description: string | null;
  type: WorkflowNodeType;
  config: NodeConfig;
  positionX: number;
  positionY: number;
}

export interface ExportedWorkflowEdge {
  sourceNodeName: string;
  targetNodeName: string;
}

export interface ExportedWorkflow {
  name: string;
  description: string | null;
  nodes: ExportedWorkflowNode[];
  edges: ExportedWorkflowEdge[];
}
```

- [ ] **Step 2: Add clone and export API functions**

In `frontend/src/api/workflow.ts`:

Add import for `ExportedWorkflow`:
```typescript
import type {
  WorkflowListItem,
  WorkflowDetail,
  WorkflowRunInfo,
  WorkflowRunDetail,
  SaveWorkflowInput,
  CustomNodeTemplateInfo,
  NodeConfig,
  ExportedWorkflow,
} from '@/types/workflow';
```

Add response interface:
```typescript
interface CloneResponse {
  workflow: WorkflowListItem;
}
```

Add after `deleteWorkflow` function:
```typescript
export async function cloneWorkflow(id: string, name: string): Promise<WorkflowListItem> {
  const res = await http.post<CloneResponse>(`/workflows/${id}/clone`, { name });
  return res.workflow;
}

export async function exportWorkflow(id: string): Promise<ExportedWorkflow> {
  return http.get<ExportedWorkflow>(`/workflows/${id}/export`);
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend/ && pnpm run preflight`
Expected: PASS (there may be warnings from components not yet using the new field — that's fine)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/workflow.ts frontend/src/api/workflow.ts
git commit -m "feat(workflow): add lastRunStatus type and clone/export API functions"
```

---

### Task 5: Frontend — Update store (search, filter, clone, export, cleanup)

**Files:**
- Modify: `frontend/src/stores/workflowStore.ts`

- [ ] **Step 1: Add search/filter state and filteredWorkflows computed**

In `frontend/src/stores/workflowStore.ts`:

After `const selectedWorkflowId = ref<string | null>(null);` (line 22), add:
```typescript
const searchQuery = ref('');
const statusFilter = ref<ExecutionStatus | 'all' | 'never_run'>('all');
```

Add import for `ExecutionStatus` if not already imported (it is already imported on line 14).

After `selectedNode` computed (line 48-51), add:
```typescript
const filteredWorkflows = computed(() => {
  let result = workflows.value;
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    result = result.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.description && w.description.toLowerCase().includes(q))
    );
  }
  if (statusFilter.value !== 'all') {
    if (statusFilter.value === 'never_run') {
      result = result.filter((w) => w.lastRunStatus === null);
    } else {
      result = result.filter((w) => w.lastRunStatus === statusFilter.value);
    }
  }
  return result;
});
```

- [ ] **Step 2: Add clone and export actions**

Add after `removeWorkflow` function:

```typescript
async function cloneWorkflow(id: string, name: string): Promise<void> {
  await workflowApi.cloneWorkflow(id, name);
  await fetchWorkflows();
}

async function exportWorkflow(id: string): Promise<void> {
  const workflow = workflows.value.find((w) => w.id === id);
  const data = await workflowApi.exportWorkflow(id);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${workflow?.name ?? 'workflow'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Update return object**

Add new exports to the return statement (keep existing exports for now — `selectedWorkflowId`, `selectedWorkflow`, `selectWorkflow` will be removed in Task 8 after their references are cleaned up):
```typescript
return {
  // List
  workflows,
  isLoading,
  selectedWorkflowId,   // will be removed in Task 8
  selectedWorkflow,      // will be removed in Task 8
  searchQuery,
  statusFilter,
  filteredWorkflows,
  fetchWorkflows,
  createWorkflow,
  removeWorkflow,
  selectWorkflow,        // will be removed in Task 8
  cloneWorkflow,
  exportWorkflow,
  // ... rest stays the same
};
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend/ && pnpm run preflight`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/workflowStore.ts
git commit -m "feat(workflow): add search/filter/clone/export to store, remove selectedWorkflowId"
```

---

### Task 6: Frontend — Add i18n keys

**Files:**
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`

- [ ] **Step 1: Add Chinese locale keys**

In `frontend/src/locales/zh-CN.ts`, inside the `workflow` object, add a `list` sub-object and `status` sub-object after the existing `preview` block:

```typescript
list: {
  search: '搜索工作流...',
  filter: '筛选',
  filterAll: '全部',
  nodeCount: '节点数',
  status: '状态',
  updatedAt: '更新时间',
  actions: '操作',
  clone: '复制',
  export: '导出',
  empty: '暂无工作流',
  emptyHint: '点击上方按钮创建',
  cloneSuccess: '复制成功',
  neverRun: '未运行',
  more: '更多',
  cloneSuffix: '(副本)',
  edit: '编辑',
},
status: {
  completed: '成功',
  failed: '失败',
  running: '运行中',
  pending: '等待中',
  skipped: '已跳过',
  cancelled: '已取消',
},
```

- [ ] **Step 2: Add English locale keys**

In `frontend/src/locales/en-US.ts`, inside the `workflow` object, add the same structure:

```typescript
list: {
  search: 'Search workflows...',
  filter: 'Filter',
  filterAll: 'All',
  nodeCount: 'Nodes',
  status: 'Status',
  updatedAt: 'Updated',
  actions: 'Actions',
  clone: 'Clone',
  export: 'Export',
  empty: 'No workflows yet',
  emptyHint: 'Click the button above to create one',
  cloneSuccess: 'Cloned successfully',
  neverRun: 'Never run',
  more: 'More',
  cloneSuffix: ' (copy)',
  edit: 'Edit',
},
status: {
  completed: 'Success',
  failed: 'Failed',
  running: 'Running',
  pending: 'Pending',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
},
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend/ && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/locales/zh-CN.ts frontend/src/locales/en-US.ts
git commit -m "feat(workflow): add list view i18n keys"
```

---

### Task 7: Frontend — Create WfListView component

**Files:**
- Create: `frontend/src/components/workflow/WfListView.vue`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/workflow/WfListView.vue`:

```vue
<template>
  <div class="wf-list-view">
    <!-- Header Bar -->
    <div class="wf-list-header">
      <div class="wf-list-header__left">
        <el-input
          v-model="store.searchQuery"
          :placeholder="t('workflow.list.search')"
          :prefix-icon="Search"
          clearable
          class="wf-list-search"
        />
        <el-select
          v-model="store.statusFilter"
          class="wf-list-filter"
        >
          <el-option :label="t('workflow.list.filterAll')" value="all" />
          <el-option :label="t('workflow.status.completed')" value="completed" />
          <el-option :label="t('workflow.status.failed')" value="failed" />
          <el-option :label="t('workflow.status.running')" value="running" />
          <el-option :label="t('workflow.status.pending')" value="pending" />
          <el-option :label="t('workflow.status.skipped')" value="skipped" />
          <el-option :label="t('workflow.status.cancelled')" value="cancelled" />
          <el-option :label="t('workflow.list.neverRun')" value="never_run" />
        </el-select>
      </div>
      <el-button type="primary" :icon="Plus" @click="showCreateDialog = true">
        {{ t('workflow.newWorkflow') }}
      </el-button>
    </div>

    <!-- Loading State -->
    <div v-if="store.isLoading" class="wf-list-loading">
      <el-skeleton :rows="5" animated />
    </div>

    <!-- Error State -->
    <div v-else-if="loadError" class="wf-list-empty">
      <p>{{ loadError }}</p>
      <el-button type="primary" @click="retryLoad" style="margin-top: 12px;">
        {{ t('workflow.execution.retry') }}
      </el-button>
    </div>

    <!-- Empty State -->
    <div v-else-if="store.filteredWorkflows.length === 0" class="wf-list-empty">
      <p>{{ t('workflow.list.empty') }}</p>
      <p class="wf-list-empty__hint">{{ t('workflow.list.emptyHint') }}</p>
    </div>

    <!-- Desktop Table -->
    <el-table
      v-else-if="!props.isMobile"
      :data="store.filteredWorkflows"
      class="wf-list-table"
      stripe
    >
      <el-table-column :label="t('workflow.name')" min-width="160">
        <template #default="{ row }">
          <span class="wf-list-name" @click="emit('edit', row.id)">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.description')" min-width="200">
        <template #default="{ row }">
          <span class="wf-list-desc">{{ row.description ?? '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.list.nodeCount')" width="90" align="center">
        <template #default="{ row }">{{ row.nodeCount }}</template>
      </el-table-column>
      <el-table-column :label="t('workflow.list.status')" width="120">
        <template #default="{ row }">
          <span :class="['wf-status-badge', `wf-status-badge--${row.lastRunStatus ?? 'none'}`]">
            {{ statusLabel(row.lastRunStatus) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.list.updatedAt')" width="140">
        <template #default="{ row }">
          {{ formatRelativeTime(row.updatedAt) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.list.actions')" width="280" align="center">
        <template #default="{ row }">
          <div class="wf-list-actions">
            <el-button size="small" @click="emit('edit', row.id)">
              {{ t('workflow.list.edit') }}
            </el-button>
            <el-button size="small" @click="handleRun(row.id)" :loading="runningId === row.id">
              {{ t('workflow.run') }}
            </el-button>
            <el-button size="small" @click="handleClone(row)">
              {{ t('workflow.list.clone') }}
            </el-button>
            <el-button size="small" @click="handleExport(row.id)">
              {{ t('workflow.list.export') }}
            </el-button>
            <el-button size="small" type="danger" @click="handleDelete(row.id)">
              {{ t('common.delete') }}
            </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- Mobile Cards -->
    <div v-else class="wf-list-cards">
      <div
        v-for="wf in store.filteredWorkflows"
        :key="wf.id"
        class="wf-list-card"
      >
        <div class="wf-list-card__header">
          <span class="wf-list-card__name">{{ wf.name }}</span>
          <span :class="['wf-status-badge', `wf-status-badge--${wf.lastRunStatus ?? 'none'}`]">
            {{ statusLabel(wf.lastRunStatus) }}
          </span>
        </div>
        <p class="wf-list-card__desc">{{ wf.description ?? '—' }}</p>
        <div class="wf-list-card__meta">
          <span>{{ t('workflow.mobile.nodeCount', { n: wf.nodeCount }) }}</span>
          <span>{{ formatRelativeTime(wf.updatedAt) }}</span>
        </div>
        <div class="wf-list-card__actions">
          <el-button size="small" @click="emit('edit', wf.id)">
            {{ t('workflow.list.edit') }}
          </el-button>
          <el-dropdown trigger="click" @command="(cmd: string) => handleMobileAction(cmd, wf)">
            <el-button size="small">
              {{ t('workflow.list.more') }}
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="run">{{ t('workflow.run') }}</el-dropdown-item>
                <el-dropdown-item command="clone">{{ t('workflow.list.clone') }}</el-dropdown-item>
                <el-dropdown-item command="export">{{ t('workflow.list.export') }}</el-dropdown-item>
                <el-dropdown-item command="delete" divided>{{ t('common.delete') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <el-dialog
      v-model="showCreateDialog"
      :title="t('workflow.newWorkflow')"
      width="420px"
      @closed="resetCreateForm"
    >
      <el-form @submit.prevent="handleCreateConfirm">
        <el-form-item :label="t('workflow.name')" required>
          <el-input v-model="createName" :placeholder="t('workflow.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('workflow.description')">
          <el-input
            v-model="createDescription"
            type="textarea"
            :placeholder="t('workflow.descriptionPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleCreateConfirm" :disabled="!createName.trim()">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Run Params Dialog -->
    <el-dialog
      v-model="showRunParamsDialog"
      :title="t('workflow.runParams.title')"
      width="480px"
    >
      <p>{{ t('workflow.runParams.description') }}</p>
      <el-form>
        <el-form-item v-for="param in detectedRunParams" :key="param" :label="param">
          <el-input v-model="runParamsValues[param]" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRunParamsDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="confirmRun">
          {{ t('workflow.runParams.startRun') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus } from '@element-plus/icons-vue';
import { useWorkflowStore } from '@/stores/workflowStore';
import * as workflowApi from '@/api/workflow';
import type { WorkflowListItem, ExecutionStatus } from '@/types/workflow';

const props = defineProps<{
  isMobile?: boolean;
}>();

const { t } = useI18n();
const store = useWorkflowStore();

// ── Error State ──────────────────────────────────────────
const loadError = ref<string | null>(null);

async function retryLoad(): Promise<void> {
  loadError.value = null;
  try {
    await store.fetchWorkflows();
  } catch {
    loadError.value = t('common.failed');
  }
}

const emit = defineEmits<{
  edit: [id: string];
  created: [id: string];
}>();

// ── Create Dialog ────────────────────────────────────────
const showCreateDialog = ref(false);
const createName = ref('');
const createDescription = ref('');

function resetCreateForm(): void {
  createName.value = '';
  createDescription.value = '';
}

async function handleCreateConfirm(): Promise<void> {
  const name = createName.value.trim();
  if (!name) return;
  const id = await store.createWorkflow(name, createDescription.value.trim() || undefined);
  showCreateDialog.value = false;
  resetCreateForm();
  emit('created', id);
}

// ── Status Badge ─────────────────────────────────────────
function statusLabel(status: ExecutionStatus | null): string {
  if (!status) return t('workflow.list.neverRun');
  return t(`workflow.status.${status}`);
}

// ── Run from List ────────────────────────────────────────
const runningId = ref<string | null>(null);
const showRunParamsDialog = ref(false);
const detectedRunParams = ref<string[]>([]);
const runParamsValues = reactive<Record<string, string>>({});
let pendingRunId = '';

async function handleRun(id: string): Promise<void> {
  runningId.value = id;
  try {
    // Fetch full workflow to detect params
    const detail = await workflowApi.getWorkflow(id);
    const params = extractParams(detail.nodes);

    if (params.length > 0) {
      detectedRunParams.value = params;
      // Clear previous values
      for (const key of Object.keys(runParamsValues)) {
        delete runParamsValues[key];
      }
      for (const p of params) {
        runParamsValues[p] = '';
      }
      pendingRunId = id;
      showRunParamsDialog.value = true;
    } else {
      await workflowApi.startWorkflow(id);
      ElMessage.success(t('workflow.run'));
      await store.fetchWorkflows();
    }
  } catch {
    ElMessage.error(t('common.failed'));
  } finally {
    runningId.value = null;
  }
}

async function confirmRun(): Promise<void> {
  showRunParamsDialog.value = false;
  try {
    await workflowApi.startWorkflow(pendingRunId, runParamsValues);
    ElMessage.success(t('workflow.run'));
    await store.fetchWorkflows();
  } catch {
    ElMessage.error(t('common.failed'));
  }
}

function extractParams(nodes: { config: Record<string, unknown> }[]): string[] {
  const paramSet = new Set<string>();
  const regex = /\{\{params\.(\w+)\}\}/g;
  for (const node of nodes) {
    const configStr = JSON.stringify(node.config);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(configStr)) !== null) {
      paramSet.add(match[1]);
    }
  }
  return Array.from(paramSet);
}

// ── Clone ────────────────────────────────────────────────
async function handleClone(wf: WorkflowListItem): Promise<void> {
  const newName = wf.name + t('workflow.list.cloneSuffix');
  await store.cloneWorkflow(wf.id, newName);
  ElMessage.success(t('workflow.list.cloneSuccess'));
}

// ── Export ────────────────────────────────────────────────
async function handleExport(id: string): Promise<void> {
  await store.exportWorkflow(id);
}

// ── Delete ───────────────────────────────────────────────
async function handleDelete(id: string): Promise<void> {
  await ElMessageBox.confirm(t('workflow.deleteConfirm'), { type: 'warning' });
  await store.removeWorkflow(id);
  ElMessage.success(t('workflow.deleteSuccess'));
}

// ── Mobile Actions ───────────────────────────────────────
function handleMobileAction(cmd: string, wf: WorkflowListItem): void {
  switch (cmd) {
    case 'run':
      handleRun(wf.id);
      break;
    case 'clone':
      handleClone(wf);
      break;
    case 'export':
      handleExport(wf.id);
      break;
    case 'delete':
      handleDelete(wf.id);
      break;
  }
}

// ── Time Formatting ──────────────────────────────────────
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? '<1m' : `${diffMins}m`;
    }
    return `${diffHours}h`;
  }
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}
</script>

<style scoped lang="scss">
.wf-list-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px 24px;
  overflow-y: auto;
}

.wf-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;

  &__left {
    display: flex;
    gap: 8px;
  }
}

.wf-list-search {
  width: 240px;
}

.wf-list-filter {
  width: 120px;
}

.wf-list-loading {
  padding: 24px 0;
}

.wf-list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: var(--el-text-color-secondary);

  &__hint {
    font-size: 13px;
    margin-top: 8px;
    color: var(--el-text-color-placeholder);
  }
}

.wf-list-name {
  color: var(--el-color-primary);
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

.wf-list-desc {
  color: var(--el-text-color-secondary);
}

.wf-list-actions {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
}

// ── Status Badge ──────────────────────────────────────
.wf-status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;

  &--completed {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
  }

  &--failed {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  &--running,
  &--pending {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
  }

  &--skipped {
    background: rgba(234, 179, 8, 0.15);
    color: #eab308;
  }

  &--cancelled,
  &--none {
    background: rgba(107, 114, 128, 0.15);
    color: #6b7280;
  }
}

// ── Table Overrides ───────────────────────────────────
.wf-list-table {
  flex: 1;
}

// ── Mobile Cards ──────────────────────────────────────
.wf-list-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wf-list-card {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 14px;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  &__name {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  &__desc {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    margin-bottom: 8px;
  }

  &__meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    margin-bottom: 10px;
  }

  &__actions {
    display: flex;
    gap: 8px;
    border-top: 1px solid var(--el-border-color-lighter);
    padding-top: 10px;
  }
}
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend/ && pnpm run preflight`
Expected: PASS (component is standalone, not yet imported anywhere)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workflow/WfListView.vue
git commit -m "feat(workflow): create WfListView component with table/card views"
```

---

### Task 8: Frontend — Update WorkflowPage to use WfListView

**Files:**
- Modify: `frontend/src/components/workflow/WorkflowPage.vue`
- Delete: `frontend/src/components/workflow/WfListSidebar.vue`

- [ ] **Step 1: Replace sidebar with WfListView in WorkflowPage**

In `frontend/src/components/workflow/WorkflowPage.vue`:

Remove the import of `WfListSidebar` and `WfMobileCard` (if imported). Add import:
```typescript
import WfListView from './WfListView.vue';
```

Replace the desktop template section. The current desktop section (approx lines 3-27) renders a sidebar + editor side by side. Replace with:

Desktop template should be:
```html
<!-- Desktop Layout -->
<template v-if="!isMobile">
  <WfListView
    v-if="activeView === 'list'"
    :is-mobile="false"
    @edit="handleEdit"
    @created="handleCreated"
  />
  <div v-else class="wf-editor-layout">
    <!-- existing editor layout: WfEditorHeader, WfNodePalette, WfEditorCanvas, WfCopilotPanel -->
  </div>
</template>
```

Replace the mobile template section similarly:
```html
<!-- Mobile Layout -->
<template v-else>
  <WfListView
    v-if="activeView === 'list'"
    :is-mobile="true"
    @edit="handleEdit"
    @created="handleCreated"
  />
  <div v-else class="wf-mobile-editor">
    <!-- existing mobile editor layout -->
  </div>
</template>
```

Also check if `WfInfoPanel.vue` references `store.selectedWorkflow` or `store.selectedWorkflowId`. If it does, update or remove those references since `selectedWorkflowId` and `selectedWorkflow` are being removed from the store. If `WfInfoPanel` is no longer used (not imported anywhere after sidebar removal), it can be left as-is or deleted.

Remove `handleSelect` function (was for sidebar selection). Add `handleEdit` and `handleCreated`:

```typescript
async function handleEdit(id: string): Promise<void> {
  await store.loadForEditing(id);
  copilotStore.connect(id);
  activeView.value = 'editor';
}

async function handleCreated(id: string): Promise<void> {
  await store.loadForEditing(id);
  copilotStore.connect(id);
  activeView.value = 'editor';
}
```

Remove the `handleCreate` function that was used by the sidebar (creation is now handled inside `WfListView`).

Update `handleEditorBack` to refresh the list:
```typescript
function handleEditorBack(): void {
  store.closeEditor();
  copilotStore.disconnect();
  activeView.value = 'list';
  store.fetchWorkflows();
}
```

Remove references to `selectWorkflow` and `selectedWorkflowId`.

- [ ] **Step 2: Delete WfListSidebar**

Delete `frontend/src/components/workflow/WfListSidebar.vue`.

- [ ] **Step 3: Clean up selectedWorkflowId from store**

Now that all component references to `selectedWorkflowId` are removed, update `frontend/src/stores/workflowStore.ts`:

Remove `selectedWorkflowId` ref (line 22).
Remove `selectedWorkflow` computed (lines 42-44).
Remove `selectWorkflow` function (lines 77-79).
Update `removeWorkflow` to remove the `selectedWorkflowId` check (lines 69-75):
```typescript
async function removeWorkflow(id: string): Promise<void> {
  await workflowApi.deleteWorkflow(id);
  await fetchWorkflows();
}
```
Remove `selectedWorkflowId`, `selectedWorkflow`, `selectWorkflow` from the return statement.

Also check and update `WfInfoPanel.vue` if it references `store.selectedWorkflow`.

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend/ && pnpm run preflight`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workflow/WorkflowPage.vue frontend/src/stores/workflowStore.ts
git rm frontend/src/components/workflow/WfListSidebar.vue
git commit -m "feat(workflow): replace sidebar with full-width list view, clean up selectedWorkflowId"
```

---

### Task 9: Frontend — Store filter tests

**Files:**
- Create: `frontend/tests/stores/workflowStore-filter.test.ts`

- [ ] **Step 1: Write filter tests**

```typescript
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
```

- [ ] **Step 2: Run tests**

Run: `cd frontend/ && pnpm vitest run tests/stores/workflowStore-filter.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/stores/workflowStore-filter.test.ts
git commit -m "test(workflow): add store filter/search tests"
```

---

### Task 10: Frontend — Fix existing store tests for removed fields

**Files:**
- Modify: `frontend/tests/stores/workflowStore.test.ts`

- [ ] **Step 1: Update test fixtures and references**

In `frontend/tests/stores/workflowStore.test.ts`:

Update the `WorkflowListItem` test fixtures to include `lastRunStatus: null`.

Remove any tests that reference `selectedWorkflowId`, `selectedWorkflow`, or `selectWorkflow`.

- [ ] **Step 2: Run full test suite**

Run: `cd frontend/ && pnpm vitest run`
Expected: All tests PASS

- [ ] **Step 3: Run full preflight**

Run: `cd frontend/ && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/stores/workflowStore.test.ts
git commit -m "test(workflow): update store tests for removed selectedWorkflowId"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run backend preflight**

Run: `cd backend/ && pnpm run preflight`
Expected: PASS

- [ ] **Step 2: Run frontend preflight**

Run: `cd frontend/ && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Run all backend tests**

Run: `cd backend/ && pnpm vitest run`
Expected: All PASS

- [ ] **Step 4: Run all frontend tests**

Run: `cd frontend/ && pnpm vitest run`
Expected: All PASS

- [ ] **Step 5: Fix any remaining issues**

Address any compilation errors or test failures found above.

- [ ] **Step 6: Final commit if needed**

```bash
git add -A
git commit -m "fix(workflow): address remaining issues from list view migration"
```
