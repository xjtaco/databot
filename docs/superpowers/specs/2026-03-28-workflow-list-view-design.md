# Workflow List View Design

## Summary

Replace the current workflow page layout (sidebar + blank main area) with a full-width workflow list view. The list view shows workflow summary information in a table (desktop) or card grid (mobile). Clicking "edit" enters the existing workflow editor. The sidebar (`WfListSidebar.vue`) is removed.

## Architecture & View Switching

`WorkflowPage.vue` manages two view states:

```
activeView = 'list' (default)
  → WfListView (full width, no sidebar)

activeView = 'editor'
  → Existing editor layout (Header + Palette + Canvas + Copilot)
```

**Transitions:**
- Enter workflow page → list view
- Click "edit" on a workflow → `activeView = 'editor'`, load workflow detail
- Click "back" in editor → `activeView = 'list'`, refresh list data

**Deleted component:** `WfListSidebar.vue`

## List View Component (WfListView)

### Desktop Layout (Table)

```
┌─ Header Bar ──────────────────────────────────┐
│  搜索框(el-input)  筛选下拉(el-select)   [+ 新建] │
├───────────────────────────────────────────────┤
│  el-table                                      │
│  ┌──────┬──────┬────┬────┬──────┬───────┐     │
│  │ 名称 │ 描述 │节点数│状态│更新时间│ 操作  │     │
│  ├──────┼──────┼────┼────┼──────┼───────┤     │
│  │ ...  │ ...  │ 5  │ ✓  │ 3/27 │ ✎▶⧉↓✕│     │
│  └──────┴──────┴────┴────┴──────┴───────┘     │
│                                                │
│  Empty state: centered prompt + create button  │
└───────────────────────────────────────────────┘
```

### Mobile Layout (Cards)

```
┌─ Header Bar ────────────────┐
│  搜索框          筛选  [+ 新建] │
├─────────────────────────────┤
│  ┌─ Card ─────────────────┐ │
│  │ 名称        [状态badge] │ │
│  │ 描述                    │ │
│  │ 5个节点 · 3月27日更新    │ │
│  │ [编辑] [···]              │ │
│  └─────────────────────────┘ │
└─────────────────────────────┘
```

Mobile cards show an "Edit" button and a three-dot overflow menu (`el-dropdown`) for Run, Clone, Export, Delete. This avoids cramming five buttons on a narrow card.

### Loading & Error States

- **Loading:** Show `el-skeleton` placeholder rows/cards while `fetchWorkflows()` is in flight.
- **Error:** Show centered error message with retry button if API call fails.
- **Empty:** Show centered prompt with create button when list is empty (and no active filter).

### Table Columns

| Column | Field | Notes |
|--------|-------|-------|
| 名称 | `name` | Clickable, also enters editor |
| 描述 | `description` | Show `—` when null |
| 节点数 | `nodeCount` | Numeric |
| 状态 | `lastRunStatus` | Badge: completed(green), failed(red), running(blue), pending(blue), skipped(yellow), cancelled(gray), null(gray/"未运行") |
| 更新时间 | `updatedAt` | Relative time or date |
| 操作 | — | Edit, Run, Clone, Export, Delete buttons |

### Filter Options

All / Completed / Failed / Running / Pending / Skipped / Cancelled / Never run

### Actions

- **Edit:** Switch to editor view
- **Run:** Fetch full workflow detail first to detect `{{params.*}}` placeholders in node configs. Show loading indicator while fetching. If params detected, show params dialog. Then execute. After execution starts, stay on the list view (fire-and-forget). The `lastRunStatus` will update on next list refresh or can be polled. If detail fetch fails, show error via `ElMessage.error`.
- **Clone:** Frontend sends clone API with `name` = `originalName + t('workflow.list.cloneSuffix')`. API returns the new workflow object. Refresh list. Duplicate names are allowed (no unique constraint on workflow name).
- **Export:** Call export API, receive JSON. Frontend creates a Blob and triggers download via a temporary `<a>` element with `Content-Disposition`-style filename `{workflowName}.json`.
- **Delete:** Confirm dialog (reuse existing `workflow.deleteConfirm` i18n key), then delete
- **Create (header button):** Open dialog with name (required) + description (optional) fields, same as existing `WfListSidebar` create dialog. On success, enter editor for the new workflow.

## Data Model Changes

### WorkflowListItem Extension

Add field to existing type:

```typescript
lastRunStatus: ExecutionStatus | null  // status of most recent run
```

### Backend `GET /workflows` Change

Join most recent `WorkflowRun` per workflow, return its `status` as `lastRunStatus`. Return `null` when no runs exist. Use the existing Prisma `include` pattern with `orderBy: { startedAt: 'desc' }, take: 1` on the `runs` relation — just add `select: { status: true }` alongside the existing `startedAt` selection.

### New APIs

| Method | Path | Description |
|--------|------|-------------|
| POST | `/workflows/:id/clone` | Clone workflow (copy nodes, edges, new IDs) |
| GET | `/workflows/:id/export` | Export workflow definition as JSON |

**Clone logic:**
- Request body: `{ name: string }` — required, frontend always sends the name using i18n key `workflow.list.cloneSuffix` (e.g., `originalName + t('workflow.list.cloneSuffix')`)
- Copy all nodes and edges with new UUIDs
- Do not copy run history
- Response: `{ workflow: WorkflowListItem }` — returns the newly created workflow

**Export JSON format:**
```json
{
  "name": "...",
  "description": "...",
  "nodes": [{ "name", "type", "config", "positionX", "positionY" }],
  "edges": [{ "sourceNodeName", "targetNodeName" }]
}
```

