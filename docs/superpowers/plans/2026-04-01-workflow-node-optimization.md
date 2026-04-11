# Workflow Node Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify branch node to truthy/falsy, add per-node run button with cascade toggle, add variable insertion UI, and enhance copilot debug capabilities.

**Architecture:** Backend changes to execution engine support three node-run modes: cascade (run upstream chain), non-cascade (use historical outputs), and mock (copilot-provided inputs). Frontend adds run controls to canvas nodes and a shared variable-insertion dropdown to all config panels. Copilot prompts updated to reflect simplified branch logic and new debug capabilities.

**Tech Stack:** Vue 3 + TypeScript + Vite + Element Plus + Vue Flow + CodeMirror 6 (frontend), Express.js v5 + Prisma v7 (backend), Vitest (testing)

**Spec:** `docs/superpowers/specs/2026-04-01-workflow-node-optimization-design.md`

**Preflight commands:**
- Backend: `cd backend/ && pnpm run preflight`
- Frontend: `cd frontend/ && pnpm run preflight`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/components/workflow/config/WfVariableInsertButton.vue` | Shared dropdown button for inserting upstream variable templates |
| `backend/tests/workflow/branchNodeExecutor.test.ts` | Unit tests for simplified branch truthy logic |
| `frontend/tests/components/WfVariableInsertButton.test.ts` | Unit tests for variable insert button |

### Modified Files
| File | Changes |
|------|---------|
| `backend/src/workflow/workflow.types.ts` | Simplify BranchNodeConfig (remove operator/value) |
| `backend/src/workflow/nodeExecutors/branchNodeExecutor.ts` | Replace operator evaluation with isTruthy() |
| `backend/src/workflow/executionEngine.ts` | Add non-cascade mode, mockInputs support to executeNode |
| `backend/src/workflow/workflow.controller.ts` | Accept cascade/mockInputs in runNodeHandler |
| `backend/src/workflow/workflow.repository.ts` | Add findLatestNodeRunOutput() query |
| `backend/src/copilot/copilotPrompt.ts` | Rewrite branch docs, enhance all node I/O docs, add debug section |
| `backend/src/copilot/copilotTools.ts` | Add mockInputs to wf_execute_node, update branch config schema |
| `backend/tests/workflow/executionEngine.test.ts` | Add tests for non-cascade and mockInputs modes |
| `frontend/src/types/workflow.ts` | Simplify BranchNodeConfig |
| `frontend/src/constants/workflow.ts` | Add NODE_OUTPUT_FIELDS registry |
| `frontend/src/components/workflow/WfCanvasNode.vue` | Add run button + cascade toggle to footer |
| `frontend/src/components/workflow/WfEditorCanvas.vue` | Handle node-run event from canvas nodes |
| `frontend/src/components/workflow/config/WfConfigBranch.vue` | Remove operator/value, add variable insert |
| `frontend/src/components/workflow/config/WfConfigSqlQuery.vue` | Add variable insert button |
| `frontend/src/components/workflow/config/WfConfigPythonScript.vue` | Add variable insert button |
| `frontend/src/components/workflow/config/WfConfigLlmGenerate.vue` | Add variable insert button |
| `frontend/src/components/workflow/config/WfConfigEmail.vue` | Add variable insert button |
| `frontend/src/components/workflow/config/WfConfigWebSearch.vue` | Add variable insert button |
| `frontend/src/components/workflow/mobile/WfMobileNodeCard.vue` | Add run button + cascade toggle |
| `frontend/src/stores/workflowStore.ts` | Add nodeCascadeStates, update executeNode with cascade param |
| `frontend/src/api/workflow.ts` | Add cascade param to startNode() |
| `frontend/src/locales/zh-CN.ts` | Add new i18n keys, remove operator keys |
| `frontend/src/locales/en-US.ts` | Add new i18n keys, remove operator keys |

---

## Task 1: Branch Node Simplification — Backend Types & Executor

**Files:**
- Modify: `backend/src/workflow/workflow.types.ts:118-134`
- Modify: `backend/src/workflow/nodeExecutors/branchNodeExecutor.ts` (full rewrite of evaluate logic)
- Create: `backend/tests/workflow/branchNodeExecutor.test.ts`

- [ ] **Step 1: Write tests for isTruthy logic**

Create `backend/tests/workflow/branchNodeExecutor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/util/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { BranchNodeExecutor } from '../../src/workflow/nodeExecutors/branchNodeExecutor';
import type { NodeExecutionContext } from '../../src/workflow/nodeExecutors/types';

function makeContext(field: string): NodeExecutionContext {
  return {
    workFolder: '/tmp/test',
    nodeId: 'node-1',
    nodeName: 'branch_1',
    resolvedConfig: {
      nodeType: 'branch' as const,
      field,
      outputVariable: 'branch_result',
    },
  };
}

describe('BranchNodeExecutor', () => {
  let executor: BranchNodeExecutor;

  beforeEach(() => {
    executor = new BranchNodeExecutor();
  });

  it('returns false for null', async () => {
    const result = await executor.execute(makeContext('null'));
    // field is the resolved string "null" — but template resolver would have resolved it
    // In practice, field comes from resolveTemplate which returns the actual value
    // For unit test, we test the isTruthy function directly
    expect(executor.type).toBe('branch');
  });

  describe('isTruthy', () => {
    const cases: Array<[string, unknown, boolean]> = [
      ['null', null, false],
      ['undefined', undefined, false],
      ['true boolean', true, true],
      ['false boolean', false, false],
      ['zero number', 0, false],
      ['nonzero number', 42, true],
      ['negative number', -1, true],
      ['empty string', '', false],
      ['"false" string', 'false', false],
      ['"FALSE" string', 'FALSE', false],
      ['"False" string', 'False', false],
      ['nonempty string', 'hello', true],
      ['"true" string', 'true', true],
      ['"0" string', '0', true],
      ['empty array', [], false],
      ['nonempty array', [1, 2], true],
      ['empty object', {}, false],
      ['nonempty object', { key: 'val' }, true],
      ['NaN number', NaN, false],
    ];

    for (const [label, input, expected] of cases) {
      it(`${label} → ${expected}`, () => {
        expect(isTruthy(input)).toBe(expected);
      });
    }
  });
});
```

Note: We'll need to export `isTruthy` from the executor for direct testing. Adjust the import after implementation.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pnpm vitest run tests/workflow/branchNodeExecutor.test.ts
```

Expected: FAIL — `isTruthy` not exported / not found.

