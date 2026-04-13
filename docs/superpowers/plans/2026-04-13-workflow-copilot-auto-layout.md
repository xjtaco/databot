# Workflow Copilot Auto Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Copilot-triggered top-to-bottom layered auto layout so Copilot-created workflow edits end each round with a readable full-graph reflow, while protecting user-arranged layouts from light edits.

**Architecture:** Implement a backend-owned layout engine under `workflow/layout`, expose a workflow-service reflow entry point, and let `CopilotAgent` decide when to run it based on round-level structural changes plus layout-ownership heuristics. Keep `wf_add_node` temporary placement minimal and let the frontend stay passive, only reloading updated workflow coordinates.

**Tech Stack:** TypeScript, Node.js backend services, Vitest, Vue 3, Pinia, Vue Flow

---

### Task 1: Build the layered layout engine

**Files:**
- Create: `backend/src/workflow/layout/autoLayout.ts`
- Create: `backend/tests/workflow/autoLayout.test.ts`
- Modify: `backend/src/workflow/workflow.types.ts`

- [ ] **Step 1: Write the failing layout-engine tests**

```ts
// backend/tests/workflow/autoLayout.test.ts
import { describe, it, expect } from 'vitest';
import { computeAutoLayout } from '../../src/workflow/layout/autoLayout';

describe('computeAutoLayout', () => {
  it('keeps a simple chain in increasing Y order', () => {
    const result = computeAutoLayout(
      [
        { id: 'a', name: 'A', positionX: 0, positionY: 0 },
        { id: 'b', name: 'B', positionX: 0, positionY: 0 },
        { id: 'c', name: 'C', positionX: 0, positionY: 0 },
      ],
      [
        { sourceNodeId: 'a', targetNodeId: 'b' },
        { sourceNodeId: 'b', targetNodeId: 'c' },
      ]
    );

    expect(result.positions.get('a')!.y).toBeLessThan(result.positions.get('b')!.y);
    expect(result.positions.get('b')!.y).toBeLessThan(result.positions.get('c')!.y);
  });

  it('spreads same-layer branch nodes horizontally', () => {
    const result = computeAutoLayout(
      [
        { id: 'root', name: 'Root', positionX: 0, positionY: 0 },
        { id: 'left', name: 'Left', positionX: 0, positionY: 0 },
        { id: 'right', name: 'Right', positionX: 0, positionY: 0 },
      ],
      [
        { sourceNodeId: 'root', targetNodeId: 'left' },
        { sourceNodeId: 'root', targetNodeId: 'right' },
      ]
    );

    expect(result.positions.get('left')!.x).not.toBe(result.positions.get('right')!.x);
    expect(result.positions.get('left')!.y).toBe(result.positions.get('right')!.y);
  });

  it('keeps merge nodes below their upstream nodes and near center', () => {
    const result = computeAutoLayout(
      [
        { id: 'root', name: 'Root', positionX: 0, positionY: 0 },
        { id: 'left', name: 'Left', positionX: -300, positionY: 150 },
        { id: 'right', name: 'Right', positionX: 300, positionY: 150 },
        { id: 'merge', name: 'Merge', positionX: 0, positionY: 300 },
      ],
      [
        { sourceNodeId: 'root', targetNodeId: 'left' },
        { sourceNodeId: 'root', targetNodeId: 'right' },
        { sourceNodeId: 'left', targetNodeId: 'merge' },
        { sourceNodeId: 'right', targetNodeId: 'merge' },
      ]
    );

    expect(result.positions.get('merge')!.y).toBeGreaterThan(result.positions.get('left')!.y);
    expect(Math.abs(result.positions.get('merge')!.x)).toBeLessThan(60);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd backend && pnpm vitest run tests/workflow/autoLayout.test.ts`

Expected: FAIL with `Cannot find module '../../src/workflow/layout/autoLayout'` or missing export/type errors.

- [ ] **Step 3: Add minimal shared layout types**

```ts
// backend/src/workflow/workflow.types.ts
export interface WorkflowLayoutPosition {
  x: number;
  y: number;
}

export interface WorkflowLayoutResult {
  positions: Map<string, WorkflowLayoutPosition>;
}
```

