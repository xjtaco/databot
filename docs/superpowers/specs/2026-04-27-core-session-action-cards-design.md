# CoreSession Action Cards Design

## Goal

Extend CoreSession from a report-focused chat agent into an operation-aware assistant. Users can ask the main chat to prepare system actions for data management, knowledge base management, schedule management, workflow creation, and custom node template creation. The chat displays operation cards, asks the user to confirm, then either executes existing frontend APIs or navigates to the correct Copilot workspace.

The first version uses frontend execution. CoreSession proposes structured cards; the browser owns confirmation, existing API calls, navigation, and result feedback.

## Scope

Included:

- Data management operation cards.
- Knowledge base operation cards.
- Schedule operation cards.
- Workflow Copilot creation cards.
- Custom node template Copilot creation cards.
- Structured CoreAgent tools for action card discovery and display.
- Chat card rendering, confirmation, execution state, and history restore.
- Desktop and mobile navigation integration.

Excluded from the first version:

- Backend execution of confirmed operation cards.
- Arbitrary URL/API execution from model output.
- File upload through a chat card. Upload cards only navigate to the relevant page.
- User management, system settings, and audit log operations.

## Design Decisions

### Execution Boundary

The selected approach is catalog-backed structured tool output with frontend execution.

CoreSession adds two tools:

- `search_ui_action_card`: searches the backend UI action card catalog and returns a small set of relevant card definitions.
- `show_ui_action_card`: takes a catalog `cardId` plus optional filled parameters and emits a validated card payload for the browser.

Neither tool calls business services or mutates system state. `CoreAgentSession` forwards the final card to the browser through a new WebSocket message type.

The frontend renders the card and dispatches confirmed actions through a local action registry. The registry maps `domain + action` to existing frontend APIs and stores. This prevents the LLM from choosing arbitrary endpoints or methods.

The payload still includes `executionMode: 'frontend'` so the protocol can later support backend-executed high-risk actions without replacing the card schema.

### Action Card Catalog

Add a backend `UiActionCardCatalog` that is the source of truth for cards the agent may show. The catalog keeps detailed card instructions out of the always-on `CORE_PROMPT` and out of a single oversized tool schema.

Each catalog entry includes:

```ts
interface UiActionCardDefinition {
  cardId: string;
  domain: ActionDomain;
  action: string;
  title: string;
  description: string;
  usage: string;
  requiredParams: UiActionCardParamDefinition[];
  optionalParams: UiActionCardParamDefinition[];
  riskLevel: RiskLevel;
  confirmRequired: boolean;
  targetNav?: 'data' | 'workflow' | 'schedule';
  targetDataTab?: 'data' | 'knowledge';
  relatedDomains: ActionDomain[];
  dependencies: string[];
}

interface UiActionCardParamDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  sensitive?: boolean;
}
```

Module relationships live in this catalog. Examples:

- Knowledge base cards can relate to workflow cards because knowledge files can support workflow building context.
- Workflow cards can relate to schedule cards because schedules run workflows.
- Custom node template cards can relate to workflow cards because templates are reusable workflow node building blocks.

`search_ui_action_card` returns only the top relevant definitions with concise but sufficient usage details. As new business actions are added, the prompt remains stable; implementation mainly adds catalog entries and frontend registry handlers.

Typical agent flow:

1. User asks for an operation, such as "make a weekly sales workflow" or "create a schedule for this workflow".
2. CoreAgent calls `search_ui_action_card` with the user's request and optional domain if obvious.
3. The search tool returns a few relevant card definitions, including their required parameters and related domains.
4. CoreAgent chooses the best card. If required high-risk parameters are missing, it asks the user a clarifying question.
5. CoreAgent calls `show_ui_action_card` with `cardId` and known `params`.
6. The frontend displays the card. Nothing executes until the user confirms in the UI.

### Action Card Payload

`show_ui_action_card` produces this restrictive payload:

```ts
type ActionDomain = 'data' | 'knowledge' | 'schedule' | 'workflow' | 'template';
type RiskLevel = 'low' | 'medium' | 'high' | 'danger';
type ExecutionMode = 'frontend';

interface UiActionCardPayload {
  id: string;
  cardId: string;
  domain: ActionDomain;
  action: string;
  title: string;
  summary: string;
  params: Record<string, unknown>;
  riskLevel: RiskLevel;
  confirmRequired: boolean;
  executionMode: ExecutionMode;
  targetNav?: 'data' | 'workflow' | 'schedule';
  targetDataTab?: 'data' | 'knowledge';
  copilotPrompt?: string;
}
```

`cardId` and `action` are validated against the backend catalog and frontend registry.

The payload must not contain arbitrary URLs, HTTP methods, or API paths.

### WebSocket Events

Backend agent message types add:

- `action_card`: carries a `UiActionCardPayload`.

Frontend handling:

- `useChat` handles `action_card`.
- `chatStore` appends the card to the current assistant message, or creates an assistant card-only message if no assistant message is active.
- `turn_complete` keeps existing tool-call behavior unchanged.

### Chat Persistence

Add `metadata Json?` to `ChatMessage` in Prisma and repository/service types. This metadata stores action card payload and card execution state. This is preferable to encoding action cards in plain message content because cards are structured UI state, not prose.

Persisted card state includes:

- `payload`
- `status`: `proposed | confirming | running | succeeded | failed | cancelled`
- `resultSummary?`
- `error?`
- `executedAt?`

When an action succeeds or fails, the frontend updates the card metadata through a chat session API and appends a concise assistant result message. Historical chats restore cards from metadata. Completed cards are not executable again unless a future implementation adds an explicit retry action.

Sensitive values are masked before metadata is persisted.

## Frontend Architecture

### Chat Types and Components

Extend `ChatMessage` with optional action cards:

```ts
interface ChatMessage {
  // existing fields
  actionCards?: ChatActionCard[];
}
```

Create `ActionCard.vue` under `frontend/src/components/chat`. `ChatMessage.vue` renders cards below assistant content and above message actions.

Card states:

- `proposed`: initial card state.
- `confirming`: confirmation dialog is open or pending.
- `running`: action is executing.
- `succeeded`: action completed.
- `failed`: action failed and can show retry/manual-open options where supported.
- `cancelled`: user cancelled.

All visible static text must be defined in `frontend/src/locales/zh-CN.ts` and `frontend/src/locales/en-US.ts`.

### Action Registry

Add a local registry, for example `frontend/src/components/chat/actionCards/actionCardRegistry.ts` or `frontend/src/services/actionCards.ts`.

The registry owns:

- Payload validation.
- Required field checks per action.
- Risk confirmation rules.
- API/store calls.
- Success/failure result summaries.

The registry accepts only registered actions. Unknown `domain + action` marks the card as failed and shows a localized unsupported-action message.

### Navigation Store

Desktop and mobile layouts currently keep `activeNav` locally. Extract this into a Pinia `navigationStore`.

State:

- `activeNav: NavType`
- `pendingIntent: NavigationIntent | null`

`NavigationIntent` supports:

- Open data management.
- Open a specific data management tab: `data` or `knowledge`.
- Open schedule page.
- Open workflow editor for a workflow ID.
- Open custom node editor for a template ID.
- Auto-send a prompt to workflow Copilot or debug Copilot after connection.

Desktop and mobile layouts read `activeNav` from this store. Mobile navigation closes the sidebar and returns to the main page after a card-triggered navigation.

### Copilot Auto-send

Workflow creation card:

1. Frontend calls `workflowStore.createWorkflow()` or `workflowApi.createWorkflow()` with draft name and description.
2. `navigationStore` switches to `workflow`.
3. `WorkflowPage` opens the editor for the created workflow.
4. `copilotStore.connect(workflowId)` runs.
5. After the Copilot WebSocket is connected, the pending prompt is sent as the first Copilot message.

Template creation card:

1. Frontend calls `workflowApi.createTemplate()` with a minimal draft template.
2. `navigationStore` switches to `workflow`.
3. `WorkflowPage` opens the custom node editor for the created template ID.
4. `debugCopilotStore.connect(templateId)` runs.
5. After the debug Copilot WebSocket is connected, the pending prompt is sent.

The draft template step is required because the current debug Copilot endpoint depends on `templateId`.

If Copilot connection does not become ready within a timeout, the card becomes failed and keeps the prompt visible for manual sending.

## First-version Actions

### Data Management

Actions:

- `data.open`: navigate to data management.
- `data.datasource_create`: create a datasource from confirmed config.
- `data.datasource_test`: test a datasource connection config.
- `data.datasource_delete`: delete an existing datasource.

Risk:

- Open page: `low`.
- Create/test: `medium`.
- Delete or update connection-like data: `high` or `danger`.

Sensitive fields such as `password` must be masked in display and persistence.

### Knowledge Base

Actions:

- `knowledge.open`: navigate to data management with the knowledge tab active.
- `knowledge.folder_create`
- `knowledge.folder_rename`
- `knowledge.folder_move`
- `knowledge.folder_delete`
- `knowledge.file_open`
- `knowledge.file_move`
- `knowledge.file_delete`

File upload is represented only as a navigation card because it requires browser file selection.

### Schedule Management

Actions:

- `schedule.open`
- `schedule.create`
- `schedule.update`
- `schedule.delete`

The create payload may include workflow ID, schedule type, cron expression, timezone, parameters, and enabled state.

Risk:

- Create: `medium`.
- Update/delete existing task: `high`.
- Any action that starts execution immediately in a future version should be `danger`.

### Workflow Copilot Creation

Action:

- `workflow.copilot_create`

The card confirms a draft workflow name, optional description, and the prompt that will be sent to workflow Copilot. On confirmation, frontend creates the workflow, opens the editor, connects Copilot, and sends the prompt.

