# Workflow Execution History Page

## Overview

Add a dedicated execution history view to the workflow system, accessible from the workflow list page. Users can browse past runs with filtering (status, time range) and pagination, and expand individual runs to see node-level execution details (status, duration, inputs, outputs, errors).

## Approach

Extend `WorkflowPage.vue`'s existing `activeView` state to include a `'history'` view (alongside `'list'` and `'editor'`). This keeps navigation consistent with the current pattern — no new routes needed.

## Backend API Changes

### `GET /workflows/:id/runs` — Enhanced with query parameters

No schema changes required. The existing `WorkflowRun` and `WorkflowNodeRun` models already store all needed data.

**New query parameters:**

| Parameter  | Type       | Default | Description                                    |
|------------|------------|---------|------------------------------------------------|
| `page`     | number     | 1       | Page number (1-based)                          |
| `pageSize` | number     | 20      | Items per page (max 100)                       |
| `status`   | string     | —       | Filter by any valid `RunStatusValue` (pending/running/completed/failed/cancelled/skipped) |
| `startFrom`| ISO string | —       | Filter runs started at or after this time      |
| `startTo`  | ISO string | —       | Filter runs started at or before this time     |

**Response format changes from `{ runs }` to:**

```typescript
{
  runs: WorkflowRunInfo[]
  total: number
  page: number
  pageSize: number
}
```

### Layer-by-layer changes

**Repository** (`workflow.repository.ts`):
- `findRunsByWorkflowId` accepts a filter/pagination params object
- Builds Prisma `where` clause from status + time range
- Uses `skip` / `take` for pagination
- Returns `{ runs, total }` using `findMany` + `count` in parallel

**Service** (`workflow.service.ts`):
- `listRuns` passes filter params through to repository

**Controller** (`workflow.controller.ts`):
- `listRunsHandler` parses query params from `req.query`
- Validates: page/pageSize are positive integers, status is valid enum, times are valid ISO strings
- Invalid params are silently ignored (use defaults)

### Node name resolution in run detail

The existing `WorkflowNodeRunInfo` type only has `nodeId` but no node name or type. To display human-readable node details in the expanded row, enhance `findRunById` to include the node relation:

```
include: { nodeRuns: { include: { node: { select: { name: true, type: true } } } } }
```

Add `nodeName` and `nodeType` as optional fields to `WorkflowNodeRunInfo`:

```typescript
export interface WorkflowNodeRunInfo {
  // ... existing fields ...
  nodeName?: string    // NEW — populated when node relation is included
  nodeType?: string    // NEW — populated when node relation is included
}
```

Add a separate `mapNodeRunInfoWithNode` function in the repository for `findRunById`, which maps the included node relation to `nodeName`/`nodeType`. The existing `mapNodeRunInfo` remains unchanged — callers that don't include the node relation (`createNodeRun`, `createNodeRunsBatch`, `findNodeRunsByRunId`) are unaffected.

### Backward compatibility

When no params are provided, the API returns page 1 with 20 items — identical to current behavior. The response shape adds `total`, `page`, `pageSize` fields alongside `runs`. Existing frontend callers (`listRuns` in api/workflow.ts) only read the `.runs` field and are unaffected.

## Frontend Changes

### API Layer (`api/workflow.ts`)

Keep the existing `listRuns` function unchanged for current callers. Add a new `listRunsPaginated` function for the history view:

```typescript
// Rename existing RunListResponse → ListRunsResponse and extend with pagination fields
interface ListRunsResponse {
  runs: WorkflowRunInfo[]
  total: number
  page: number
  pageSize: number
}

// Existing — unchanged behavior, returns plain array for editor/info panel callers
export async function listRuns(workflowId: string): Promise<WorkflowRunInfo[]> {
  const res = await http.get<ListRunsResponse>(`/workflows/${workflowId}/runs`);
  return res.runs;  // backend response now has extra fields, but we only read .runs
}

// New — returns full paginated response for history view
interface ListRunsParams {
  page?: number
  pageSize?: number
  status?: ExecutionStatus
  startFrom?: string
  startTo?: string
}

export async function listRunsPaginated(
  workflowId: string,
  params: ListRunsParams
): Promise<ListRunsResponse> {
  return http.get<ListRunsResponse>(`/workflows/${workflowId}/runs`, { params });
}
```

Note: The existing `RunListResponse` interface is renamed to `ListRunsResponse` for consistency. The old name `RunListResponse` is removed.

**Call sites unchanged:** `workflowStore.fetchRuns()` and `loadForEditing()` both call `listRuns()` which still returns `WorkflowRunInfo[]`. No changes needed to `WfInfoPanel.vue`.

### Store (`workflowStore.ts`)

