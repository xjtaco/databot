# Custom Node Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to save workflow nodes as reusable custom templates, manage them in a dedicated list, edit them in a single-node canvas with a debug copilot, and search them from the main copilot.

**Architecture:** Introduce a `WorkflowAccessor` interface to abstract DB vs in-memory workflow access. Create a standalone `DebugAgent` class for single-node editing via a new WebSocket endpoint. Frontend gets a tabbed list view and a single-node editor canvas with debug copilot panel.

**Tech Stack:** Express.js v5, Prisma v7, Vue 3, TypeScript, Element Plus, Vue Flow, WebSocket

**Spec:** `docs/superpowers/specs/2026-04-02-custom-node-templates-design.md`

---

## File Map

### New Backend Files
| File | Responsibility |
|------|---------------|
| `backend/src/copilot/workflowAccessor.ts` | `WorkflowAccessor` interface + `DbWorkflowAccessor` + `InMemoryWorkflowAccessor` |
| `backend/src/copilot/debugAgent.ts` | `DebugAgent` class with agentic loop |
| `backend/src/copilot/debugPrompt.ts` | Debug-focused system prompt builder |
| `backend/src/copilot/debugTools.ts` | `createDebugToolRegistry()` factory |
| `backend/src/copilot/debugWebSocket.ts` | WS endpoint `/ws/custom-node-debug` |

### New Frontend Files
| File | Responsibility |
|------|---------------|
| `frontend/src/components/workflow/WfCustomNodeList.vue` | Custom node list with search, edit, delete |
| `frontend/src/components/workflow/WfCustomNodeEditor.vue` | Single-node editor canvas + debug copilot |
| `frontend/src/stores/debugCopilotStore.ts` | Debug copilot WS connection + state |

### Modified Files
| File | Change Summary |
|------|---------------|
| `backend/src/copilot/copilotTools.ts` | Refactor 5 tools to accept `WorkflowAccessor`; add `WfSearchCustomNodes`; extend `WfAddNodeTool` with `templateId` |
| `backend/src/workflow/customNodeTemplate.service.ts:16` | Add branch type rejection |
| `backend/src/copilot/index.ts` | Export debug modules |
| `backend/src/index.ts:34` | Init debug WebSocket |
| `frontend/src/components/workflow/WorkflowPage.vue:256` | Add `customNodeEditor` view mode |
| `frontend/src/components/workflow/WfListView.vue:1-12` | Wrap in `el-tabs` |
| `frontend/src/components/workflow/WfEditorCanvas.vue:212-223` | Read `template-id` from drop |
| `frontend/src/stores/workflowStore.ts` | Add `activeTab`, `editingTemplateId`, `addNodeFromTemplate`, `updateTemplate`, `enterCustomNodeEditor`, `exitCustomNodeEditor` |
| `frontend/src/stores/index.ts:16` | Export `useDebugCopilotStore` |
| `frontend/src/api/workflow.ts:144` | Add `updateTemplate()` API function |
| `frontend/src/locales/zh-CN.ts` | Add custom node i18n keys |
| `frontend/src/locales/en-US.ts` | Add custom node i18n keys |
| Node config components | Add "Save as Custom Node" button (except Branch) |

---

## Task 1: Backend — Branch Validation + i18n Keys

Small foundational changes that other tasks depend on.

**Files:**
- Modify: `backend/src/workflow/customNodeTemplate.service.ts:16-17`
- Modify: `frontend/src/locales/en-US.ts` (workflow section ~line 329-500)
- Modify: `frontend/src/locales/zh-CN.ts` (matching section)
- Test: `backend/tests/workflow/customNodeTemplate.service.test.ts`

- [ ] **Step 1: Write test for branch type rejection**

In `backend/tests/workflow/customNodeTemplate.service.test.ts` (create if not exists), add:

```typescript
import { describe, it, expect } from 'vitest';
import * as service from '../../src/workflow/customNodeTemplate.service';

describe('customNodeTemplate.service', () => {
  it('should reject branch type when creating template', async () => {
    await expect(
      service.createTemplate({
        name: 'Test Branch',
        type: 'branch',
        config: { nodeType: 'branch', field: '', outputVariable: 'br' },
      })
    ).rejects.toThrow('Branch nodes cannot be saved as custom templates');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/workflow/customNodeTemplate.service.test.ts`
Expected: FAIL — no branch rejection exists yet

- [ ] **Step 3: Add branch validation in service**

In `backend/src/workflow/customNodeTemplate.service.ts`, after line 17 (`isValidNodeType` check), add:

```typescript
import { WorkflowNodeType } from './workflow.types';
// ... inside createTemplate, after the isValidNodeType check:
if (input.type === WorkflowNodeType.Branch) {
  throw new WorkflowValidationError('Branch nodes cannot be saved as custom templates');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm vitest run tests/workflow/customNodeTemplate.service.test.ts`
Expected: PASS

- [ ] **Step 5: Add i18n keys to en-US.ts**

In `frontend/src/locales/en-US.ts`, inside the `workflow` object (after the existing keys, before the closing `}`), add:

```typescript
tabs: {
  workflows: 'Workflows',
  customNodes: 'Custom Nodes',
},
customNode: {
  edit: 'Edit',
  delete: 'Delete',
  search: 'Search custom nodes...',
  empty: 'No custom nodes yet',
  saveAs: 'Save as Custom Node',
  saveName: 'Name',
  saveDesc: 'Description',
  saveTitle: 'Save as Custom Node',
  editor: 'Custom Node Template',
  saveTemplate: 'Save Template',
  debugCopilot: 'Debug Copilot',
  deleteConfirm: 'Are you sure you want to delete this custom node template?',
  back: 'Back',
  unsavedChanges: 'You have unsaved changes. Discard them?',
  connectionLost: 'Connection to debug session lost. Please re-enter the editor.',
},
```

- [ ] **Step 6: Add matching i18n keys to zh-CN.ts**

Same structure in `frontend/src/locales/zh-CN.ts`:

```typescript
tabs: {
  workflows: '工作流',
  customNodes: '自定义节点',
},
customNode: {
  edit: '编辑',
  delete: '删除',
  search: '搜索自定义节点...',
  empty: '暂无自定义节点',
  saveAs: '保存为自定义节点',
  saveName: '名称',
  saveDesc: '描述',
  saveTitle: '保存为自定义节点',
  editor: '自定义节点模板',
  saveTemplate: '保存模板',
  debugCopilot: '调试助手',
  deleteConfirm: '确定要删除此自定义节点模板吗？',
  back: '返回',
  unsavedChanges: '有未保存的更改，确定要放弃吗？',
  connectionLost: '调试会话连接已断开，请重新进入编辑器。',
},
```

- [ ] **Step 7: Run preflight checks**

Run: `cd backend && pnpm run preflight`
Run: `cd frontend && pnpm run preflight`
Expected: Both pass

- [ ] **Step 8: Commit**

```bash
git add backend/src/workflow/customNodeTemplate.service.ts backend/tests/workflow/customNodeTemplate.service.test.ts frontend/src/locales/en-US.ts frontend/src/locales/zh-CN.ts
git commit -m "feat(custom-node): add branch validation and i18n keys"
```

---

## Task 2: Backend — WorkflowAccessor Interface + DbWorkflowAccessor

The abstraction layer that enables in-memory workflow support.

**Files:**
- Create: `backend/src/copilot/workflowAccessor.ts`
- Test: `backend/tests/copilot/workflowAccessor.test.ts`

