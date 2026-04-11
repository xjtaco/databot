# Custom Node Templates — Design Spec

## Overview

Allow users to save workflow nodes as reusable custom node templates, manage them in a dedicated list tab, edit them in a single-node canvas with a debug copilot, and use them from the main copilot via search.

## Key Decisions

- **DebugAgent**: Independent class alongside `CopilotAgent` (not a mode or subclass). Simpler, clearer separation of concerns.
- **In-memory workflow**: Debug editing creates a temporary workflow in memory (never persisted to DB). Created on WS connect, destroyed on WS disconnect.
- **Custom node usage**: Drag-to-canvas creates a deep copy of the template config. The new node has no ongoing relationship with the template.
- **Branch exclusion**: Branch nodes cannot be saved as custom templates (not useful as standalone reusable units).

---

## 1. Backend — DebugAgent & In-Memory Workflow

### 1.1 DebugAgent Class

**File**: `backend/src/copilot/debugAgent.ts` (new)

- Independent class, parallel to `CopilotAgent`
- Constructor: `(templateId: string, sendEvent: (event: CopilotServerMessage) => void)`
- Holds an in-memory workflow object (one workflow + one node, loaded from `CustomNodeTemplate`)
- Implements its own agentic loop (`handleUserMessage`) — same pattern as `CopilotAgent` but with a reduced tool set
- WS disconnect triggers cleanup of the in-memory workflow

### 1.2 DebugAgent Tool Set (8 tools)

| Tool | Purpose |
|------|---------|
| `WfGetNodeTool` | Read current node config |
| `WfPatchNodeTool` | Text replacement in SQL/Python/Prompt content |
| `WfUpdateNodeTool` | Update node config (merge) |
| `WfExecuteNodeTool` | Execute node with mockInputs for debugging |
| `WfGetRunResultTool` | Retrieve execution results |
| `scoped_glob` | File pattern matching in allowed directories |
| `scoped_grep` | Regex search in allowed directories |
| `scoped_read_file` | Read file contents from allowed paths |

These tools operate on the in-memory workflow, not the database.

### 1.2a In-Memory Workflow Abstraction

The existing Wf* tools are tightly coupled to the database (via `workflow.repository` and `workflow.service`). To support both CopilotAgent (DB-backed) and DebugAgent (in-memory), introduce a `WorkflowAccessor` interface:

```typescript
interface WorkflowAccessor {
  getWorkflow(): Promise<WorkflowDetail>
  getNode(nodeId: string): Promise<WorkflowNodeDetail>
  updateNode(nodeId: string, updates: Partial<SaveNodeInput>): Promise<void>
  patchNodeContent(nodeId: string, oldText: string, newText: string, occurrence?: number): Promise<void>
  executeNode(nodeId: string, options: { mockInputs?: Record<string, unknown> }): Promise<{ runId: string }>
  getRunResult(runId: string): Promise<WorkflowRunDetail>
}
```

`patchNodeContent` auto-detects the content field from node type (sql→`sql`, python→`script`, llm→`prompt`) — same logic as the existing `WfPatchNodeTool`. The `occurrence` parameter supports nth-match replacement.

**Two implementations:**

1. **`DbWorkflowAccessor`** — wraps existing `workflow.service` / `workflow.repository` calls. Used by `CopilotAgent`. No behavior change.

2. **`InMemoryWorkflowAccessor`** — holds the workflow object in memory. Used by `DebugAgent`.
   - `getWorkflow()` / `getNode()`: return from in-memory object
   - `updateNode()` / `patchNodeContent()`: mutate in-memory object directly
   - `executeNode()`: calls the existing node executor directly (bypassing `executionEngine.executeNode`), always requires `mockInputs` since there are no upstream nodes. Creates a temporary work folder for output files. Run state (inputs, outputs, status) is stored in an in-memory map keyed by a generated `runId`.
   - `getRunResult()`: returns from the in-memory run map

**Execution details for in-memory mode:**
- No `WorkflowRun` or `WorkflowNodeRun` DB records are created
- `mockInputs` is mandatory (the debug prompt instructs the LLM accordingly)
- Temporary work folder is created under `os.tmpdir()` per execution, cleaned up on WS disconnect
- Run results are held in a `Map<string, RunResult>` on the `InMemoryWorkflowAccessor` instance

Only the 5 Wf* tools used by DebugAgent are refactored to accept `WorkflowAccessor`: `WfGetNodeTool`, `WfPatchNodeTool`, `WfUpdateNodeTool`, `WfExecuteNodeTool`, `WfGetRunResultTool`. These tools receive a `WorkflowAccessor` via their constructor. The `createDebugToolRegistry()` factory passes an `InMemoryWorkflowAccessor`; the existing `createCopilotToolRegistry()` passes a `DbWorkflowAccessor`. The other 8 Wf* tools (only used by CopilotAgent) keep their current `workflowId` + direct DB approach unchanged.

### 1.3 In-Memory Workflow Lifecycle

