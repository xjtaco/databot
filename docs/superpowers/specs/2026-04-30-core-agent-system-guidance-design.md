# CoreAgent System Guidance Enhancement Design

## Goal

Improve CoreAgent so it remains a strong data analysis agent while also guiding users through managed system operations now exposed through `ui_action_card` tools.

The enhancement is prompt- and catalog-focused. It does not change action card protocols, frontend rendering, card IDs, API contracts, or LLM provider behavior.

## Current Context

CoreAgent currently has a data-analysis-centered system prompt in `backend/src/agent/coreAgentSession.ts`. The existing `## Operation Cards` section tells the agent how to use `search_ui_action_card` and `show_ui_action_card`, but it is appended after the data analysis workflow and does not clearly define when the agent should act as:

- a data analysis executor,
- a system operation guide,
- or a lightweight help assistant.

The action card catalog in `backend/src/infrastructure/tools/uiActionCardCatalog.ts` already covers these domains:

- `data`
- `knowledge`
- `schedule`
- `workflow`
- `template`

The catalog and tools are functionally adequate, but some descriptions are sparse for broad user guidance intents such as "where do I upload data", "create a daily report", "manage workflows", or "start with a dashboard/report workflow".

## Scope

In scope:

- Enhance `CORE_PROMPT` with explicit intent routing.
- Expand Operation Cards guidance so CoreAgent knows when to use cards and when to ask questions first.
- Lightly improve `search_ui_action_card`, `show_ui_action_card`, and selected catalog descriptions/usage text to improve action discovery.
- Update CoreAgent chat window hint text so the frontend invites both data analysis and system setup/management requests.
- Add backend tests that protect the intended prompt and catalog behavior.

Out of scope:

- New action card types.
- New frontend components or i18n keys.
- Changes to card payload shape.
- Chat input or empty-state layout changes.
- Runtime LLM simulation or brittle end-to-end assertions about exact model tool-call choices.
- Automatic card display when a user only asks for analysis but the data source is unknown.

## Product Behavior

CoreAgent should behave as a dual-role assistant:

1. Data analysis remains the primary role.
2. System guidance becomes an explicit secondary role.

Intent routing:

- If the user asks for analysis, querying, data processing, or report generation and the data source is clear, follow the existing data analysis workflow.
- If the user asks for analysis but the data source is unclear, ask where the data is located. Do not immediately display upload or datasource cards.
- If the user asks to upload/import data, create or test a datasource, open or manage data/knowledge/workflow/schedule/template resources, create workflows/templates, or delete resources, use Operation Cards.
- If the user asks how to use the system or where to start, answer briefly in text. Show an action card only after the user expresses a concrete operation intent.

This preserves user control for ambiguous analysis requests while making system operations discoverable once intent is clear.

## Prompt Design

`CORE_PROMPT` should gain a short section near the top of the workflow guidance, before the detailed data analysis workflow, named along the lines of `Intent Routing` or `Request Routing`.

The section should define three routes:

- `Data analysis route`: use dictionaries, SQL, Python, chart/report workflow.
- `System operation route`: use `search_ui_action_card` then `show_ui_action_card`.
- `Help route`: explain briefly, then offer the next concrete operation without forcing a card.

The existing `## Operation Cards` section should be updated from a pure ordered list into a behavior contract:

- Always search first and select from returned card definitions.
- Use cards for managed system objects and navigation actions.
- Cards present proposed frontend actions; they do not mean the operation has executed.
- Inline form cards such as datasource, knowledge, and schedule creation can be shown directly when requested.
- Workflow and template creation should prefer Copilot cards.
- Risky actions such as delete require a clear target before showing the card.
- Sensitive values must only be passed as card parameters, not repeated in normal assistant text.
- Do not hard-code card button/body text; rely on catalog metadata and i18n keys.

The prompt should also mention representative operation examples without turning the prompt into a full duplicated card catalog.

## Catalog And Tool Description Design

No API or schema changes are needed.

The following text-only improvements should be made:

- `SearchUiActionCardTool.description`: mention navigation, browsing, resource management, and guided setup intents in addition to create/delete/manage operations.
- `ShowUiActionCardTool.description`: make clear the returned card is a proposed frontend action waiting for user confirmation/execution.
- Selected catalog `usage` and `description` fields should include broader searchable language:
  - `data.open`: browse/list/manage datasources and uploaded/imported tables.
  - `data.file_upload`: upload/import CSV, Excel, SQLite files for later analysis.
  - `data.datasource_create`: connect a database before analysis.
  - `knowledge.open`: browse/list/manage knowledge folders/files.
  - `workflow.open`: browse/list/manage workflows, run/edit/delete existing workflows.
  - `workflow.copilot_create`: create/build a workflow with Copilot from a business goal.
  - `workflow.template_report`: create reporting/dashboard/recurring report workflows.
  - `schedule.create`: schedule recurring workflow runs, daily reports, refresh jobs.
  - `template.copilot_create`: create reusable workflow or node templates with Copilot.