- [ ] **Step 1: Write the WorkflowAccessor interface and DbWorkflowAccessor**

Create `backend/src/copilot/workflowAccessor.ts`:

```typescript
import * as service from '../workflow/workflow.service';
import * as executionEngine from '../workflow/executionEngine';
import type { WorkflowDetail, WorkflowNodeInfo, SaveNodeInput } from '../workflow/workflow.types';
import type { WsWorkflowEvent } from '../workflow/workflow.types';

/**
 * Abstraction over workflow data access. Allows tools to work
 * with both DB-persisted workflows and in-memory debug workflows.
 */
export interface WorkflowAccessor {
  readonly workflowId: string;
  getWorkflow(): Promise<WorkflowDetail>;
  getNode(nodeId: string): Promise<WorkflowNodeInfo>;
  updateNode(nodeId: string, updates: Partial<SaveNodeInput>): Promise<void>;
  executeNode(
    nodeId: string,
    options: {
      mockInputs?: Record<string, unknown>;
      cascade?: boolean;
      onProgress?: (event: WsWorkflowEvent) => void;
    }
  ): Promise<{ runId: string }>;
  getRunResult(runId: string): Promise<Record<string, unknown>>;
}

/**
 * DB-backed implementation — wraps existing workflow.service calls.
 * Used by CopilotAgent.
 */
export class DbWorkflowAccessor implements WorkflowAccessor {
  readonly workflowId: string;

  constructor(workflowId: string) {
    this.workflowId = workflowId;
  }

  async getWorkflow(): Promise<WorkflowDetail> {
    return service.getWorkflow(this.workflowId);
  }

  async getNode(nodeId: string): Promise<WorkflowNodeInfo> {
    const wf = await this.getWorkflow();
    const node = wf.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    return node;
  }

  async updateNode(nodeId: string, updates: Partial<SaveNodeInput>): Promise<void> {
    // The tools handle the full save logic (getWorkflow → mutate → saveWorkflow).
    // This method is a thin wrapper for tools that just need to mutate + save.
    const wf = await this.getWorkflow();
    const idx = wf.nodes.findIndex((n) => n.id === nodeId);
    if (idx === -1) throw new Error(`Node ${nodeId} not found`);
    Object.assign(wf.nodes[idx], updates);
    await service.saveWorkflow(this.workflowId, {
      name: wf.name,
      description: wf.description ?? undefined,
      nodes: wf.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        description: n.description ?? undefined,
        type: n.type,
        config: n.config,
        positionX: n.positionX,
        positionY: n.positionY,
      })),
      edges: wf.edges.map((e) => ({
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        sourceHandle: e.sourceHandle ?? undefined,
      })),
    });
  }

  async executeNode(
    nodeId: string,
    options: {
      mockInputs?: Record<string, unknown>;
      cascade?: boolean;
      onProgress?: (event: WsWorkflowEvent) => void;
    }
  ): Promise<{ runId: string }> {
    return executionEngine.executeNode(this.workflowId, nodeId, {
      mockInputs: options.mockInputs,
      cascade: options.cascade,
      onProgress: options.onProgress,
    });
  }

  async getRunResult(runId: string): Promise<Record<string, unknown>> {
    const detail = await service.getRunDetail(this.workflowId, runId);
    return detail as unknown as Record<string, unknown>;
  }
}
```

Note: `patchNodeContent` was removed from the interface. The `WfPatchNodeTool` handles the full patch logic inline (read workflow → auto-detect content field → replace text → save) using `accessor.getWorkflow()` to read and `accessor.updateNode()` to write back. This avoids duplicating field auto-detection logic in the accessor.

- [ ] **Step 2: Write basic test for DbWorkflowAccessor**

Create `backend/tests/copilot/workflowAccessor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DbWorkflowAccessor } from '../../src/copilot/workflowAccessor';

describe('DbWorkflowAccessor', () => {
  it('should be constructable with a workflowId', () => {
    const accessor = new DbWorkflowAccessor('test-id');
    expect(accessor).toBeDefined();
    expect(accessor.workflowId).toBe('test-id');
  });
});
```

- [ ] **Step 3: Run test**

Run: `cd backend && pnpm vitest run tests/copilot/workflowAccessor.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/copilot/workflowAccessor.ts backend/tests/copilot/workflowAccessor.test.ts
git commit -m "feat(custom-node): add WorkflowAccessor interface and DbWorkflowAccessor"
```

---

## Task 3: Backend — Refactor 5 Wf* Tools to Accept WorkflowAccessor

Modify `WfGetNodeTool`, `WfUpdateNodeTool`, `WfPatchNodeTool`, `WfExecuteNodeTool`, `WfGetRunResultTool` to accept `WorkflowAccessor` instead of raw `workflowId`.

**Files:**
- Modify: `backend/src/copilot/copilotTools.ts` (lines 322-388 WfUpdateNodeTool, 390-548 WfPatchNodeTool, 601-643 WfGetNodeTool, 908-970 WfExecuteNodeTool, 972-1005 WfGetRunResultTool, 1188-1229 createCopilotToolRegistry)
- Test: `backend/tests/copilot/copilotTools.test.ts` (if exists, otherwise create)

- [ ] **Step 0: Export the 5 Wf* tool classes and 3 Scoped tool classes**

In `backend/src/copilot/copilotTools.ts`, add `export` keyword to these class declarations:
- `class WfGetNodeTool` (line 601) → `export class WfGetNodeTool`
- `class WfUpdateNodeTool` (line 322) → `export class WfUpdateNodeTool`
- `class WfPatchNodeTool` (line 390) → `export class WfPatchNodeTool`
- `class WfExecuteNodeTool` (line 908) → `export class WfExecuteNodeTool`
- `class WfGetRunResultTool` (line 972) → `export class WfGetRunResultTool`
- `class ScopedGlobTool` (line 1009) → `export class ScopedGlobTool`
- `class ScopedGrepTool` (line 1043) → `export class ScopedGrepTool`
- `class ScopedReadFileTool` (line 1086) → `export class ScopedReadFileTool`

- [ ] **Step 1: Refactor WfGetNodeTool (lines 601-643)**

Change constructor from `(workflowId: string)` to `(accessor: WorkflowAccessor)`. Replace `this.workflowId` with `this.accessor`. In `execute()`, replace `repository.findWorkflowById(this.workflowId)` with `this.accessor.getWorkflow()`.

```typescript
import { WorkflowAccessor } from './workflowAccessor';

// In WfGetNodeTool class:
private accessor: WorkflowAccessor;

constructor(accessor: WorkflowAccessor) {
  super();
  this.accessor = accessor;
}

async execute(params: ToolParams): Promise<ToolResult> {
  try {
    const nodeId = params.node_id as string;
    const wf = await this.accessor.getWorkflow();
    const node = wf.nodes.find((n) => n.id === nodeId);
    // ... rest stays the same but remove workflowId from logger calls
  }
}
```

- [ ] **Step 2: Refactor WfUpdateNodeTool (lines 322-388)**

Same pattern: change constructor to `(accessor: WorkflowAccessor)`. In `execute()`, replace `service.getWorkflow(this.workflowId)` and `service.saveWorkflow(this.workflowId, input)` with `this.accessor.getWorkflow()` and `this.accessor.updateNode(nodeId, updates)`.

- [ ] **Step 3: Refactor WfPatchNodeTool (lines 390-548)**

Change constructor to `(accessor: WorkflowAccessor)`. In `execute()`, replace `service.getWorkflow(this.workflowId)` with `this.accessor.getWorkflow()` and `service.saveWorkflow(this.workflowId, input)` with `this.accessor.updateNode(...)`. The field auto-detection and occurrence logic stays in the tool.

