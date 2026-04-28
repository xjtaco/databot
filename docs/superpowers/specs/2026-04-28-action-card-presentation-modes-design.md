# Action Card Presentation Modes Design

## Summary

Improve CoreAgent action cards so operation forms appear directly in the chat when that is the most efficient workflow, while still protecting disruptive or destructive actions with explicit modal confirmation.

This is a follow-up to the existing CoreSession action card and inline form designs. The backend action card catalog remains the source of truth, and the frontend renderer consumes explicit presentation metadata instead of inferring behavior from domain, action, risk, or `confirmRequired` alone.

## Goals

- Show knowledge management, schedule management, data upload, and similar form-backed cards directly in the chat without requiring an extra "confirm operation" click before the form appears.
- Require a modal confirmation before any high-risk or destructive operation executes.
- For workflow and custom node template creation, show a navigation/action button first. When clicked, show a modal explaining that the user will leave the CoreAgent chat; only after confirmation should the app create the workflow/template and navigate away.
- Localize all card titles, summaries, action labels, and modal text through the frontend i18n language packs.

## Non-Goals

- Do not move action execution to the backend. The frontend remains responsible for executing confirmed action cards.
- Do not allow model-generated arbitrary UI strings to become fixed interface copy.
- Do not redesign the visual appearance of all action cards beyond the controls required for these behaviors.
- Do not remove form-level validation or existing inline form submit/cancel actions.

## Catalog Metadata

Extend the backend `UiActionCardDefinition` with presentation and i18n metadata:

```ts
type ActionCardPresentationMode = 'inline_form' | 'button' | 'deferred_navigation_action';
type ActionCardConfirmationMode = 'none' | 'modal' | 'danger_text';

interface UiActionCardDefinition {
  // existing fields
  presentationMode: ActionCardPresentationMode;
  confirmationMode: ActionCardConfirmationMode;
  titleKey: string;
  summaryKey: string;
  actionLabelKey?: string;
  confirmTitleKey?: string;
  confirmMessageKey?: string;
}
```

`show_ui_action_card` includes these fields in `UiActionCardPayload`. Existing `title` and `summary` can remain for compatibility, tool summaries, and persisted history, but the frontend must prefer i18n keys when rendering visible UI.

## Presentation Rules

### Inline Forms

Cards with `presentationMode: 'inline_form'` should render their form immediately when the card arrives.

Examples:

- `data.datasource_create`
- `data.file_upload`
- `knowledge.folder_create`
- `knowledge.folder_rename`
- `knowledge.folder_move`
- `knowledge.file_upload`
- `knowledge.file_move`
- `schedule.create`
- `schedule.update`

The frontend should initialize these cards with `status: 'editing'` instead of `status: 'proposed'`. This removes the extra click currently required to reveal the form.

For `confirmationMode: 'none'`, the form submit button executes after normal form validation.

For `confirmationMode: 'modal'`, the form submit or delete button first opens an Element Plus modal confirmation. The action executes only after the user confirms the modal.

### High-Risk Actions

High-risk and destructive cards must require modal confirmation before execution. This includes, at minimum:

- `data.datasource_delete`
- `knowledge.folder_delete`
- `knowledge.file_delete`
- `schedule.delete`

These cards may still render inline warning content immediately, but the final destructive API call must be blocked behind a modal. The modal must clearly state the action and affected object when that information is available in `payload.params`.

`danger_text` remains available for actions that require typing a specific phrase, but the default for current destructive cards should be `modal` unless a stronger typed confirmation is intentionally required.

### Deferred Navigation Actions

Workflow and custom node template creation cards use:

```ts
presentationMode: 'deferred_navigation_action'
confirmationMode: 'modal'
```

Cards:

- `workflow.copilot_create`
- `template.copilot_create`

Frontend behavior:

1. Render a button such as "Open workflow editor" or "Open template editor".
2. On click, show a modal explaining that the user will leave the CoreAgent chat window and enter the workflow/template editor.
3. If the user cancels, keep the card in the chat and do not create anything.
4. If the user confirms, set the card to `running`, call the existing action handler, create the workflow/template, set the pending navigation intent, and navigate.
5. If creation or navigation setup fails, show `failed` state with the error.