1. **WS connect** (`/ws/custom-node-debug?templateId=xxx`): Read `CustomNodeTemplate` from DB → build in-memory workflow object (one workflow + one node) → create `InMemoryWorkflowAccessor`
2. **Tool calls**: All Wf* tools operate via the accessor interface
3. **Save**: User triggers save → `PUT /custom-node-templates/:id` writes current in-memory node config back to DB
4. **WS disconnect**: Destroy `InMemoryWorkflowAccessor` (cleans up temp work folders and run map)

### 1.4 Debug System Prompt

**File**: `backend/src/copilot/debugPrompt.ts` (new)

Focused on single-node debugging:
- Node type reference (only the type of the current node)
- mockInput usage instructions
- Config editing guidance
- File reading for data dictionary context

Does NOT include: workflow construction, node connection, multi-node orchestration.

### 1.5 Debug WebSocket Endpoint

**File**: `backend/src/copilot/debugWebSocket.ts` (new)

- Route: `/ws/custom-node-debug?templateId=xxx`
- Message protocol: reuses `CopilotServerMessage` / `CopilotClientMessage` types
- `set_auto_fix` messages are ignored (not applicable to single-node debug mode)
- Creates `DebugAgent` instance per connection, destroys on disconnect

---

## 2. Backend — Main Copilot Changes

### 2.1 WfSearchCustomNodes Tool (new)

- Registered in main `CopilotAgent` tool set (NOT in DebugAgent)
- Tool name: `wf_search_custom_nodes`
- Parameters: `{ pattern: string }` (regex)
- Searches `CustomNodeTemplate` `name` and `description` fields
- Returns: `{ id, name, description, type }[]` (max 20 results)
- Implementation: query all templates from DB, filter with regex in application layer
- Safety: wrap `new RegExp(pattern)` in try/catch; on invalid regex, fall back to substring match

### 2.2 WfAddNodeTool Extension

- New optional parameter: `templateId?: string`
- When `templateId` is provided: load `CustomNodeTemplate` config as initial node config
- When `templateId` is omitted: existing default config behavior unchanged

### 2.3 CustomNodeTemplate API

**All endpoints already exist** (no new backend routes needed):
- `GET /custom-node-templates` — list all templates
- `POST /custom-node-templates` — create template (add explicit `if (input.type === WorkflowNodeType.Branch) throw new ValidationError(...)` after existing `isValidNodeType` check)
- `PUT /custom-node-templates/:id` — update template (name, description, config)
- `DELETE /custom-node-templates/:id` — delete template

---

## 3. Frontend — Custom Node List Tab

### 3.1 WfListView Tab Structure

Add `el-tabs` at the top of `WfListView.vue`:
- Tab 1: **Workflows** — existing workflow list (unchanged)
- Tab 2: **Custom Nodes** — new custom node template list

Active tab state managed in `workflowStore` as `activeTab: 'workflows' | 'customNodes'`.

### 3.2 WfCustomNodeList.vue (new)

**File**: `frontend/src/components/workflow/WfCustomNodeList.vue`

- Desktop: `el-table` with columns: Name, Description, Type (color-coded badge), Created, Actions (Edit / Delete)
- Mobile: card layout matching workflow card style
- Search: filter by name/description text
- No status filter (templates have no execution status)
- Edit button → enters `customNodeEditor` view mode
- Delete button → confirmation dialog → `DELETE /custom-node-templates/:id`

### 3.3 "Save as Custom Node" Button

In the node config drawer (for all node types except Branch):
- Add a button at the bottom: "Save as Custom Node"
- Click → dialog with Name and Description inputs
- Confirm → calls existing `saveNodeAsTemplate` store method
- i18n keys added for both zh-CN and en-US

---

## 4. Frontend — Single-Node Editor Canvas

### 4.1 View Mode

`WorkflowPage` gets a new view mode: `customNodeEditor` (alongside `list`, `editor`, `history`).

Entered via: custom node list → Edit button → `enterCustomNodeEditor(templateId)`.

### 4.2 WfCustomNodeEditor.vue (new)

**File**: `frontend/src/components/workflow/WfCustomNodeEditor.vue`

Layout:
- **Header**: Back button + template name/type label + Save Template button
- **Canvas area**: Reuses `WfEditorCanvas` but simplified — no left palette, single node displayed
- **Right panel**: Debug Copilot panel
- Click node → opens config drawer (reuses existing config components)

### 4.3 Debug Copilot Panel

Reuses UI structure from `WfCopilotPanel` (message list, input box, tool status badges).

Connects to `/ws/custom-node-debug?templateId=xxx` instead of `/ws/copilot?workflowId=xxx`.

### 4.4 debugCopilotStore.ts (new)

**File**: `frontend/src/stores/debugCopilotStore.ts`