- [ ] **Step 4: Refactor WfExecuteNodeTool (lines 908-970)**

Change constructor from `(workflowId: string, onProgress?)` to `(accessor: WorkflowAccessor, onProgress?: ...)`. Keep `this.onProgress` as a separate field. In `execute()`, replace `executionEngine.executeNode(this.workflowId, ...)` with `this.accessor.executeNode(nodeId, { mockInputs, cascade, onProgress: this.onProgress })`.

- [ ] **Step 5: Refactor WfGetRunResultTool (lines 972-1005)**

Change constructor to `(accessor: WorkflowAccessor)`. In `execute()`, replace `service.getRunDetail(this.workflowId, runId)` with `this.accessor.getRunResult(runId)`.

- [ ] **Step 6: Update createCopilotToolRegistry (lines 1188-1229)**

Create `DbWorkflowAccessor` and pass it to the refactored tools:

```typescript
import { DbWorkflowAccessor } from './workflowAccessor';

export function createCopilotToolRegistry(
  workflowId: string,
  onProgress?: (event: WsWorkflowEvent) => void,
  configStatus?: ConfigStatusResponse
): ToolRegistryClass {
  const registry = new ToolRegistryClass();
  const accessor = new DbWorkflowAccessor(workflowId);

  // ... allowedTypes logic unchanged ...

  registry.register(new WfGetSummaryTool(workflowId));        // keeps workflowId
  registry.register(new WfAddNodeTool(workflowId, allowedTypes)); // keeps workflowId
  registry.register(new WfUpdateNodeTool(accessor));            // NOW uses accessor
  registry.register(new WfPatchNodeTool(accessor));             // NOW uses accessor
  registry.register(new WfDeleteNodeTool(workflowId));         // keeps workflowId
  registry.register(new WfGetNodeTool(accessor));               // NOW uses accessor
  registry.register(new WfConnectNodesTool(workflowId));       // keeps workflowId
  registry.register(new WfDisconnectNodesTool(workflowId));    // keeps workflowId
  registry.register(new WfGetUpstreamTool(workflowId));        // keeps workflowId
  registry.register(new WfGetDownstreamTool(workflowId));      // keeps workflowId
  registry.register(new WfExecuteTool(workflowId, onProgress)); // keeps workflowId
  registry.register(new WfExecuteNodeTool(accessor, onProgress)); // uses accessor + keeps onProgress
  registry.register(new WfGetRunResultTool(accessor));          // NOW uses accessor
  // ... rest unchanged
}
```

- [ ] **Step 7: Run preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS (no type errors, no lint errors)

- [ ] **Step 8: Commit**

```bash
git add backend/src/copilot/copilotTools.ts backend/src/copilot/workflowAccessor.ts
git commit -m "refactor(copilot): extract WorkflowAccessor from 5 Wf tools"
```

---

## Task 4: Backend — InMemoryWorkflowAccessor

The in-memory implementation for debug mode.

**Files:**
- Modify: `backend/src/copilot/workflowAccessor.ts`
- Test: `backend/tests/copilot/workflowAccessor.test.ts`

- [ ] **Step 1: Write tests for InMemoryWorkflowAccessor**

Add to `backend/tests/copilot/workflowAccessor.test.ts`:

```typescript
import { InMemoryWorkflowAccessor } from '../../src/copilot/workflowAccessor';
import type { WorkflowDetail } from '../../src/workflow/workflow.types';

describe('InMemoryWorkflowAccessor', () => {
  function makeWorkflow(): WorkflowDetail {
    return {
      id: 'mem-wf-1',
      name: 'Debug Workflow',
      description: null,
      nodes: [
        {
          id: 'node-1',
          workflowId: 'mem-wf-1',
          name: 'test_sql',
          description: null,
          type: 'sql',
          config: { nodeType: 'sql', datasourceId: 'ds1', sql: 'SELECT 1', outputVariable: 'out' },
          positionX: 0,
          positionY: 0,
        },
      ],
      edges: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it('getWorkflow returns the in-memory workflow', async () => {
    const accessor = new InMemoryWorkflowAccessor(makeWorkflow());
    const wf = await accessor.getWorkflow();
    expect(wf.id).toBe('mem-wf-1');
    expect(wf.nodes).toHaveLength(1);
  });

  it('getNode returns node by id', async () => {
    const accessor = new InMemoryWorkflowAccessor(makeWorkflow());
    const node = await accessor.getNode('node-1');
    expect(node.name).toBe('test_sql');
  });

  it('getNode throws for unknown id', async () => {
    const accessor = new InMemoryWorkflowAccessor(makeWorkflow());
    await expect(accessor.getNode('unknown')).rejects.toThrow('not found');
  });

  it('updateNode merges config', async () => {
    const accessor = new InMemoryWorkflowAccessor(makeWorkflow());
    await accessor.updateNode('node-1', { name: 'renamed' });
    const node = await accessor.getNode('node-1');
    expect(node.name).toBe('renamed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pnpm vitest run tests/copilot/workflowAccessor.test.ts`
Expected: FAIL — `InMemoryWorkflowAccessor` not yet defined

- [ ] **Step 3: Implement InMemoryWorkflowAccessor**

