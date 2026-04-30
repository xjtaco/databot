# CoreAgent System Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance CoreAgent so it can clearly route between data analysis, system guidance, and UI action card operations, with matching frontend chat hints.

**Architecture:** Keep the change text- and test-focused. Backend prompt changes live in `CORE_PROMPT`; action-card discovery improvements stay in existing tool descriptions and catalog copy; frontend guidance stays in existing i18n locale keys used by the chat input and empty state.

**Tech Stack:** Express/TypeScript backend, Vitest, Vue 3 frontend, vue-i18n, Element Plus.

---

## File Structure

| File | Purpose |
| --- | --- |
| `backend/src/agent/coreAgentSession.ts` | Add request routing and stronger Operation Cards behavior rules to `CORE_PROMPT`. |
| `backend/tests/agent/corePrompt-action-cards.test.ts` | Protect the CoreAgent prompt contract with exact content assertions. |
| `backend/src/infrastructure/tools/searchUiActionCardTool.ts` | Improve search tool description so LLMs use it for navigation/resource-management/setup intents. |
| `backend/src/infrastructure/tools/showUiActionCardTool.ts` | Improve show tool description so LLMs treat cards as proposed frontend actions, not completed operations. |
| `backend/src/infrastructure/tools/uiActionCardCatalog.ts` | Improve selected catalog descriptions/usage strings for better search matching. |
| `backend/tests/infrastructure/tools/uiActionCardCatalog.test.ts` | Add catalog searchability assertions for broad guidance terms. |
| `backend/tests/infrastructure/tools/searchUiActionCardTool.test.ts` | Add tool description assertions for guidance/search semantics. |
| `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts` | Add tool description assertions for proposed-action semantics. |
| `frontend/src/locales/zh-CN.ts` | Update Chinese CoreAgent chat input and empty-state hint copy. |
| `frontend/src/locales/en-US.ts` | Update English CoreAgent chat input and empty-state hint copy. |
| `frontend/tests/components/chat/ChatGuidanceLocale.test.ts` | New focused locale test covering both languages and i18n-backed guidance. |

## Task 1: Backend Prompt Routing Contract

**Files:**
- Modify: `backend/tests/agent/corePrompt-action-cards.test.ts`
- Modify: `backend/src/agent/coreAgentSession.ts`

- [ ] **Step 1: Add failing prompt contract tests**

In `backend/tests/agent/corePrompt-action-cards.test.ts`, append these tests inside the existing `describe('CORE_PROMPT action card rules', ...)` block, after the existing `mentions copilot_create for workflows` test:

```ts
  it('defines request routing between analysis, system operations, and help', () => {
    expect(corePrompt).toContain('## Request Routing');
    expect(corePrompt).toContain('Data analysis route');
    expect(corePrompt).toContain('System operation route');
    expect(corePrompt).toContain('Help route');
  });

  it('asks for data location before showing cards for unclear analysis requests', () => {
    expect(corePrompt).toContain('If the user asks for analysis but the data source is unclear');
    expect(corePrompt).toContain('ask where the data is located');
    expect(corePrompt).toContain('do not immediately show upload or datasource cards');
  });

  it('requires operation cards for concrete system operation intents', () => {
    expect(corePrompt).toContain('upload or import data files');
    expect(corePrompt).toContain('create or test datasources');
    expect(corePrompt).toContain('open, browse, list, or manage');
    expect(corePrompt).toContain('create workflows, templates, or schedules');
  });

  it('states action cards are proposals and not completed operations', () => {
    expect(corePrompt).toContain('Action cards propose frontend actions');
    expect(corePrompt).toContain('Do not claim that the operation has executed');
  });

  it('requires clear targets before destructive action cards', () => {
    expect(corePrompt).toContain('For destructive or high-risk actions');
    expect(corePrompt).toContain('ask for the target before showing the card');
  });
```

- [ ] **Step 2: Run prompt tests and verify failure**

Run:

