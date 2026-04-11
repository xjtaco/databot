# Workflow Import/Export Enhancement

## Overview

Enhance workflow batch export to produce a zip package containing multiple workflow JSON files, and add workflow import functionality supporting both single JSON files and zip packages.

## Current State

- Batch export exists but downloads individual JSON files in a loop (one browser download per workflow)
- Export format: `ExportedWorkflow` JSON using node names (not IDs) for edge references
- No import functionality exists

## Design Decisions

- **Zip handling**: front-end only (JSZip) — backend stays simple, handles single workflows
- **Zip structure**: flat directory, one `{workflow-name}.json` per workflow, no manifest
- **Single-select export**: downloads JSON directly (no zip for one file)
- **Name conflicts on import**: auto-rename with `(1)`, `(2)` incrementing suffix (server-side)
- **Import feedback**: result summary dialog listing each workflow's outcome
- **Validation**: basic structure check on frontend (name, nodes, edges exist); full business validation on backend

## Backend Changes

### New Route

`POST /workflows/import`

### Request Body

Same as `ExportedWorkflow`:

```typescript
{
  name: string;
  description: string | null;
  nodes: ExportedWorkflowNode[];
  edges: ExportedWorkflowEdge[];
}
```

### Response

Wrapped in standard response envelope (consistent with other mutation endpoints):

```typescript
{ result: ImportWorkflowResult }
```

```typescript
interface ImportWorkflowResult {
  id: string;
  name: string;
  renamed: boolean;
}
```

### New Type

Add `ImportWorkflowResult` to both:
- Backend: `backend/src/workflow/workflow.types.ts`
- Frontend: `frontend/src/types/workflow.ts`

### Implementation Layers

- **`workflow.routes.ts`** — register `POST /import` route **before** `/:id` routes (static routes must precede parameterized ones)
- **`workflow.controller.ts`** — `importWorkflowHandler`: validate request body basic structure
- **`workflow.service.ts`** — `importWorkflow`: handle name conflict detection and auto-rename, convert `ExportedWorkflow` to `SaveWorkflowInput` (node name to temp ID mapping, edge reference conversion), then call existing `saveWorkflow` service function (reuse its validation: node type check, unique names, DAG acyclicity, edge references)

### Name Conflict Resolution

Query existing workflow names from database. If the imported name conflicts, append `(1)`, `(2)`, etc., incrementing until a unique name is found.

## Frontend Changes

### Batch Export Refactor

Modify `workflowStore.ts`:

- New method `batchExportWorkflows(ids: string[])`:
  - 1 workflow selected: download single JSON file (current behavior)
  - Multiple workflows selected: call export API for each concurrently, pack results into zip using JSZip, trigger zip download as `workflows-export.zip`
- Zip internal filenames: `{sanitized-name}.json`, with `(n)` suffix for duplicates (e.g., `my-workflow(1).json`). Sanitize names by replacing characters invalid in filenames (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`) with `_`.

Modify `WfListView.vue`:
- `handleBatchExport` calls new store method

New dependency: `jszip`

### Import UI

**Toolbar layout change** in `WfListView.vue` header right section:

```
[Import Workflow] [Export Selected] [New Workflow]
```

"Import Workflow" button with Upload icon, always enabled. Triggers a hidden `<input type="file" accept=".json,.zip">`.

### File Processing Flow

1. User selects file
2. Determine type by extension:
   - `.json` — `JSON.parse`, yields single `ExportedWorkflow`
   - `.zip` — JSZip decompress, iterate `.json` files, parse each
3. Basic validation: each object must have `name`, `nodes`, `edges` fields
4. Call `POST /workflows/import` for each workflow sequentially (sequential to ensure deterministic rename ordering — if two workflows have the same name, the first gets priority)
5. Collect results (frontend tracks each `ExportedWorkflow.name` as `originalName` before sending, since the response only contains the final name), show summary dialog

### Import Result Dialog

New component `ImportResultDialog.vue` using `el-dialog` with a table:

| Workflow Name | Status |
|---|---|
| my-workflow | Success |
| data-pipeline | Success (renamed to data-pipeline(1)) |
| bad-format | Failed: missing nodes field |

On dialog close, refresh workflow list.

### API Layer

Add to `api/workflow.ts`:

```typescript
export async function importWorkflow(data: ExportedWorkflow): Promise<ImportWorkflowResult> {
  const res = await http.post<{ result: ImportWorkflowResult }>('/workflows/import', data);
  return res.result;
}
```

### Store Method

Add to `workflowStore.ts`:

- `handleImportFile(file: File): Promise<void>` — reads file (JSON or zip), parses workflows, calls API sequentially, collects results, returns for dialog display

### i18n Keys

Add to both `zh-CN.ts` and `en-US.ts` under `workflow.list`:

- `importWorkflow` — button label
- `importSuccess` — success status text
- `importRenamed` — renamed status text
- `importFailed` — failed status text
- `importResultTitle` — dialog title
- `importResultName` — table column: workflow name
- `importResultStatus` — table column: status
- `importNoValidFiles` — warning when zip contains no JSON files
- `importInvalidFormat` — error when file is not valid JSON/zip

## Error Handling

### Frontend

- File parse failure (bad JSON / corrupt zip) — `ElMessage.error` with invalid format message
- Zip contains no `.json` files — `ElMessage.warning`
- Individual workflow import API failure — record as failed, continue processing remaining workflows, show all results in summary dialog

### Backend

- Missing required fields in request body — 400, reuse existing `WorkflowValidationError` (error code E00028)
- Edge references non-existent node name — 400, reuse existing `WorkflowValidationError`
- Database write failure — 500, handled by global error middleware

### Edge Cases

- Empty zip — frontend shows "no importable content" warning
- Non-JSON files in zip — silently ignored, only `.json` files processed
- File size — no frontend limit. Note: Express default `json()` body limit is 100KB; individual workflow JSONs should stay within this. If workflows with many nodes approach this limit, the import route can set a higher limit (e.g., `express.json({ limit: '1mb' })`).

## Testing

### Backend Tests

- `importWorkflow` service:
  - Normal import: correct id, name, renamed=false
  - Name conflict: auto-rename works, renamed=true, suffix increments correctly
  - Invalid data: missing name/nodes/edges throws correct error
  - Edge references non-existent node name throws error

### Frontend Tests

- `workflowStore.batchExportWorkflows`: single yields JSON download, multiple yields zip
- `workflowStore.importWorkflows`: normal import, partial failure result collection
- File parsing utilities: JSON parse, zip decompress, basic validation, invalid file handling