Structure mirrors `copilotStore.ts`:
- Connection parameter: `templateId` (not `workflowId`)
- WS endpoint: `/ws/custom-node-debug`
- Same message types and event handling
- `connect(templateId)` / `disconnect()` / `sendMessage(content)` / `abort()`
- No auto-fix toggle (not applicable)
- No automatic reconnect — on disconnect, the in-memory workflow is gone; user must re-enter editor
- `workflow_changed` events update the single in-memory node representation directly (not via `workflowStore.loadForEditing`)

### 4.5 Save & Exit

- **Save**: calls `PUT /custom-node-templates/:id` with current node config
- **Back/Exit**: disconnects WS (backend destroys in-memory workflow), returns to custom node list

### 4.6 Mobile

- Single node displayed as `WfMobileNodeCard`
- Tap to open config via `WfMobileNodeConfigSheet`
- Debug Copilot as full-screen overlay (same pattern as `WfMobileCopilot`)

---

## 5. Store Changes Summary

### workflowStore.ts (modified)

New state:
- `activeTab: 'workflows' | 'customNodes'`
- `editingTemplateId: string | null`

New methods:
- `addNodeFromTemplate(type, position, templateId)` — reads from the already-fetched `customTemplates` ref, deep-copies config via `structuredClone()` into new node
- `updateTemplate(id, { name?, description?, config? })` — calls `PUT` API
- `enterCustomNodeEditor(templateId)` — sets mode + templateId
- `exitCustomNodeEditor()` — clears state, returns to list

### debugCopilotStore.ts (new)

- Mirrors `copilotStore` structure
- WS connection uses `templateId`
- WS endpoint: `/ws/custom-node-debug`

---

## 6. i18n Keys

New keys needed in both `zh-CN.ts` and `en-US.ts`:

```
workflow.tabs.workflows        — "Workflows" / "工作流"
workflow.tabs.customNodes      — "Custom Nodes" / "自定义节点"
workflow.customNode.edit       — "Edit" / "编辑"
workflow.customNode.delete     — "Delete" / "删除"
workflow.customNode.search     — "Search custom nodes..." / "搜索自定义节点..."
workflow.customNode.empty      — "No custom nodes yet" / "暂无自定义节点"
workflow.customNode.saveAs     — "Save as Custom Node" / "保存为自定义节点"
workflow.customNode.saveName   — "Name" / "名称"
workflow.customNode.saveDesc   — "Description" / "描述"
workflow.customNode.saveTitle  — "Save as Custom Node" / "保存为自定义节点"
workflow.customNode.editor     — "Custom Node Template" / "自定义节点模板"
workflow.customNode.saveTemplate — "Save Template" / "保存模板"
workflow.customNode.debugCopilot — "Debug Copilot" / "调试助手"
workflow.customNode.deleteConfirm — "Are you sure..." / "确定删除..."
```

---

## 7. New Files Summary

### Backend
| File | Purpose |
|------|---------|
| `backend/src/copilot/debugAgent.ts` | DebugAgent class with agentic loop |
| `backend/src/copilot/debugPrompt.ts` | Debug-focused system prompt builder |
| `backend/src/copilot/debugWebSocket.ts` | WS endpoint `/ws/custom-node-debug` |
| `backend/src/copilot/debugTools.ts` | `createDebugToolRegistry()` factory |

### Frontend
| File | Purpose |
|------|---------|
| `frontend/src/components/workflow/WfCustomNodeList.vue` | Custom node list component |
| `frontend/src/components/workflow/WfCustomNodeEditor.vue` | Single-node editor canvas |
| `frontend/src/stores/debugCopilotStore.ts` | Debug copilot state + WS management |

### Modified Files
| File | Change |
|------|--------|
| `backend/src/copilot/copilotTools.ts` | Add `WfSearchCustomNodes` tool; extend `WfAddNodeTool` with `templateId`; refactor Wf* tools to accept `WorkflowAccessor` |
| `backend/src/workflow/customNodeTemplate.service.ts` | Add branch type validation in `createTemplate()` |
| `backend/src/copilot/index.ts` | Export new debug modules |
| `backend/src/index.ts` | Call `initDebugWebSocket(app)` alongside existing copilot WS init |
| `frontend/src/components/workflow/WorkflowPage.vue` | Add `customNodeEditor` view mode (both desktop & mobile template blocks) |
| `frontend/src/components/workflow/WfListView.vue` | Add tabs structure |
| `frontend/src/components/workflow/WfEditorCanvas.vue` | Read `workflow/template-id` from drop event; call `addNodeFromTemplate()` when present |
| `frontend/src/stores/workflowStore.ts` | Add tab state, template editing methods, `addNodeFromTemplate()` |
| `frontend/src/stores/index.ts` | Export `useDebugCopilotStore` |
| `frontend/src/api/workflow.ts` | Add `updateCustomNodeTemplate()` API function |
| `frontend/src/locales/zh-CN.ts` | Add custom node i18n keys |
| `frontend/src/locales/en-US.ts` | Add custom node i18n keys |
| Node config components | Add "Save as Custom Node" button (except Branch) |