- [ ] **Step 3: Update BranchNodeConfig type**

In `backend/src/workflow/workflow.types.ts`, replace lines 118–134:

```typescript
// BEFORE:
export interface BranchNodeConfig {
  nodeType: 'branch';
  field: string;
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'lt'
    | 'gte'
    | 'lte'
    | 'contains'
    | 'not_contains'
    | 'is_empty'
    | 'is_not_empty';
  value: string;
  outputVariable: string;
}

// AFTER:
export interface BranchNodeConfig {
  nodeType: 'branch';
  field: string;
  outputVariable: string;
}
```

- [ ] **Step 4: Rewrite branchNodeExecutor.ts**

Replace the full executor with truthy-based logic:

```typescript
import type { BranchNodeConfig } from '../workflow.types';
import type { NodeExecutionContext, NodeExecutor, NodeOutput } from './types';

export function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return !isNaN(value) && value !== 0;
  if (typeof value === 'string') return value !== '' && value.toLowerCase() !== 'false';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

export class BranchNodeExecutor implements NodeExecutor {
  readonly type = 'branch';

  async execute(context: NodeExecutionContext): Promise<NodeOutput> {
    const config = context.resolvedConfig as BranchNodeConfig;
    let fieldValue: unknown = config.field;

    // Try to parse JSON values that came from template resolution
    if (typeof fieldValue === 'string') {
      try {
        fieldValue = JSON.parse(fieldValue);
      } catch {
        // keep as string
      }
    }

    const result = isTruthy(fieldValue);
    return { result };
  }
}
```

- [ ] **Step 5: Fix test imports and run**

Update the test to import `isTruthy` directly:

```typescript
import { isTruthy, BranchNodeExecutor } from '../../src/workflow/nodeExecutors/branchNodeExecutor';
```

Remove the `makeContext` executor-level test and keep the `isTruthy` unit tests.

```bash
cd backend && pnpm vitest run tests/workflow/branchNodeExecutor.test.ts
```

Expected: All isTruthy tests PASS.

- [ ] **Step 6: Fix any existing tests that reference branch operator/value**

Search for branch operator references in existing tests:

```bash
cd backend && grep -rn 'operator.*eq\|branchConfig.*operator\|value.*branch' tests/
```

Update any test helpers (like `makeBranchConfig()`) to remove `operator` and `value` fields.

- [ ] **Step 7: Update resolveNodeConfig for branch in executionEngine.ts**

In `backend/src/workflow/executionEngine.ts`, the branch case in `resolveNodeConfig` (around line 555–561) should remain unchanged — it already only resolves `field`. The removed `operator` and `value` fields simply won't be present. Verify no compile errors:

```bash
cd backend && pnpm tsc --noEmit
```

- [ ] **Step 8: Run backend preflight**

```bash
cd backend && pnpm run preflight
```

Expected: All checks pass.

- [ ] **Step 9: Commit**

```bash
git add backend/src/workflow/workflow.types.ts backend/src/workflow/nodeExecutors/branchNodeExecutor.ts backend/tests/workflow/branchNodeExecutor.test.ts
git commit -m "feat(workflow): simplify branch node to truthy/falsy evaluation"
```

---

## Task 2: Branch Node Simplification — Frontend

**Files:**
- Modify: `frontend/src/types/workflow.ts:128-144`
- Modify: `frontend/src/components/workflow/config/WfConfigBranch.vue` (full rewrite)
- Modify: `frontend/src/stores/workflowStore.ts:599-606` (default config)
- Modify: `frontend/src/locales/zh-CN.ts` (remove operators, add truthy hint)
- Modify: `frontend/src/locales/en-US.ts` (remove operators, add truthy hint)

- [ ] **Step 1: Update frontend BranchNodeConfig type**

In `frontend/src/types/workflow.ts`, replace lines 128–144:

```typescript
// BEFORE:
export interface BranchNodeConfig {
  nodeType: 'branch';
  field: string;
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'lt'
    | 'gte'
    | 'lte'
    | 'contains'
    | 'not_contains'
    | 'is_empty'
    | 'is_not_empty';
  value: string;
  outputVariable: string;
}

// AFTER:
export interface BranchNodeConfig {
  nodeType: 'branch';
  field: string;
  outputVariable: string;
}
```

- [ ] **Step 2: Simplify WfConfigBranch.vue**

Rewrite the component to remove operator dropdown and value input. Keep only field input + output variable. Add an info tooltip about truthy rules:

```vue
<template>
  <div class="wf-config-branch">
    <el-form-item :label="t('workflow.config.nodeName')">
      <el-input v-model="nodeName" @change="handleNameChange" />
    </el-form-item>

    <el-form-item :label="t('workflow.config.branchField')">
      <el-input
        v-model="field"
        :placeholder="t('workflow.config.branchFieldPlaceholder')"
        @change="handleConfigChange"
      />
      <div class="wf-config-branch__hint">
        <el-tooltip :content="t('workflow.config.branchTruthyHint')" placement="top" :width="280">
          <el-icon><InfoFilled /></el-icon>
        </el-tooltip>
        <span class="wf-config-branch__hint-text">{{ t('workflow.config.branchTruthyShort') }}</span>
      </div>
    </el-form-item>

    <el-form-item :label="t('workflow.config.outputVariable')">
      <el-input
        v-model="outputVar"
        :placeholder="t('workflow.config.outputVariablePlaceholder')"
        @change="handleConfigChange"
      />
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { InfoFilled } from '@element-plus/icons-vue';
import { useWorkflowStore } from '@/stores';
import type { WorkflowNodeInfo, BranchNodeConfig } from '@/types/workflow';

const props = defineProps<{
  node: WorkflowNodeInfo;
}>();

const { t } = useI18n();
const store = useWorkflowStore();

const config = () => props.node.config as BranchNodeConfig;

const nodeName = ref(props.node.name);
const field = ref(config().field);
const outputVar = ref(config().outputVariable);

watch(
  () => props.node.id,
  () => {
    const cfg = config();
    nodeName.value = props.node.name;
    field.value = cfg.field;
    outputVar.value = cfg.outputVariable;
  }
);

function handleNameChange(): void {
  store.updateNodeConfig(props.node.id, { name: nodeName.value });
}

function handleConfigChange(): void {
  const cfg: BranchNodeConfig = {
    nodeType: 'branch',
    field: field.value,
    outputVariable: outputVar.value,
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-config-branch {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__hint {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__hint-text {
    font-size: $font-size-xs;
    color: $text-muted;
  }
}
</style>
```