```bash
cd backend && pnpm exec vitest run tests/agent/corePrompt-action-cards.test.ts
```

Expected: FAIL. At least the new `## Request Routing` assertion should fail because the prompt does not yet contain that section.

- [ ] **Step 3: Add request routing to `CORE_PROMPT`**

In `backend/src/agent/coreAgentSession.ts`, insert this section after `# Main Workflow` and before `## Data Analysis Tasks`:

```md
## Request Routing

Before choosing a workflow, classify the user's intent:

- **Data analysis route:** If the user asks for analysis, querying, data processing, charting, or report generation and the data source is clear, follow "Data Analysis Tasks" below.
- **Unclear data source:** If the user asks for analysis but the data source is unclear, ask where the data is located. Mention examples such as an existing datasource, uploaded file, or database table, but do not immediately show upload or datasource cards.
- **System operation route:** If the user asks to upload or import data files, create or test datasources, open, browse, list, or manage data/knowledge/workflow/schedule/template resources, create workflows, templates, or schedules, or delete resources, use "Operation Cards" below.
- **Help route:** If the user asks how to use the system or where to start, answer briefly in text and suggest one concrete next action. Only show an action card after the user expresses a specific operation intent.
```

- [ ] **Step 4: Replace Operation Cards section with stronger behavior contract**

In `backend/src/agent/coreAgentSession.ts`, replace the entire `## Operation Cards` section with this text:

```md
## Operation Cards

Use operation cards for concrete system operations involving managed objects: datasources, uploaded data files (CSV/Excel/SQLite), knowledge files/folders, schedules, workflows, and custom node templates.

1. Use ${ToolName.SearchUiActionCard} first to find the relevant card. Provide a natural language query and optional domain filter. For broad, multilingual, or mixed-language intent, use regex query mode with alternatives that describe the operation and object, for example \`upload|import|file|csv|excel|sqlite\`.
2. Review the returned card definitions. Choose the safest specific card that matches the user's intent.
3. Use ${ToolName.ShowUiActionCard} with the chosen cardId and any known parameters. Leave optional parameters empty if the user has not provided them.
4. Action cards propose frontend actions for user confirmation/execution. Do not claim that the operation has executed just because a card was shown.
5. Use cards when the user asks to upload or import data files, create or test datasources, open, browse, list, or manage resources, create workflows, templates, or schedules, or delete resources.
6. For creating workflows or custom node templates, prefer the Copilot creation cards (workflow.copilot_create, template.copilot_create). For reporting or dashboard workflows, prefer workflow.template_report when it matches the user intent.
7. Inline form cards such as data source, knowledge, and schedule create cards should be shown directly when the user asks to create/manage them; do not ask for an extra pre-confirmation.
8. Workflow and node-template cards are deferred navigation actions. Show the card with a jump/open button; the UI will ask for modal confirmation before leaving CoreAgent chat and only then create/open the target.
9. For destructive or high-risk actions such as delete, if the target resource is not clear from the user request, ask for the target before showing the card.
10. If search finds no relevant card, briefly say that no matching system action was found and ask for clarification.
11. Never put secrets (passwords, tokens) in your normal response text. They belong only in card parameters.
12. Never write hard-coded card button labels or card body copy yourself; use catalog metadata and i18n keys returned by show_ui_action_card.
```

- [ ] **Step 5: Run prompt tests and verify pass**

Run:

