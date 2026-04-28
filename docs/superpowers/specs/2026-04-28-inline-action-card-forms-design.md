# Inline Action Card Forms Design

## Summary

Extend the action card system to support inline form editing within chat messages, covering two parts:
- **Part A**: Fix workflow/template action card navigation to editor with copilot prompt pre-fill
- **Part B**: Implement inline form cards for data source management, file upload, knowledge base management, and scheduled tasks

## Part A: Workflow/Template Creation Navigation Fix

### Problem

`WorkflowPage.vue` does not consume `navigationStore.pendingIntent` on mount. When the `workflow.copilot_create` or `template.copilot_create` handler navigates to the workflow page, the user lands on the list view instead of the editor.

### Solution

1. `WorkflowPage.vue` `onMounted`: check `navigationStore.pendingIntent`
   - `open_workflow_editor` → `store.loadForEditing(workflowId)` → `copilotStore.connect(workflowId)` → `activeView = 'editor'` → if `copilotPrompt`, wait for connection then `copilotStore.sendMessage(copilotPrompt)`
   - `open_template_editor` → similar flow using `debugCopilotStore`
   - Clear `pendingIntent` after consumption

2. Existing handlers in `handlers.ts` remain unchanged — they already wait for copilot connection and send the prompt. `pendingIntent` serves as the UI-side fallback to ensure the correct view opens.

3. User's workflow description is passed via `copilotPrompt` and sent directly through `copilotStore.sendMessage()`, not pre-filled into the input box.

### Files Changed

- `frontend/src/components/workflow/WorkflowPage.vue` — add pending intent consumption in onMounted
- `frontend/src/components/chat/actionCards/handlers.ts` — no changes needed (already correct)

## Part B: Inline Form Cards

### Approach: Extend ActionCard

Add an `editing` status to the card lifecycle. When the user clicks confirm on a form-type card, the card expands to show an inline form instead of executing immediately.

### Card Status Flow

```
proposed → (user clicks confirm) → editing → (user submits) → running → succeeded / failed
                                   ↘ (user cancels) → cancelled
```

For workflow/template creation (no form needed), keep the existing flow: `proposed → running → succeeded`.

### Handler Architecture Change

Current handler signature (synchronous result):
```ts
type ActionHandler = (payload: UiActionCardPayload) => Promise<{ success: boolean; summary?: string; error?: string }>;
```

New handler signature (streaming status updates):
```ts
interface ActionCallbacks {
  setStatus: (status: CardStatus) => void;
  setResult: (result: string) => void;
  setError: (error: string) => void;
}

type ActionHandler = (payload: UiActionCardPayload, callbacks: ActionCallbacks) => Promise<void>;
```

### Inline Form Components

Located at `frontend/src/components/chat/actionCards/forms/`:

| Component | Action Cards | Description |
|-----------|-------------|-------------|
| `InlineDataCreateForm.vue` | `data.datasource_create` | Database connection form (db type, host, port, database, user, password, schema) with test connection button |
| `InlineDataTestForm.vue` | `data.datasource_test` | Read-only connection info + test connection button |
| `InlineDataDeleteForm.vue` | `data.datasource_delete` | Data source name display + danger confirm delete |
| `InlineFileUploadForm.vue` | `data.file_upload` | Drag-and-drop file zone, auto-detect CSV/Excel vs SQLite, upload progress |
| `InlineKnowledgeFolderForm.vue` | `knowledge.folder_create`, `folder_rename`, `folder_move`, `folder_delete` | Folder name input, parent folder selector (create); current name editable (rename); target folder selector (move); confirm delete |
| `InlineKnowledgeFileForm.vue` | `knowledge.file_upload`, `knowledge.file_move`, `knowledge.file_delete` | Folder selector + file drop zone (.md/.markdown) for upload; target selector for move; confirm delete |
| `InlineScheduleForm.vue` | `schedule.create`, `schedule.update`, `schedule.delete` | Name, workflow select, schedule type (daily/weekly/monthly/cron), time picker, parameter overrides; confirm delete |

