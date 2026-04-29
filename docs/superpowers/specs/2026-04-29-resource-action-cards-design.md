# Resource Action Cards Design

## Context

CoreAgent action cards currently work well for create/edit flows, but list and delete flows still expose system-oriented details to the user:

- List cards render fetched resources as plain text summaries instead of interactive rows.
- Delete cards require object IDs that users cannot know from the chat.
- Schedule creation can require `workflowId` and cron-shaped input instead of letting the user choose a workflow and confirm a schedule in the card.
- Similar problems exist across workflows, data sources, tables, schedules, knowledge files/folders, and node templates.

The goal is to keep non-editing workflows inside the chat box while making resource selection and destructive operations user-operable.

## Design Direction

Add a unified `ResourceActionCard` layer for resource list, selection, and row actions.

Existing create/edit cards remain as they are:

- Creating and editing workflows may still navigate to the workflow editor.
- Creating and editing node templates may still navigate to the template editor.
- Existing inline forms remain responsible for form-heavy create/update flows.

Resource-oriented cards use a new presentation mode:

```ts
presentationMode: 'resource_list'
```

The backend catalog marks these cards with resource metadata:

- `resourceType`: `workflow`, `datasource`, `table`, `schedule`, `knowledge_folder`, `knowledge_file`, or `template`.
- `defaultQuery`: optional search text extracted from the user request.
- `allowedActions`: row actions available for that resource and card intent.

The frontend `ActionCard.vue` delegates `resource_list` payloads to `ResourceActionCard.vue`.

## Resource List UX

The card uses the compact list direction:

- A search input at the top.
- Up to 10 visible rows.
- Each row includes enough metadata to distinguish similarly named objects.
- High-frequency row actions appear inline.
- Dangerous row actions open a confirmation dialog before execution.
- After a successful row action, the card refreshes the list and shows the result inside the card.

List cards do not require a separate "view" click before showing results. They fetch and render on mount.

## Resource Coverage

### Workflow

Search by workflow name and optional description.

Rows show:

- Workflow name.
- Node count.
- Last run status or "never run".
- Updated time when available.

Actions:

- Edit: open workflow editor.
- Execute: run workflow.
- Delete: confirm, then delete.

### Data Source

Search by data source name and type.

Rows show:

- Data source name.
- Type.
- Table count.

Actions:

- Delete: confirm, then delete.

### Table

Search by display name, physical name, and type.

Rows show:

- Display name.
- Physical name when different.
- Type.

Actions:

- View: open table details or preview in the data page.
- Delete: confirm, then delete.

### Schedule

Search by schedule name and workflow name.

Rows show:

- Schedule name.
- Workflow name.
- Schedule expression or schedule type.
- Enabled state.

Actions:

- Edit: open the existing inline schedule form.
- Enable or disable.
- Delete: confirm, then delete.

### Knowledge Folder

Search by folder name.

Rows show:

- Folder name.
- Direct file count.
- Parent context when available.

Actions:

- Delete: confirm, then delete.

Rename and move can be added later through the same row-action model, but are not first-phase requirements.

### Knowledge File

Search by file name.

Rows show:

- File name.
- Folder name when available.
- File size or updated time when available.

Actions:

- View: preview content in the chat when feasible.
- Delete: confirm, then delete.

Move can be added later through the same row-action model, but is not a first-phase requirement.

### Template

Search by template name and node type.

Rows show:

- Template name.
- Node type.
- Updated time or creator when available.

Actions:

- Edit: open template editor.
- Delete: confirm, then delete.

## Delete Intent Handling

Delete intents no longer execute from a payload ID directly.

When the LLM asks for `workflow.delete`, `data.datasource_delete`, `data.table_delete`, `knowledge.folder_delete`, `knowledge.file_delete`, `schedule.delete`, or `template.delete`, the backend returns a resource list card for the corresponding resource type.

The payload may include a search hint:

- `query`
- `keyword`
- `name`
- resource-specific names such as `workflowName`, `datasourceName`, `tableName`, `folderName`, `fileName`, `scheduleName`, or `templateName`

