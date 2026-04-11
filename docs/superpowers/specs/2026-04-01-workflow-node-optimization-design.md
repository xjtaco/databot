# Workflow Node Logic Optimization

## Overview

Optimize workflow node input/output handling, simplify branch logic, add per-node run controls, enhance variable insertion UI, and update copilot prompts/tools accordingly.

## Changes Summary

| Item | Current | Target |
|------|---------|--------|
| Branch node | 10 operators (eq, neq, gt, lt, etc.) | Truthy/falsy check only |
| Per-node run | API-only + copilot tool | UI button on each node + cascade toggle |
| Variable insertion | Manual typing of `{{}}` templates | "Insert Variable" button with dropdown picker |
| `wf_execute_node` | Always runs upstream dependencies | Supports `mockInputs` to skip upstream |
| Non-cascade run | Not supported | Uses historical upstream outputs |
| Copilot prompts | Current version | Updated node descriptions, debug guidance |

## 1. Branch Node Simplification

### Backend (`branchNodeExecutor.ts`)

Remove `operator` and `value` from config. Keep only `field` (template string) and `outputVariable`.

New config:
```typescript
interface BranchNodeConfig {
  nodeType: 'branch';
  field: string;           // e.g. {{python_result.result.flag}}
  outputVariable: string;
}
```

Execution uses Python-style truthy evaluation:
```typescript
function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value !== '' && value.toLowerCase() !== 'false';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}
```

Output remains `{ result: boolean }`.

### Frontend (`WfConfigBranch.vue`)

- Remove operator dropdown and value input
- Keep `field` input with new "Insert Variable" button (see section 3)
- Add info tooltip explaining truthy rules

### Types (`workflow.types.ts` backend, `workflow.ts` frontend)

- Remove `operator` and `value` from `BranchNodeConfig`
- Remove operator-related type definitions

### No migration needed — test environment, old data will be manually cleaned.

## 2. Per-Node Run Button + Cascade Toggle

### UI Design: Footer Bar

Run button (▶) and cascade toggle integrated into the node's existing footer, next to the output variable label. Always visible.

Layout:
```
┌─────────────────────────┐
│ [icon] Python            │  ← header
├─────────────────────────┤
│ data_transform           │  ← body
│ df = pd.read_csv...     │
├─────────────────────────┤
│ result    [⇄] [▶]       │  ← footer (output var + cascade toggle + run button)
└─────────────────────────┘
```

- `[▶]` Run button: triggers single-node execution
- `[⇄]` Cascade toggle: small switch, default OFF
  - OFF: run only this node using historical upstream outputs
  - ON: run from topmost upstream through to this node

### Frontend Changes

**`WfCanvasNode.vue`:**
- Add cascade toggle (small switch icon) and run button (play icon) to footer
- Run button click emits event to parent canvas
- While node is running, button shows spinner; disable click
- Cascade toggle state stored per node in workflow store (transient, not persisted)

**`WfEditorCanvas.vue`:**
- Handle node run event: call `store.executeNode(nodeId, { cascade })` 
- Save workflow before execution if dirty

**`workflowStore.ts`:**
- Add `nodeCascadeStates: Map<string, boolean>` (transient state, default false)
- Modify `executeNode` action to accept `{ cascade?: boolean }` option
- Pass `cascade` parameter to API call

**`api/workflow.ts`:**
- Update `startNode()` to accept and pass `cascade` parameter

### Backend Changes

**`workflow.routes.ts` / `workflow.controller.ts`:**
- Accept `cascade` boolean in `POST /:workflowId/nodes/:nodeId/run` body

**`executionEngine.ts` — new non-cascade mode:**

When `cascade=false` (default):
1. Find target node's upstream nodes via `getUpstreamNodes()`
2. For each upstream node, query its most recent successfully completed `WorkflowNodeRun` record (status=completed, ordered by completedAt desc)
3. If any upstream node has no historical output → throw error with message identifying missing nodes
4. Build `nodeOutputs` Map from historical outputs (parse stored JSON)
5. Create new `WorkflowRun` + single `WorkflowNodeRun` for target node
6. Execute target node only, using historical `nodeOutputs` for template resolution