- [ ] **Step 4: Implement the first-pass layered layout engine**

```ts
// backend/src/workflow/layout/autoLayout.ts
import type { WorkflowLayoutResult, WorkflowLayoutPosition } from '../workflow.types';

interface LayoutNodeInput {
  id: string;
  name: string;
  positionX: number;
  positionY: number;
}

interface LayoutEdgeInput {
  sourceNodeId: string;
  targetNodeId: string;
}

const LAYER_GAP = 220;
const NODE_GAP = 280;
const START_X = 0;
const START_Y = 80;

export function computeAutoLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[]
): WorkflowLayoutResult {
  const downstream = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const node of nodes) {
    downstream.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of edges) {
    downstream.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1);
  }

  const queue = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const layer = new Map<string, number>();

  for (const id of queue) layer.set(id, 0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of downstream.get(current) ?? []) {
      layer.set(next, Math.max(layer.get(next) ?? 0, (layer.get(current) ?? 0) + 1));
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if ((indegree.get(next) ?? 0) === 0) queue.push(next);
    }
  }

  const byLayer = new Map<number, string[]>();
  for (const node of nodes) {
    const currentLayer = layer.get(node.id) ?? 0;
    const bucket = byLayer.get(currentLayer) ?? [];
    bucket.push(node.id);
    byLayer.set(currentLayer, bucket);
  }

  const positions = new Map<string, WorkflowLayoutPosition>();
  for (const [layerIndex, ids] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    const ordered = ids.sort();
    const width = (ordered.length - 1) * NODE_GAP;
    ordered.forEach((id, index) => {
      positions.set(id, {
        x: START_X - width / 2 + index * NODE_GAP,
        y: START_Y + layerIndex * LAYER_GAP,
      });
    });
  }

  return { positions };
}
```

- [ ] **Step 5: Re-run the targeted tests and make them pass**

Run: `cd backend && pnpm vitest run tests/workflow/autoLayout.test.ts`

Expected: PASS for the new auto-layout cases.

- [ ] **Step 6: Commit the engine baseline**

```bash
git add backend/src/workflow/layout/autoLayout.ts backend/src/workflow/workflow.types.ts backend/tests/workflow/autoLayout.test.ts
git commit -m "feat: add workflow auto layout engine"
```

### Task 2: Add workflow-service reflow and layout-quality safeguards

**Files:**
- Modify: `backend/src/workflow/workflow.service.ts`
- Modify: `backend/tests/workflow/workflow.service.test.ts`
- Modify: `backend/src/workflow/layout/autoLayout.ts`

- [ ] **Step 1: Write failing workflow-service tests for reflow persistence**

```ts
// backend/tests/workflow/workflow.service.test.ts
it('reflows a workflow and persists updated node positions', async () => {
  const workflow = await service.createWorkflow('Auto Layout Test');

  await service.saveWorkflow(workflow.id, {
    name: 'Auto Layout Test',
    nodes: [
      { tempId: 'a', name: 'a', type: 'python', config: pythonConfig(), positionX: 200, positionY: 80 },
      { tempId: 'b', name: 'b', type: 'python', config: pythonConfig(), positionX: 200, positionY: 200 },
      { tempId: 'c', name: 'c', type: 'python', config: pythonConfig(), positionX: 200, positionY: 320 },
    ],
    edges: [
      { sourceNodeId: 'a', targetNodeId: 'b' },
      { sourceNodeId: 'b', targetNodeId: 'c' },
    ],
  });

  const updated = await service.reflowWorkflowLayout(workflow.id);

  expect(updated.nodes[0].positionY).toBeLessThan(updated.nodes[1].positionY);
  expect(updated.nodes[1].positionY).toBeLessThan(updated.nodes[2].positionY);
});
```

- [ ] **Step 2: Run the workflow-service tests to verify failure**

Run: `cd backend && pnpm vitest run tests/workflow/workflow.service.test.ts`

Expected: FAIL because `reflowWorkflowLayout` does not exist.

- [ ] **Step 3: Add quality validation and fallback to the layout engine**