Add to `backend/src/copilot/workflowAccessor.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { getNodeExecutor } from '../workflow/nodeExecutors';
import { resolveTemplate, resolveParamsTemplates } from '../workflow/templateResolver';
import type { NodeExecutionContext } from '../workflow/nodeExecutors/types';
import type { NodeConfig } from '../workflow/workflow.types';

export class InMemoryWorkflowAccessor implements WorkflowAccessor {
  readonly workflowId: string;
  private workflow: WorkflowDetail;
  private runResults = new Map<string, Record<string, unknown>>();
  private tempDirs: string[] = [];

  constructor(workflow: WorkflowDetail) {
    this.workflow = workflow;
    this.workflowId = workflow.id;
  }

  async getWorkflow(): Promise<WorkflowDetail> {
    return this.workflow;
  }

  async getNode(nodeId: string): Promise<WorkflowNodeInfo> {
    const node = this.workflow.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found in debug workflow`);
    return node;
  }

  async updateNode(nodeId: string, updates: Partial<SaveNodeInput>): Promise<void> {
    const node = this.workflow.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found in debug workflow`);
    if (updates.name !== undefined) node.name = updates.name;
    if (updates.description !== undefined) node.description = updates.description ?? null;
    if (updates.config !== undefined) node.config = { ...node.config, ...updates.config };
    if (updates.positionX !== undefined) node.positionX = updates.positionX;
    if (updates.positionY !== undefined) node.positionY = updates.positionY;
  }

  async executeNode(
    nodeId: string,
    options: {
      mockInputs?: Record<string, unknown>;
      cascade?: boolean;
      onProgress?: (event: WsWorkflowEvent) => void;
    }
  ): Promise<{ runId: string }> {
    const node = await this.getNode(nodeId);
    const executor = getNodeExecutor(node.type);
    if (!executor) throw new Error(`No executor for node type: ${node.type}`);

    const runId = uuidv4();
    const workDir = path.join(os.tmpdir(), `databot-debug-${runId}`);
    await fs.mkdir(workDir, { recursive: true });
    this.tempDirs.push(workDir);

    // Build nodeOutputs map from mockInputs for template resolution
    const nodeOutputs = new Map<string, Record<string, unknown>>();
    if (options.mockInputs) {
      for (const [key, value] of Object.entries(options.mockInputs)) {
        nodeOutputs.set(key, typeof value === 'object' && value !== null
          ? value as Record<string, unknown>
          : { value });
      }
    }

    // Resolve templates per-field, matching executionEngine pattern
    const resolvedConfig = resolveNodeConfig(node.config, nodeOutputs);

    // Call executor with proper NodeExecutionContext
    const context: NodeExecutionContext = {
      workFolder: workDir,
      nodeId: node.id,
      nodeName: node.name,
      resolvedConfig,
    };
    const result = await executor.execute(context);

    this.runResults.set(runId, {
      runId,
      status: 'completed',
      nodeId,
      nodeName: node.name,
      nodeType: node.type,
      outputs: result,
    });

    return { runId };
  }

  async getRunResult(runId: string): Promise<Record<string, unknown>> {
    const result = this.runResults.get(runId);
    if (!result) throw new Error(`Run ${runId} not found`);
    return result;
  }

  /** Clean up temporary directories created during debug executions. */
  async cleanup(): Promise<void> {
    for (const dir of this.tempDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    this.tempDirs = [];
    this.runResults.clear();
  }
}

/**
 * Resolve template variables in a node config object.
 * Uses resolveTemplate for string fields and resolveParamsTemplates for params.
 */
function resolveNodeConfig(
  config: NodeConfig,
  nodeOutputs: Map<string, Record<string, unknown>>
): NodeConfig {
  const resolved = { ...config };
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string' && key !== 'nodeType' && key !== 'outputVariable') {
      (resolved as Record<string, unknown>)[key] = resolveTemplate(value, nodeOutputs);
    }
  }
  if ('params' in resolved && typeof resolved.params === 'object') {
    (resolved as Record<string, unknown>).params = resolveParamsTemplates(
      resolved.params as Record<string, unknown>,
      nodeOutputs
    );
  }
  return resolved;
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && pnpm vitest run tests/copilot/workflowAccessor.test.ts`
Expected: PASS

- [ ] **Step 5: Run preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/copilot/workflowAccessor.ts backend/tests/copilot/workflowAccessor.test.ts
git commit -m "feat(custom-node): add InMemoryWorkflowAccessor for debug mode"
```

---

## Task 5: Backend — WfSearchCustomNodes Tool + WfAddNodeTool templateId

**Files:**
- Modify: `backend/src/copilot/copilotTools.ts`
- Test: `backend/tests/copilot/copilotTools.test.ts`

- [ ] **Step 1: Write test for WfSearchCustomNodes**

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/workflow/customNodeTemplate.repository');

import { WfSearchCustomNodesTool } from '../../src/copilot/copilotTools';

describe('WfSearchCustomNodesTool', () => {
  it('should search templates by regex pattern on name and description', async () => {
    const { findAllTemplates } = await import(
      '../../src/workflow/customNodeTemplate.repository'
    );
    vi.mocked(findAllTemplates).mockResolvedValue([
      { id: '1', name: 'Daily Sales', description: 'Query daily sales', type: 'sql', createdAt: '', updatedAt: '' },
      { id: '2', name: 'Data Cleaner', description: 'Clean CSV data', type: 'python', createdAt: '', updatedAt: '' },
    ]);

    const tool = new WfSearchCustomNodesTool();
    const result = await tool.execute({ pattern: 'daily' });
    expect(result.success).toBe(true);
    expect((result.data as Array<unknown>)).toHaveLength(1);
  });

  it('should fall back to substring match on invalid regex', async () => {
    const { findAllTemplates } = await import(
      '../../src/workflow/customNodeTemplate.repository'
    );
    vi.mocked(findAllTemplates).mockResolvedValue([
      { id: '1', name: 'Sales [Report]', description: '', type: 'sql', createdAt: '', updatedAt: '' },
    ]);

    const tool = new WfSearchCustomNodesTool();
    const result = await tool.execute({ pattern: '[Report' }); // invalid regex
    expect(result.success).toBe(true);
    expect((result.data as Array<unknown>)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/copilot/copilotTools.test.ts`
Expected: FAIL — `WfSearchCustomNodesTool` not exported

- [ ] **Step 3: Implement WfSearchCustomNodesTool**

Add to `backend/src/copilot/copilotTools.ts` (before `createCopilotToolRegistry`):

```typescript
import * as templateRepository from '../workflow/customNodeTemplate.repository';

export class WfSearchCustomNodesTool extends Tool {
  name = 'wf_search_custom_nodes';
  description = 'Search custom node templates by name or description using a regex or keyword pattern. Returns matching templates (max 20).';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex pattern or keyword to search in template name and description',
      },
    },
    required: ['pattern'],
  };

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const pattern = params.pattern as string;
      const templates = await templateRepository.findAllTemplates();

      let regex: RegExp | null = null;
      try {
        regex = new RegExp(pattern, 'i');
      } catch {
        // invalid regex — fall back to substring match
      }

      const matches = templates.filter((t) => {
        const text = `${t.name} ${t.description ?? ''}`;
        return regex ? regex.test(text) : text.toLowerCase().includes(pattern.toLowerCase());
      });

      const limited = matches.slice(0, 20).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        type: t.type,
      }));

      return { success: true, data: limited };
    } catch (err) {
      logger.error('WfSearchCustomNodesTool error', { error: String(err) });
      return { success: false, data: null, error: String(err) };
    }
  }
}
```

- [ ] **Step 4: Extend WfAddNodeTool with templateId**

In `WfAddNodeTool` (line 226), add `templateId` to parameters schema:

```typescript
// In parameters.properties, add:
template_id: {
  type: 'string',
  description: 'Optional: ID of a custom node template to use as initial config',
},
```

In `execute()` method, after getting `nodeType` and before building the node, add template loading:

```typescript
const templateId = params.template_id as string | undefined;
let initialConfig = getDefaultConfig(nodeType);
if (templateId) {
  const template = await templateService.getTemplate(templateId);
  initialConfig = template.config as NodeConfig;
}
```

Import `* as templateService from '../workflow/customNodeTemplate.service'` at the top.

- [ ] **Step 5: Register WfSearchCustomNodesTool in createCopilotToolRegistry**

In `createCopilotToolRegistry` (line ~1220), add:

```typescript
registry.register(new WfSearchCustomNodesTool());
```

- [ ] **Step 6: Run tests**

Run: `cd backend && pnpm vitest run tests/copilot/copilotTools.test.ts`
Expected: PASS

- [ ] **Step 7: Run preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/copilot/copilotTools.ts backend/tests/copilot/copilotTools.test.ts
git commit -m "feat(copilot): add WfSearchCustomNodes tool and WfAddNodeTool templateId support"
```

---

## Task 6: Backend — DebugAgent + Debug Prompt + Debug Tools Registry

**Files:**
- Create: `backend/src/copilot/debugPrompt.ts`
- Create: `backend/src/copilot/debugTools.ts`
- Create: `backend/src/copilot/debugAgent.ts`
- Test: `backend/tests/copilot/debugAgent.test.ts`

- [ ] **Step 1: Create debugPrompt.ts**

Create `backend/src/copilot/debugPrompt.ts`. The prompt is focused on single-node debugging. Reference `copilotPrompt.ts` for style but only include the current node type's reference:

```typescript
import type { WorkflowNodeInfo } from '../workflow/workflow.types';

export function buildDebugSystemPrompt(node: WorkflowNodeInfo): string {
  const nodeTypeGuide = getNodeTypeGuide(node.type);

  return `# Role
You are a debug assistant helping the user edit and test a single workflow node.
Your goal is to help them refine the node's configuration and verify it works correctly using mock inputs.

# Current Node
- Name: ${node.name}
- Type: ${node.type}
- Output Variable: ${(node.config as Record<string, unknown>).outputVariable ?? 'N/A'}

# Node Type Reference
${nodeTypeGuide}

# Available Tools
- **wf_get_node**: Read the current node configuration
- **wf_update_node**: Update node config (merges with existing)
- **wf_patch_node**: Replace specific text in the node's code/SQL/prompt
- **wf_execute_node**: Run the node with mock inputs for testing. ALWAYS provide mockInputs parameter — this node has no upstream connections.
- **wf_get_run_result**: View execution results after running
- **scoped_glob/scoped_grep/scoped_read_file**: Read data dictionary and knowledge files for context

# Debugging Workflow
1. Use wf_get_node to understand current config
2. Make edits with wf_update_node or wf_patch_node
3. Test with wf_execute_node using mockInputs
4. Check results with wf_get_run_result
5. Iterate until the node works correctly

# Mock Inputs
When calling wf_execute_node, you MUST provide mockInputs to simulate upstream data.
Example: { "mockInputs": { "upstream_node_name": { "filePath": "/path/to/data.csv" } } }

# Output Format
- Match the user's language (Chinese or English)
- Be concise and focused on the current node
`;
}

function getNodeTypeGuide(type: string): string {
  switch (type) {
    case 'sql':
      return `## SQL Node
- Config fields: datasourceId, sql, outputVariable
- Template syntax: {{paramName}} for variable references
- Output: CSV file with query results`;
    case 'python':
      return `## Python Node
- Config fields: params, script, timeout, outputVariable
- The script receives a \`params\` dict with upstream outputs
- Output: JSON result or CSV file`;
    case 'llm':
      return `## LLM Node
- Config fields: params, prompt, outputVariable
- Template syntax: {{paramName}} in prompt
- Output: Text/JSON response from LLM`;
    case 'email':
      return `## Email Node
- Config fields: to, subject, body, contentSource, isHtml, outputVariable
- Template syntax: {{paramName}} in to/subject/body`;
    case 'web_search':
      return `## Web Search Node
- Config fields: keywords, outputVariable
- Template syntax: {{paramName}} in keywords`;
    default:
      return `## ${type} Node`;
  }
}
```

- [ ] **Step 2: Create debugTools.ts**

Create `backend/src/copilot/debugTools.ts`:

```typescript
import { ToolRegistryClass } from '../infrastructure/tools/tools';
import { ScopedGlobTool, ScopedGrepTool, ScopedReadFileTool } from './copilotTools';
import { WfGetNodeTool, WfUpdateNodeTool, WfPatchNodeTool, WfExecuteNodeTool, WfGetRunResultTool } from './copilotTools';
import type { WorkflowAccessor } from './workflowAccessor';
import { config } from '../base/config';

export function createDebugToolRegistry(accessor: WorkflowAccessor): ToolRegistryClass {
  const registry = new ToolRegistryClass();

  // Workflow tools (operate on in-memory workflow via accessor)
  registry.register(new WfGetNodeTool(accessor));
  registry.register(new WfUpdateNodeTool(accessor));
  registry.register(new WfPatchNodeTool(accessor));
  registry.register(new WfExecuteNodeTool(accessor));
  registry.register(new WfGetRunResultTool(accessor));

  // Scoped file tools (use default allowed dirs from config, same as main copilot)
  registry.register(new ScopedGlobTool());
  registry.register(new ScopedGrepTool());
  registry.register(new ScopedReadFileTool());

  return registry;
}
```

- [ ] **Step 3: Create debugAgent.ts**

Create `backend/src/copilot/debugAgent.ts`. Model after `copilotAgent.ts` (lines 13-361) but simplified:

```typescript
import { LLMProviderFactory } from '../infrastructure/llm/factory';
import { ToolRegistryClass } from '../infrastructure/tools/tools';
import { Context } from '../agent/context';
import logger from '../utils/logger';
import { buildDebugSystemPrompt } from './debugPrompt';
import { createDebugToolRegistry } from './debugTools';
import { InMemoryWorkflowAccessor } from './workflowAccessor';
import * as templateService from '../workflow/customNodeTemplate.service';
import type { CopilotServerMessage } from './copilot.types';
import type { WorkflowDetail, WorkflowNodeInfo } from '../workflow/workflow.types';
import { v4 as uuidv4 } from 'uuid';

export class DebugAgent {
  private context: Context;
  private templateId: string;
  private sendEvent: (event: CopilotServerMessage) => void;
  private aborted: boolean;
  private isProcessing: boolean;
  private toolRegistry: ToolRegistryClass;
  private accessor: InMemoryWorkflowAccessor;
  private node: WorkflowNodeInfo;
  private initialized = false;

  constructor(
    templateId: string,
    accessor: InMemoryWorkflowAccessor,
    node: WorkflowNodeInfo,
    sendEvent: (event: CopilotServerMessage) => void
  ) {
    this.context = new Context();
    this.templateId = templateId;
    this.accessor = accessor;
    this.node = node;
    this.sendEvent = sendEvent;
    this.aborted = false;
    this.isProcessing = false;
    this.toolRegistry = createDebugToolRegistry(accessor);
  }

  abort(): void {
    this.aborted = true;
  }

  async handleUserMessage(content: string): Promise<void> {
    if (this.isProcessing) {
      this.sendEvent({ type: 'error', message: 'Agent is busy processing a previous message' });
      return;
    }

    this.isProcessing = true;
    this.aborted = false;

    try {
      const provider = LLMProviderFactory.getProvider();
      if (!provider) {
        this.sendEvent({ type: 'error', message: 'LLM not configured', errorType: 'config_missing', configType: 'llm' });
        return;
      }

      // Initialize system prompt on first message
      if (!this.initialized) {
        const systemPrompt = buildDebugSystemPrompt(this.node);
        this.context.addSystemMessage(systemPrompt);
        this.initialized = true;
      }

      this.context.addUserMessage(content);

      // Agentic loop — same pattern as CopilotAgent
      let toolCallCount = 0;
      const MAX_TOOL_CALLS = 20;

      while (!this.aborted && toolCallCount < MAX_TOOL_CALLS) {
        const response = await provider.chat(this.context.validHistory(), {
          tools: this.toolRegistry.getAllToolSchemas(),
          toolRegistry: this.toolRegistry,
          onToolCallStart: (toolCall) => {
            this.sendEvent({
              type: 'tool_start',
              toolName: toolCall.name,
              toolCallId: toolCall.id,
              summary: `Calling ${toolCall.name}`,
            });
          },
          onToolCallComplete: (toolCall, result) => {
            const eventType = result.success ? 'tool_done' : 'tool_error';
            if (eventType === 'tool_done') {
              this.sendEvent({
                type: 'tool_done',
                toolCallId: toolCall.id,
                success: true,
                summary: `${toolCall.name} completed`,
              });
            } else {
              this.sendEvent({
                type: 'tool_error',
                toolCallId: toolCall.id,
                error: result.error ?? 'Unknown error',
              });
            }

            // Emit workflow_changed for mutation tools
            if (['wf_update_node', 'wf_patch_node'].includes(toolCall.name) && result.success) {
              this.sendEvent({ type: 'workflow_changed', action: 'node_updated' });
            }
          },
        });

        this.context.addMessageWithTokens(response.message, response.usage);
        toolCallCount += (response.toolCalls?.length ?? 0);

        // If no tool calls, this is the final text response
        if (!response.toolCalls || response.toolCalls.length === 0) {
          const text = typeof response.message.content === 'string'
            ? response.message.content
            : '';
          if (text) {
            this.sendEvent({ type: 'text_delta', content: text });
            this.sendEvent({ type: 'text_done' });
          }
          break;
        }
      }
    } catch (err) {
      logger.error('DebugAgent error', {
        templateId: this.templateId,
        error: err instanceof Error ? err.message : String(err),
      });
      this.sendEvent({ type: 'error', message: String(err) });
    } finally {
      this.isProcessing = false;
      this.sendEvent({ type: 'turn_done' });
    }
  }

  async cleanup(): Promise<void> {
    await this.accessor.cleanup();
  }
}

/**
 * Factory: creates a DebugAgent from a templateId by loading the template and
 * building an in-memory workflow.
 */
export async function createDebugAgent(
  templateId: string,
  sendEvent: (event: CopilotServerMessage) => void
): Promise<DebugAgent> {
  const template = await templateService.getTemplate(templateId);
  const nodeId = uuidv4();
  const node: WorkflowNodeInfo = {
    id: nodeId,
    workflowId: `debug-${templateId}`,
    name: template.name,
    description: template.description,
    type: template.type,
    config: template.config as Record<string, unknown>,
    positionX: 300,
    positionY: 200,
  };
  const workflow: WorkflowDetail = {
    id: `debug-${templateId}`,
    name: `Debug: ${template.name}`,
    description: null,
    nodes: [node],
    edges: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const accessor = new InMemoryWorkflowAccessor(workflow);
  return new DebugAgent(templateId, accessor, node, sendEvent);
}
```

- [ ] **Step 4: Write basic test for DebugAgent construction**

Create `backend/tests/copilot/debugAgent.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/workflow/customNodeTemplate.service');

import { createDebugAgent } from '../../src/copilot/debugAgent';
import * as templateService from '../../src/workflow/customNodeTemplate.service';

describe('DebugAgent', () => {
  it('should create a DebugAgent from a template', async () => {
    vi.mocked(templateService.getTemplate).mockResolvedValue({
      id: 'tpl-1',
      name: 'Test SQL',
      description: 'A test SQL node',
      type: 'sql',
      config: { nodeType: 'sql', datasourceId: '', sql: 'SELECT 1', outputVariable: 'out' },
      createdAt: '',
      updatedAt: '',
    });

    const events: unknown[] = [];
    const agent = await createDebugAgent('tpl-1', (event) => events.push(event));
    expect(agent).toBeDefined();
  });
});
```

- [ ] **Step 5: Run test**

Run: `cd backend && pnpm vitest run tests/copilot/debugAgent.test.ts`
Expected: PASS

- [ ] **Step 6: Run preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/copilot/debugPrompt.ts backend/src/copilot/debugTools.ts backend/src/copilot/debugAgent.ts backend/tests/copilot/debugAgent.test.ts
git commit -m "feat(custom-node): add DebugAgent, debug prompt, and debug tool registry"
```

---

## Task 7: Backend — Debug WebSocket Endpoint + Wiring

**Files:**
- Create: `backend/src/copilot/debugWebSocket.ts`
- Modify: `backend/src/copilot/index.ts`
- Modify: `backend/src/index.ts:34`

- [ ] **Step 1: Create debugWebSocket.ts**

Create `backend/src/copilot/debugWebSocket.ts`, modeled on `copilotWebSocket.ts`:

```typescript
import type { Application } from 'express';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import logger from '../utils/logger';
import { config } from '../base/config';
import { createDebugAgent, DebugAgent } from './debugAgent';
import type { CopilotClientMessage, CopilotServerMessage } from './copilot.types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function initDebugWebSocket(app: Application): void {
  const wsApp = app as Application & {
    ws(route: string, handler: (ws: WebSocket, req: IncomingMessage) => void): void;
  };

  wsApp.ws(`${config.websocket.path}/custom-node-debug`, (ws: WebSocket, req: IncomingMessage) => {
    const url = new globalThis.URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    const templateId = url.searchParams.get('templateId');

    if (!templateId) {
      ws.close(4000, 'templateId query parameter is required');
      return;
    }

    if (!UUID_REGEX.test(templateId)) {
      ws.close(4001, 'templateId must be a valid UUID');
      return;
    }

    logger.info('Debug WebSocket connected', { templateId });

    const sendEvent = (event: CopilotServerMessage): void => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(event));
      }
    };

    let agent: DebugAgent | null = null;

    // Async initialization
    createDebugAgent(templateId, sendEvent)
      .then((a) => {
        agent = a;
        logger.info('DebugAgent created', { templateId });
      })
      .catch((err: unknown) => {
        logger.error('Failed to create DebugAgent', {
          templateId,
          error: err instanceof Error ? err.message : String(err),
        });
        sendEvent({ type: 'error', message: `Failed to initialize debug session: ${String(err)}` });
        ws.close(4002, 'Failed to create debug agent');
      });

    ws.on('message', (data: Buffer) => {
      try {
        const raw = data.toString();

        if (raw === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        const message = JSON.parse(raw) as CopilotClientMessage;

        switch (message.type) {
          case 'user_message':
            if (!agent) {
              sendEvent({ type: 'error', message: 'Debug agent not ready yet' });
              return;
            }
            agent.handleUserMessage(message.content).catch((err: unknown) => {
              logger.error('DebugAgent handleUserMessage error', {
                templateId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
            break;

          case 'set_auto_fix':
            // Ignored in debug mode
            break;

          case 'abort':
            agent?.abort();
            break;

          case 'ping':
            sendEvent({ type: 'pong' });
            break;

          default:
            logger.warn('Unknown debug message type', { raw });
        }
      } catch (err) {
        logger.error('Failed to parse debug message', {
          templateId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    ws.on('close', () => {
      logger.info('Debug WebSocket disconnected', { templateId });
      agent?.cleanup().catch((err: unknown) => {
        logger.error('DebugAgent cleanup error', { error: String(err) });
      });
    });

    ws.on('error', (error: Error) => {
      logger.error('Debug WebSocket error', { templateId, error: String(error) });
    });
  });

  logger.info('Debug WebSocket route initialized', {
    path: `${config.websocket.path}/custom-node-debug`,
  });
}
```

- [ ] **Step 2: Update copilot barrel export**

In `backend/src/copilot/index.ts`, add line:

```typescript
export { initDebugWebSocket } from './debugWebSocket';
export { DebugAgent, createDebugAgent } from './debugAgent';
export { createDebugToolRegistry } from './debugTools';
```

- [ ] **Step 3: Wire into main server**

In `backend/src/index.ts`, after line 20 import, add:

```typescript
import { initDebugWebSocket } from './copilot';
```

After line 34 (`initCopilotWebSocket(app);`), add:

```typescript
initDebugWebSocket(app);
```

- [ ] **Step 4: Run preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/copilot/debugWebSocket.ts backend/src/copilot/index.ts backend/src/index.ts
git commit -m "feat(custom-node): add debug WebSocket endpoint and wire into server"
```

---

## Task 8: Frontend — API + Store Changes

**Files:**
- Modify: `frontend/src/api/workflow.ts:144`
- Modify: `frontend/src/stores/workflowStore.ts`
- Modify: `frontend/src/stores/index.ts:16`
- Create: `frontend/src/stores/debugCopilotStore.ts`

- [ ] **Step 1: Add updateTemplate API function**

In `frontend/src/api/workflow.ts`, after line 144 (`deleteTemplate`), add:

```typescript
export async function updateTemplate(
  id: string,
  data: { name?: string; description?: string; config?: NodeConfig }
): Promise<CustomNodeTemplateInfo> {
  const res = await http.put<TemplateDetailResponse>(`/custom-node-templates/${id}`, data);
  return res.template;
}
```

- [ ] **Step 2: Add workflowStore extensions**

In `frontend/src/stores/workflowStore.ts`:

Add new state refs (after `customTemplates` ref, around line 56):

```typescript
const activeTab = ref<'workflows' | 'customNodes'>('workflows');
const editingTemplateId = ref<string | null>(null);
```

Add new methods (after `removeTemplate`, around line 500):

```typescript
function addNodeFromTemplate(
  type: WorkflowNodeType,
  position: { x: number; y: number },
  templateId: string
): string {
  if (!editorWorkflow.value) return '';
  const template = customTemplates.value.find((t) => t.id === templateId);
  if (!template) return addNode(type, position); // fallback to default

  tempIdCounter++;
  const tempId = `temp_${tempIdCounter}_${Date.now()}`;
  const nodeName = `${type}_${editorWorkflow.value.nodes.length + 1}`;

  const newNode: WorkflowNodeInfo = {
    id: tempId,
    workflowId: editorWorkflow.value.id,
    name: nodeName,
    description: template.description ?? null,
    type,
    config: structuredClone(template.config),
    positionX: position.x,
    positionY: position.y,
  };

  editorWorkflow.value.nodes.push(newNode);
  isDirty.value = true;
  selectedNodeId.value = tempId;
  return tempId;
}

async function updateTemplate(
  id: string,
  data: { name?: string; description?: string; config?: NodeConfig }
): Promise<void> {
  await workflowApi.updateTemplate(id, data);
  await fetchTemplates();
}

function enterCustomNodeEditor(templateId: string): void {
  editingTemplateId.value = templateId;
}

function exitCustomNodeEditor(): void {
  editingTemplateId.value = null;
}
```

Add these to the return object:

```typescript
// Custom Templates (add to existing section)
activeTab,
editingTemplateId,
addNodeFromTemplate,
updateTemplate,
enterCustomNodeEditor,
exitCustomNodeEditor,
```

- [ ] **Step 3: Create debugCopilotStore.ts**

Create `frontend/src/stores/debugCopilotStore.ts`. Model on `copilotStore.ts` but simplified (no auto-fix, no reconnect):

```typescript
import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { NodeConfig, WsWorkflowEvent } from '@/types/workflow';
import { i18n } from '@/locales';

// Reuse same message types as copilotStore
export type DebugCopilotMessage =
  | { type: 'user'; content: string }
  | { type: 'assistant'; content: string; done: boolean }
  | {
      type: 'tool_status';
      toolCallId: string;
      toolName: string;
      status: 'running' | 'success' | 'error';
      summary: string;
    };

// Server message types — same as copilotStore
// (import or duplicate the interfaces as needed)

export const useDebugCopilotStore = defineStore('debugCopilot', () => {
  const messages = ref<DebugCopilotMessage[]>([]);
  const isConnected = ref(false);
  const isWaiting = ref(false);
  const templateId = ref<string | null>(null);

  let ws: WebSocket | null = null;

  function connect(tplId: string): void {
    templateId.value = tplId;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws/custom-node-debug?templateId=${tplId}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isConnected.value = true;
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string);
      handleServerMessage(data);
    };

    ws.onclose = () => {
      isConnected.value = false;
      ws = null;
    };

    ws.onerror = () => {
      isConnected.value = false;
    };
  }

  function disconnect(): void {
    ws?.close();
    ws = null;
    isConnected.value = false;
    messages.value = [];
    templateId.value = null;
    isWaiting.value = false;
  }

  function sendMessage(content: string): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    messages.value.push({ type: 'user', content });
    isWaiting.value = true;
    ws.send(JSON.stringify({ type: 'user_message', content }));
  }

  function abort(): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'abort' }));
  }

  // The onNodeChanged callback is called when the debug agent modifies the node
  let onNodeChangedCallback: (() => void) | null = null;

  function setOnNodeChanged(callback: (() => void) | null): void {
    onNodeChangedCallback = callback;
  }

  function handleServerMessage(data: Record<string, unknown>): void {
    switch (data.type) {
      case 'text_delta': {
        const last = messages.value[messages.value.length - 1];
        if (last && last.type === 'assistant' && !last.done) {
          last.content += data.content as string;
        } else {
          messages.value.push({
            type: 'assistant',
            content: data.content as string,
            done: false,
          });
        }
        break;
      }
      case 'text_done': {
        const last = messages.value[messages.value.length - 1];
        if (last && last.type === 'assistant') {
          last.done = true;
        }
        break;
      }
      case 'tool_start':
        messages.value.push({
          type: 'tool_status',
          toolCallId: data.toolCallId as string,
          toolName: data.toolName as string,
          status: 'running',
          summary: data.summary as string,
        });
        break;
      case 'tool_done': {
        const tool = messages.value.find(
          (m) => m.type === 'tool_status' && m.toolCallId === data.toolCallId
        );
        if (tool && tool.type === 'tool_status') {
          tool.status = 'success';
          tool.summary = data.summary as string;
        }
        break;
      }
      case 'tool_error': {
        const tool = messages.value.find(
          (m) => m.type === 'tool_status' && m.toolCallId === data.toolCallId
        );
        if (tool && tool.type === 'tool_status') {
          tool.status = 'error';
          tool.summary = data.error as string;
        }
        break;
      }
      case 'workflow_changed':
        onNodeChangedCallback?.();
        break;
      case 'turn_done':
        isWaiting.value = false;
        break;
      case 'error':
        messages.value.push({
          type: 'assistant',
          content: `Error: ${data.message as string}`,
          done: true,
        });
        isWaiting.value = false;
        break;
      case 'pong':
        break;
    }
  }

  return {
    messages,
    isConnected,
    isWaiting,
    templateId,
    connect,
    disconnect,
    sendMessage,
    abort,
    setOnNodeChanged,
  };
});
```

- [ ] **Step 4: Export in stores/index.ts**

In `frontend/src/stores/index.ts`, add after line 14:

```typescript
export { useDebugCopilotStore } from './debugCopilotStore';
```

- [ ] **Step 5: Run preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/workflow.ts frontend/src/stores/workflowStore.ts frontend/src/stores/debugCopilotStore.ts frontend/src/stores/index.ts
git commit -m "feat(custom-node): add frontend API, store extensions, and debugCopilotStore"
```