New state (separate from editor's `runs`):

```typescript
const historyRuns = ref<WorkflowRunInfo[]>([])
const historyTotal = ref(0)
const historyPage = ref(1)
const historyPageSize = ref(20)
const historyStatusFilter = ref<ExecutionStatus | 'all'>('all')
const historyDateRange = ref<[string, string] | null>(null)
const historyLoading = ref(false)
const expandedRunDetails = reactive<Map<string, WorkflowRunDetail>>(new Map())
const expandedRunLoading = ref<string | null>(null)  // runId currently being loaded
```

Note: `expandedRunDetails` is a Map keyed by runId for caching — expanding a previously loaded run does not re-fetch. Cleared on `resetHistoryState()`.

New actions:

- `fetchHistoryRuns(workflowId)` — loads run list with current filter/page state via `listRunsPaginated`
- `fetchRunDetailForHistory(workflowId, runId)` — loads node-level detail, caches in `expandedRunDetails` Map, skips fetch if already cached
- `resetHistoryState()` — clears all history state (including the expandedRunDetails Map) when leaving the view

### WorkflowPage.vue

- `activeView` type: `'list' | 'editor' | 'history'`
- New `historyWorkflowId` ref to track which workflow's history is being viewed
- Handles `@history` event from WfListView: sets `historyWorkflowId`, switches to `'history'` view
- Renders `<WfRunHistoryView>` when `activeView === 'history'`
- Back from history returns to `'list'`

### WfListView.vue

- Desktop table: add History icon button (lucide `History` icon) in the actions column
- Mobile cards: add History button in the action area
- Emits `history(workflowId)` event on click

### New Component: `WfRunHistoryView.vue`

**Props:**
- `workflowId: string`
- `workflowName: string` — passed from WorkflowPage (reads from `store.workflows` list), displayed in the header

**Desktop layout:**

```
┌─────────────────────────────────────────────────┐
│ Header: ← Back  |  Workflow Name — Exec History │
├─────────────────────────────────────────────────┤
│ Filters: [Status Select] [Date Range Picker]    │
├─────────────────────────────────────────────────┤
│ el-table with expandable rows                   │
│ ┌─────────────────────────────────────────────┐ │
│ │ ▶ ●completed  2026-03-30 14:30   5s        │ │
│ │ ▶ ●failed     2026-03-29 10:00   3s        │ │
│ │ ▼ ●completed  2026-03-28 09:00   8s        │ │
│ │   ┌─ Node Details ─────────────────────┐   │ │
│ │   │ sql_query  ●completed  2.1s        │   │ │
│ │   │   Inputs: { ... }                  │   │ │
│ │   │   Outputs: { ... }                 │   │ │
│ │   │ python_1   ●completed  1.5s        │   │ │
│ │   │   Inputs: { ... }                  │   │ │
│ │   │   Outputs: { ... }                 │   │ │
│ │   └────────────────────────────────────┘   │ │
│ └─────────────────────────────────────────────┘ │
│ el-pagination                                   │
└─────────────────────────────────────────────────┘
```

**Mobile layout:**

```
┌─────────────────────────────────┐
│ ← Back    执行历史               │
├─────────────────────────────────┤
│ [Status Select  ▼]             │
│ [Date Range Picker        ▼]   │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ ●completed   2026-03-30     │ │
│ │ 14:30:00     耗时 5s        │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ●failed      2026-03-29     │ │
│ │ 10:00:00     耗时 3s        │ │
│ │ Error: timeout exceeded     │ │
│ │  ─ ─ ─ tap to expand ─ ─ ─ │ │
│ │ sql_query  ●completed  2.1s │ │
│ │   Inputs: { ... }           │ │
│ │   Outputs: { ... }          │ │
│ │ python_1   ●failed     0.9s │ │
│ │   Error: script failed      │ │
│ └─────────────────────────────┘ │
│                                 │
│ el-pagination (small mode)      │
└─────────────────────────────────┘
```

- Filters stacked vertically, full width
- Each run is a card showing status badge, timestamp, duration, error (if failed)
- Tap card to toggle inline expansion showing node details
- Node details render as a list within the card
- Pagination uses `small` mode to fit mobile width

**Columns (desktop table):**

| Column       | Content                                              |
|-------------|------------------------------------------------------|
| Expand      | Arrow toggle for row expansion                       |
| Status      | Status badge (reuse existing color scheme)           |
| Started At  | Formatted timestamp                                  |
| Duration    | Computed from startedAt/completedAt (Xs / Xm Xs / Xh Xm) |
| Error       | Error message (shown only for failed runs, truncated)|

**Row expansion (node details):**
- On expand: calls `fetchRunDetailForHistory(workflowId, runId)` to load node runs
- Displays each node as a row: name, status badge, duration
- Below each node: collapsible inputs/outputs as formatted JSON (`<pre>` with `JSON.stringify(data, null, 2)`)
- Error message shown in red for failed nodes

**Loading and error states:**
- **List loading**: `v-loading` directive on the table/card area while `historyLoading` is true
- **Expand loading**: Show `el-skeleton` or spinner in the expanded area while `expandedRunLoading` matches the run ID
- **API error**: Show inline error message with a retry button (follow WfListView's existing error state pattern)
- **Empty state**: `el-empty` with `workflow.history.noRuns` message when runs array is empty and not loading

**Interactions:**
- Filter/page change → watch triggers `fetchHistoryRuns`
- Expand row → check `expandedRunDetails` Map; if cached, show immediately; otherwise fetch with loading indicator
- Back button → emits `back` event → WorkflowPage returns to list

**Sort order:** Runs are always sorted by `startedAt` descending (most recent first), consistent with the existing backend query.

**Duration formatting:** Extract the existing `formatDuration` from `WfInfoPanel.vue` into a shared utility at `frontend/src/utils/time.ts`. The extracted function signature should handle nullable `endIso` (returns `'--'` when null): `formatDuration(startIso: string, endIso: string | null): string`. Import in both `WfInfoPanel.vue` and `WfRunHistoryView.vue`.

**Date range format:** `el-date-picker` with `value-format="YYYY-MM-DD"` outputs date strings. The frontend sends `startFrom` as `"YYYY-MM-DD"` and `startTo` as `"YYYY-MM-DD"`. The backend converts `startFrom` to start of day (`new Date(startFrom)` → `gte`) and `startTo` to end of day by appending `T23:59:59.999Z` or adding 1 day (`new Date(startTo + 'T23:59:59.999')` → `lte`) to ensure runs on the end date are included.

## UI Components (Element Plus)

| Purpose         | Component                         |
|----------------|-----------------------------------|
| Run list        | `el-table` with expand rows       |
| Status filter   | `el-select`                       |
| Date range      | `el-date-picker` type="daterange" |
| Pagination      | `el-pagination`                   |
| Status badges   | Reuse existing status badge styles |
| Empty state     | `el-empty`                        |
| Node I/O display| `<pre>` + JSON.stringify           |

## i18n

New keys under `workflow.history` namespace in both `zh-CN.ts` and `en-US.ts`:

```
workflow.history.title          — "执行历史" / "Execution History"
workflow.history.back           — "返回" / "Back"
workflow.history.status         — "状态" / "Status"
workflow.history.startedAt      — "开始时间" / "Started At"
workflow.history.duration       — "耗时" / "Duration"
workflow.history.errorMessage   — "错误信息" / "Error Message"
workflow.history.nodeDetails    — "节点详情" / "Node Details"
workflow.history.inputs         — "输入" / "Inputs"
workflow.history.outputs        — "输出" / "Outputs"
workflow.history.noRuns         — "暂无执行记录" / "No execution records"
workflow.history.dateRange      — "时间范围" / "Date Range"
workflow.history.filterAll      — "全部状态" / "All Statuses"
```

## Testing

### Backend (`backend/tests/`)

1. **Repository tests** — `findRunsByWorkflowId` with filter params:
   - Pagination correctness (skip/take, total count)
   - Status filter
   - Time range filter
   - Combined filters

2. **Controller tests** — `listRunsHandler` query param parsing:
   - Default values (page=1, pageSize=20)
   - Invalid params ignored (negative numbers, non-numeric, invalid status)
   - Paginated response structure

### Frontend (`frontend/tests/`)

1. **Store tests** — `fetchHistoryRuns`:
   - Correct API params from store state
   - Results written to historyRuns/historyTotal
   - `resetHistoryState` clears all state

2. **Component tests** — `WfRunHistoryView.vue`:
   - Renders run list
   - Expand row shows node details
   - Filter change triggers reload
   - Empty state display
   - Back button emits event

3. **WfListView test** — History button click emits `history` event

## Files Changed

| File | Change |
|------|--------|
| `backend/src/workflow/workflow.repository.ts` | `findRunsByWorkflowId` add filter/pagination; `findRunById` include node name/type |
| `backend/src/workflow/workflow.service.ts` | `listRuns` pass filter params |
| `backend/src/workflow/workflow.controller.ts` | `listRunsHandler` parse query params, clamp pageSize to 100 |
| `backend/src/workflow/workflow.types.ts` | Add `ListRunsParams`, `ListRunsResponse`; add `nodeName`/`nodeType` to `WorkflowNodeRunInfo` |
| `frontend/src/api/workflow.ts` | Add `listRunsPaginated` function (existing `listRuns` unchanged) |
| `frontend/src/types/workflow.ts` | Add `ListRunsParams`, `ListRunsResponse`; add `nodeName`/`nodeType` to `WorkflowNodeRunInfo` |
| `frontend/src/stores/workflowStore.ts` | Add history state and actions |
| `frontend/src/utils/time.ts` | **New** — extract `formatDuration` from `WfInfoPanel.vue` |
| `frontend/src/components/workflow/WfInfoPanel.vue` | Import `formatDuration` from utils/time instead of local function |
| `frontend/src/components/workflow/WorkflowPage.vue` | Add `'history'` view |
| `frontend/src/components/workflow/WfListView.vue` | Add history button |
| `frontend/src/components/workflow/WfRunHistoryView.vue` | **New** — history page component |
| `frontend/src/locales/zh-CN.ts` | Add `workflow.history.*` keys |
| `frontend/src/locales/en-US.ts` | Add `workflow.history.*` keys |
| `backend/tests/workflow/...` | Repository + controller tests |
| `frontend/tests/workflow/...` | Store + component tests |