Edges reference nodes by `name` (unique per workflow via `@@unique([workflowId, name])` constraint) for robustness and readability. Exports structure only — no IDs, timestamps, or run history. Frontend creates a Blob from the JSON response and triggers browser download via a temporary `<a>` element.

## Store Changes (workflowStore)

**New state:**
```typescript
searchQuery: string                    // search keyword
statusFilter: ExecutionStatus | 'all' | 'never_run'  // status filter ('never_run' maps to lastRunStatus === null)
```

**New actions:**
```typescript
cloneWorkflow(id: string)    // call clone API, refresh list
exportWorkflow(id: string)   // call export API, trigger download
```

**New computed:**
```typescript
filteredWorkflows  // filter workflows by searchQuery and statusFilter
```

**Search/filter logic:**
- Search: frontend filter, match `name` and `description` (case insensitive)
- Filter: frontend filter, match `lastRunStatus` (`all` = no filter, `null` = "never run")
- Data volume is small, no backend pagination needed

**Cleanup:**
- Remove `selectedWorkflowId` from state (no longer needed; editor uses `editorWorkflow`)
- Remove `selectedWorkflow` computed (depends on `selectedWorkflowId`)
- Update `removeWorkflow()` to no longer reference `selectedWorkflowId`

## i18n Keys

New keys under `workflow.list.*` and `workflow.status.*` namespaces:

```
workflow.list.search         搜索 workflow... / Search workflow...
workflow.list.filter         筛选 / Filter
workflow.list.filterAll      全部 / All
workflow.list.nodeCount      节点数 / Nodes
workflow.list.updatedAt      更新时间 / Updated
workflow.list.actions        操作 / Actions
workflow.list.clone          复制 / Clone
workflow.list.export         导出 / Export
workflow.list.empty          暂无 workflow / No workflows yet
workflow.list.emptyHint      点击上方按钮创建 / Click above to create one
workflow.list.cloneSuccess   复制成功 / Cloned successfully
workflow.list.neverRun       未运行 / Never run
workflow.list.more           更多 / More
workflow.list.cloneSuffix    (副本) / (copy)

workflow.status.completed    成功 / Completed
workflow.status.failed       失败 / Failed
workflow.status.running      运行中 / Running
workflow.status.pending      等待中 / Pending
workflow.status.skipped      已跳过 / Skipped
workflow.status.cancelled    已取消 / Cancelled
```

## i18n Notes

Reuse existing keys where semantics match (avoid duplication):
- `workflow.name` — reuse for table column header "Name"
- `workflow.description` — reuse for table column header "Description"
- `workflow.run` — reuse for "Run" action button
- `workflow.status` — reuse for table column header "Status"
- `workflow.delete` — reuse for "Delete" action button
- `workflow.edit` — reuse for "Edit" action button
- `workflow.deleteConfirm` — reuse for delete confirmation dialog
- `workflow.create` / `workflow.createTitle` — reuse for create button and dialog

## Testing

### Backend
- Unit tests for clone service function (happy path, not-found error, name uniqueness)
- Unit tests for export service function (correct JSON shape, edge name references)
- Unit test for `GET /workflows` returning `lastRunStatus`

### Frontend
- Unit test for `filteredWorkflows` computed (search by name/description, filter by status, combined)
- Unit test for `WfListView.vue` rendering (table on desktop, cards on mobile, empty state, loading state)

Test files go in `backend/tests/` and `frontend/tests/` per project conventions.

## Error Handling

New error code for clone failure (source workflow not found). Follows existing `ApiError` pattern in `backend/src/errors/`. Frontend displays errors via `ElMessage.error`.

## Files Changed

### New
- `frontend/src/components/workflow/WfListView.vue`
- `backend/tests/workflow-clone-export.test.ts`
- `frontend/tests/stores/workflowStore-filter.test.ts`
- `frontend/tests/components/WfListView.test.ts`

### Modified
- `frontend/src/components/workflow/WorkflowPage.vue` — remove sidebar, add list/editor view switching
- `frontend/src/types/workflow.ts` — add `lastRunStatus` to `WorkflowListItem`
- `frontend/src/stores/workflowStore.ts` — add search/filter state, clone/export actions, filteredWorkflows computed, remove selectedWorkflowId
- `frontend/src/api/workflow.ts` — add clone/export API calls
- `frontend/src/locales/zh-CN.ts` — add i18n keys
- `frontend/src/locales/en-US.ts` — add i18n keys
- `backend/src/workflow/workflow.routes.ts` — add clone/export routes
- `backend/src/workflow/workflow.service.ts` — add clone/export logic
- `backend/src/workflow/workflow.repository.ts` — update `PrismaWorkflowForList` type to include `{ status: true }` in runs select, update `findAllWorkflows` query, update `mapWorkflowListItem` to extract `lastRunStatus`, add clone/export repository functions
- `backend/src/workflow/workflow.types.ts` — add `lastRunStatus` to `WorkflowListItem` type, add `ExportedWorkflow` interface for export response
- `backend/src/errors/errorCode.ts` — add clone error code
- `backend/src/errors/types.ts` — add clone error type

### Deleted
- `frontend/src/components/workflow/WfListSidebar.vue`

### Mobile
- `frontend/src/components/workflow/WorkflowPage.vue` — mobile layout also switches between list (cards) and editor
- Existing mobile workflow components (`WfMobileCard.vue` etc.) may be reused or adapted within `WfListView.vue`