---

## Task 9: Frontend — Custom Node List Tab in WfListView

**Files:**
- Create: `frontend/src/components/workflow/WfCustomNodeList.vue`
- Modify: `frontend/src/components/workflow/WfListView.vue`

- [ ] **Step 1: Create WfCustomNodeList.vue**

Create `frontend/src/components/workflow/WfCustomNodeList.vue`. Reference `WfListView.vue` style for the table and cards. Desktop uses `el-table`; mobile uses cards. Search filters by name/description. Edit and Delete actions.

Key structure:
- Props: none (reads from workflowStore)
- Emits: `edit(templateId)` — parent handles navigation
- Template: search input + el-table (desktop) / cards (mobile) + delete confirmation dialog
- Uses `useResponsive()` composable for desktop/mobile detection
- Uses `NODE_COLORS` for type badge colors

- [ ] **Step 2: Modify WfListView.vue to add tabs**

In `frontend/src/components/workflow/WfListView.vue`, wrap the existing content in an `el-tabs` component:

At the top of the template (line 2, after `<div class="wf-list-view">`):

```html
<el-tabs v-model="store.activeTab" class="wf-list-tabs">
  <el-tab-pane :label="t('workflow.tabs.workflows')" name="workflows">
    <!-- EXISTING list content moves here -->
  </el-tab-pane>
  <el-tab-pane :label="t('workflow.tabs.customNodes')" name="customNodes">
    <WfCustomNodeList @edit="handleEditTemplate" />
  </el-tab-pane>
</el-tabs>
```

