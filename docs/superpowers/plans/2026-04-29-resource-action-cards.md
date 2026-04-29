# Resource Action Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace passive/list-only and id-required non-edit action cards with in-chat resource list cards that load up to 10 matching resources, show row-level actions, confirm destructive actions, and keep list/search/delete flows inside the chat box. Creation and edit forms remain as existing inline forms or intentional editor navigation.

**Architecture:** Add a `resource_list` presentation mode and resource metadata to backend/frontend action card payloads. Route those cards through a new `ResourceActionCard.vue` that uses a typed adapter registry to fetch/search resources and execute row actions. Keep old `in_chat` handlers as backward compatibility, but move current list/delete card definitions to `resource_list`. Extend schedule creation so LLM-extracted defaults prefill the existing inline schedule form.

**Tech Stack:** Vue 3 + TypeScript, Element Plus, Pinia stores, Vitest, Express TypeScript catalog tests

---

### Task 1: Add Resource List Metadata Types

**Files:**
- Modify: `backend/src/infrastructure/tools/uiActionCardTypes.ts`
- Modify: `frontend/src/types/actionCard.ts`
- Test: `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts`
- Test: `frontend/tests/stores/chatStore-action-cards.test.ts`

- [ ] **Step 1: Extend shared action card unions**

In both type files, add `resource_list` to the presentation mode union and add typed resource list metadata. Keep the frontend and backend shapes aligned.

```ts
export type ResourceActionCardType =
  | 'workflow'
  | 'datasource'
  | 'table'
  | 'schedule'
  | 'knowledge_folder'
  | 'knowledge_file'
  | 'template';

export type ResourceActionKey =
  | 'view'
  | 'edit'
  | 'execute'
  | 'delete'
  | 'enable'
  | 'disable';

export interface ResourceActionSpec {
  key: ResourceActionKey;
  riskLevel?: RiskLevel;
  confirmationMode?: ActionCardConfirmationMode;
}

export interface ResourceSectionSpec {
  resourceType: ResourceActionCardType;
  titleKey: string;
  emptyKey: string;
  allowedActions: ResourceActionSpec[];
  defaultQuery?: string;
}
```

Add optional metadata fields to `UiActionCardDefinition` and `UiActionCardPayload`:

```ts
resourceType?: ResourceActionCardType;
resourceSections?: ResourceSectionSpec[];
defaultQuery?: string;
allowedActions?: ResourceActionSpec[];
```

- [ ] **Step 2: Preserve metadata in card payload creation**

In `backend/src/infrastructure/tools/showUiActionCardTool.ts`, copy `resourceType`, `resourceSections`, `defaultQuery`, and `allowedActions` from the catalog definition into `cardPayload`.

- [ ] **Step 3: Add backend payload regression coverage**

Update `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts` to assert that a resource list card, using `workflow.open`, returns:

```ts
expect(cardPayload.presentationMode).toBe('resource_list');
expect(cardPayload.resourceType).toBe('workflow');
expect(cardPayload.allowedActions?.map((item) => item.key)).toEqual(['edit', 'execute', 'delete']);
```