- [ ] **Step 3: Update default config in workflowStore.ts**

In `frontend/src/stores/workflowStore.ts`, update the branch case in `getDefaultConfig` (around line 599–606):

```typescript
// BEFORE:
case 'branch':
  return {
    nodeType: 'branch',
    field: '',
    operator: 'eq',
    value: '',
    outputVariable: 'branch_result',
  };

// AFTER:
case 'branch':
  return {
    nodeType: 'branch',
    field: '',
    outputVariable: 'branch_result',
  };
```

- [ ] **Step 4: Update i18n keys**

In both `frontend/src/locales/zh-CN.ts` and `frontend/src/locales/en-US.ts`:

Remove the entire `operator` block and `branchValue`/`branchValuePlaceholder` keys.

Add new keys:

**zh-CN:**
```typescript
branchTruthyHint: '判定规则：null、undefined、false、0、NaN、空字符串、"false"、空数组、空对象 → 否；其余 → 是。复杂判断请用 Python 节点处理后输出布尔值。',
branchTruthyShort: 'Truthy/Falsy 判定',
```

**en-US:**
```typescript
branchTruthyHint: 'Rules: null, undefined, false, 0, NaN, empty string, "false", empty array, empty object → No; everything else → Yes. Use a Python node for complex conditions.',
branchTruthyShort: 'Truthy/Falsy evaluation',
```

- [ ] **Step 5: Fix any compile errors**

```bash
cd frontend && pnpm tsc --noEmit
```

Fix any references to `operator` or `value` on BranchNodeConfig.

- [ ] **Step 6: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```

Expected: All checks pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/workflow.ts frontend/src/components/workflow/config/WfConfigBranch.vue frontend/src/stores/workflowStore.ts frontend/src/locales/zh-CN.ts frontend/src/locales/en-US.ts
git commit -m "feat(workflow): simplify branch node UI to truthy/falsy"
```

---

## Task 3: Execution Engine — Non-Cascade Mode & Mock Inputs

**Files:**
- Modify: `backend/src/workflow/executionEngine.ts:202-233` (executeNode signature + logic)
- Modify: `backend/src/workflow/workflow.repository.ts` (add findLatestNodeRunOutput)
- Modify: `backend/src/workflow/workflow.controller.ts:147-158` (accept cascade/mockInputs)
- Modify: `backend/tests/workflow/executionEngine.test.ts` (add new test cases)

- [ ] **Step 1: Add repository method for historical node output**

Add to `backend/src/workflow/workflow.repository.ts`:

```typescript
export async function findLatestSuccessfulNodeRunOutput(
  nodeId: string
): Promise<Record<string, unknown> | null> {
  const prisma = getPrismaClient();
  const nodeRun = await prisma.workflowNodeRun.findFirst({
    where: { nodeId, status: 'completed' },
    orderBy: { completedAt: 'desc' },
  });
  if (!nodeRun?.outputs) return null;
  return parseJsonField(nodeRun.outputs);
}
```

- [ ] **Step 2: Write tests for non-cascade executeNode**

Add test cases to `backend/tests/workflow/executionEngine.test.ts`:

```typescript
describe('executeNode non-cascade mode', () => {
  it('uses historical outputs when cascade=false', async () => {
    // Setup: mock workflow with nodeA → nodeB
    // Mock findLatestSuccessfulNodeRunOutput for nodeA returns historical output
    // Execute nodeB with cascade=false
    // Assert: only nodeB executor was called, not nodeA
    // Assert: nodeB received historical outputs for template resolution
  });

  it('throws when upstream has no historical output and cascade=false', async () => {
    // Setup: mock workflow with nodeA → nodeB
    // Mock findLatestSuccessfulNodeRunOutput for nodeA returns null
    // Execute nodeB with cascade=false
    // Assert: throws error identifying missing upstream node
  });

  it('runs upstream when cascade=true', async () => {
    // Setup: same as above
    // Execute nodeB with cascade=true
    // Assert: both nodeA and nodeB executors were called
  });
});

describe('executeNode with mockInputs', () => {
  it('uses mockInputs and skips upstream execution', async () => {
    // Setup: mock workflow with nodeA → nodeB
    // Execute nodeB with mockInputs: { "nodeA_output": { csvPath: "/test.csv" } }
    // Assert: only nodeB executor called
    // Assert: nodeB received mock data for template resolution
  });

  it('mockInputs takes priority over cascade flag', async () => {
    // Setup: same workflow
    // Execute nodeB with mockInputs AND cascade=true
    // Assert: still only nodeB runs (mockInputs wins)
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend && pnpm vitest run tests/workflow/executionEngine.test.ts
```

Expected: New tests FAIL.

- [ ] **Step 4: Modify executeNode signature**

In `backend/src/workflow/executionEngine.ts`, update the `executeNode` function (lines 202–233):

```typescript
export interface ExecuteNodeOptions {
  params?: Record<string, string>;
  mockInputs?: Record<string, unknown>;
  cascade?: boolean;
}

export async function executeNode(
  workflowId: string,
  nodeId: string,
  options?: ExecuteNodeOptions
): Promise<AsyncExecutionHandle> {
  const { params, mockInputs, cascade = false } = options ?? {};

  if (activeExecutions.has(workflowId)) {
    throw new WorkflowExecutionError('Workflow is already executing');
  }

  const workflow = await repository.findWorkflowById(workflowId);
  if (!workflow) {
    throw new WorkflowNotFoundError('Workflow not found');
  }

  const workFolder = join(appConfig.work_folder, `wf_${generateShortId()}`);
  mkdirSync(workFolder, { recursive: true });
  const run = await repository.createRun(workflow.id, RunStatus.Running, workFolder);

  activeExecutions.add(workflowId);

  let promise: Promise<WorkflowRunDetail>;

  if (mockInputs) {
    // Mock mode: run only target node with provided inputs
    const existingOutputsMap = new Map<string, Record<string, unknown>>(
      Object.entries(mockInputs) as Array<[string, Record<string, unknown>]>
    );
    promise = executeNodes(workflow, [nodeId], run, workFolder, params, existingOutputsMap).finally(
      () => activeExecutions.delete(workflowId)
    );
  } else if (cascade) {
    // Cascade mode: run upstream + target (existing behavior)
    const nodeIds = workflow.nodes.map((n) => ({ id: n.id }));
    const edges = workflow.edges.map((e) => ({
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
    }));
    const subgraphIds = getUpstreamNodes(nodeId, nodeIds, edges);
    promise = executeNodes(workflow, subgraphIds, run, workFolder, params).finally(() =>
      activeExecutions.delete(workflowId)
    );
  } else {
    // Non-cascade mode: use historical outputs
    const nodeIds = workflow.nodes.map((n) => ({ id: n.id }));
    const edges = workflow.edges.map((e) => ({
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
    }));
    const upstreamIds = getUpstreamNodes(nodeId, nodeIds, edges).filter((id) => id !== nodeId);
    const existingOutputsMap = new Map<string, Record<string, unknown>>();

    for (const upId of upstreamIds) {
      const upNode = workflow.nodes.find((n) => n.id === upId);
      if (!upNode) continue;
      const output = await repository.findLatestSuccessfulNodeRunOutput(upId);
      if (!output) {
        activeExecutions.delete(workflowId);
        throw new WorkflowExecutionError(
          `Upstream node "${upNode.name}" has no historical output. Run it first or enable cascade mode.`
        );
      }
      existingOutputsMap.set(upNode.name, output);
      const outputVar = getOutputVariable(upNode.config as NodeConfig);
      if (outputVar) {
        existingOutputsMap.set(outputVar, output);
      }
    }

    promise = executeNodes(workflow, [nodeId], run, workFolder, params, existingOutputsMap).finally(
      () => activeExecutions.delete(workflowId)
    );
  }

  return { runId: run.id, promise };
}
```