```bash
cd backend && pnpm exec vitest run tests/agent/corePrompt-action-cards.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit backend prompt changes**

Run:

```bash
git add backend/src/agent/coreAgentSession.ts backend/tests/agent/corePrompt-action-cards.test.ts
git commit -m "refactor(agent): clarify core request routing"
```

## Task 2: Action Card Catalog And Tool Discoverability

**Files:**
- Modify: `backend/tests/infrastructure/tools/uiActionCardCatalog.test.ts`
- Modify: `backend/tests/infrastructure/tools/searchUiActionCardTool.test.ts`
- Modify: `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts`
- Modify: `backend/src/infrastructure/tools/uiActionCardCatalog.ts`
- Modify: `backend/src/infrastructure/tools/searchUiActionCardTool.ts`
- Modify: `backend/src/infrastructure/tools/showUiActionCardTool.ts`

- [ ] **Step 1: Add failing catalog searchability tests**

In `backend/tests/infrastructure/tools/uiActionCardCatalog.test.ts`, append this `describe` block after the existing `describe('getCardDefinition', () => { ... })` block:

```ts
describe('guidance search terms', () => {
  function searchableText(cardId: string): string {
    const def = getCardDefinition(cardId);
    expect(def).toBeDefined();

    return [
      def!.description,
      def!.usage,
      ...def!.requiredParams.map((param) => param.description),
      ...def!.optionalParams.map((param) => param.description),
    ]
      .join(' ')
      .toLowerCase();
  }

  it('describes data setup cards with upload, import, connect, and analysis terms', () => {
    expect(searchableText('data.file_upload')).toContain('import');
    expect(searchableText('data.file_upload')).toContain('analysis');
    expect(searchableText('data.datasource_create')).toContain('connect');
    expect(searchableText('data.datasource_create')).toContain('before analysis');
  });

  it('describes open cards with browse, list, and manage terms', () => {
    for (const cardId of ['data.open', 'knowledge.open', 'workflow.open']) {
      const text = searchableText(cardId);
      expect(text).toContain('browse');
      expect(text).toContain('list');
      expect(text).toContain('manage');
    }
  });

  it('describes workflow and schedule cards with report and recurring guidance terms', () => {
    expect(searchableText('workflow.copilot_create')).toContain('business goal');
    expect(searchableText('workflow.template_report')).toContain('dashboard');
    expect(searchableText('workflow.template_report')).toContain('recurring report');
    expect(searchableText('schedule.create')).toContain('recurring');
    expect(searchableText('schedule.create')).toContain('daily report');
  });

  it('describes template copilot creation as reusable workflow or node template setup', () => {
    const text = searchableText('template.copilot_create');
    expect(text).toContain('reusable workflow');
    expect(text).toContain('node template');
  });
});
```

- [ ] **Step 2: Add failing tool description tests**

In `backend/tests/infrastructure/tools/searchUiActionCardTool.test.ts`, add this test after `is registered in ToolRegistry with correct name`:

```ts
  it('describes navigation, resource management, and guided setup intents', () => {
    const tool = ToolRegistry.get(ToolName.SearchUiActionCard);

    expect(tool.description).toContain('navigation');
    expect(tool.description).toContain('browse');
    expect(tool.description).toContain('resource management');
    expect(tool.description).toContain('guided setup');
  });
```

In `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts`, add this test after `is registered in ToolRegistry with correct name`:

```ts
  it('describes cards as proposed frontend actions awaiting user confirmation', () => {
    const tool = ToolRegistry.get(ToolName.ShowUiActionCard);

    expect(tool.description).toContain('proposed frontend action');
    expect(tool.description).toContain('must approve');
    expect(tool.description).toContain('before it is executed');
  });