The object must not be created before the modal is confirmed.

## Frontend State Model

`CardStatus` can remain:

```ts
type CardStatus =
  | 'proposed'
  | 'confirming'
  | 'editing'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
```

`chatStore.addActionCard()` should initialize status from payload metadata:

- `inline_form` -> `editing`
- `button` -> `proposed`
- `deferred_navigation_action` -> `proposed`

If an explicit `initialStatus` is later added to the payload, it may override this mapping, but the initial implementation can compute it in the store from `presentationMode`.

`ActionCard.vue` should route user interactions through a small behavior layer:

- `editing`: render the mapped inline form.
- `proposed + button`: render an action button.
- `proposed + deferred_navigation_action`: render a navigation action button.
- `confirming`: show modal confirmation state.

Modal confirmation should be owned by `ActionCard.vue` so individual form components do not each reimplement dialog behavior. For actions with `confirmationMode: 'modal'`, the form must emit an execution request before it calls the mutating API. `ActionCard.vue` opens the modal, and only after confirmation lets the form action continue.

Implementation can use one of two concrete patterns, but the chosen pattern must be consistent across forms:

- Forms expose a `submit()` method and `ActionCard.vue` owns the submit button for modal-confirmed actions.
- Forms emit `request-submit`, then wait for an approved callback before running the API call.

The final implementation must not allow delete or navigation-creating APIs to run before the modal confirmation resolves positively.

## i18n

All visible static card UI text must come from `frontend/src/locales/zh-CN.ts` and `frontend/src/locales/en-US.ts`.

Backend catalog entries should declare i18n keys, not final display copy:

```ts
titleKey: 'chat.actionCards.workflowCopilotCreate.title'
summaryKey: 'chat.actionCards.workflowCopilotCreate.summary'
actionLabelKey: 'chat.actionCards.workflowCopilotCreate.action'
confirmTitleKey: 'chat.actionCards.workflowCopilotCreate.confirmTitle'
confirmMessageKey: 'chat.actionCards.workflowCopilotCreate.confirmMessage'
```

Frontend rendering rules:

- Card title: `t(payload.titleKey)` when present, fallback to `payload.title`.
- Card summary: `t(payload.summaryKey)` when present, fallback to `payload.summary`.
- Main action button: `t(payload.actionLabelKey)` when present, fallback to existing generic confirm text.
- Modal title and message: use `confirmTitleKey` and `confirmMessageKey` when present.
- Dynamic values from `payload.params` can be interpolated into localized strings, but fixed UI labels must not be hardcoded in Vue templates.

The language packs must include keys for every catalog card that is rendered in chat, plus generic fallback keys for modal confirmation and navigation confirmation.

## Backend Prompt Guidance

Update the CoreAgent operation-card prompt so the model understands:

- Showing a card is not the same as executing an operation.
- Inline form cards can collect missing details directly in the chat.
- Workflow/template creation cards should be shown as navigation actions; creation occurs after the frontend modal confirmation.
- The model should not write user-facing button labels or modal text in normal responses.

## Persistence

Persisted action card metadata should include the new presentation and i18n fields because historical chat rendering needs the same behavior after reload.

Historical completed cards remain non-executable. Historical active cards can be restored with their stored status; if no status is stored, the same initial status mapping applies.

## Testing

Backend tests:

- Catalog definitions include presentation and i18n keys for every card.
- `show_ui_action_card` includes presentation and i18n metadata in `cardPayload`.
- Core prompt mentions inline forms, navigation confirmation, and not executing before user confirmation.

Frontend tests:

- `chatStore.addActionCard()` initializes inline-form cards as `editing`.
- `ActionCard.vue` renders inline forms immediately for `inline_form`.
- High-risk cards open a modal before execution.
- Workflow/template cards do not call handlers until the navigation confirmation modal is confirmed.
- Cancelling the navigation modal does not create objects and leaves the card actionable.
- Card title, summary, action labels, and confirmation modal text render from `zh-CN` and `en-US` locale keys.

## Rollout Notes

Implement this as a schema extension with compatibility fallbacks:

- If old payloads lack presentation fields, use the current behavior.
- If old payloads lack i18n keys, render `title` and `summary`.
- Add frontend and backend type fields together so new cards are typed end to end.