Add the import and handler:

```typescript
import WfCustomNodeList from './WfCustomNodeList.vue';

const emit = defineEmits<{
  editTemplate: [templateId: string];
}>();

function handleEditTemplate(templateId: string): void {
  emit('editTemplate', templateId);
}
```

- [ ] **Step 3: Run preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/workflow/WfCustomNodeList.vue frontend/src/components/workflow/WfListView.vue
git commit -m "feat(custom-node): add custom node list tab in workflow list view"
```

---

## Task 10: Frontend — WfEditorCanvas Template Drop Support

**Files:**
- Modify: `frontend/src/components/workflow/WfEditorCanvas.vue:212-223`

- [ ] **Step 1: Update handleDrop to support templateId**

In `frontend/src/components/workflow/WfEditorCanvas.vue`, replace `handleDrop` (lines 212-223):

```typescript
function handleDrop(event: DragEvent): void {
  if (!event.dataTransfer) return;
  const nodeType = event.dataTransfer.getData('workflow/node-type') as WorkflowNodeType;
  if (!nodeType) return;

  const position = screenToFlowCoordinate({
    x: event.clientX,
    y: event.clientY,
  });

  const templateId = event.dataTransfer.getData('workflow/template-id');
  if (templateId) {
    store.addNodeFromTemplate(nodeType, position, templateId);
  } else {
    store.addNode(nodeType, position);
  }
}
```

- [ ] **Step 2: Run preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workflow/WfEditorCanvas.vue
git commit -m "feat(custom-node): support template-based node creation on canvas drop"
```