Note: The `executeNodes` function already accepts `existingOutputs` parameter (line 333 shows `new Map<string, Record<string, unknown>>(existingOutputs ?? [])`). Verify this parameter exists; if not, add it.

- [ ] **Step 5: Update controller to pass new options**

In `backend/src/workflow/workflow.controller.ts`, update `runNodeHandler` (lines 147–158):

```typescript
export async function runNodeHandler(req: Request, res: Response): Promise<void> {
  const workflowId = getValidatedUuid(req, 'workflowId');
  const nodeId = getValidatedUuid(req, 'nodeId');
  const body = (req.body ?? {}) as {
    params?: Record<string, string>;
    cascade?: boolean;
    mockInputs?: Record<string, unknown>;
  };
  const { executeNode } = await import('./executionEngine');
  const { runId, promise } = await executeNode(workflowId, nodeId, {
    params: body.params,
    cascade: body.cascade,
    mockInputs: body.mockInputs,
  });
  promise.catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Background node execution failed', { runId, error: msg });
  });
  res.status(202).json({ runId });
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && pnpm vitest run tests/workflow/executionEngine.test.ts
```

Expected: All tests PASS (new and existing).

- [ ] **Step 7: Run backend preflight**

```bash
cd backend && pnpm run preflight
```

Expected: All checks pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/workflow/executionEngine.ts backend/src/workflow/workflow.controller.ts backend/src/workflow/workflow.repository.ts backend/tests/workflow/executionEngine.test.ts
git commit -m "feat(workflow): add non-cascade and mock-inputs execution modes"
```

---

## Task 4: Node Output Fields Registry (Frontend Constant)

**Files:**
- Modify: `frontend/src/constants/workflow.ts`

- [ ] **Step 1: Add NODE_OUTPUT_FIELDS registry**

Append to `frontend/src/constants/workflow.ts`:

```typescript
export interface NodeOutputField {
  field: string;
  type: string; // 'csvFile' | 'number' | 'array' | 'object' | 'text' | 'boolean' | 'markdownFile'
}

export const NODE_OUTPUT_FIELDS: Record<WorkflowNodeType, NodeOutputField[]> = {
  sql: [
    { field: 'csvPath', type: 'csvFile' },
    { field: 'totalRows', type: 'number' },
    { field: 'columns', type: 'array' },
    { field: 'previewData', type: 'object' },
  ],
  python: [
    { field: 'result', type: 'object' },
    { field: 'csvPath', type: 'csvFile' },
    { field: 'stderr', type: 'text' },
  ],
  llm: [
    { field: 'result', type: 'object' },
    { field: 'rawResponse', type: 'text' },
  ],
  email: [
    { field: 'success', type: 'boolean' },
    { field: 'messageId', type: 'text' },
    { field: 'recipients', type: 'array' },
  ],
  branch: [
    { field: 'result', type: 'boolean' },
  ],
  web_search: [
    { field: 'markdownPath', type: 'markdownFile' },
    { field: 'totalResults', type: 'number' },
  ],
};
```

- [ ] **Step 2: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/constants/workflow.ts
git commit -m "feat(workflow): add node output fields registry constant"
```

---

## Task 5: Variable Insert Button Component

**Files:**
- Create: `frontend/src/components/workflow/config/WfVariableInsertButton.vue`
- Create: `frontend/tests/components/WfVariableInsertButton.test.ts`

- [ ] **Step 1: Write tests for variable insert button**

Create `frontend/tests/components/WfVariableInsertButton.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import zhCN from '../../src/locales/zh-CN';
import enUS from '../../src/locales/en-US';
import WfVariableInsertButton from '../../src/components/workflow/config/WfVariableInsertButton.vue';
import { useWorkflowStore } from '../../src/stores';

vi.mock('@/api/workflow');

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});

const globalStubs = {
  'el-popover': { template: '<div><slot /><template #reference><slot name="reference" /></template></div>' },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>', emits: ['click'] },
  'el-tooltip': { template: '<div><slot /></div>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-scrollbar': { template: '<div><slot /></div>' },
};

describe('WfVariableInsertButton', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('is disabled when no upstream nodes exist', () => {
    const store = useWorkflowStore();
    store.editorWorkflow = {
      id: 'wf-1', name: 'Test', description: null,
      nodes: [{ id: 'n1', workflowId: 'wf-1', name: 'sql_1', description: null, type: 'sql', config: { nodeType: 'sql', datasourceId: '', sql: '', outputVariable: 'q1' }, positionX: 0, positionY: 0 }],
      edges: [],
      createdAt: '', updatedAt: '',
    };
    const wrapper = mount(WfVariableInsertButton, {
      props: { nodeId: 'n1' },
      global: { plugins: [i18n], stubs: globalStubs },
    });
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
  });

  it('emits insert with template string when variable selected', async () => {
    const store = useWorkflowStore();
    store.editorWorkflow = {
      id: 'wf-1', name: 'Test', description: null,
      nodes: [
        { id: 'n1', workflowId: 'wf-1', name: 'sql_1', description: null, type: 'sql', config: { nodeType: 'sql', datasourceId: '', sql: '', outputVariable: 'query_result' }, positionX: 0, positionY: 0 },
        { id: 'n2', workflowId: 'wf-1', name: 'python_1', description: null, type: 'python', config: { nodeType: 'python', params: {}, script: '', outputVariable: 'result' }, positionX: 0, positionY: 100 },
      ],
      edges: [{ id: 'e1', workflowId: 'wf-1', sourceNodeId: 'n1', targetNodeId: 'n2' }],
      createdAt: '', updatedAt: '',
    };
    const wrapper = mount(WfVariableInsertButton, {
      props: { nodeId: 'n2' },
      global: { plugins: [i18n], stubs: globalStubs },
    });
    // Component should compute upstream fields from sql node
    expect(wrapper.vm.upstreamGroups.length).toBe(1);
    expect(wrapper.vm.upstreamGroups[0].fields.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && pnpm vitest run tests/components/WfVariableInsertButton.test.ts
```