The catalog changes should avoid changing `cardId`, `domain`, `action`, params, risk level, i18n keys, confirmation mode, or target navigation metadata.

## Frontend Hint Text Design

The chat UI already reads user-facing copy through i18n:

- `frontend/src/components/chat/ChatInput.vue` uses `chat.inputPlaceholder`.
- `frontend/src/components/chat/ChatMessageList.vue` uses `chat.emptyState.title` and `chat.emptyState.description`.

These locale values should be updated in both Chinese and English so the first-screen guidance matches the enhanced CoreAgent role.

The text should communicate that users can:

- ask data questions,
- generate reports,
- upload/connect data sources,
- create workflows or scheduled tasks,
- and manage system resources.

The copy should stay concise enough to fit existing desktop and mobile layouts. The implementation should only update `frontend/src/locales/zh-CN.ts` and `frontend/src/locales/en-US.ts` unless tests reveal an existing layout issue. No hard-coded text should be added to Vue components.

Suggested direction:

- Chinese placeholder: `询问数据、上传文件或创建工作流...`
- English placeholder: `Ask about data, upload files, or create workflows...`
- Chinese empty description should mention 数据分析、报告、数据源/文件、工作流/定时任务.
- English empty description should mention data analysis, reports, data sources/files, workflows/schedules.

## Data Flow

For a concrete system operation request:

1. CoreAgent routes the request to Operation Cards.
2. It calls `search_ui_action_card` with a natural-language or regex query and an optional domain.
3. It reviews returned card definitions.
4. It calls `show_ui_action_card` with the selected `cardId` and known parameters.
5. `CoreAgentSession` emits the existing `action_card` WebSocket message and persists card metadata as it does today.
6. The frontend renders the card and the user decides whether to execute it.

For unclear analysis requests:

1. CoreAgent asks where the data is located.
2. If the user then chooses upload, datasource setup, or opening an existing resource panel, CoreAgent uses Operation Cards.
3. If the user identifies an existing database/file source, CoreAgent follows the data analysis workflow.

## Error Handling And Safety

- If action card search returns no relevant card, CoreAgent should briefly say it cannot find a matching system action and ask for clarification.
- If multiple cards match, CoreAgent should choose the safest specific card when intent is clear, or ask a concise clarification when the choice affects user data or navigation.
- For destructive actions, missing target identifiers or names should trigger a clarification question before showing the card.
- For credentials and secrets, CoreAgent must not echo values in normal text.
- CoreAgent must not claim that a card action has completed until the frontend reports execution status in a later interaction.

## Testing

Backend prompt and catalog tests should cover the behavior contract without depending on exact LLM output.

Prompt tests:

- `CORE_PROMPT` contains request or intent routing language.
- It says unclear analysis data source requests should ask where the data is located.
- It says system operations should use `search_ui_action_card` then `show_ui_action_card`.
- It says cards are proposed/confirmation actions, not completed operations.
- It says risky/destructive actions need a clear target before showing a card.
- It retains existing action-card presentation rules.

Catalog/tool tests:

- Key catalog entries contain broad searchable terms for upload/import, browse/list/manage, report/dashboard workflow, recurring schedule, and Copilot creation.
- Tool descriptions mention navigation/resource management and proposed frontend action semantics.

Frontend tests:

- Existing chat input/message-list tests, or a small focused locale test, should verify that the prompt text comes from i18n and contains both analysis and system-operation guidance.
- Tests should cover both `zh-CN` and `en-US` locale entries if no existing component test already checks this.

Backend tests should stay in `backend/tests`; frontend tests should stay in `frontend/tests`. All new TypeScript test code should avoid `any` types.

## Implementation Notes

The likely files are:

- `backend/src/agent/coreAgentSession.ts`
- `backend/src/infrastructure/tools/searchUiActionCardTool.ts`
- `backend/src/infrastructure/tools/showUiActionCardTool.ts`
- `backend/src/infrastructure/tools/uiActionCardCatalog.ts`
- `backend/tests/agent/corePrompt-action-cards.test.ts`
- A focused catalog/tool test file if existing coverage is not suitable
- `frontend/src/locales/zh-CN.ts`
- `frontend/src/locales/en-US.ts`
- Focused frontend tests under `frontend/tests` if existing tests do not cover chat hint text

After implementation, run:

```bash
cd backend/ && pnpm run preflight
cd frontend/ && pnpm run preflight
```