```

- [ ] **Step 3: Run targeted tool/catalog tests and verify failure**

Run:

```bash
cd backend && pnpm exec vitest run tests/infrastructure/tools/uiActionCardCatalog.test.ts tests/infrastructure/tools/searchUiActionCardTool.test.ts tests/infrastructure/tools/showUiActionCardTool.test.ts
```

Expected: FAIL. The new text assertions should fail before source descriptions are updated.

- [ ] **Step 4: Update `SearchUiActionCardTool.description`**

In `backend/src/infrastructure/tools/searchUiActionCardTool.ts`, replace the `description = ...` template string with:

```ts
  description = `Search the UI action card catalog to discover available frontend actions.
Returns an array of card definitions matching the query. Each card describes a UI action
(e.g. create datasource, upload file, browse resources, create workflow) that can be
presented to the user for confirmation.

Use this tool when the user asks for a concrete system operation that requires UI
interaction, including navigation, browse/list/open requests, resource management,
guided setup, creating, deleting, or managing datasources, data files, knowledge
folders/files, scheduled tasks, workflows, or templates. Always search first before
presenting an action card to ensure you pick the correct one. Use regex query mode for
broad intent matching across card IDs, titles, descriptions, usage text, and parameter
descriptions.`;
```

- [ ] **Step 5: Update `ShowUiActionCardTool.description`**

In `backend/src/infrastructure/tools/showUiActionCardTool.ts`, replace the `description = ...` template string with:

```ts
  description = `Display a UI action card as a proposed frontend action.
Returns a structured card payload that the frontend renders as a confirmation dialog,
inline form, resource list, or navigation card. The user must approve the action before
it is executed on the frontend.

Use this tool after searching for an action card (via search_ui_action_card) to present
a specific card to the user. Provide the cardId and any required parameters.`;
```

- [ ] **Step 6: Update selected catalog descriptions and usage**

In `backend/src/infrastructure/tools/uiActionCardCatalog.ts`, update only the listed `description` and `usage` strings.

For `data.open`:

```ts
    description: 'Navigate to the data management panel to browse, list, and manage datasources and uploaded/imported tables.',
    usage: 'When the user wants to open, browse, list, view, or manage datasources and data tables.',
```

For `data.datasource_create`:

```ts
    description: 'Create and connect a new database datasource before analysis by providing connection details.',
    usage: 'When the user wants to add, connect, or configure a database connection (MySQL, PostgreSQL, ClickHouse, etc.) before analysis.',
```

For `data.file_upload`:

```ts
    description: 'Upload or import a CSV, Excel, or SQLite file as a data source for later analysis.',
    usage: 'When the user wants to upload, import, or add a data file (CSV, Excel, SQLite) for analysis.',
```

For `knowledge.open`:

```ts
    description: 'Navigate to the knowledge base panel to browse, list, and manage folders and files.',
    usage: 'When the user wants to open, browse, list, view, or manage their knowledge base.',
```

For `workflow.open`:

```ts
    description: 'Navigate to the workflow panel to browse, list, run, edit, delete, and manage workflows.',
    usage: 'When the user wants to open, browse, list, view, run, edit, delete, or manage workflows.',
```

For `workflow.copilot_create`:

```ts
    description: 'Launch the workflow copilot to design and create a new workflow from a business goal.',
    usage: 'When the user wants to create, build, or design a data processing or analysis workflow with Copilot from a business goal.',
```

For `workflow.template_report`:

```ts
    description: 'Open the workflow editor with a report or dashboard template creation flow.',
    usage: 'When the user wants to create a reporting, dashboard, recurring report, or dashboard generation workflow.',
```

For `schedule.create`:

```ts
    description: 'Create a new scheduled task for recurring workflow runs, refresh jobs, or daily reports.',
    usage: 'When the user wants to set up a recurring task, daily report, scheduled workflow run, or data refresh.',
```

For `template.copilot_create`:

```ts
    description: 'Launch the template copilot to design a reusable workflow or node template.',
    usage:
      'When the user wants to create a reusable workflow template, node template, or custom node from an existing workflow or from scratch.',
```

- [ ] **Step 7: Run targeted tool/catalog tests and verify pass**

Run:

```bash
cd backend && pnpm exec vitest run tests/infrastructure/tools/uiActionCardCatalog.test.ts tests/infrastructure/tools/searchUiActionCardTool.test.ts tests/infrastructure/tools/showUiActionCardTool.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit catalog/tool changes**

Run:

```bash
git add backend/src/infrastructure/tools/searchUiActionCardTool.ts backend/src/infrastructure/tools/showUiActionCardTool.ts backend/src/infrastructure/tools/uiActionCardCatalog.ts backend/tests/infrastructure/tools/searchUiActionCardTool.test.ts backend/tests/infrastructure/tools/showUiActionCardTool.test.ts backend/tests/infrastructure/tools/uiActionCardCatalog.test.ts
git commit -m "refactor(agent): improve action card guidance search"
```