Expected: FAIL — component does not exist yet.

- [ ] **Step 3: Create WfVariableInsertButton.vue**

Create `frontend/src/components/workflow/config/WfVariableInsertButton.vue`:

```vue
<template>
  <el-popover
    :visible="popoverVisible"
    placement="bottom-start"
    :width="280"
    trigger="click"
    @update:visible="popoverVisible = $event"
  >
    <template #reference>
      <el-tooltip
        :content="t('workflow.config.noUpstreamNodes')"
        :disabled="upstreamGroups.length > 0"
        placement="top"
      >
        <el-button
          size="small"
          :disabled="disabled || upstreamGroups.length === 0"
          @click="popoverVisible = !popoverVisible"
        >
          <span class="wf-var-btn__icon">{{}}</span>
          <span>{{ t('workflow.config.insertVariable') }}</span>
        </el-button>
      </el-tooltip>
    </template>

    <el-scrollbar max-height="260px">
      <div v-for="group in upstreamGroups" :key="group.nodeId" class="wf-var-dropdown__group">
        <div class="wf-var-dropdown__group-header">
          {{ group.nodeName }} ({{ t(`workflow.nodeTypes.${group.nodeType}`) }})
        </div>
        <div
          v-for="field in group.fields"
          :key="field.template"
          class="wf-var-dropdown__item"
          @click="handleSelect(field.template)"
        >
          <span class="wf-var-dropdown__item-template">{{ field.template }}</span>
          <el-tag size="small" type="info">{{ field.type }}</el-tag>
        </div>
      </div>
    </el-scrollbar>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorkflowStore } from '@/stores';
import { NODE_OUTPUT_FIELDS } from '@/constants/workflow';
import type { WorkflowNodeType } from '@/types/workflow';

interface FieldItem {
  template: string;
  type: string;
}

interface UpstreamGroup {
  nodeId: string;
  nodeName: string;
  nodeType: WorkflowNodeType;
  fields: FieldItem[];
}

const props = defineProps<{
  nodeId: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  insert: [template: string];
}>();

const { t } = useI18n();
const store = useWorkflowStore();
const popoverVisible = ref(false);

function getUpstreamNodeIds(currentNodeId: string): string[] {
  const wf = store.editorWorkflow;
  if (!wf) return [];
  const visited = new Set<string>();
  const queue: string[] = [currentNodeId];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    for (const edge of wf.edges) {
      if (edge.targetNodeId === nodeId && !visited.has(edge.sourceNodeId)) {
        visited.add(edge.sourceNodeId);
        queue.push(edge.sourceNodeId);
      }
    }
  }
  return [...visited];
}

const upstreamGroups = computed<UpstreamGroup[]>(() => {
  const wf = store.editorWorkflow;
  if (!wf) return [];
  const upstreamIds = getUpstreamNodeIds(props.nodeId);
  return upstreamIds
    .map((id) => {
      const node = wf.nodes.find((n) => n.id === id);
      if (!node) return null;
      const outputFields = NODE_OUTPUT_FIELDS[node.type] ?? [];
      const outputVar =
        'outputVariable' in node.config ? (node.config as { outputVariable: string }).outputVariable : node.name;
      return {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        fields: outputFields.map((f) => ({
          template: `{{${outputVar}.${f.field}}}`,
          type: f.type,
        })),
      };
    })
    .filter((g): g is UpstreamGroup => g !== null && g.fields.length > 0);
});

function handleSelect(template: string): void {
  emit('insert', template);
  popoverVisible.value = false;
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-var-btn__icon {
  font-family: $font-family-mono;
  font-size: 11px;
  margin-right: 2px;
}

.wf-var-dropdown {
  &__group {
    &:not(:first-child) {
      border-top: 1px solid $border-dark;
      margin-top: 4px;
      padding-top: 4px;
    }
  }

  &__group-header {
    padding: 4px 8px;
    font-size: 11px;
    color: $text-muted;
    font-weight: $font-weight-medium;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  &__item {
    padding: 6px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    border-radius: $radius-xs;
    gap: 8px;

    &:hover {
      background-color: $bg-hover;
    }
  }

  &__item-template {
    font-family: $font-family-mono;
    font-size: $font-size-xs;
    color: $text-primary-color;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && pnpm vitest run tests/components/WfVariableInsertButton.test.ts
```

Expected: Tests PASS.

- [ ] **Step 5: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/workflow/config/WfVariableInsertButton.vue frontend/tests/components/WfVariableInsertButton.test.ts
git commit -m "feat(workflow): add WfVariableInsertButton shared component"
```

---

## Task 6: Integrate Variable Insert Button Into Config Panels

**Files:**
- Modify: `frontend/src/components/workflow/config/WfConfigSqlQuery.vue`
- Modify: `frontend/src/components/workflow/config/WfConfigPythonScript.vue`
- Modify: `frontend/src/components/workflow/config/WfConfigLlmGenerate.vue`
- Modify: `frontend/src/components/workflow/config/WfConfigBranch.vue`
- Modify: `frontend/src/components/workflow/config/WfConfigWebSearch.vue`
- Modify: `frontend/src/components/workflow/config/WfConfigEmail.vue`

- [ ] **Step 1: Add to WfConfigSqlQuery.vue**

Add import and component. In the toolbar (line 21), add the button next to Format:

```vue
<!-- In toolbar div, after format button -->
<WfVariableInsertButton :node-id="node.id" @insert="handleVariableInsert" />
```

Add handler that inserts at CodeMirror cursor. Add a template ref for the Codemirror component:

```typescript
import WfVariableInsertButton from './WfVariableInsertButton.vue';
import { EditorView } from '@codemirror/view';