```ts
// backend/src/workflow/layout/autoLayout.ts
export function validateAutoLayout(
  result: WorkflowLayoutResult,
  nodes: LayoutNodeInput[]
): boolean {
  for (const node of nodes) {
    const pos = result.positions.get(node.id);
    if (!pos) return false;
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return false;
  }
  return true;
}
```

- [ ] **Step 4: Implement workflow-service reflow**

```ts
// backend/src/workflow/workflow.service.ts
import { computeAutoLayout, validateAutoLayout } from './layout/autoLayout';

export async function reflowWorkflowLayout(id: string): Promise<WorkflowDetail> {
  const workflow = await getWorkflow(id);
  const layout = computeAutoLayout(workflow.nodes, workflow.edges);

  if (!validateAutoLayout(layout, workflow.nodes)) {
    return workflow;
  }

  const input: SaveWorkflowInput = {
    name: workflow.name,
    description: workflow.description ?? undefined,
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      description: node.description ?? undefined,
      type: node.type,
      config: node.config,
      positionX: layout.positions.get(node.id)?.x ?? node.positionX,
      positionY: layout.positions.get(node.id)?.y ?? node.positionY,
    })),
    edges: workflow.edges.map((edge) => ({
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      sourceHandle: edge.sourceHandle,
    })),
  };

  return saveWorkflow(id, input);
}
```

- [ ] **Step 5: Re-run the workflow-service tests and confirm pass**

Run: `cd backend && pnpm vitest run tests/workflow/workflow.service.test.ts tests/workflow/autoLayout.test.ts`

Expected: PASS for layout engine and service reflow tests.

- [ ] **Step 6: Commit the service integration**

```bash
git add backend/src/workflow/layout/autoLayout.ts backend/src/workflow/workflow.service.ts backend/tests/workflow/workflow.service.test.ts
git commit -m "feat: add workflow layout reflow service"
```

### Task 3: Track Copilot round mutations and trigger conditional reflow

**Files:**
- Modify: `backend/src/copilot/copilotAgent.ts`
- Modify: `backend/src/copilot/copilot.types.ts`
- Modify: `backend/tests/copilotAgent.test.ts`
- Modify: `backend/tests/copilot/debugAgent.test.ts`

- [ ] **Step 1: Write failing Copilot-agent tests for round-end reflow**

```ts
// backend/tests/copilotAgent.test.ts
it('reflows after a structurally mutating Copilot round', async () => {
  const reflowSpy = vi.spyOn(workflowService, 'reflowWorkflowLayout').mockResolvedValue(workflowDetail());
  mockProvider.chat.mockResolvedValueOnce(toolCallingResponse('wf_add_node')).mockResolvedValueOnce(finalTextResponse('done'));

  await agent.handleUserMessage('build a workflow');

  expect(reflowSpy).toHaveBeenCalledWith('wf-1');
});

it('does not reflow after config-only updates', async () => {
  const reflowSpy = vi.spyOn(workflowService, 'reflowWorkflowLayout').mockResolvedValue(workflowDetail());
  mockProvider.chat.mockResolvedValueOnce(toolCallingResponse('wf_update_node')).mockResolvedValueOnce(finalTextResponse('done'));

  await agent.handleUserMessage('fix prompt text');

  expect(reflowSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the Copilot-agent tests to verify failure**

Run: `cd backend && pnpm vitest run tests/copilotAgent.test.ts tests/copilot/debugAgent.test.ts`

Expected: FAIL because the agent does not yet track structural mutations or call `reflowWorkflowLayout`.

- [ ] **Step 3: Add round mutation and ownership types**

```ts
// backend/src/copilot/copilot.types.ts
export type CopilotLayoutOwnership = 'copilot' | 'mixed' | 'user';

export interface CopilotRoundMutationSummary {
  addedNodes: number;
  deletedNodes: number;
  addedEdges: number;
  deletedEdges: number;
  replacedNodes: number;
  updatedNodes: number;
}
```

- [ ] **Step 4: Implement round tracking and conditional reflow in `CopilotAgent`**

```ts
// backend/src/copilot/copilotAgent.ts
private roundMutations: CopilotRoundMutationSummary = {
  addedNodes: 0,
  deletedNodes: 0,
  addedEdges: 0,
  deletedEdges: 0,
  replacedNodes: 0,
  updatedNodes: 0,
};