### Form Behavior

- **LLM pre-fill**: Forms receive `payload.params` as initial values extracted from user conversation
- **Form state**: Each form manages its own state and validation
- **Events**: `submit(formData)`, `cancel()` emitted to ActionCard
- **Loading**: Forms support loading state (e.g., testing connection)
- **Result**: On success, emit `success(summary)`; on error, emit `error(message)`
- **Mobile**: Forms auto-stack to single column on small screens, buttons go full-width

### ActionCard.vue Changes

Add `editing` status rendering branch. Based on `payload.domain + payload.action`, render the corresponding form component from a lookup map:

```ts
const formComponentMap: Record<string, Component> = {
  'data:datasource_create': InlineDataCreateForm,
  'data:datasource_test': InlineDataTestForm,
  'data:datasource_delete': InlineDataDeleteForm,
  'data:file_upload': InlineFileUploadForm,
  'knowledge:folder_create': InlineKnowledgeFolderForm,
  'knowledge:folder_rename': InlineKnowledgeFolderForm,
  'knowledge:folder_move': InlineKnowledgeFolderForm,
  'knowledge:folder_delete': InlineKnowledgeFolderForm,
  'knowledge:file_upload': InlineKnowledgeFileForm,
  'knowledge:file_move': InlineKnowledgeFileForm,
  'knowledge:file_delete': InlineKnowledgeFileForm,
  'schedule:create': InlineScheduleForm,
  'schedule:update': InlineScheduleForm,
  'schedule:delete': InlineScheduleForm,
};
```

Cards with `confirmRequired: false` (workflow/template create) skip the editing state and execute immediately.

### Backend Changes

**New action card definitions** in `uiActionCardCatalog.ts`:
- `data.file_upload` — file upload card (CSV/Excel/SQLite)
- `knowledge.file_upload` — knowledge file upload card (.md/.markdown)

**Existing stub handlers** replaced with full implementations using the new form-based flow.

**LLM prompt**: The core agent prompt already instructs the LLM to use action cards. The LLM will extract connection details, file names, schedule parameters etc. from conversation and include them in `params`.

### Data Source Create Form Details

Reuse form logic from `DatabaseConnectionDialog.vue` but render inline:
- Database type selector (17 types supported)
- Dynamic fields based on type (host, port, database, user, password, schema)
- Special fields for Oracle (SID/Service Name), SAP HANA (instance number), Trino/PrestoDB (catalog), Spark/Hive2 (transport)
- Auto-fill default port on type change
- "Test Connection" button before "Create" submit
- LLM pre-fills from conversation (e.g., "connect to MySQL at 192.168.1.100 port 3306")

### File Upload Form Details

- Drag-and-drop zone + file chooser button
- Accept: `.csv`, `.xls`, `.xlsx`, `.db`, `.sqlite`, `.sqlite3`
- Auto-detect type: CSV/Excel → `datafileStore.uploadFile()`, SQLite → `datafileStore.uploadSqliteFile()`
- File list with name and size, removable
- Upload progress bar
- Max file size validation

### Schedule Form Details

Reuse core logic from `ScheduleForm.vue`:
- Name, description fields
- Workflow selector (dropdown)
- Schedule type: daily / weekly / monthly / cron
- Time picker, timezone selector
- Weekday/monthday selectors based on type
- Cron expression input with preview
- Parameter overrides (extracted from workflow node `{{params.X}}` patterns)
- Create mode vs update mode

### Mobile Adaptation

- Forms use CSS media queries at Element Plus breakpoints
- Fields stack vertically on screens < 768px
- Buttons become full-width
- File upload zone adapts to smaller touch targets

## Error Handling

- Form validation errors shown inline (below each field)
- API errors shown as toast + card error state
- Network errors: retry button in card error state
- Test connection failure: inline error message, form stays editable

## i18n

All form labels, placeholders, button text, and error messages must use i18n keys from `frontend/src/locales`.