const cmRef = ref<{ view: EditorView } | null>(null);

function handleVariableInsert(template: string): void {
  const view = cmRef.value?.view;
  if (view) {
    const cursor = view.state.selection.main.head;
    view.dispatch({ changes: { from: cursor, insert: template } });
    handleSqlChange(view.state.doc.toString());
  } else {
    sqlCode.value += template;
    handleSqlChange(sqlCode.value);
  }
}
```

Add `ref="cmRef"` to the `<Codemirror>` tag.

- [ ] **Step 2: Add to WfConfigPythonScript.vue**

Same pattern as SQL. Add a toolbar div above the CodeMirror editor:

```vue
<div class="wf-config-python__toolbar">
  <WfVariableInsertButton :node-id="node.id" @insert="handleVariableInsert" />
</div>
```

Same CodeMirror cursor insertion handler.

- [ ] **Step 3: Add to WfConfigLlmGenerate.vue**

For the textarea (not CodeMirror), use selectionStart/selectionEnd:

```vue
<!-- Above the prompt textarea -->
<div class="wf-config-llm__toolbar">
  <WfVariableInsertButton :node-id="node.id" @insert="handleVariableInsert" />
</div>
```

```typescript
const promptRef = ref<HTMLTextAreaElement | null>(null);

function handleVariableInsert(template: string): void {
  const el = promptRef.value;
  if (el) {
    const start = el.selectionStart ?? prompt.value.length;
    prompt.value = prompt.value.slice(0, start) + template + prompt.value.slice(el.selectionEnd ?? start);
  } else {
    prompt.value += template;
  }
  handlePromptChange();
}
```

Note: el-input textarea exposes the native element via `ref`. May need to use `ref` on el-input and access via `.ref` property. Check Element Plus API.

- [ ] **Step 4: Add to WfConfigBranch.vue (already simplified in Task 2)**

Add button next to the field input:

```vue
<el-form-item :label="t('workflow.config.branchField')">
  <div style="display: flex; gap: 8px; width: 100%;">
    <el-input
      v-model="field"
      :placeholder="t('workflow.config.branchFieldPlaceholder')"
      @change="handleConfigChange"
      style="flex: 1;"
    />
    <WfVariableInsertButton :node-id="node.id" @insert="handleVariableInsert" />
  </div>
  <!-- truthy hint stays below -->
</el-form-item>
```

```typescript
function handleVariableInsert(template: string): void {
  field.value = template;
  handleConfigChange();
}
```

- [ ] **Step 5: Add to WfConfigWebSearch.vue**

Same as branch — button next to keywords input:

```vue
<div style="display: flex; gap: 8px; width: 100%;">
  <el-input v-model="keywords" ... style="flex: 1;" />
  <WfVariableInsertButton :node-id="node.id" @insert="handleVariableInsert" />
</div>
```

```typescript
function handleVariableInsert(template: string): void {
  keywords.value += template;
  handleConfigChange();
}
```

- [ ] **Step 6: Add to WfConfigEmail.vue**

Add button next to subject input and body editor. For subject, use the same input-append pattern. For body (CodeMirror markdown), use cursor insertion like SQL.

- [ ] **Step 7: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/workflow/config/
git commit -m "feat(workflow): integrate variable insert button into all config panels"
```

---

## Task 7: Per-Node Run Button + Cascade Toggle — Frontend

**Files:**
- Modify: `frontend/src/components/workflow/WfCanvasNode.vue`
- Modify: `frontend/src/components/workflow/WfEditorCanvas.vue`
- Modify: `frontend/src/stores/workflowStore.ts`
- Modify: `frontend/src/api/workflow.ts`
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`
- Modify: `frontend/src/components/workflow/mobile/WfMobileNodeCard.vue`

- [ ] **Step 1: Update API to pass cascade param**

In `frontend/src/api/workflow.ts`, update `startNode` (lines 83–92):

```typescript
export async function startNode(
  workflowId: string,
  nodeId: string,
  params?: Record<string, string>,
  cascade?: boolean
): Promise<string> {
  const res = await http.post<StartRunResponse>(`/workflows/${workflowId}/nodes/${nodeId}/run`, {
    params,
    cascade,
  });
  return res.runId;
}
```

- [ ] **Step 2: Update workflowStore**

In `frontend/src/stores/workflowStore.ts`:

Add state:
```typescript
const nodeCascadeStates = ref(new Map<string, boolean>());
```

Add actions:
```typescript
function setNodeCascade(nodeId: string, cascade: boolean): void {
  nodeCascadeStates.value.set(nodeId, cascade);
}

function getNodeCascade(nodeId: string): boolean {
  return nodeCascadeStates.value.get(nodeId) ?? false;
}
```

Update `executeNode` (lines 367–374):
```typescript
async function executeNode(
  nodeId: string,
  params?: Record<string, string>,
  cascade?: boolean
): Promise<void> {
  if (!editorWorkflow.value) throw new Error('No workflow loaded');
  isExecuting.value = true;
  nodeExecutionStates.clear();
  const runId = await workflowApi.startNode(editorWorkflow.value.id, nodeId, params, cascade);
  currentRunId.value = runId;
  connectExecutionWs(runId);
}
```

Expose new functions in the return object.

- [ ] **Step 3: Add i18n keys**

**zh-CN:**
```typescript
cascade: '级联',
runNode: '运行节点',
nodeRunNoHistory: '上游节点无历史输出，请先运行上游或开启级联',
```

**en-US:**
```typescript
cascade: 'Cascade',
runNode: 'Run Node',
nodeRunNoHistory: 'Upstream has no historical output. Run upstream first or enable cascade.',
```

- [ ] **Step 4: Update WfCanvasNode.vue**

Add run button and cascade toggle to the footer section. The footer currently (lines 37–39):

```vue
<div v-if="data.outputVariable" class="wf-canvas-node__footer">
  <span class="wf-canvas-node__output-label">{{ data.outputVariable }}</span>