Update `frontend/tests/stores/chatStore-action-cards.test.ts` so a persisted card carrying `resource_list` metadata round-trips without losing those fields.

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd backend && pnpm vitest run tests/infrastructure/tools/showUiActionCardTool.test.ts
cd frontend && pnpm vitest run tests/stores/chatStore-action-cards.test.ts
```

Expected: both commands PASS.

---

### Task 2: Convert List/Delete Catalog Entries To Resource Lists

**Files:**
- Modify: `backend/src/infrastructure/tools/uiActionCardCatalog.ts`
- Test: `backend/tests/infrastructure/tools/uiActionCardCatalog.test.ts`
- Test: `backend/tests/infrastructure/tools/searchUiActionCardTool.test.ts`

- [ ] **Step 1: Update non-edit list cards**

Change these cards from `in_chat` to `resource_list`, with no page-jumping action required:

```ts
'workflow.open': {
  presentationMode: 'resource_list',
  resourceType: 'workflow',
  allowedActions: [
    { key: 'edit' },
    { key: 'execute' },
    { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
  ],
}

'data.open': {
  presentationMode: 'resource_list',
  resourceSections: [
    {
      resourceType: 'datasource',
      titleKey: 'chat.actionCards.resource.datasource.sectionTitle',
      emptyKey: 'chat.actionCards.resource.datasource.empty',
      allowedActions: [{ key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
    },
    {
      resourceType: 'table',
      titleKey: 'chat.actionCards.resource.table.sectionTitle',
      emptyKey: 'chat.actionCards.resource.table.empty',
      allowedActions: [
        { key: 'view' },
        { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
      ],
    },
  ],
}
```

Apply the same pattern to `knowledge.open`, `schedule.open`, and `template.open` if present. Keep create and edit cards as `inline_form` or `deferred_navigation`.

- [ ] **Step 2: Convert delete cards away from id-required forms**

For these delete cards, remove the hard required ID requirement and make them `resource_list` with a delete-only action:

```ts
workflow.delete
data.datasource_delete
data.table_delete
knowledge.folder_delete
knowledge.file_delete
schedule.delete
template.delete
```

Use `defaultQuery` from likely LLM parameters (`name`, `keyword`, `query`, `title`) in `showUiActionCardTool.ts` when present so "删除名字包含 X 的工作流" immediately filters the list.

- [ ] **Step 3: Allow schedule.create defaults**

Keep `schedule.create` as `inline_form`, but add optional params:

```ts
workflowName, workflowQuery, scheduleType, cronExpr, time, timezone, enabled, name, description
```

Do not make `workflowId` or `cronExpr` required. The form will let the user choose a workflow and configure time.

- [ ] **Step 4: Update catalog tests**

Update existing expectations that currently assert `data.open` or `workflow.open` is `in_chat` to expect `resource_list`. Add tests that delete cards have `confirmationMode: 'modal'` and `allowedActions: [{ key: 'delete', ... }]`.

- [ ] **Step 5: Run catalog tests**

Run:

```bash
cd backend && pnpm vitest run tests/infrastructure/tools/uiActionCardCatalog.test.ts tests/infrastructure/tools/searchUiActionCardTool.test.ts
```

Expected: all tests PASS.

---

### Task 3: Add Resource Adapter Registry

**Files:**
- Add: `frontend/src/components/chat/actionCards/resourceAdapters.ts`
- Modify if needed: `frontend/src/components/chat/actionCards/handlers.ts`
- Test: `frontend/tests/components/chat/resourceAdapters.test.ts`

- [ ] **Step 1: Define typed row and adapter contracts**

Create `resourceAdapters.ts` with no `any` types:

```ts
export interface ResourceRowMeta {
  label: string;
  value: string;
}

export interface ResourceRowAction {
  key: ResourceActionKey;
  labelKey: string;
  icon: 'Edit' | 'VideoPlay' | 'Delete' | 'View' | 'TurnOff' | 'Open';
  riskLevel?: RiskLevel;
  confirmationMode?: ConfirmationMode;
}

export interface ResourceRow {
  id: string;
  title: string;
  subtitle?: string;
  meta: ResourceRowMeta[];
  statusLabel?: string;
  actions: ResourceRowAction[];
  rawType: ResourceActionCardType;
}

export interface ResourceFetchContext {
  query: string;
  limit: number;
  allowedActions: ResourceActionSpec[];
}

export interface ResourceActionResult {
  summaryKey: string;
  summaryParams?: Record<string, string | number>;
  refresh?: boolean;
}

export interface ResourceAdapter {
  fetchRows: (context: ResourceFetchContext) => Promise<ResourceRow[]>;
  executeAction: (row: ResourceRow, actionKey: ResourceActionKey) => Promise<ResourceActionResult>;
}
```

- [ ] **Step 2: Implement workflow adapter**

Use `useWorkflowStore().fetchWorkflows()` to load rows and `workflowApi.startWorkflow(row.id)` for execute. Delete uses `useWorkflowStore().deleteWorkflow(row.id)`. Edit uses the existing navigation pending intent to open workflow editor and is allowed because editing workflows is one of the explicit exceptions.

Rows show name, description, status, node count, and updated time when available. Search checks name and description, case-insensitive, then returns the first 10 rows.

- [ ] **Step 3: Implement datasource and table adapters**

Use existing data store/API methods already used by `handlers.ts` for listing and deletion. Datasource rows show name/type/table count. Table rows show display name, physical name, and type. Table `view` may navigate to the data tab because viewing table contents is an explicit user inspection action; delete stays in chat with confirmation and refresh.

- [ ] **Step 4: Implement schedule adapter**

Use `useScheduleStore().fetchSchedules()`, `deleteSchedule`, and the existing enable/disable update path. Rows show schedule name, workflow name, cron/friendly schedule, enabled status, and timezone. `edit` returns an inline edit request for `InlineScheduleForm` instead of navigating away.

- [ ] **Step 5: Implement knowledge and template adapters**

Use the same store/API calls currently used by `handlers.ts` for knowledge folders/files and template deletion. Template `edit` may navigate to the workflow/template editor because template editing is one of the explicit exceptions.

- [ ] **Step 6: Add adapter unit tests**

Mock the relevant stores/APIs and cover:

- workflow query filters by name and description and limits to 10 rows
- workflow execute calls `startWorkflow(id)`
- datasource/table delete calls the expected delete method
- schedule delete/enable/disable call the schedule store and request refresh
- adapters never expose internal IDs as primary labels

- [ ] **Step 7: Run adapter tests**

Run:

```bash
cd frontend && pnpm vitest run tests/components/chat/resourceAdapters.test.ts
```

Expected: all tests PASS.

---

### Task 4: Build `ResourceActionCard.vue`

**Files:**
- Add: `frontend/src/components/chat/actionCards/ResourceActionCard.vue`
- Modify: `frontend/src/components/chat/ActionCard.vue`
- Test: `frontend/tests/components/chat/ResourceActionCard.test.ts`
- Test: `frontend/tests/components/chat/ActionCard.test.ts`

- [ ] **Step 1: Add the compact resource list component**

Create a component that accepts the existing action card payload and renders:

- a search input initialized from `payload.defaultQuery` or `payload.params.query/name/keyword`
- one or more sections based on `payload.resourceSections` or `payload.resourceType`
- up to 10 rows per section
- row title, subtitle, compact metadata, and icon buttons for configured actions
- loading, empty, error, row action running, and result states

Use Element Plus inputs/buttons/dialog and lucide/Element icons already available in the repo. All visible strings must come from `frontend/src/locales`.

- [ ] **Step 2: Confirm destructive row actions**

For actions with `confirmationMode: 'modal'` or `riskLevel: 'danger'`, show an in-card confirmation dialog with row title and action label. Only execute after confirmation.

- [ ] **Step 3: Support inline schedule edit inside the card**

When the schedule adapter returns an edit request, render `InlineScheduleForm` within the resource card using a synthetic payload:

```ts
{
  ...payload,
  cardId: 'schedule.update',
  domain: 'schedule',
  action: 'update',
  presentationMode: 'inline_form',
  params: { scheduleId: row.id },
}
```

After successful update, close the embedded form and refresh the section.

- [ ] **Step 4: Wire `ActionCard.vue` to `resource_list`**

In `ActionCard.vue`, branch before normal action buttons:

```vue
<ResourceActionCard
  v-if="payload.presentationMode === 'resource_list'"
  :payload="payload"
  @status-change="handleInlineSubmit"
/>
```

Do not auto-run `executeAction` for `resource_list`. The card loads rows itself on mount.

- [ ] **Step 5: Add component tests**

Cover:

- card loads rows immediately; user does not click "view" first
- search filters and reloads rows
- delete action opens confirmation dialog and refreshes rows after success
- workflow execute calls adapter and shows result inside the card
- `ActionCard.vue` delegates `resource_list` payloads to `ResourceActionCard`

- [ ] **Step 6: Run focused component tests**

Run:

```bash
cd frontend && pnpm vitest run tests/components/chat/ResourceActionCard.test.ts tests/components/chat/ActionCard.test.ts
```

Expected: all tests PASS.

---

### Task 5: Prefill Schedule Create Cards

**Files:**
- Modify: `frontend/src/components/chat/actionCards/forms/InlineScheduleForm.vue`
- Modify: `frontend/src/components/schedule/ScheduleForm.vue`
- Test: `frontend/tests/components/chat/InlineScheduleForm.test.ts`
- Test: `frontend/tests/components/schedule/ScheduleForm.test.ts`

- [ ] **Step 1: Add initial defaults prop to `ScheduleForm.vue`**

Add a typed `initial` prop:

```ts
export interface ScheduleFormInitialValues {
  name?: string;
  description?: string;
  workflowName?: string;
  workflowQuery?: string;
  scheduleType?: ScheduleType;
  cronExpr?: string;
  time?: string;
  timezone?: string;
  enabled?: boolean;
}
```

When `editing` is null, apply `initial` values. If `workflowName` or `workflowQuery` is present, after workflows load, select the first workflow whose name includes that value. Preserve manual user changes after the first initialization.

- [ ] **Step 2: Pass action card params from `InlineScheduleForm.vue`**

Build `initial` from `payload.params` with type guards; never cast to `any`. Pass it into `ScheduleForm`.

- [ ] **Step 3: Include enabled in submit input**

If `initial.enabled` is present, carry it through `getSubmitInput()` instead of always returning `enabled: true`.

- [ ] **Step 4: Add tests**

Cover:

- schedule create preselects workflow by `workflowName`
- cron schedule type and expression are prefilled
- daily schedule with `time` and `timezone` is prefilled
- create still works when no defaults are provided

- [ ] **Step 5: Run focused schedule form tests**

Run:

```bash
cd frontend && pnpm vitest run tests/components/chat/InlineScheduleForm.test.ts tests/components/schedule/ScheduleForm.test.ts
```

Expected: all tests PASS.

---

### Task 6: Add I18n Keys And Polish Responsive Styles

**Files:**
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`
- Modify: `frontend/src/components/chat/actionCards/ResourceActionCard.vue`
- Test: `frontend/tests/components/chat/ResourceActionCard.test.ts`

- [ ] **Step 1: Add resource card locale keys**

Add keys under `chat.actionCards.resource` for:

- `searchPlaceholder`
- `refresh`
- `loading`
- `empty`
- `confirmTitle`
- `confirmDelete`
- `confirmAction`
- `action.edit`, `action.execute`, `action.delete`, `action.view`, `action.enable`, `action.disable`
- section titles and empty text for workflow, datasource, table, schedule, knowledge folder, knowledge file, template
- success summaries for execute/delete/enable/disable

- [ ] **Step 2: Mobile layout pass**

In `ResourceActionCard.vue`, make row action buttons wrap below metadata on narrow widths. Keep fixed icon button dimensions so rows do not jump when loading states change.

- [ ] **Step 3: Run locale/type tests**

Run:

```bash
cd frontend && pnpm vitest run tests/components/chat/ResourceActionCard.test.ts
cd frontend && pnpm vue-tsc --noEmit
```

Expected: tests and type check PASS.

---

### Task 7: Update Legacy Handler Tests And Backward Compatibility

**Files:**
- Modify: `frontend/src/components/chat/actionCards/handlers.ts`
- Modify: `frontend/tests/components/chat/actionCardHandlers.test.ts`
- Modify: `frontend/tests/composables/useChat-action-cards.test.ts`

- [ ] **Step 1: Keep old handlers but stop depending on them for new cards**

Leave existing `workflow.open`, `data.open`, `knowledge.open`, `schedule.open`, and `template.open` handlers registered so persisted older `in_chat` cards still work. Update comments/tests to make clear current catalog cards use `resource_list`.

- [ ] **Step 2: Remove id-required expectations for delete cards**

Tests should assert that new delete card payloads are resource lists and that row-level deletion is handled by `ResourceActionCard`, not by asking the user for an ID in chat.

- [ ] **Step 3: Run action card test group**

Run:

```bash
cd frontend && pnpm vitest run tests/components/chat/actionCardHandlers.test.ts tests/composables/useChat-action-cards.test.ts tests/components/chat/actionCardRegistry.test.ts
```

Expected: all tests PASS.

---

### Task 8: Full Verification And Commit

**Files:**
- Verify all modified files

- [ ] **Step 1: Run frontend preflight**

Run:

```bash
cd frontend && pnpm run preflight
```

Expected: ESLint, Stylelint, TypeScript, Prettier, tests, and build all PASS.

- [ ] **Step 2: Run backend preflight**

Run:

```bash
cd backend && pnpm run preflight
```

Expected: ESLint, TypeScript, Prettier, tests, and build all PASS. The prior backend test optimization should keep this near the current roughly 24 second runtime.

- [ ] **Step 3: Inspect git diff**

Run:

```bash
git status --short
git diff -- frontend backend docs/superpowers/plans/2026-04-29-resource-action-cards.md
```

Confirm no generated/unrelated files are staged and no `any` types were introduced.

- [ ] **Step 4: Commit**

Run:

```bash
git add backend/src/infrastructure/tools/uiActionCardTypes.ts \
  backend/src/infrastructure/tools/showUiActionCardTool.ts \
  backend/src/infrastructure/tools/uiActionCardCatalog.ts \
  backend/tests/infrastructure/tools/showUiActionCardTool.test.ts \
  backend/tests/infrastructure/tools/uiActionCardCatalog.test.ts \
  backend/tests/infrastructure/tools/searchUiActionCardTool.test.ts \
  frontend/src/types/actionCard.ts \
  frontend/src/components/chat/ActionCard.vue \
  frontend/src/components/chat/actionCards/ResourceActionCard.vue \
  frontend/src/components/chat/actionCards/resourceAdapters.ts \
  frontend/src/components/chat/actionCards/forms/InlineScheduleForm.vue \
  frontend/src/components/schedule/ScheduleForm.vue \
  frontend/src/components/chat/actionCards/handlers.ts \
  frontend/src/locales/zh-CN.ts \
  frontend/src/locales/en-US.ts \
  frontend/tests/components/chat/ResourceActionCard.test.ts \
  frontend/tests/components/chat/ActionCard.test.ts \
  frontend/tests/components/chat/resourceAdapters.test.ts \
  frontend/tests/components/chat/InlineScheduleForm.test.ts \
  frontend/tests/components/schedule/ScheduleForm.test.ts \
  frontend/tests/components/chat/actionCardHandlers.test.ts \
  frontend/tests/composables/useChat-action-cards.test.ts \
  frontend/tests/components/chat/actionCardRegistry.test.ts \
  frontend/tests/stores/chatStore-action-cards.test.ts \
  docs/superpowers/plans/2026-04-29-resource-action-cards.md
git commit -m "Improve resource action cards"
```

Expected: commit succeeds. Do not push unless the user asks.