private recordMutation(toolName: string): void {
  if (toolName === 'wf_add_node') this.roundMutations.addedNodes += 1;
  if (toolName === 'wf_delete_node') this.roundMutations.deletedNodes += 1;
  if (toolName === 'wf_connect_nodes') this.roundMutations.addedEdges += 1;
  if (toolName === 'wf_disconnect_nodes') this.roundMutations.deletedEdges += 1;
  if (toolName === 'wf_replace_node') this.roundMutations.replacedNodes += 1;
  if (toolName === 'wf_update_node' || toolName === 'wf_patch_node') this.roundMutations.updatedNodes += 1;
}

private shouldReflowRound(ownership: CopilotLayoutOwnership): boolean {
  const structuralChanges =
    this.roundMutations.addedNodes +
    this.roundMutations.deletedNodes +
    this.roundMutations.addedEdges +
    this.roundMutations.deletedEdges +
    this.roundMutations.replacedNodes;

  if (structuralChanges === 0) return false;
  if (ownership === 'copilot') return true;
  if (ownership === 'mixed') return structuralChanges >= 2 || this.roundMutations.replacedNodes > 0;
  return structuralChanges >= 4;
}
```

- [ ] **Step 5: Emit a workflow refresh event when reflow succeeds**

```ts
// backend/src/copilot/copilotAgent.ts
if (this.shouldReflowRound(this.detectLayoutOwnership())) {
  await workflowService.reflowWorkflowLayout(this.workflowId);
  this.sendEvent({ type: 'workflow_changed', changeType: 'node_updated' });
}
```

- [ ] **Step 6: Re-run the Copilot-agent tests and confirm pass**

Run: `cd backend && pnpm vitest run tests/copilotAgent.test.ts tests/copilot/debugAgent.test.ts`

Expected: PASS for the new reflow-trigger cases and no regression in existing agent behavior.

- [ ] **Step 7: Commit the Copilot round reflow logic**

```bash
git add backend/src/copilot/copilotAgent.ts backend/src/copilot/copilot.types.ts backend/tests/copilotAgent.test.ts backend/tests/copilot/debugAgent.test.ts
git commit -m "feat: trigger copilot workflow auto layout after structural rounds"
```

### Task 4: Detect user-arranged layouts and avoid overriding them

**Files:**
- Modify: `frontend/src/stores/workflowStore.ts`
- Modify: `frontend/src/components/workflow/WfEditorCanvas.vue`
- Modify: `backend/src/copilot/copilotAgent.ts`
- Modify: `frontend/tests/stores/copilotStore.test.ts`
- Modify: `backend/tests/copilotAgent.test.ts`

- [ ] **Step 1: Write a failing frontend/store test for manual-layout tracking**

```ts
// frontend/tests/stores/copilotStore.test.ts
it('marks the workflow as manually arranged after node dragging', async () => {
  const workflowStore = useWorkflowStore();
  workflowStore.loadSnapshot({
    id: 'wf-1',
    name: 'Test',
    description: null,
    nodes: [{ id: 'n1', name: 'Node', type: 'python', config: pythonConfig(), positionX: 0, positionY: 0 }],
    edges: [],
  });

  workflowStore.updateNodePosition('n1', 320, 240, { source: 'user-drag' });

  expect(workflowStore.hasManualLayoutEdits).toBe(true);
});
```

- [ ] **Step 2: Run the targeted frontend/store tests to verify failure**

Run: `cd frontend && pnpm vitest run tests/stores/copilotStore.test.ts`

Expected: FAIL because manual-layout ownership state does not exist.

- [ ] **Step 3: Extend workflow store with non-persistent manual-layout flags**

```ts
// frontend/src/stores/workflowStore.ts
const hasManualLayoutEdits = ref(false);