</div>
```

Update to:

```vue
<div v-if="data.outputVariable" class="wf-canvas-node__footer">
  <span class="wf-canvas-node__output-label">{{ data.outputVariable }}</span>
  <div class="wf-canvas-node__run-controls">
    <el-tooltip :content="t('workflow.config.cascade')" placement="top">
      <button
        class="wf-canvas-node__cascade-btn"
        :class="{ 'is-active': data.cascade }"
        @click.stop="$emit('toggle-cascade', id)"
      >
        <ArrowRightLeft :size="10" />
      </button>
    </el-tooltip>
    <el-tooltip :content="t('workflow.config.runNode')" placement="top">
      <button
        class="wf-canvas-node__run-btn"
        :class="{ 'is-running': data.executionStatus === 'running' }"
        :disabled="data.executionStatus === 'running'"
        @click.stop="$emit('run-node', id)"
      >
        <Loader2 v-if="data.executionStatus === 'running'" :size="10" class="spin" />
        <Play v-else :size="10" fill="currentColor" />
      </button>
    </el-tooltip>
  </div>
</div>
```

Add imports: `Play`, `ArrowRightLeft`, `Loader2` from `lucide-vue-next`.

Add emits:
```typescript
defineEmits<{
  'run-node': [nodeId: string];
  'toggle-cascade': [nodeId: string];
}>();
```

Update `WfCanvasNodeData` type in `WfEditorCanvas.vue` to include `cascade: boolean`.

Add CSS for the run controls:
```scss
&__run-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

