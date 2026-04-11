# Custom Node Enhancements — Design Spec

## Overview

Enhance the custom node template feature with: (1) import/export for the custom node list tab, (2) a "New Node" creation flow in the editor, (3) a node type palette for new node creation, and (4) save dialog with name/description input.

---

## 1. Custom Node List Tab Enhancements

### 1.1 Header Buttons

Add three buttons to `WfCustomNodeList.vue` header, matching workflow list style:

- **Import Nodes** (`Upload` icon) — upload ZIP file, parse and batch-create templates
- **Export Selected** (`Download` icon) — export checked templates as ZIP, disabled when none selected
- **New Node** (`Plus` icon, primary) — enter editor in create mode

Desktop: buttons show icon + text. Mobile: icon-only with tooltips (same pattern as workflow list).

### 1.2 Selection Support

Desktop table: add `el-table-column type="selection"` checkbox column.

Mobile cards: add `el-checkbox` in each card header (same pattern as workflow mobile cards).

Track selected IDs in local state: `selectedIds: string[]`.

### 1.3 Import/Export (Frontend-Side ZIP, Matching Workflow Pattern)

Import/export follows the **same architecture as workflow import/export**: ZIP assembly and parsing happen on the frontend using `jszip` (already in frontend `package.json`). The backend only provides per-item JSON endpoints (which already exist: `GET /:id`, `POST /`).

**Export flow** (frontend-only, no new backend endpoint):
1. Frontend fetches each selected template via `GET /custom-node-templates/:id`
2. For each template, creates a JSON file `{name}.json` containing `{ name, description, type, config }`
3. Packs all JSON files into a ZIP using `JSZip` and triggers download
4. Duplicate filenames resolved with `(1)`, `(2)` suffixes

**Import flow** (frontend parses ZIP, calls existing create endpoint):
1. Frontend reads uploaded ZIP file using `JSZip`
2. Parses each `.json` file in the ZIP (silently skip non-JSON or invalid files)
3. For each valid template JSON, calls `POST /custom-node-templates` with `{ name, description, type, config }`
4. On name conflict (409 or unique constraint error), auto-renames with `(1)` suffix and retries
5. Collects results and shows import result dialog matching `ImportResultItem` shape: `{ originalName, result: { id, name, renamed }, error? }`

**Frontend API/Store**:
- Store: `batchExportTemplates(ids: string[])` — fetches each, builds ZIP, downloads
- Store: `importTemplates(file: File)` — parses ZIP, creates each, collects results
- No new backend endpoints needed for import/export

**Import error handling**:
- Non-JSON files in ZIP: silently skipped
- Invalid `type` (e.g., `'branch'`): recorded as error in results
- Empty ZIP: show "no valid templates found" message
- Corrupted ZIP: show error toast

### 1.4 i18n Keys

New keys (both zh-CN and en-US):
```
workflow.customNode.importNodes      — "Import Nodes" / "导入节点"
workflow.customNode.exportSelected   — "Export Selected" / "导出所选"
workflow.customNode.newNode          — "New Node" / "新建节点"
workflow.customNode.importSuccess    — "Import successful" / "导入成功"
workflow.customNode.noValidTemplates — "No valid templates found in file" / "文件中没有有效的模板"
workflow.customNode.saveDialogTitle  — "Save Node Template" / "保存节点模板"
workflow.customNode.nameRequired     — "Name is required" / "名称不能为空"
workflow.customNode.nodePalette      — "Select Node Type" / "选择节点类型"
workflow.customNode.nodeAdded        — "Node added. Configure and save." / "节点已添加，请配置后保存。"
```

---

## 2. Custom Node Editor Enhancements

### 2.1 Two Modes: Create vs Edit

`WfCustomNodeEditor.vue` accepts `templateId` as optional prop:
- **Edit mode** (`templateId` provided): loads existing template, same as current behavior
- **Create mode** (`templateId` absent/null): empty canvas, shows node type palette

### 2.2 Node Type Palette (Create Mode Only)

Left-side panel visible only in create mode. Lists built-in node types (excluding Branch):
- SQL Query
- Python Script
- LLM Generate
- Send Email (disabled if SMTP not configured)
- Web Search (disabled if not configured)

User clicks/drags a type to add it to the canvas. **Only one node allowed** — after adding, the palette items are disabled or the palette hides.

Edit mode: no palette shown (the single node is already on canvas).

### 2.3 Save Dialog with Name/Description

Both modes: clicking Save opens a dialog:

**Create mode**: empty name/description fields, must fill name. On confirm:
- Call `POST /custom-node-templates` with `{ name, description, type, config }`
- On success, return to list and refresh

**Edit mode**: pre-filled with current template name/description. On confirm:
- Call `PUT /custom-node-templates/:id` with `{ name, description, config }`
- On success, show success toast

### 2.4 Create Mode — Debug Copilot

Create mode also connects the debug copilot WebSocket. Since there's no `templateId` yet, the WS connection is deferred until after the first save. Before first save, copilot panel shows a message: "Save the node first to enable debug copilot."

Alternatively (simpler): in create mode, the copilot panel is hidden. User creates node type → configures → saves → then can edit it (with copilot). This avoids the complexity of a temporary WS connection.

**Chosen approach**: Copilot panel hidden in create mode. After save, user can re-enter in edit mode to use copilot.

### 2.5 WorkflowPage Integration

- `handleCreateTemplate()`: sets `editingTemplateId = null`, switches to `customNodeEditor` view
- `handleEditTemplate(id)`: sets `editingTemplateId = id` (existing)
- `WfCustomNodeEditor` prop changes: `templateId` becomes optional (`templateId?: string`)
- `WfCustomNodeList` emits: `edit(id)` (existing), `create` (new)
- `WfListView` forwards `create` event from `WfCustomNodeList` as `createTemplate` emit to `WorkflowPage`

---

## 3. Backend Changes

No new backend endpoints needed. Import/export uses existing CRUD endpoints (`GET /:id`, `POST /`) with frontend-side ZIP handling (same as workflow import/export pattern).

---

## 4. Modified Files Summary

### Frontend
| File | Change |
|------|--------|
| `frontend/src/components/workflow/WfCustomNodeList.vue` | Add header buttons (import/export/new), selection checkboxes, import result dialog |
| `frontend/src/components/workflow/WfCustomNodeEditor.vue` | Optional `templateId`, node type palette for create mode, save dialog with name/desc |
| `frontend/src/components/workflow/WfListView.vue` | Forward `createTemplate` event from `WfCustomNodeList` |
| `frontend/src/components/workflow/WorkflowPage.vue` | Add `handleCreateTemplate`, wire `createTemplate` event |
| `frontend/src/stores/workflowStore.ts` | Add `batchExportTemplates()`, `importTemplates()` methods |
| `frontend/src/locales/zh-CN.ts` | Add new i18n keys |
| `frontend/src/locales/en-US.ts` | Add new i18n keys |