---

## Task 11: Frontend — "Save as Custom Node" Button in Config Drawers

**Files:**
- Modify: Node config components (all except Branch):
  - `frontend/src/components/workflow/config/WfConfigSqlQuery.vue`
  - `frontend/src/components/workflow/config/WfConfigPythonScript.vue`
  - `frontend/src/components/workflow/config/WfConfigLlmGenerate.vue`
  - `frontend/src/components/workflow/config/WfConfigEmail.vue`
  - `frontend/src/components/workflow/config/WfConfigWebSearch.vue`

- [ ] **Step 1: Add "Save as Custom Node" button to each config component**

In each of the 5 config components listed above, add at the bottom of the template (before the closing tag):

```html
<el-divider />
<el-button type="default" @click="showSaveTemplateDialog = true">
  {{ t('workflow.customNode.saveAs') }}
</el-button>

<el-dialog v-model="showSaveTemplateDialog" :title="t('workflow.customNode.saveTitle')" width="420px">
  <el-form label-position="top">
    <el-form-item :label="t('workflow.customNode.saveName')">
      <el-input v-model="templateName" />
    </el-form-item>
    <el-form-item :label="t('workflow.customNode.saveDesc')">
      <el-input v-model="templateDesc" type="textarea" :rows="3" />
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="showSaveTemplateDialog = false">{{ t('common.cancel') }}</el-button>
    <el-button type="primary" :disabled="!templateName.trim()" @click="handleSaveTemplate">
      {{ t('common.save') }}
    </el-button>
  </template>
</el-dialog>
```

