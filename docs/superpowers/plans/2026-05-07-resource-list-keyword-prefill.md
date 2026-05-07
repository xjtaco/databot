# Resource List Keyword Prefill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CoreAgent pass clear user keywords into every list-style UI action card so the card search box is prefilled.

**Architecture:** Keep the behavior in the existing action-card contract. CoreAgent prompt rules tell the model to pass `params.query` for filtered `resource_list` cards, `ShowUiActionCardTool` documents that contract and continues converting query-like params into `defaultQuery`, and the catalog exposes query-like optional params on every resource-list card.

**Tech Stack:** TypeScript, Express backend, Vitest, existing action-card tool/catalog system.

---

## File Structure

- Modify `backend/src/agent/coreAgentSession.ts`
  - Responsibility: CoreAgent system prompt and Operation Cards behavior rules.
- Modify `backend/src/infrastructure/tools/showUiActionCardTool.ts`
  - Responsibility: `show_ui_action_card` schema and resource-list default query extraction.
- Modify `backend/src/infrastructure/tools/uiActionCardCatalog.ts`
  - Responsibility: action-card definitions and public catalog helpers.
- Modify `backend/tests/agent/corePrompt-action-cards.test.ts`
  - Responsibility: prompt contract regression tests.
- Modify `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts`
  - Responsibility: tool payload and schema regression tests.

No frontend files are planned because `frontend/src/components/chat/actionCards/ResourceActionCard.vue` already initializes its search input from `payload.defaultQuery`.

---

### Task 1: Add Failing Prompt Contract Test