When `cascade=true`:
- Existing `executeNode` logic (compute upstream, run all)

### Mobile

**`WfMobileNodeCard.vue`:**
- Add run button and cascade toggle to the mobile node card footer, same logic as desktop

## 3. Variable Insertion UI

### New Shared Component: `WfVariableInsertButton.vue`

A button component that shows available upstream variables in a dropdown.

**Props:**
- `nodeId: string` — current node ID (to compute upstream nodes)
- `disabled?: boolean`

**Emits:**
- `insert(template: string)` — e.g. `{{query_orders.csvPath}}`

**Behavior:**
1. Click button → compute all reachable upstream nodes via BFS through edges
2. For each upstream node, list known output fields based on node type:
   - SQL: `csvPath` (csvFile), `totalRows` (number), `columns` (array), `previewData` (object)
   - Python: `result` (object), `csvPath` (csvFile), `stderr` (text)
   - LLM: `result` (object), `rawResponse` (text)
   - Email: `success` (boolean), `messageId` (text), `recipients` (array)
   - Branch: `result` (boolean)
   - Web Search: `markdownPath` (markdownFile), `totalResults` (number)
3. Display grouped dropdown: upstream node name + type as group header, fields as items
4. Each item shows template syntax and output type badge
5. On select, emit `insert` event with the template string
6. If no upstream nodes, button is disabled with tooltip

**Output field registry:** Define a static mapping of node type → output fields in a shared constant (e.g. `constants/workflow.ts`), used by both this component and potentially by copilot prompt generation.

### Integration Points

Each config component adds the button to its toolbar area and handles the `insert` event:

**`WfConfigSqlQuery.vue`:**
- Add `WfVariableInsertButton` next to Format button in toolbar
- On insert: inject template at CodeMirror cursor position via EditorView dispatch

**`WfConfigPythonScript.vue`:**
- Add button to toolbar above CodeMirror editor
- On insert: inject at cursor position

**`WfConfigLlmGenerate.vue`:**
- Add button above the prompt textarea
- On insert: inject at textarea cursor position (selectionStart/selectionEnd)

**`WfConfigBranch.vue`:**
- Add button next to the field input
- On insert: append or replace field value

**`WfConfigWebSearch.vue`:**
- Add button next to keywords input
- On insert: append at cursor position in keywords input

**`WfConfigEmail.vue`:**
- Add button next to subject and body editor
- On insert: inject at cursor position in the active field

### i18n Keys

```
workflow.config.insertVariable        // "Insert Variable" / "插入变量"
workflow.config.noUpstreamNodes       // "No upstream nodes connected" / "无上游节点连接"
workflow.config.variableInserted      // "Variable inserted" / "变量已插入"
```

## 4. Execution Engine: `wf_execute_node` with Mock Inputs

### Copilot Tool Enhancement (`copilotTools.ts`)

Update `wf_execute_node` tool definition:

```typescript
{
  name: 'wf_execute_node',
  description: 'Execute a single workflow node. With mockInputs: runs only this node using provided mock data (skips upstream). Without mockInputs: runs this node and all upstream dependencies.',
  parameters: {
    nodeId: { type: 'string', required: true },
    mockInputs: {
      type: 'object',
      required: false,
      description: 'Mock upstream outputs keyed by outputVariable name. When provided, only the target node runs using these as resolved upstream data.'
    }
  }
}
```

### Backend Implementation (`executionEngine.ts`)

New method or parameter on existing `executeNode`:

```typescript
executeNode(
  workflowId: string,
  nodeId: string,
  options?: {
    params?: Record<string, string>;
    mockInputs?: Record<string, unknown>;
    cascade?: boolean;
  }
): Promise<AsyncExecutionHandle>
```