## Task 3: Frontend Chat Guidance Locale Copy

**Files:**
- Create: `frontend/tests/components/chat/ChatGuidanceLocale.test.ts`
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`

- [ ] **Step 1: Add failing locale tests**

Create `frontend/tests/components/chat/ChatGuidanceLocale.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

describe('chat guidance locale copy', () => {
  it('guides Chinese users toward both data analysis and system operations', () => {
    expect(zhCN.chat.inputPlaceholder).toContain('上传文件');
    expect(zhCN.chat.inputPlaceholder).toContain('创建工作流');
    expect(zhCN.chat.emptyState.description).toContain('数据分析');
    expect(zhCN.chat.emptyState.description).toContain('报告');
    expect(zhCN.chat.emptyState.description).toContain('数据源');
    expect(zhCN.chat.emptyState.description).toContain('工作流');
    expect(zhCN.chat.emptyState.description).toContain('定时任务');
  });

  it('guides English users toward both data analysis and system operations', () => {
    expect(enUS.chat.inputPlaceholder).toContain('upload files');
    expect(enUS.chat.inputPlaceholder).toContain('create workflows');
    expect(enUS.chat.emptyState.description).toContain('data analysis');
    expect(enUS.chat.emptyState.description).toContain('reports');
    expect(enUS.chat.emptyState.description).toContain('data sources');
    expect(enUS.chat.emptyState.description).toContain('workflows');
    expect(enUS.chat.emptyState.description).toContain('schedules');
  });
});
```

- [ ] **Step 2: Run frontend locale test and verify failure**

Run:

```bash
cd frontend && pnpm exec vitest run tests/components/chat/ChatGuidanceLocale.test.ts
```

Expected: FAIL because current locale copy only mentions asking about data/exploring databases/reports.

- [ ] **Step 3: Update Chinese chat locale copy**

In `frontend/src/locales/zh-CN.ts`, update the `chat` fields near the top and empty state fields:

```ts
    inputPlaceholder: '询问数据、上传文件或创建工作流...',
```

```ts
    emptyState: {
      title: '开始使用 DataBot',
      description: '进行数据分析、生成报告，\n也可以连接数据源、上传文件、创建工作流或定时任务。',
    },
```

- [ ] **Step 4: Update English chat locale copy**

In `frontend/src/locales/en-US.ts`, update the `chat` fields near the top and empty state fields:

```ts
    inputPlaceholder: 'Ask about data, upload files, or create workflows...',
```

```ts
    emptyState: {
      title: 'Start with DataBot',
      description:
        'Run data analysis and generate reports,\nor connect data sources, upload files, create workflows, and manage schedules.',
    },
```

- [ ] **Step 5: Run frontend locale test and verify pass**

Run:

```bash
cd frontend && pnpm exec vitest run tests/components/chat/ChatGuidanceLocale.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit frontend locale changes**

Run:

```bash
git add frontend/src/locales/zh-CN.ts frontend/src/locales/en-US.ts frontend/tests/components/chat/ChatGuidanceLocale.test.ts
git commit -m "refactor(chat): update core agent guidance copy"
```

## Task 4: Full Verification

**Files:**
- Verify only; no file edits expected.

- [ ] **Step 1: Run backend preflight**

Run:

```bash
cd backend && pnpm run preflight
```

Expected: PASS.

- [ ] **Step 2: Run frontend preflight**

Run:

```bash
cd frontend && pnpm run preflight
```

Expected: PASS.

- [ ] **Step 3: Inspect final git status**

Run:

```bash
git status --short
```

Expected: only pre-existing unrelated files may remain, such as `?? docker/databot-package-20260430_085648.tar.gz`. No uncommitted changes from this plan should remain.