The frontend uses that hint as the initial search value. The user chooses the target row and confirms deletion.

This keeps the LLM helpful without requiring it to know internal IDs.

## Schedule Creation

`schedule.create` remains an inline form card, but the form becomes user-oriented:

- The user selects a workflow from a loaded workflow list.
- The form supports schedule type controls such as once, daily, weekly, monthly, or custom cron.
- Advanced cron expression remains available but is not the only path.
- Timezone and enabled state have sensible defaults.

The LLM may pass optional defaults:

- `workflowName` or `query` to pre-filter or preselect a workflow candidate.
- `scheduleType`.
- `cronExpr`.
- `timezone`.
- `enabled`.
- `name` and `description`.

The user remains responsible for final confirmation in the card.

## Frontend Architecture

Add:

- `frontend/src/components/chat/ResourceActionCard.vue`
- `frontend/src/components/chat/actionCards/resourceAdapters.ts`
- `frontend/src/components/chat/actionCards/resourceActions.ts`
- resource-list specific tests under `frontend/tests/components/chat/`

`ResourceActionCard.vue` owns rendering and interaction state:

- `searchText`
- `loading`
- `items`
- `rowErrors`
- `lastResult`
- confirmation dialog state

Adapters own resource-specific behavior:

- Fetch resources.
- Normalize each object into a common row model.
- Filter rows by query.
- Execute row actions.

Common row model:

```ts
interface ResourceRow {
  id: string;
  title: string;
  subtitle?: string;
  meta: string[];
  raw: unknown;
}
```

Row actions:

```ts
interface ResourceRowAction {
  key: string;
  labelKey: string;
  icon?: string;
  risk: 'low' | 'medium' | 'high' | 'danger';
  confirmRequired: boolean;
}
```

No `any` types are introduced.

## Backend Catalog Changes

Extend action card types with resource-list metadata.

Cards that should become resource lists:

- `workflow.open`
- `workflow.delete`
- `data.open`
- `data.datasource_delete`
- `data.table_delete`
- `knowledge.open`
- `knowledge.folder_delete`
- `knowledge.file_delete`
- `schedule.open`
- `schedule.delete`
- `template.delete`

`data.open` renders two resource sections in one card: data sources and tables.
`knowledge.open` renders two resource sections in one card: folders and files.

## Error Handling

Card-level errors:

- Initial fetch failure.
- Authorization failure.
- Unsupported resource type.

Row-level errors:

- Delete failure.
- Execute failure.
- Enable or disable failure.

Empty states:

- No resources exist.
- Search has no matches.

The search empty state includes a clear-search action.

## Internationalization

All visible frontend text is added to `frontend/src/locales/en-US.ts` and `frontend/src/locales/zh-CN.ts`.

This includes:

- Search placeholders.
- Empty states.
- Row action labels.
- Confirmation dialog titles and messages.
- Success and failure summaries.

## Testing

Frontend tests:

- `ActionCard.vue` delegates `resource_list` payloads to `ResourceActionCard`.
- `ResourceActionCard` fetches on mount and renders up to 10 rows.
- Search filters rows and uses initial query from payload params.
- Delete action opens confirmation before calling the adapter.
- Successful row action refreshes resources and shows an in-card result.
- Failed row action shows row-level error.
- Schedule create form loads workflows and uses optional payload defaults.

Adapter tests:

- Workflow adapter maps list, edit, execute, and delete correctly.
- Data source and table adapters map list and delete correctly.
- Schedule adapter maps list, enable/disable, edit, and delete correctly.
- Knowledge and template adapters map list and delete correctly.

Backend tests:

- Catalog returns `resource_list` metadata for list/delete cards.
- Delete cards no longer require ID params.
- Query/name hints are accepted as optional params.

Verification:

- `cd frontend && pnpm run preflight`
- `cd backend && pnpm run preflight`

## Out of Scope

This design does not change:

- Workflow editor behavior.
- Node template editor behavior.
- Backend delete API semantics.
- Bridge service behavior.
- Full-text server-side search.

Search in phase one is client-side over the fetched list. Server-side search can be added later if resource counts become large.