And in `<script setup>`:

```typescript
const showSaveTemplateDialog = ref(false);
const templateName = ref('');
const templateDesc = ref('');

async function handleSaveTemplate(): Promise<void> {
  if (!props.nodeId) return;
  await store.saveNodeAsTemplate(props.nodeId, templateName.value.trim(), templateDesc.value.trim() || undefined);
  showSaveTemplateDialog.value = false;
  templateName.value = '';
  templateDesc.value = '';
  ElMessage.success(t('workflow.customNode.saveAs'));
}
```

Note: Check that each component has access to `props.nodeId`, `store` (workflowStore), `t` (i18n), and `ElMessage`. Adapt imports as needed per component.

- [ ] **Step 2: Run preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workflow/config/
git commit -m "feat(custom-node): add save-as-template button to node config drawers"
```

---

## Task 12: Frontend — WfCustomNodeEditor + WorkflowPage Integration

**Files:**
- Create: `frontend/src/components/workflow/WfCustomNodeEditor.vue`
- Modify: `frontend/src/components/workflow/WorkflowPage.vue:256` (and template blocks)

- [ ] **Step 1: Create WfCustomNodeEditor.vue**

Create `frontend/src/components/workflow/WfCustomNodeEditor.vue`. This is the single-node editor with debug copilot. Key structure:

- On mount: connect debug copilot WS, load template data
- Layout: header (back + name + save) + canvas (single node via Vue Flow) + right panel (copilot messages + input)
- On save: call `workflowStore.updateTemplate()` with current node config
- On back: disconnect WS, call `workflowStore.exitCustomNodeEditor()`
- Copilot panel reuses existing copilot message components (`CopilotMessageList`, `CopilotInput`, `CopilotToolStatus`, etc.)

- [ ] **Step 2: Update WorkflowPage.vue**

In `frontend/src/components/workflow/WorkflowPage.vue`:

Change the `activeView` type (line 256):

```typescript
const activeView = ref<'list' | 'editor' | 'history' | 'customNodeEditor'>('list');
```

Add handler for `editTemplate` event from WfListView:

```typescript
function handleEditTemplate(templateId: string): void {
  store.enterCustomNodeEditor(templateId);
  activeView.value = 'customNodeEditor';
}

function handleExitCustomNodeEditor(): void {
  store.exitCustomNodeEditor();
  activeView.value = 'list';
}
```

In the desktop template block (lines 4-88), add after the history view section:

```html
<WfCustomNodeEditor
  v-else-if="activeView === 'customNodeEditor' && store.editingTemplateId"
  :template-id="store.editingTemplateId"
  @back="handleExitCustomNodeEditor"
/>
```

In the mobile template block (lines 91-193), add same:

```html
<WfCustomNodeEditor
  v-else-if="activeView === 'customNodeEditor' && store.editingTemplateId"
  :template-id="store.editingTemplateId"
  @back="handleExitCustomNodeEditor"
/>
```

Wire the `editTemplate` event from WfListView:

```html
<WfListView
  v-if="activeView === 'list'"
  @edit-template="handleEditTemplate"
  ...
/>
```

- [ ] **Step 3: Run preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/workflow/WfCustomNodeEditor.vue frontend/src/components/workflow/WorkflowPage.vue
git commit -m "feat(custom-node): add single-node editor canvas and WorkflowPage integration"
```

---

## Task 13: Final Integration + Preflight

- [ ] **Step 1: Run full backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 2: Run full frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Run all backend tests**

Run: `cd backend && pnpm vitest run`
Expected: All tests pass

- [ ] **Step 4: Run all frontend tests**

Run: `cd frontend && pnpm vitest run`
Expected: All tests pass

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(custom-node): address integration issues"
```

- [ ] **Step 6: Push**

```bash
git push
```