When `mockInputs` is provided:
1. Build `nodeOutputs` Map directly from mockInputs (each key is an outputVariable name)
2. Create WorkflowRun + single WorkflowNodeRun
3. Execute target node only, using mockInputs for template resolution
4. No upstream computation needed

This takes priority over `cascade` flag — if mockInputs is present, cascade is irrelevant.

### Copilot Tool Handler (`copilotTools.ts`)

When `wf_execute_node` is called with `mockInputs`:
- Pass mockInputs through to `executionEngine.executeNode()`
- Return execution result as usual

## 5. Copilot Prompt Updates

### Node Type Descriptions (`copilotPrompt.ts`)

**Branch node section — rewrite:**
- Remove all operator descriptions
- Describe truthy/falsy evaluation rules
- Emphasize: "For complex conditions, use a Python node to compute a boolean, then feed it to Branch"
- Example: Python outputs `{"result": {"should_continue": true}}` → Branch field: `{{python_result.result.should_continue}}`

**All node sections — enhance input/output documentation:**
- Add clear "Inputs" subsection: what templates each node supports and where
- Add clear "Outputs" subsection: exact field names and types available for downstream
- Add cross-reference examples (SQL→Python, Python→LLM, LLM→Email, etc.)

### Tool Descriptions

**`wf_execute_node`:**
- Updated description covering both modes (mock and cascade)
- Add examples for mock usage:
  ```
  wf_execute_node({
    nodeId: "xxx",
    mockInputs: { "query_result": { "csvPath": "/path/to/test.csv", "totalRows": 50 } }
  })
  ```

**`wf_add_node` / `wf_update_node`:**
- Update Branch config schema: remove `operator` and `value` fields
- Update config examples for branch node

### Debug Guidance (new section in system prompt)

Add a "Node Debugging" section:
- Explain how to use `wf_execute_node` with `mockInputs` to test a node in isolation
- Provide patterns for constructing mock data per node type
- Suggest debugging workflow: identify failing node → construct mock inputs → test → fix config → run full workflow

## 6. Files to Modify

### Backend
| File | Changes |
|------|---------|
| `workflow/workflow.types.ts` | Remove `operator`, `value` from BranchNodeConfig |
| `workflow/nodeExecutors/branchNodeExecutor.ts` | Replace evaluation with `isTruthy()` |
| `workflow/executionEngine.ts` | Add non-cascade mode, mockInputs support |
| `workflow/workflow.controller.ts` | Accept `cascade` param in node run endpoint |
| `workflow/workflow.routes.ts` | Pass `cascade` to controller |
| `copilot/copilotPrompt.ts` | Update node descriptions, add debug section |
| `copilot/copilotTools.ts` | Update `wf_execute_node` schema, branch config schema |

### Frontend
| File | Changes |
|------|---------|
| `types/workflow.ts` | Remove `operator`, `value` from BranchNodeConfig |
| `components/workflow/WfCanvasNode.vue` | Add run button + cascade toggle to footer |
| `components/workflow/config/WfConfigBranch.vue` | Remove operator/value, add variable insert button |
| `components/workflow/config/WfConfigSqlQuery.vue` | Add variable insert button to toolbar |
| `components/workflow/config/WfConfigPythonScript.vue` | Add variable insert button to toolbar |
| `components/workflow/config/WfConfigLlmGenerate.vue` | Add variable insert button |
| `components/workflow/config/WfConfigEmail.vue` | Add variable insert button |
| `components/workflow/config/WfConfigWebSearch.vue` | Add variable insert button |
| `components/workflow/config/WfVariableInsertButton.vue` | **New** shared component |
| `stores/workflowStore.ts` | Add `nodeCascadeStates`, update `executeNode` action |
| `api/workflow.ts` | Add `cascade` param to `startNode()` |
| `constants/workflow.ts` | Add node output field registry |
| `locales/zh-CN.ts` | Add new i18n keys |
| `locales/en-US.ts` | Add new i18n keys |
| `components/workflow/mobile/WfMobileNodeCard.vue` | Add run button + cascade toggle |