### Custom Node Template Copilot Creation

Action:

- `template.copilot_create`

The card confirms a draft template name, node type if known, optional description, and the prompt that will be sent to debug Copilot. On confirmation, frontend creates the draft template, opens the custom node editor, connects debug Copilot, and sends the prompt.

If node type is unknown, the card should either ask the user to confirm a default type or open the editor with a minimal default type chosen by the frontend registry.

## Backend Changes

### Tools

Add UI action card tools under `backend/src/infrastructure/tools`.

`SearchUiActionCardTool` responsibilities:

- Accept `query: string` and optional `domain`.
- Search `UiActionCardCatalog` by card ID, title, description, usage, related domains, and dependencies.
- Return a small ranked list of candidate card definitions with detailed usage for each returned card.
- Avoid returning the full catalog for broad queries.

`ShowUiActionCardTool` responsibilities:

- Accept `cardId` and optional `params`.
- Load the card definition from `UiActionCardCatalog`.
- Validate card existence, required top-level fields, risk level, execution mode, and supplied parameter names.
- Allow missing business parameters when the card can be shown as a confirmation or information-gathering card.
- Return `ToolResult` metadata containing the final card payload.
- Avoid business service calls.

Register both tools in `ToolRegistry` and add `ToolName.SearchUiActionCard` and `ToolName.ShowUiActionCard`.

### CoreAgentSession

When a tool result is from `show_ui_action_card` and metadata contains a valid card:

- Send `action_card` WebSocket message with the card payload.
- Persist card metadata if a chat session exists.
- Keep existing `tool_call` event behavior so the tool history remains visible if desired.

### Prompt

Update `CORE_PROMPT` with operation-card rules:

- Use `search_ui_action_card` when the user asks to create, modify, delete, open, or prepare managed system objects and the right card is not already known from recent context.
- Use `show_ui_action_card` after choosing a catalog card. Fill known parameters when available; leave optional or missing fields empty if the UI should collect or confirm them.
- Do not claim an operation has executed before the user confirms.
- Prefer workflow/template Copilot cards for requests to create workflows or custom node templates.
- Ask clarifying questions when required fields are missing for risky actions.
- Never put secrets in normal assistant prose.

The prompt should stay short. Detailed card-specific instructions belong in `UiActionCardCatalog` and are retrieved on demand by `search_ui_action_card`.

## Security and Risk Controls

Risk levels:

- `low`: navigation or informational action.
- `medium`: creates new objects or tests connection details.
- `high`: updates or deletes existing objects, changes datasource connection details, or modifies schedules.
- `danger`: irreversible delete, destructive batch operation, or immediate execution.

Confirmation behavior:

- `low`: may show a direct open button.
- `medium`: requires a card confirmation button.
- `high`: requires a confirmation dialog.
- `danger`: requires danger dialog and explicit object-name or confirmation-text input.

The frontend validates cards before execution. Invalid cards do not run.

The model cannot provide arbitrary API routes. All business behavior is implemented in the frontend registry.

## Error Handling

API failure:

- Card status becomes `failed`.
- Show a localized summary and optional technical details.
- Offer a manual navigation action where useful.

User cancellation:

- Card status becomes `cancelled`.
- No API call is made.

Copilot auto-send failure:

- Draft object remains created.
- Card status becomes `failed`.
- Result message links the user to the created object and shows the prompt for manual sending.

Persistence failure:

- The UI still shows the local card result.
- A warning is logged to the console or store; user-facing error appears only if the action itself failed.

## Testing

Backend tests:

- `SearchUiActionCardTool` returns relevant card definitions and does not return the full catalog for broad queries.
- `ShowUiActionCardTool` accepts valid `cardId` and parameter payloads.
- `ShowUiActionCardTool` rejects unknown card IDs, invalid enum values, and invalid parameter names.
- CoreAgentSession forwards `action_card` events for valid `show_ui_action_card` results.
- Chat message metadata persistence handles action cards.

Frontend tests:

- `ActionCard.vue` renders states and risk controls.
- Registry rejects unknown actions.
- Registry calls expected APIs for each first-version action.
- Sensitive fields are masked before persistence.
- Historical chat messages restore cards from metadata.
- `navigationStore` switches desktop/mobile views correctly.
- Workflow Copilot and debug Copilot auto-send pending prompts after connection.

Verification commands:

```bash
cd backend && pnpm run preflight
cd frontend && pnpm run preflight
```

## Migration Notes

Add Prisma field:

```prisma
model ChatMessage {
  // existing fields
  metadata Json?
}
```

Repository and API response types must include metadata in a typed way without using `any`.

Existing historical messages without metadata render as they do today.

## Open Follow-up

Backend execution can be added later by introducing `executionMode: 'backend'` and a `confirm_action` WebSocket message. That should be a separate design because it needs permission context, service-level validation, audit logging, and transaction/error semantics.