**Files:**
- Modify: `backend/tests/agent/corePrompt-action-cards.test.ts`
- Test: `backend/tests/agent/corePrompt-action-cards.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test inside `describe('CORE_PROMPT action card rules', () => { ... })`:

```ts
  it('requires clear user keywords to prefill every resource list card search box', () => {
    expect(corePrompt).toContain('resource_list');
    expect(corePrompt).toContain('clear filter keyword');
    expect(corePrompt).toContain('params.query');
    expect(corePrompt).toContain('search box is prefilled');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd backend && pnpm vitest run tests/agent/corePrompt-action-cards.test.ts
```

Expected: FAIL. The new test should fail because the prompt does not yet contain all required keyword-prefill phrases.

- [ ] **Step 3: Commit the failing test**

```bash
git add backend/tests/agent/corePrompt-action-cards.test.ts
git commit -m "test(agent): cover resource list keyword prompt rule"
```

---

### Task 2: Implement CoreAgent Prompt Rule

**Files:**
- Modify: `backend/src/agent/coreAgentSession.ts`
- Test: `backend/tests/agent/corePrompt-action-cards.test.ts`

- [ ] **Step 1: Update the Operation Cards prompt**

In `backend/src/agent/coreAgentSession.ts`, add the following rule in the `## Operation Cards` numbered list after the rule that says to use `show_ui_action_card` with known parameters:

```md
4. For every resource_list card, if the user request includes a clear filter keyword, pass it as params.query in ${ToolName.ShowUiActionCard} so the card search box is prefilled. Examples: "列出电商类的工作流" -> { "query": "电商" }, "show sales templates" -> { "query": "sales" }. Do not invent a query for unfiltered list requests.
```

Renumber the later Operation Cards rules so the list remains sequential.

- [ ] **Step 2: Run the prompt test**

Run:

```bash
cd backend && pnpm vitest run tests/agent/corePrompt-action-cards.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit the prompt change**

```bash
git add backend/src/agent/coreAgentSession.ts backend/tests/agent/corePrompt-action-cards.test.ts
git commit -m "fix(agent): require resource list keyword prefill"
```

---

### Task 3: Add Failing Tool Schema And Catalog Coverage

**Files:**
- Modify: `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts`
- Test: `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts`

- [ ] **Step 1: Update imports for catalog-wide tests**

Change the catalog import at the top of `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts` from:

```ts
import { getCardDefinition } from '../../../src/infrastructure/tools/uiActionCardCatalog';
```

to:

```ts
import {
  getAllCardDefinitions,
  getCardDefinition,
} from '../../../src/infrastructure/tools/uiActionCardCatalog';
```

- [ ] **Step 2: Add a schema description test**

Add this test after `it('describes cards as proposed frontend actions with conditional confirmation', ...)`:

```ts
  it('documents query prefill behavior for resource list params', () => {
    const tool = ToolRegistry.get(ToolName.ShowUiActionCard);
    const paramsSchema = tool.parameters.properties?.params;
    if (!paramsSchema || typeof paramsSchema !== 'object' || Array.isArray(paramsSchema)) {
      throw new Error('Expected params schema object');
    }

    expect(paramsSchema.description).toContain('resource_list');
    expect(paramsSchema.description).toContain('params.query');
    expect(paramsSchema.description).toContain('prefill');
    expect(paramsSchema.description).toContain('search box');
  });
```

- [ ] **Step 3: Add catalog-wide query default tests**

Add this test after `it('uses id params as resource-list defaultQuery when no readable filter is available', ...)`:

```ts
  it('uses params.query as defaultQuery for every resource list card', async () => {
    const tool = ToolRegistry.get(ToolName.ShowUiActionCard);
    const resourceListCards = getAllCardDefinitions().filter(
      (definition) => definition.presentationMode === 'resource_list'
    );

    expect(resourceListCards.map((definition) => definition.cardId).sort()).toEqual([
      'data.datasource_delete',
      'data.open',
      'data.table_delete',
      'knowledge.file_delete',
      'knowledge.folder_delete',
      'knowledge.open',
      'schedule.delete',
      'schedule.open',
      'template.delete',
      'template.open',
      'workflow.delete',
      'workflow.open',
    ]);

    for (const definition of resourceListCards) {
      const result = await tool.execute({
        cardId: definition.cardId,
        params: { query: '电商' },
      });
      expect(result.success).toBe(true);

      const cardPayload = result.metadata?.cardPayload as UiActionCardPayload;
      expect(cardPayload.presentationMode).toBe('resource_list');
      expect(cardPayload.defaultQuery).toBe('电商');
    }
  });
```

- [ ] **Step 4: Add catalog optional param tests**

Add this test after the catalog-wide default query test:

```ts
  it('advertises query filtering on every resource list catalog definition', () => {
    const resourceListCards = getAllCardDefinitions().filter(
      (definition) => definition.presentationMode === 'resource_list'
    );

    for (const definition of resourceListCards) {
      expect(
        definition.optionalParams.some(
          (param) =>
            param.name === 'query' &&
            param.type === 'string' &&
            param.description.toLowerCase().includes('filter')
        ),
        `${definition.cardId} should expose an optional query filter parameter`
      ).toBe(true);
    }
  });
```

- [ ] **Step 5: Run the tests to verify they fail**

Run:

```bash
cd backend && pnpm vitest run tests/infrastructure/tools/showUiActionCardTool.test.ts
```

Expected: FAIL. TypeScript/Vitest should report that `getAllCardDefinitions` is not exported, and after that export exists the schema/catalog assertions should fail until implementation is complete.

- [ ] **Step 6: Commit the failing tests**

```bash
git add backend/tests/infrastructure/tools/showUiActionCardTool.test.ts
git commit -m "test(tools): cover resource list query prefill contract"
```

---

### Task 4: Implement Tool Schema And Catalog Query Metadata

**Files:**
- Modify: `backend/src/infrastructure/tools/showUiActionCardTool.ts`
- Modify: `backend/src/infrastructure/tools/uiActionCardCatalog.ts`
- Test: `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts`

- [ ] **Step 1: Add shared filter parameter definitions**

In `backend/src/infrastructure/tools/uiActionCardCatalog.ts`, add this helper before `const baseCatalog`:

```ts
const resourceListFilterParams = [
  {
    name: 'query',
    type: 'string',
    description: 'Search query used to filter the resource list.',
  },
  {
    name: 'keyword',
    type: 'string',
    description: 'Keyword used to filter the resource list.',
  },
  {
    name: 'name',
    type: 'string',
    description: 'Name text used to filter the resource list.',
  },
  {
    name: 'title',
    type: 'string',
    description: 'Title text used to filter the resource list.',
  },
] satisfies UiActionCardCatalogEntry['optionalParams'];
```

- [ ] **Step 2: Use shared filter params for open list cards**

Replace these four entries:

```ts
    optionalParams: [],
```

with:

```ts
    optionalParams: resourceListFilterParams,
```

for these card definitions:

- `data.open`
- `knowledge.open`
- `schedule.open`
- `workflow.open`

Do not change create, test, upload, or copilot cards.

- [ ] **Step 3: Keep delete card id params and add shared filter params**

For each delete list card, keep the existing id-specific params first and replace the duplicated `name`, `keyword`, `query`, and `title` entries with:

```ts
      ...resourceListFilterParams,
```

Apply this to these cards:

- `data.datasource_delete`
- `data.table_delete`
- `knowledge.folder_delete`
- `knowledge.file_delete`
- `schedule.delete`
- `workflow.delete`
- `template.delete`

`template.open` already has template id params and query-like params. Keep its id-specific params and use `...resourceListFilterParams` for the query-like params.

- [ ] **Step 4: Export all catalog definitions**

At the end of the public API section in `backend/src/infrastructure/tools/uiActionCardCatalog.ts`, after `getCardDefinition`, add:

```ts
/**
 * Return every UI action card definition in catalog order.
 */
export function getAllCardDefinitions(): readonly UiActionCardDefinition[] {
  return catalog;
}
```

- [ ] **Step 5: Update the tool params schema description**

In `backend/src/infrastructure/tools/showUiActionCardTool.ts`, replace the `params` property description with:

```ts
        description:
          'Key-value pairs for the card parameters. Sensitive values are automatically masked. For resource_list cards, pass clear user filter text as params.query to prefill the card search box.',
```

- [ ] **Step 6: Run the tool tests**

Run:

```bash
cd backend && pnpm vitest run tests/infrastructure/tools/showUiActionCardTool.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit implementation**

```bash
git add backend/src/infrastructure/tools/showUiActionCardTool.ts backend/src/infrastructure/tools/uiActionCardCatalog.ts backend/tests/infrastructure/tools/showUiActionCardTool.test.ts
git commit -m "fix(tools): advertise resource list query prefill"
```

---

### Task 5: Run Focused Backend Verification

**Files:**
- Test: `backend/tests/agent/corePrompt-action-cards.test.ts`
- Test: `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts`

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd backend && pnpm vitest run tests/agent/corePrompt-action-cards.test.ts tests/infrastructure/tools/showUiActionCardTool.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run backend preflight**

Run:

```bash
cd backend && pnpm run preflight
```

Expected: PASS.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional committed changes are present. No untracked generated artifacts should remain.

---

## Self-Review

Spec coverage:

- CoreAgent prompt keyword rule: Tasks 1 and 2.
- Tool schema contract: Tasks 3 and 4.
- Catalog optional query hints for every resource list card: Tasks 3 and 4.
- Existing frontend `defaultQuery` consumption remains unchanged: File Structure and Task 5 focused backend verification.
- Error handling and destructive-card rules remain existing behavior: Task 2 only adds a list keyword rule and preserves current destructive action guidance.

Placeholder scan:

- The plan contains no unresolved placeholder markers, incomplete sections, or unspecified test commands.
- Each code-changing step includes concrete code or exact text to insert.

Type consistency:

- `params.query`, `defaultQuery`, `presentationMode`, `resource_list`, `UiActionCardDefinition`, and `UiActionCardPayload` match existing backend types.
- `getAllCardDefinitions()` is introduced before tests rely on it passing.