&__cascade-btn,
&__run-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: $radius-xs;
  background: transparent;
  color: $text-muted;
  cursor: pointer;
  padding: 0;
  transition: all $transition-fast;

  &:hover {
    background: $bg-hover;
    color: $text-primary-color;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

&__cascade-btn.is-active {
  color: $accent;
}

&__run-btn:hover:not(:disabled) {
  color: #52c41a;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 5: Handle events in WfEditorCanvas.vue**

Update `WfCanvasNodeData` to include `cascade`:
```typescript
export interface WfCanvasNodeData {
  // ... existing fields
  cascade: boolean;
}
```

When building `flowNodes`, add cascade from store:
```typescript
cascade: store.getNodeCascade(n.id),
```

Add event handlers. In the VueFlow component, listen for custom node events:

```typescript
function handleNodeRunRequest(nodeId: string): void {
  if (store.isExecuting) return;
  const cascade = store.getNodeCascade(nodeId);
  if (store.isDirty) {
    store.saveWorkflow().then(() => {
      store.executeNode(nodeId, undefined, cascade);
    });
  } else {
    store.executeNode(nodeId, undefined, cascade);
  }
}

function handleToggleCascade(nodeId: string): void {
  const current = store.getNodeCascade(nodeId);
  store.setNodeCascade(nodeId, !current);
}
```

VueFlow custom nodes don't propagate custom emits to the parent directly. Instead, use a store-based approach: in `WfCanvasNode.vue`, call store actions directly (e.g., `store.executeNode(id, ...)` or emit via a provided callback). Alternatively, inject an event bus or use `provide/inject` from the canvas. The simplest pattern for this codebase: import the workflow store in `WfCanvasNode.vue` and call `handleNodeRunRequest` / `handleToggleCascade` directly as store actions rather than emitting events. Move the `handleNodeRunRequest` and `handleToggleCascade` logic into the store or keep them as module-level functions in `WfEditorCanvas.vue` and provide them via `provide()`.

- [ ] **Step 6: Update WfMobileNodeCard.vue**

Add run button and cascade toggle to the mobile card. Add them before the chevron:

```vue
<div class="wf-mobile-node-card__run-controls">
  <button
    class="wf-mobile-node-card__cascade-btn"
    :class="{ 'is-active': cascade }"
    @click.stop="$emit('toggle-cascade')"
  >
    <ArrowRightLeft :size="14" />
  </button>
  <button
    class="wf-mobile-node-card__run-btn"
    :disabled="status === 'running'"
    @click.stop="$emit('run-node')"
  >
    <Loader2 v-if="status === 'running'" :size="14" class="spin" />
    <Play v-else :size="14" fill="currentColor" />
  </button>
</div>
```

Add props: `cascade: boolean` (default false).
Add emits: `'run-node'`, `'toggle-cascade'`.

- [ ] **Step 7: Run frontend preflight**

```bash
cd frontend && pnpm run preflight
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/workflow/WfCanvasNode.vue frontend/src/components/workflow/WfEditorCanvas.vue frontend/src/stores/workflowStore.ts frontend/src/api/workflow.ts frontend/src/locales/zh-CN.ts frontend/src/locales/en-US.ts frontend/src/components/workflow/mobile/WfMobileNodeCard.vue
git commit -m "feat(workflow): add per-node run button with cascade toggle"
```

---

## Task 8: Copilot Tool Enhancement — mockInputs

**Files:**
- Modify: `backend/src/copilot/copilotTools.ts:906-956`

- [ ] **Step 1: Update wf_execute_node tool definition**

In `backend/src/copilot/copilotTools.ts`, update the `WfExecuteNodeTool` class (lines 906–956):

Update `description`:
```typescript
description = 'Execute a single workflow node. Without mockInputs: runs this node and all upstream dependencies. With mockInputs: runs ONLY this node using the provided mock data, skipping upstream execution. Use mockInputs for debugging/testing a node in isolation.';
```

Update `parameters`:
```typescript
parameters: JSONSchemaObject = {
  type: 'object',
  properties: {
    nodeId: { type: 'string', description: 'Node ID to execute' },
    params: {
      type: 'object',
      description: 'Optional runtime parameters to pass to the execution',
      properties: {},
      required: [],
    },
    mockInputs: {
      type: 'object',
      description: 'Mock upstream outputs keyed by outputVariable name. When provided, only the target node runs using these as resolved upstream data. Example: {"query_result": {"csvPath": "/path/to/test.csv", "totalRows": 50}}',
      properties: {},
      required: [],
    },
  },
  required: ['nodeId'],
};
```

Update `execute` method to pass mockInputs:
```typescript
async execute(params: ToolParams): Promise<ToolResult> {
  try {
    const nodeId = params.nodeId as string;
    const runParams = (params.params ?? undefined) as Record<string, string> | undefined;
    const mockInputs = (params.mockInputs ?? undefined) as Record<string, unknown> | undefined;

    if (!nodeId || typeof nodeId !== 'string') {
      return { success: false, data: null, error: 'nodeId is required' };
    }

    const handle = await executionEngine.executeNode(this.workflowId, nodeId, {
      params: runParams,
      mockInputs,
    });
    // ... rest unchanged
  }
}
```

- [ ] **Step 2: Run backend preflight**

```bash
cd backend && pnpm run preflight
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/copilot/copilotTools.ts
git commit -m "feat(copilot): add mockInputs support to wf_execute_node tool"
```

---

## Task 9: Copilot Prompt Updates

**Files:**
- Modify: `backend/src/copilot/copilotPrompt.ts`

- [ ] **Step 1: Rewrite branch node documentation**

In `backend/src/copilot/copilotPrompt.ts`, replace the Branch section (lines 94–111):

```typescript
### Branch (branch)
条件分支节点，对上游输出字段进行 Truthy/Falsy 判定，控制工作流分支走向。

**Config:**
- \`field\`: string — 判断的变量，使用模板语法如 \`{{python_result.result.flag}}\`
- \`outputVariable\`: string — 输出变量名

**Truthy 判定规则（Python 风格）:**
- **Falsy（走 No 分支）:** null, undefined, false, 0, NaN, 空字符串 "", "false"（不区分大小写）, 空数组 [], 空对象 {}
- **Truthy（走 Yes 分支）:** 其他所有值

**Output:**
- \`result\`: boolean — 判定结果

**Tips:**
- 复杂条件判断请用 Python 节点处理，输出布尔值后传给 Branch 节点
- 例如：Python 输出 \`{"result": {"should_continue": true}}\` → Branch field: \`{{python_result.result.should_continue}}\`
- 连接下游节点时，必须通过 wf_connect_nodes 工具的 sourceHandle 参数指定 "true" 或 "false"
- sourceHandle="true" 表示 Truthy 分支，sourceHandle="false" 表示 Falsy 分支
```

- [ ] **Step 2: Enhance all node I/O documentation**

For each node type section, add explicit **Inputs** and **Outputs** subsections. Use this template for each node:

**SQL node — add:**
```
**Inputs:** sql 字段支持 {{}} 模板变量引用上游输出，如 {{python_result.result.status}}
**Outputs:** csvPath (csvFile), totalRows (number), columns (string[]), previewData (object[])
**下游引用示例:** {{query_result.csvPath}}, {{query_result.totalRows}}
```

**Python node — add:**
```
**Inputs:** params 字典中的值支持 {{}} 模板变量。script 字段也支持 {{}} 模板。可接受多个上游节点的输出。
**Outputs:** result (object — 脚本中 result 变量的值), csvPath (csvFile, 可选), stderr (text)
**下游引用示例:** {{result.key}}, {{result.csvPath}}
```

**LLM node — add:**
```
**Inputs:** params 字典中的值支持 {{}} 模板变量。prompt 字段支持 {{}} 模板。
**Outputs:** result (object — LLM 返回的 JSON), rawResponse (text — 原始文本)
**下游引用示例:** {{llm_result.result.summary}}, {{llm_result.rawResponse}}
```

**Email node — add:**
```
**Inputs:** to, subject, body, upstreamField 字段均支持 {{}} 模板变量。upstreamField 只能选择通过连线可达的上游节点输出。
**Outputs:** success (boolean), messageId (text), recipients (string[])
```

**Web Search node — add:**
```
**Inputs:** keywords 字段支持 {{}} 模板变量，可引用上游字符串输出。
**Outputs:** markdownPath (markdownFile), totalResults (number)
**下游引用示例:** {{search_result.markdownPath}} — 传给 LLM 节点做内容分析
```

Add a **常见节点链路** section at the end:
```
## 常见节点链路示例
- SQL → Python: SQL 输出 CSV，Python 通过 {{query.csvPath}} 读取并处理
- Python → LLM: Python 输出结构化数据，LLM 通过 {{result.result.data}} 引用
- LLM → Email: LLM 生成报告文本，Email 通过 {{llm.rawResponse}} 发送
- Python → Branch → (Yes/No 分支): Python 输出布尔值，Branch 判定走向
```

- [ ] **Step 3: Add Node Debugging section**

Append a new section to the system prompt:

```typescript
## 节点调试

使用 \`wf_execute_node\` 工具的 \`mockInputs\` 参数可以单独调试某个节点：

**用法：** 提供 mockInputs 时，只运行目标节点，跳过上游执行。mockInputs 的 key 是上游节点的 outputVariable 名称。

**示例：**
\`\`\`
wf_execute_node({
  nodeId: "target-node-id",
  mockInputs: {
    "query_result": {
      "csvPath": "/path/to/test.csv",
      "totalRows": 100,
      "columns": ["id", "name", "status"]
    }
  }
})
\`\`\`

**各节点类型的 mock 数据结构：**
- SQL 输出: \`{ csvPath: string, totalRows: number, columns: string[], previewData: object[] }\`
- Python 输出: \`{ result: object, csvPath?: string, stderr: string }\`
- LLM 输出: \`{ result: object, rawResponse: string }\`
- Email 输出: \`{ success: boolean, messageId: string, recipients: string[] }\`
- Branch 输出: \`{ result: boolean }\`
- Web Search 输出: \`{ markdownPath: string, totalResults: number }\`

**调试流程：** 定位失败节点 → 构造 mock 输入 → 单独运行测试 → 修复配置 → 运行完整工作流
```

- [ ] **Step 4: Update branch config in wf_add_node / wf_update_node tool descriptions**

Search for branch config examples in the tool definitions and remove `operator` and `value` fields.

- [ ] **Step 5: Run backend preflight**

```bash
cd backend && pnpm run preflight
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/copilot/copilotPrompt.ts backend/src/copilot/copilotTools.ts
git commit -m "docs(copilot): update prompts for branch simplification and debug guidance"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run full backend preflight**

```bash
cd backend && pnpm run preflight
```

Expected: All type checks, lint, and tests pass.

- [ ] **Step 2: Run full frontend preflight**

```bash
cd frontend && pnpm run preflight
```

Expected: All type checks, lint, and tests pass.

- [ ] **Step 3: Manual smoke test checklist**

Verify in the browser:
1. Branch node config shows only field input + truthy hint (no operator/value)
2. Variable insert button appears in SQL, Python, LLM, Email, Branch, Web Search config panels
3. Clicking insert variable shows upstream nodes grouped with fields
4. Selecting a variable inserts the template at cursor position
5. Run button (▶) and cascade toggle visible in node footer on canvas
6. Clicking run with cascade OFF runs only the target node
7. Clicking run with cascade ON runs upstream chain + target
8. Mobile node cards show run button + cascade toggle
9. Copilot can use `wf_execute_node` with mockInputs to debug a node

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A && git commit -m "fix: address smoke test findings"
```