function updateNodePosition(
  nodeId: string,
  x: number,
  y: number,
  options?: { source?: 'user-drag' | 'system' }
): void {
  if (!editorWorkflow.value) return;
  const node = editorWorkflow.value.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  node.positionX = x;
  node.positionY = y;
  if (options?.source === 'user-drag') {
    hasManualLayoutEdits.value = true;
  }
  isDirty.value = true;
}
```

- [ ] **Step 4: Mark drag-origin updates from the canvas**

```ts
// frontend/src/components/workflow/WfEditorCanvas.vue
if (posChange.position) {
  store.updateNodePosition(posChange.id, posChange.position.x, posChange.position.y, {
    source: 'user-drag',
  });
}
```

- [ ] **Step 5: Feed the ownership signal into Copilot reflow policy**

```ts
// backend/src/copilot/copilotAgent.ts
private detectLayoutOwnership(): CopilotLayoutOwnership {
  if (this.layoutSignals.manualEdits) return 'user';
  if (this.layoutSignals.offGridNodes > 0) return 'mixed';
  return 'copilot';
}
```

- [ ] **Step 6: Re-run backend and frontend tests together**

Run: `cd backend && pnpm vitest run tests/copilotAgent.test.ts && cd ../frontend && pnpm vitest run tests/stores/copilotStore.test.ts`

Expected: PASS for manual-layout protection and Copilot ownership selection.

- [ ] **Step 7: Commit the ownership guardrail**

```bash
git add frontend/src/stores/workflowStore.ts frontend/src/components/workflow/WfEditorCanvas.vue frontend/tests/stores/copilotStore.test.ts backend/src/copilot/copilotAgent.ts backend/tests/copilotAgent.test.ts
git commit -m "feat: protect manual workflow layouts from copilot reflow"
```

### Task 5: Final integration verification and cleanup

**Files:**
- Modify: `backend/src/copilot/copilotTools.ts`
- Modify: `backend/tests/copilot/copilotTools.test.ts`
- Modify: `frontend/src/stores/copilotStore.ts`

- [ ] **Step 1: Write the final integration assertions**

```ts
// backend/tests/copilot/copilotTools.test.ts
it('still creates nodes with temporary coordinates before round-end reflow', async () => {
  const registry = createCopilotToolRegistry('test-workflow-id');
  const tool = registry.getTool('wf_add_node');
  const result = await tool.execute({ name: 'tmp_node', type: 'python' });

  expect(result.success).toBe(true);
  expect((result.data as { positionX: number }).positionX).toBeTypeOf('number');
});
```

```ts
// frontend/src/stores/copilotStore.ts
// existing workflow_changed handler should continue to reload the workflow after auto-layout
if (workflowId.value) {
  workflowStore.loadForEditing(workflowId.value);
}
```

- [ ] **Step 2: Run the full targeted verification suite**

Run: `cd backend && pnpm vitest run tests/workflow/autoLayout.test.ts tests/workflow/workflow.service.test.ts tests/copilotAgent.test.ts tests/copilot/copilotTools.test.ts`

Expected: PASS

Run: `cd frontend && pnpm vitest run tests/stores/copilotStore.test.ts`

Expected: PASS

- [ ] **Step 3: Run type/build verification**

Run: `cd backend && pnpm test -- --runInBand`

Expected: PASS or, if that script does not exist, stop and use the project's actual backend verification command before proceeding.

Run: `cd frontend && pnpm build`

Expected: PASS

- [ ] **Step 4: Commit the final integration pass**

```bash
git add backend/src/copilot/copilotTools.ts backend/tests/copilot/copilotTools.test.ts frontend/src/stores/copilotStore.ts
git commit -m "test: verify workflow copilot auto layout integration"
```

## Self-Review

### Spec coverage

- Layered top-to-bottom layout: covered by Task 1
- Whole-workflow reflow service: covered by Task 2
- Copilot round-end trigger logic: covered by Task 3
- Protect user-arranged layouts: covered by Task 4
- Keep frontend passive and reload on workflow updates: covered by Task 5
- Fallback on invalid layout: covered by Task 2

### Placeholder scan

- No `TBD`, `TODO`, or "implement later" placeholders remain
- Each task includes concrete files, code, commands, and expected results

### Type consistency

- Layout engine names are consistent: `computeAutoLayout`, `validateAutoLayout`, `reflowWorkflowLayout`
- Ownership types are consistent: `CopilotLayoutOwnership`, `CopilotRoundMutationSummary`
- Manual drag flag uses `hasManualLayoutEdits`
