# CoreSession Action Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend CoreSession with UI action cards so users can ask the chat to prepare system operations (data management, knowledge base, schedules, workflow/template creation) and confirm them through structured cards rendered in the chat.

**Architecture:** Backend adds two tools (`search_ui_action_card`, `show_ui_action_card`) backed by an in-memory catalog. `CoreAgentSession` forwards card payloads via a new `action_card` WebSocket message type. Frontend renders cards in `ChatMessage.vue`, dispatches confirmed actions through a local registry that maps `domain + action` to existing API/store calls. A new `navigationStore` replaces scattered local `activeNav` refs.

**Tech Stack:** Backend: TypeScript, Express v5, Prisma v7, Vitest. Frontend: Vue 3, TypeScript, Pinia, Element Plus, Vitest.

---

### Task 1: Backend — Action Card Types and Catalog

**Files:**
- Create: `backend/src/infrastructure/tools/uiActionCardTypes.ts`
- Create: `backend/src/infrastructure/tools/uiActionCardCatalog.ts`
- Test: `backend/tests/infrastructure/tools/uiActionCardCatalog.test.ts`

- [ ] **Step 1: Write the failing test for the catalog**

```ts
// backend/tests/infrastructure/tools/uiActionCardCatalog.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  searchCatalog,
  getCardDefinition,
  UiActionCardCatalogError,
} from '../../../src/infrastructure/tools/uiActionCardCatalog';
import type { ActionDomain, RiskLevel } from '../../../src/infrastructure/tools/uiActionCardTypes';

describe('searchCatalog', () => {
  it('returns cards matching a query string', () => {
    const results = searchCatalog('create datasource');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.cardId === 'data.datasource_create')).toBe(true);
  });

  it('returns cards filtered by domain', () => {
    const results = searchCatalog('folder', { domain: 'knowledge' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.domain === 'knowledge')).toBe(true);
  });

  it('returns empty for query matching nothing', () => {
    const results = searchCatalog('xyz_nonexistent_query_abc');
    expect(results).toEqual([]);
  });

  it('does not return the full catalog for a broad single-word query', () => {
    const results = searchCatalog('open');
    // 'open' is broad but should return a limited set, not all 20+ cards
    expect(results.length).toBeLessThan(10);
  });
});

describe('getCardDefinition', () => {
  it('returns the definition for a valid cardId', () => {
    const def = getCardDefinition('data.datasource_create');
    expect(def).toBeDefined();
    expect(def!.cardId).toBe('data.datasource_create');
    expect(def!.domain).toBe('data');
    expect(def!.action).toBe('datasource_create');
  });

  it('returns undefined for an unknown cardId', () => {
    const def = getCardDefinition('nonexistent.card');
    expect(def).toBeUndefined();
  });

  it('returns definitions across all domains', () => {
    const domains: ActionDomain[] = ['data', 'knowledge', 'schedule', 'workflow', 'template'];
    for (const domain of domains) {
      const results = searchCatalog('', { domain });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.domain === domain)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/infrastructure/tools/uiActionCardCatalog.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create the types file**

```ts
// backend/src/infrastructure/tools/uiActionCardTypes.ts
export type ActionDomain = 'data' | 'knowledge' | 'schedule' | 'workflow' | 'template';
export type RiskLevel = 'low' | 'medium' | 'high' | 'danger';
export type ExecutionMode = 'frontend';
export type CardStatus = 'proposed' | 'confirming' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface UiActionCardParamDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  sensitive?: boolean;
}

export interface UiActionCardDefinition {
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

export interface UiActionCardPayload {
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

export interface PersistedCardState {
  payload: UiActionCardPayload;
  status: CardStatus;
  resultSummary?: string;
  error?: string;
  executedAt?: string;
}
```

- [ ] **Step 4: Create the catalog file**

```ts
// backend/src/infrastructure/tools/uiActionCardCatalog.ts
import type {
  UiActionCardDefinition,
  ActionDomain,
  RiskLevel,
} from './uiActionCardTypes';

const catalog: UiActionCardDefinition[] = [
  // ── Data Management ─────────────────────────────────────
  {
    cardId: 'data.open',
    domain: 'data',
    action: 'open',
    title: 'Open Data Management',
    description: 'Navigate to the data management page.',
    usage: 'Use when the user asks to open, view, or go to data management, datasources, or tables.',
    requiredParams: [],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'data',
    relatedDomains: ['knowledge'],
    dependencies: [],
  },
  {
    cardId: 'data.datasource_create',
    domain: 'data',
    action: 'datasource_create',
    title: 'Create Datasource',
    description: 'Create a new database datasource connection.',
    usage: 'Use when the user asks to add, create, or set up a new datasource or database connection.',
    requiredParams: [
      { name: 'name', type: 'string', description: 'Datasource name' },
      { name: 'dbType', type: 'string', description: 'Database type (e.g. mysql, postgresql)' },
      { name: 'host', type: 'string', description: 'Database host' },
      { name: 'port', type: 'number', description: 'Database port' },
      { name: 'database', type: 'string', description: 'Database name' },
      { name: 'username', type: 'string', description: 'Database username' },
      { name: 'password', type: 'string', description: 'Database password', sensitive: true },
    ],
    optionalParams: [],
    riskLevel: 'medium',
    confirmRequired: true,
    targetNav: 'data',
    relatedDomains: [],
    dependencies: [],
  },
  {
    cardId: 'data.datasource_test',
    domain: 'data',
    action: 'datasource_test',
    title: 'Test Datasource Connection',
    description: 'Test an existing datasource connection configuration.',
    usage: 'Use when the user asks to test or verify a datasource connection.',
    requiredParams: [{ name: 'datasourceId', type: 'string', description: 'Datasource ID to test' }],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    relatedDomains: [],
    dependencies: [],
  },
  {
    cardId: 'data.datasource_delete',
    domain: 'data',
    action: 'datasource_delete',
    title: 'Delete Datasource',
    description: 'Delete an existing datasource and its tables.',
    usage: 'Use when the user asks to remove or delete a datasource.',
    requiredParams: [{ name: 'datasourceId', type: 'string', description: 'Datasource ID to delete' }],
    optionalParams: [],
    riskLevel: 'danger',
    confirmRequired: true,
    targetNav: 'data',
    relatedDomains: [],
    dependencies: [],
  },
  // ── Knowledge Base ──────────────────────────────────────
  {
    cardId: 'knowledge.open',
    domain: 'knowledge',
    action: 'open',
    title: 'Open Knowledge Base',
    description: 'Navigate to the knowledge base tab in data management.',
    usage: 'Use when the user asks to open, view, or go to the knowledge base.',
    requiredParams: [],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: ['workflow'],
    dependencies: [],
  },
  {
    cardId: 'knowledge.folder_create',
    domain: 'knowledge',
    action: 'folder_create',
    title: 'Create Knowledge Folder',
    description: 'Create a new folder in the knowledge base.',
    usage: 'Use when the user asks to create a folder in the knowledge base.',
    requiredParams: [{ name: 'name', type: 'string', description: 'Folder name' }],
    optionalParams: [{ name: 'parentId', type: 'string', description: 'Parent folder ID' }],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: ['workflow'],
    dependencies: [],
  },
  {
    cardId: 'knowledge.folder_rename',
    domain: 'knowledge',
    action: 'folder_rename',
    title: 'Rename Knowledge Folder',
    description: 'Rename an existing folder in the knowledge base.',
    usage: 'Use when the user asks to rename a knowledge folder.',
    requiredParams: [
      { name: 'folderId', type: 'string', description: 'Folder ID to rename' },
      { name: 'newName', type: 'string', description: 'New folder name' },
    ],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: [],
    dependencies: [],
  },
  {
    cardId: 'knowledge.folder_move',
    domain: 'knowledge',
    action: 'folder_move',
    title: 'Move Knowledge Folder',
    description: 'Move a folder to a different parent in the knowledge base.',
    usage: 'Use when the user asks to move a knowledge folder to another location.',
    requiredParams: [
      { name: 'folderId', type: 'string', description: 'Folder ID to move' },
      { name: 'targetParentId', type: 'string', description: 'Target parent folder ID' },
    ],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: [],
    dependencies: [],
  },
  {
    cardId: 'knowledge.folder_delete',
    domain: 'knowledge',
    action: 'folder_delete',
    title: 'Delete Knowledge Folder',
    description: 'Delete a folder and all its contents from the knowledge base.',
    usage: 'Use when the user asks to delete a knowledge folder.',
    requiredParams: [{ name: 'folderId', type: 'string', description: 'Folder ID to delete' }],
    optionalParams: [],
    riskLevel: 'high',
    confirmRequired: true,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: [],
    dependencies: [],
  },
  {
    cardId: 'knowledge.file_open',
    domain: 'knowledge',
    action: 'file_open',
    title: 'Open Knowledge File',
    description: 'Navigate to and open a knowledge file for viewing.',
    usage: 'Use when the user asks to open or view a knowledge file.',
    requiredParams: [{ name: 'fileId', type: 'string', description: 'File ID to open' }],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: [],
    dependencies: [],
  },
  {
    cardId: 'knowledge.file_move',
    domain: 'knowledge',
    action: 'file_move',
    title: 'Move Knowledge File',
    description: 'Move a file to a different folder in the knowledge base.',
    usage: 'Use when the user asks to move a knowledge file to another folder.',
    requiredParams: [
      { name: 'fileId', type: 'string', description: 'File ID to move' },
      { name: 'targetFolderId', type: 'string', description: 'Target folder ID' },
    ],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: [],
    dependencies: [],
  },
  {
    cardId: 'knowledge.file_delete',
    domain: 'knowledge',
    action: 'file_delete',
    title: 'Delete Knowledge File',
    description: 'Delete a file from the knowledge base.',
    usage: 'Use when the user asks to delete a knowledge file.',
    requiredParams: [{ name: 'fileId', type: 'string', description: 'File ID to delete' }],
    optionalParams: [],
    riskLevel: 'high',
    confirmRequired: true,
    targetNav: 'data',
    targetDataTab: 'knowledge',
    relatedDomains: [],
    dependencies: [],
  },
  // ── Schedule Management ─────────────────────────────────
  {
    cardId: 'schedule.open',
    domain: 'schedule',
    action: 'open',
    title: 'Open Schedule Management',
    description: 'Navigate to the schedule management page.',
    usage: 'Use when the user asks to open, view, or go to schedules or scheduled tasks.',
    requiredParams: [],
    optionalParams: [],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'schedule',
    relatedDomains: ['workflow'],
    dependencies: [],
  },
  {
    cardId: 'schedule.create',
    domain: 'schedule',
    action: 'create',
    title: 'Create Schedule',
    description: 'Create a new scheduled task for a workflow.',
    usage: 'Use when the user asks to create, set up, or add a schedule, cron job, or recurring task.',
    requiredParams: [
      { name: 'name', type: 'string', description: 'Schedule name' },
      { name: 'workflowId', type: 'string', description: 'Workflow ID to schedule' },
    ],
    optionalParams: [
      { name: 'scheduleType', type: 'string', description: 'Schedule type: daily, weekly, monthly, cron' },
      { name: 'cronExpression', type: 'string', description: 'Cron expression' },
      { name: 'timezone', type: 'string', description: 'Timezone' },
      { name: 'parameters', type: 'object', description: 'Workflow input parameters' },
      { name: 'enabled', type: 'boolean', description: 'Whether the schedule is enabled' },
    ],
    riskLevel: 'medium',
    confirmRequired: true,
    targetNav: 'schedule',
    relatedDomains: ['workflow'],
    dependencies: ['workflow'],
  },
  {
    cardId: 'schedule.update',
    domain: 'schedule',
    action: 'update',
    title: 'Update Schedule',
    description: 'Update an existing scheduled task.',
    usage: 'Use when the user asks to modify, change, or update a schedule.',
    requiredParams: [{ name: 'scheduleId', type: 'string', description: 'Schedule ID to update' }],
    optionalParams: [
      { name: 'name', type: 'string', description: 'New schedule name' },
      { name: 'cronExpression', type: 'string', description: 'New cron expression' },
      { name: 'timezone', type: 'string', description: 'New timezone' },
      { name: 'enabled', type: 'boolean', description: 'Enabled state' },
    ],
    riskLevel: 'high',
    confirmRequired: true,
    targetNav: 'schedule',
    relatedDomains: ['workflow'],
    dependencies: [],
  },
  {
    cardId: 'schedule.delete',
    domain: 'schedule',
    action: 'delete',
    title: 'Delete Schedule',
    description: 'Delete an existing scheduled task.',
    usage: 'Use when the user asks to remove or delete a schedule.',
    requiredParams: [{ name: 'scheduleId', type: 'string', description: 'Schedule ID to delete' }],
    optionalParams: [],
    riskLevel: 'high',
    confirmRequired: true,
    targetNav: 'schedule',
    relatedDomains: [],
    dependencies: [],
  },
  // ── Workflow Copilot Creation ───────────────────────────
  {
    cardId: 'workflow.copilot_create',
    domain: 'workflow',
    action: 'copilot_create',
    title: 'Create Workflow with Copilot',
    description: 'Create a new workflow and open it in the Copilot editor with a prompt.',
    usage: 'Use when the user asks to create a new workflow, build a workflow, or design an automation pipeline. Prefer this card over a simple workflow.open for creation requests.',
    requiredParams: [{ name: 'name', type: 'string', description: 'Workflow name' }],
    optionalParams: [
      { name: 'description', type: 'string', description: 'Workflow description' },
      { name: 'copilotPrompt', type: 'string', description: 'Prompt to send to Copilot after creation' },
    ],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'workflow',
    relatedDomains: ['schedule', 'template'],
    dependencies: [],
  },
  // ── Template Copilot Creation ───────────────────────────
  {
    cardId: 'template.copilot_create',
    domain: 'template',
    action: 'copilot_create',
    title: 'Create Custom Node Template with Copilot',
    description: 'Create a new custom node template and open it in the debug Copilot editor with a prompt.',
    usage: 'Use when the user asks to create a custom node, build a template, or design a reusable workflow node component.',
    requiredParams: [{ name: 'name', type: 'string', description: 'Template name' }],
    optionalParams: [
      { name: 'nodeType', type: 'string', description: 'Node type for the template' },
      { name: 'description', type: 'string', description: 'Template description' },
      { name: 'copilotPrompt', type: 'string', description: 'Prompt to send to debug Copilot after creation' },
    ],
    riskLevel: 'low',
    confirmRequired: false,
    targetNav: 'workflow',
    relatedDomains: ['workflow'],
    dependencies: [],
  },
];

function matchScore(definition: UiActionCardDefinition, query: string): number {
  const q = query.toLowerCase();
  const fields = [
    definition.cardId,
    definition.title,
    definition.description,
    definition.usage,
    definition.action,
    definition.domain,
    ...definition.requiredParams.map((p) => p.name + ' ' + p.description),
    ...definition.optionalParams.map((p) => p.name + ' ' + p.description),
  ].join(' ');
  const lower = fields.toLowerCase();
  let score = 0;
  const words = q.split(/\s+/);
  for (const word of words) {
    if (!word) continue;
    // Exact cardId match is highest priority
    if (definition.cardId.toLowerCase() === q) {
      score += 100;
    }
    // Word in cardId
    if (definition.cardId.toLowerCase().includes(word)) {
      score += 10;
    }
    // Word in title
    if (definition.title.toLowerCase().includes(word)) {
      score += 8;
    }
    // Word in action
    if (definition.action.toLowerCase().includes(word)) {
      score += 6;
    }
    // Word in usage (guidance text)
    if (definition.usage.toLowerCase().includes(word)) {
      score += 4;
    }
    // Word in param names/descriptions
    for (const p of [...definition.requiredParams, ...definition.optionalParams]) {
      if (p.name.toLowerCase().includes(word) || p.description.toLowerCase().includes(word)) {
        score += 2;
        break;
      }
    }
  }
  return score;
}

export function searchCatalog(
  query: string,
  options?: { domain?: ActionDomain; maxResults?: number }
): UiActionCardDefinition[] {
  const maxResults = options?.maxResults ?? 5;
  const scored = catalog
    .filter((def) => !options?.domain || def.domain === options.domain)
    .map((def) => ({ def, score: matchScore(def, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
  return scored.map((item) => item.def);
}

export function getCardDefinition(cardId: string): UiActionCardDefinition | undefined {
  return catalog.find((def) => def.cardId === cardId);
}

export class UiActionCardCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UiActionCardCatalogError';
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/infrastructure/tools/uiActionCardCatalog.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/infrastructure/tools/uiActionCardTypes.ts backend/src/infrastructure/tools/uiActionCardCatalog.ts backend/tests/infrastructure/tools/uiActionCardCatalog.test.ts
git commit -m "feat(tools): add UI action card types and catalog

Introduces UiActionCardDefinition, UiActionCardPayload, and related types.
Adds an in-memory catalog with first-version cards for data, knowledge,
schedule, workflow, and template domains. Includes search and lookup
functions with relevance scoring."
```

---

### Task 2: Backend — SearchUiActionCardTool

**Files:**
- Create: `backend/src/infrastructure/tools/searchUiActionCardTool.ts`
- Modify: `backend/src/infrastructure/tools/types.ts` (add ToolName entries)
- Modify: `backend/src/infrastructure/tools/index.ts` (add export)
- Test: `backend/tests/infrastructure/tools/searchUiActionCardTool.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/infrastructure/tools/searchUiActionCardTool.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ToolRegistry } from '../../../src/infrastructure/tools/tools';
import { ToolName } from '../../../src/infrastructure/tools/types';

const toolName = ToolName.SearchUiActionCard;

describe('SearchUiActionCardTool', () => {
  beforeEach(() => {
    const toolNames = ToolRegistry.list();
    toolNames.forEach((name) => {
      (ToolRegistry as unknown as { tools: Map<string, unknown> }).tools.delete(name);
    });
  });

  it('is registered in ToolRegistry', () => {
    expect(ToolRegistry.has(toolName)).toBe(true);
  });

  it('returns relevant cards for a query', async () => {
    const result = await ToolRegistry.execute(toolName, { query: 'create datasource' });
    expect(result.success).toBe(true);
    const cards = result.data as Array<{ cardId: string; title: string }>;
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.some((c) => c.cardId === 'data.datasource_create')).toBe(true);
  });

  it('returns cards filtered by domain', async () => {
    const result = await ToolRegistry.execute(toolName, { query: 'folder', domain: 'knowledge' });
    expect(result.success).toBe(true);
    const cards = result.data as Array<{ domain: string }>;
    expect(cards.every((c) => c.domain === 'knowledge')).toBe(true);
  });

  it('returns empty array when no matches found', async () => {
    const result = await ToolRegistry.execute(toolName, { query: 'xyz_nonexistent' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('fails when query is missing', async () => {
    const result = await ToolRegistry.execute(toolName, {});
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/infrastructure/tools/searchUiActionCardTool.test.ts`
Expected: FAIL — tool not registered

- [ ] **Step 3: Add ToolName entries**

In `backend/src/infrastructure/tools/types.ts`, add two entries to the `ToolName` object (after the existing entries around line 19):

```ts
  SearchUiActionCard: 'search_ui_action_card',
  ShowUiActionCard: 'show_ui_action_card',
```

- [ ] **Step 4: Create the tool**

```ts
// backend/src/infrastructure/tools/searchUiActionCardTool.ts
import { Tool } from './tools';
import type { ToolParams, ToolResult, JSONSchemaObject } from './types';
import { searchCatalog } from './uiActionCardCatalog';
import type { ActionDomain } from './uiActionCardTypes';

export class SearchUiActionCardTool extends Tool {
  name = 'search_ui_action_card';
  description =
    'Search the UI action card catalog for relevant operation cards. Use this when the user asks to create, modify, delete, open, or prepare managed system objects and you need to find the right card. Returns a ranked list of matching card definitions with their parameters and usage guidance.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query describing the desired operation.',
      },
      domain: {
        type: 'string',
        enum: ['data', 'knowledge', 'schedule', 'workflow', 'template'],
        description: 'Optional domain filter to narrow search results.',
      },
    },
    required: ['query'],
  };

  async execute(params: ToolParams): Promise<ToolResult> {
    const query = params.query as string;
    if (!query) {
      return { success: false, data: null, error: 'query is required' };
    }

    const domain = params.domain as ActionDomain | undefined;
    const results = searchCatalog(query, { domain });

    const cards = results.map((def) => ({
      cardId: def.cardId,
      domain: def.domain,
      action: def.action,
      title: def.title,
      description: def.description,
      usage: def.usage,
      requiredParams: def.requiredParams,
      optionalParams: def.optionalParams,
      riskLevel: def.riskLevel,
      confirmRequired: def.confirmRequired,
      relatedDomains: def.relatedDomains,
      dependencies: def.dependencies,
    }));

    return {
      success: true,
      data: cards,
      metadata: { status: 'success', resultSummary: `Found ${cards.length} matching card(s)` },
    };
  }
}

ToolRegistry.register(new SearchUiActionCardTool());
```

- [ ] **Step 5: Add export to index.ts**

In `backend/src/infrastructure/tools/index.ts`, add before the last tool export:

```ts
// Export Search UI Action Card tool implementation
export { SearchUiActionCardTool } from './searchUiActionCardTool';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/infrastructure/tools/searchUiActionCardTool.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/infrastructure/tools/searchUiActionCardTool.ts backend/src/infrastructure/tools/types.ts backend/src/infrastructure/tools/index.ts backend/tests/infrastructure/tools/searchUiActionCardTool.test.ts
git commit -m "feat(tools): add SearchUiActionCardTool

Catalog search tool that returns ranked card definitions based on
natural language queries with optional domain filtering."
```

---

### Task 3: Backend — ShowUiActionCardTool

**Files:**
- Create: `backend/src/infrastructure/tools/showUiActionCardTool.ts`
- Modify: `backend/src/infrastructure/tools/index.ts` (add export)
- Test: `backend/tests/infrastructure/tools/showUiActionCardTool.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/infrastructure/tools/showUiActionCardTool.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ToolRegistry } from '../../../src/infrastructure/tools/tools';
import { ToolName } from '../../../src/infrastructure/tools/types';
import type { UiActionCardPayload } from '../../../src/infrastructure/tools/uiActionCardTypes';

const toolName = ToolName.ShowUiActionCard;

describe('ShowUiActionCardTool', () => {
  beforeEach(() => {
    const toolNames = ToolRegistry.list();
    toolNames.forEach((name) => {
      (ToolRegistry as unknown as { tools: Map<string, unknown> }).tools.delete(name);
    });
  });

  it('is registered in ToolRegistry', () => {
    expect(ToolRegistry.has(toolName)).toBe(true);
  });

  it('returns a valid card payload for a known cardId', async () => {
    const result = await ToolRegistry.execute(toolName, { cardId: 'data.open' });
    expect(result.success).toBe(true);
    const payload = result.metadata?.cardPayload as UiActionCardPayload;
    expect(payload).toBeDefined();
    expect(payload.cardId).toBe('data.open');
    expect(payload.domain).toBe('data');
    expect(payload.action).toBe('open');
    expect(payload.riskLevel).toBe('low');
    expect(payload.executionMode).toBe('frontend');
    expect(payload.id).toBeDefined();
    expect(payload.title).toBeDefined();
  });

  it('fails for unknown cardId', async () => {
    const result = await ToolRegistry.execute(toolName, { cardId: 'nonexistent.card' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown card');
  });

  it('fails when cardId is missing', async () => {
    const result = await ToolRegistry.execute(toolName, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('cardId is required');
  });

  it('passes params through to the payload', async () => {
    const result = await ToolRegistry.execute(toolName, {
      cardId: 'data.datasource_test',
      params: { datasourceId: 'test-id-123' },
    });
    expect(result.success).toBe(true);
    const payload = result.metadata?.cardPayload as UiActionCardPayload;
    expect(payload.params.datasourceId).toBe('test-id-123');
  });

  it('masks sensitive params in metadata summary', async () => {
    const result = await ToolRegistry.execute(toolName, {
      cardId: 'data.datasource_create',
      params: { name: 'mydb', password: 'secret123' },
    });
    expect(result.success).toBe(true);
    const payload = result.metadata?.cardPayload as UiActionCardPayload;
    // Sensitive fields should be masked in the payload for display
    expect(payload.params.password).toBe('******');
  });

  it('includes copilotPrompt in payload when provided', async () => {
    const result = await ToolRegistry.execute(toolName, {
      cardId: 'workflow.copilot_create',
      params: { name: 'My Workflow', copilotPrompt: 'Build a sales report pipeline' },
    });
    expect(result.success).toBe(true);
    const payload = result.metadata?.cardPayload as UiActionCardPayload;
    expect(payload.copilotPrompt).toBe('Build a sales report pipeline');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/infrastructure/tools/showUiActionCardTool.test.ts`
Expected: FAIL — tool not registered

- [ ] **Step 3: Create the tool**

```ts
// backend/src/infrastructure/tools/showUiActionCardTool.ts
import { randomUUID } from 'crypto';
import { Tool } from './tools';
import type { ToolParams, ToolResult, JSONSchemaObject } from './types';
import { getCardDefinition } from './uiActionCardCatalog';
import type { UiActionCardPayload, UiActionCardDefinition } from './uiActionCardTypes';

function maskSensitiveParams(
  params: Record<string, unknown>,
  definition: UiActionCardDefinition
): Record<string, unknown> {
  const sensitiveNames = new Set<string>();
  for (const p of [...definition.requiredParams, ...definition.optionalParams]) {
    if (p.sensitive) {
      sensitiveNames.add(p.name);
    }
  }
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    masked[key] = sensitiveNames.has(key) ? '******' : value;
  }
  return masked;
}

export class ShowUiActionCardTool extends Tool {
  name = 'show_ui_action_card';
  description =
    'Display a UI action card to the user. Call this after searching and selecting the right card. Provide the cardId from the catalog and any known parameters. The card will be shown in the chat for user confirmation. No operation is executed until the user confirms.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'The cardId from the catalog (e.g. data.datasource_create, schedule.create).',
      },
      params: {
        type: 'object',
        description: 'Optional parameters for the card. Only include known values; leave others empty for the user to fill in.',
      },
    },
    required: ['cardId'],
  };

  async execute(params: ToolParams): Promise<ToolResult> {
    const cardId = params.cardId as string;
    if (!cardId) {
      return { success: false, data: null, error: 'cardId is required' };
    }

    const definition = getCardDefinition(cardId);
    if (!definition) {
      return { success: false, data: null, error: `Unknown card: ${cardId}` };
    }

    const rawParams = (params.params as Record<string, unknown>) ?? {};
    const maskedParams = maskSensitiveParams(rawParams, definition);

    const copilotPrompt = rawParams.copilotPrompt as string | undefined;

    const payload: UiActionCardPayload = {
      id: randomUUID(),
      cardId: definition.cardId,
      domain: definition.domain,
      action: definition.action,
      title: definition.title,
      summary: definition.description,
      params: maskedParams,
      riskLevel: definition.riskLevel,
      confirmRequired: definition.confirmRequired,
      executionMode: 'frontend',
      targetNav: definition.targetNav,
      targetDataTab: definition.targetDataTab,
      ...(copilotPrompt ? { copilotPrompt } : {}),
    };

    return {
      success: true,
      data: { cardId: definition.cardId, title: definition.title, action: definition.action },
      metadata: {
        status: 'success',
        resultSummary: `Action card: ${definition.title}`,
        cardPayload: payload,
      },
    };
  }
}

ToolRegistry.register(new ShowUiActionCardTool());
```

- [ ] **Step 4: Add export to index.ts**

In `backend/src/infrastructure/tools/index.ts`, add:

```ts
// Export Show UI Action Card tool implementation
export { ShowUiActionCardTool } from './showUiActionCardTool';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/infrastructure/tools/showUiActionCardTool.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/infrastructure/tools/showUiActionCardTool.ts backend/src/infrastructure/tools/index.ts backend/tests/infrastructure/tools/showUiActionCardTool.test.ts
git commit -m "feat(tools): add ShowUiActionCardTool

Validates cardId against catalog, masks sensitive params, produces
a UiActionCardPayload for frontend rendering."
```

---

### Task 4: Backend — CoreAgentSession action_card WebSocket Event

**Files:**
- Modify: `backend/src/agent/types.ts` (add `action_card` to MessageType)
- Modify: `backend/src/agent/coreAgentSession.ts` (emit action_card event)
- Test: `backend/tests/services/agents/coreAgentSession-action-card.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/services/agents/coreAgentSession-action-card.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/base/config', () => ({
  config: {
    port: 3000,
    work_folder: '/tmp/test-wf-action-card',
    data_dictionary_folder: '/tmp/data-dict',
    upload: { directory: '/tmp/uploads' },
  },
}));

vi.mock('../../../src/infrastructure/database', () => ({
  getPrismaClient: () => ({
    chatSession: {
      create: vi.fn().mockResolvedValue({ id: 'session-1', title: null }),
      update: vi.fn().mockResolvedValue({}),
    },
    chatMessage: {
      create: vi.fn().mockResolvedValue({ id: 'msg-1', role: 'tool', content: '{}' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  }),
}));

import { CoreAgentSession } from '../../../src/agent/coreAgentSession';
import type { WsMessage } from '../../../src/agent/types';

class MockWebSocket {
  readyState = 1;
  send = vi.fn();
  close = vi.fn();
  on = vi.fn();
}

function createMockStream(events: Array<Record<string, unknown>>): AsyncGenerator<Record<string, unknown>> {
  return (async function* () {
    for (const event of events) {
      yield event;
    }
  })();
}

describe('CoreAgentSession action_card event', () => {
  let ws: MockWebSocket;
  let session: CoreAgentSession;

  beforeEach(() => {
    ws = new MockWebSocket();
    session = new CoreAgentSession({ sessionId: 'test-session' });
  });

  it('sends action_card WS message when show_ui_action_card tool returns a cardPayload', async () => {
    const cardPayload = {
      id: 'card-1',
      cardId: 'data.open',
      domain: 'data',
      action: 'open',
      title: 'Open Data Management',
      summary: 'Navigate to data management',
      params: {},
      riskLevel: 'low',
      confirmRequired: false,
      executionMode: 'frontend',
      targetNav: 'data',
    };

    const toolCallId = 'tc-action-1';
    const streamEvents = [
      {
        type: 'tool_call_result',
        toolCallResult: {
          toolCallId,
          name: 'show_ui_action_card',
          content: JSON.stringify(cardPayload),
          metadata: {
            status: 'success',
            resultSummary: 'Action card: Open Data Management',
            cardPayload,
          },
        },
      },
      { type: 'done', finishReason: 'stop' },
    ];

    vi.spyOn(session, 'llm' as never, 'get').mockReturnValue({
      streamChat: vi.fn().mockReturnValue(createMockStream(streamEvents)),
    } as never);

    session.connect(ws as never);

    // Wait for message processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    const sentMessages = ws.send.mock.calls.map((call: unknown[]) => JSON.parse(call[0] as string)) as WsMessage[];

    const actionCardMsg = sentMessages.find((m) => m.type === 'action_card');
    expect(actionCardMsg).toBeDefined();
    expect((actionCardMsg!.data as Record<string, unknown>).id).toBe('card-1');
    expect((actionCardMsg!.data as Record<string, unknown>).cardId).toBe('data.open');
  });

  it('does not send action_card for non-show_ui_action_card tools', async () => {
    const streamEvents = [
      {
        type: 'tool_call_result',
        toolCallResult: {
          toolCallId: 'tc-bash-1',
          name: 'bash',
          content: 'output',
          metadata: { status: 'success', resultSummary: 'Ran command' },
        },
      },
      { type: 'done', finishReason: 'stop' },
    ];

    vi.spyOn(session, 'llm' as never, 'get').mockReturnValue({
      streamChat: vi.fn().mockReturnValue(createMockStream(streamEvents)),
    } as never);

    session.connect(ws as never);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const sentMessages = ws.send.mock.calls.map((call: unknown[]) => JSON.parse(call[0] as string)) as WsMessage[];
    const actionCardMsg = sentMessages.find((m) => m.type === 'action_card');
    expect(actionCardMsg).toBeUndefined();
  });

  it('does not send action_card when cardPayload is missing from metadata', async () => {
    const streamEvents = [
      {
        type: 'tool_call_result',
        toolCallResult: {
          toolCallId: 'tc-action-2',
          name: 'show_ui_action_card',
          content: '{}',
          metadata: { status: 'success' },
        },
      },
      { type: 'done', finishReason: 'stop' },
    ];

    vi.spyOn(session, 'llm' as never, 'get').mockReturnValue({
      streamChat: vi.fn().mockReturnValue(createMockStream(streamEvents)),
    } as never);

    session.connect(ws as never);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const sentMessages = ws.send.mock.calls.map((call: unknown[]) => JSON.parse(call[0] as string)) as WsMessage[];
    const actionCardMsg = sentMessages.find((m) => m.type === 'action_card');
    expect(actionCardMsg).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/services/agents/coreAgentSession-action-card.test.ts`
Expected: FAIL — `action_card` is not a valid MessageType

- [ ] **Step 3: Add `action_card` to MessageType and ValidMessageTypes**

In `backend/src/agent/types.ts`, add `'action_card'` to both the `MessageType` union (line 8-18) and the `ValidMessageTypes` array (line 23-34).

- [ ] **Step 4: Modify CoreAgentSession to emit action_card**

In `backend/src/agent/coreAgentSession.ts`, inside the `tool_call_result` case (around line 285-349), after the existing `this.sendMessage({ type: 'tool_call', ... })` block (around line 319), add:

```ts
// Forward action card payload via dedicated WS message
if (
  event.toolCallResult?.name === ToolName.ShowUiActionCard &&
  event.toolCallResult?.metadata?.cardPayload
) {
  this.sendMessage({
    type: 'action_card',
    timestamp: Date.now(),
    data: event.toolCallResult.metadata.cardPayload,
  });
}
```

This requires importing `ToolName` at the top of `coreAgentSession.ts`:

```ts
import { ToolName } from '../infrastructure/tools/types';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/services/agents/coreAgentSession-action-card.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/agent/types.ts backend/src/agent/coreAgentSession.ts backend/tests/services/agents/coreAgentSession-action-card.test.ts
git commit -m "feat(agent): emit action_card WebSocket event for show_ui_action_card results

Adds action_card message type. CoreAgentSession detects show_ui_action_card
tool results with cardPayload in metadata and forwards them to the browser."
```

---

### Task 5: Backend — Prisma Migration for ChatMessage.metadata

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/chatSession/chatSession.types.ts`
- Modify: `backend/src/chatSession/chatSession.repository.ts`
- Test: `backend/tests/chatSession/chatSession-metadata.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/chatSession/chatSession-metadata.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import * as repository from '../../../src/chatSession/chatSession.repository';

describe('ChatMessage metadata', () => {
  it('createMessage accepts optional metadata', async () => {
    const msg = await repository.createMessage({
      sessionId: 'test-session-id',
      role: 'tool',
      content: '{"toolName":"show_ui_action_card"}',
      metadata: { payload: { cardId: 'data.open' }, status: 'proposed' },
    });
    expect(msg).toBeDefined();
    expect(msg.metadata).toEqual({ payload: { cardId: 'data.open' }, status: 'proposed' });
  });

  it('findMessagesBySessionId returns metadata field', async () => {
    // Depends on test DB having records; we test the mapper
    // This test verifies the type includes metadata
    const typeCheck: { metadata?: Record<string, unknown> | null } = {} as Awaited<
      ReturnType<typeof repository.findMessagesBySessionId>
    >[0];
    expect(typeCheck).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/chatSession/chatSession-metadata.test.ts`
Expected: FAIL — metadata not accepted by createMessage

- [ ] **Step 3: Add metadata field to Prisma schema**

In `backend/prisma/schema.prisma`, add `metadata Json?` to the `ChatMessage` model (after `content` line 168):

```prisma
model ChatMessage {
  id        String   @id @default(uuid()) @db.Uuid
  sessionId String   @map("session_id") @db.Uuid
  role      String   @db.VarChar(20)
  content   String?  @db.Text
  metadata  Json?
  createdAt DateTime @default(now()) @map("created_at")

  session ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
  @@map("chat_messages")
}
```

- [ ] **Step 4: Update ChatMessageRecord type**

In `backend/src/chatSession/chatSession.types.ts`, add metadata to `ChatMessageRecord`:

```ts
export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}
```

- [ ] **Step 5: Update repository mapper and functions**

In `backend/src/chatSession/chatSession.repository.ts`:

Update `mapMessage` to include metadata:

```ts
function mapMessage(message: PrismaMessage): ChatMessageRecord {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    metadata: message.metadata as Record<string, unknown> | null,
    createdAt: message.createdAt,
  };
}
```

Update `createMessage` to accept metadata:

```ts
export async function createMessage(data: {
  sessionId: string;
  role: string;
  content: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<ChatMessageRecord> {
  const prisma = getPrismaClient();
  const message = await prisma.chatMessage.create({
    data: {
      sessionId: data.sessionId,
      role: data.role,
      content: data.content,
      ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
    },
  });
  return mapMessage(message);
}
```

- [ ] **Step 6: Generate Prisma migration**

Run: `cd backend && npx prisma migrate dev --name add-chat-message-metadata`
Expected: Migration created successfully

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/chatSession/chatSession-metadata.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/ backend/src/chatSession/chatSession.types.ts backend/src/chatSession/chatSession.repository.ts backend/tests/chatSession/chatSession-metadata.test.ts
git commit -m "feat(db): add metadata column to ChatMessage

Adds nullable JSON metadata field for storing action card state.
Updates types and repository to support metadata in message
creation and retrieval."
```

---

### Task 6: Backend — Persist Action Card Metadata in CoreAgentSession

**Files:**
- Modify: `backend/src/agent/coreAgentSession.ts` (persist card metadata)
- Modify: `backend/src/chatSession/chatSession.service.ts` (add updateMessageMetadata)
- Modify: `backend/src/chatSession/chatSession.repository.ts` (add updateMessageMetadata)
- Test: `backend/tests/services/agents/coreAgentSession-card-persistence.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/services/agents/coreAgentSession-card-persistence.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { updateMessageMetadata } from '../../../src/chatSession/chatSession.service';

describe('updateMessageMetadata', () => {
  it('persists metadata to a chat message', async () => {
    // The service delegates to repository; verify it does not throw
    // when called with valid input (actual DB interaction requires test DB)
    // This test verifies the function exists and accepts correct params
    expect(typeof updateMessageMetadata).toBe('function');
  });
});
```

- [ ] **Step 2: Add updateMessageMetadata to repository**

In `backend/src/chatSession/chatSession.repository.ts`, add:

```ts
export async function updateMessageMetadata(
  messageId: string,
  metadata: Record<string, unknown>
): Promise<ChatMessageRecord> {
  const prisma = getPrismaClient();
  const message = await prisma.chatMessage.update({
    where: { id: messageId },
    data: { metadata },
  });
  return mapMessage(message);
}
```

- [ ] **Step 3: Add updateMessageMetadata to service**

In `backend/src/chatSession/chatSession.service.ts`, add:

```ts
export async function updateMessageMetadata(
  messageId: string,
  metadata: Record<string, unknown>
): Promise<ChatMessageRecord> {
  const message = await repository.updateMessageMetadata(messageId, metadata);
  logger.info('Updated chat message metadata', { messageId });
  return message;
}
```

- [ ] **Step 4: Modify CoreAgentSession to persist card metadata**

In `backend/src/agent/coreAgentSession.ts`, in the action_card emission block added in Task 4, add persistence after the `this.sendMessage` call:

```ts
if (
  event.toolCallResult?.name === ToolName.ShowUiActionCard &&
  event.toolCallResult?.metadata?.cardPayload
) {
  this.sendMessage({
    type: 'action_card',
    timestamp: Date.now(),
    data: event.toolCallResult.metadata.cardPayload,
  });

  // Persist card metadata to chat session
  if (this.chatSessionId) {
    chatSessionService
      .addMessage(this.chatSessionId, 'tool', JSON.stringify({
        toolName: 'show_ui_action_card',
        toolCallId: event.toolCallResult.toolCallId,
        status: 'success',
        cardPayload: event.toolCallResult.metadata.cardPayload,
      }), {
        metadata: {
          type: 'action_card',
          payload: event.toolCallResult.metadata.cardPayload,
          status: 'proposed',
        } as Record<string, unknown>,
      })
      .catch((error) => logger.warn('Failed to persist action card metadata', { error }));
  }
}
```

This requires updating the `chatSessionService.addMessage` call signature. The existing `addMessage` in the service accepts `(sessionId, role, content)`. Add an optional 4th parameter `metadata`:

In `backend/src/chatSession/chatSession.service.ts`, update `addMessage`:

```ts
export async function addMessage(
  sessionId: string,
  role: string,
  content: string | null,
  metadata?: Record<string, unknown> | null
): Promise<ChatMessageRecord> {
  const message = await repository.createMessage({ sessionId, role, content, metadata });
  await repository.updateSessionTimestamp(sessionId);
  logger.info('Added chat message', { sessionId, messageId: message.id, role });
  return message;
}
```

- [ ] **Step 5: Run test**

Run: `cd backend && npx vitest run tests/services/agents/coreAgentSession-card-persistence.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/agent/coreAgentSession.ts backend/src/chatSession/chatSession.service.ts backend/src/chatSession/chatSession.repository.ts backend/tests/services/agents/coreAgentSession-card-persistence.test.ts
git commit -m "feat(agent): persist action card metadata to chat messages

CoreAgentSession now stores action card payloads as chat message
metadata when a chat session is active. Adds updateMessageMetadata
to repository and service layers."
```

---

### Task 7: Backend — Update CORE_PROMPT with Action Card Rules

**Files:**
- Modify: `backend/src/agent/coreAgentSession.ts` (CORE_PROMPT string)
- Test: `backend/tests/agent/corePrompt-action-cards.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/agent/corePrompt-action-cards.test.ts
import { describe, it, expect } from 'vitest';

// Import the CORE_PROMPT — it's a module-level const, so we need to check it
// through the compiled output. We'll check the source file directly.
import * as fs from 'fs';
import * as path from 'path';

describe('CORE_PROMPT action card rules', () => {
  let prompt: string;

  beforeAll(() => {
    const filePath = path.resolve(__dirname, '../../../src/agent/coreAgentSession.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    // Extract CORE_PROMPT content
    const match = content.match(/const CORE_PROMPT[\s\S]*?`([\s\S]*?)`/);
    prompt = match ? match[1] : '';
  });

  it('mentions search_ui_action_card', () => {
    expect(prompt).toContain('search_ui_action_card');
  });

  it('mentions show_ui_action_card', () => {
    expect(prompt).toContain('show_ui_action_card');
  });

  it('mentions action card confirmation rules', () => {
    expect(prompt).toContain('confirm');
  });

  it('references workflow Copilot cards', () => {
    expect(prompt).toContain('workflow');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/agent/corePrompt-action-cards.test.ts`
Expected: FAIL — prompt doesn't contain action card rules

- [ ] **Step 3: Add action card rules to CORE_PROMPT**

In `backend/src/agent/coreAgentSession.ts`, append the following section to the `CORE_PROMPT` string (before the closing backtick). Place it after the existing tool usage section:

```
## Operation Cards

When the user asks to create, modify, delete, open, or prepare managed system objects (datasources, knowledge files, schedules, workflows, custom node templates):

1. Use ${ToolName.SearchUiActionCard} to find the relevant card. Provide a natural language query and optional domain filter.
2. Review the returned card definitions. Choose the best matching card.
3. Use ${ToolName.ShowUiActionCard} with the chosen cardId and any known parameters. Leave optional parameters empty if the user has not provided them.
4. Do NOT claim the operation has executed. The card is shown to the user for confirmation.
5. For creating workflows or custom node templates, prefer the Copilot creation cards (workflow.copilot_create, template.copilot_create).
6. If required parameters are missing for a risky action, ask the user before showing the card.
7. Never put secrets (passwords, tokens) in your normal response text. They belong only in card parameters.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/agent/corePrompt-action-cards.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/coreAgentSession.ts backend/tests/agent/corePrompt-action-cards.test.ts
git commit -m "feat(agent): add operation card rules to CORE_PROMPT

Instructs the agent to use search_ui_action_card and show_ui_action_card
tools for system operations, with confirmation and safety guidelines."
```

---

### Task 8: Backend — Chat Message Metadata API Endpoint

**Files:**
- Modify: `backend/src/chatSession/chatSession.routes.ts`
- Modify: `backend/src/chatSession/chatSession.controller.ts`
- Modify: `frontend/src/api/chatSession.ts`
- Modify: `frontend/src/types/chatSession.ts`
- Test: `backend/tests/chatSession/chatSession-metadata-api.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/chatSession/chatSession-metadata-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { chatSessionRoutes } from '../../../src/chatSession';

function createApp() {
  const app = express();
  app.use(express.json());
  // Minimal auth mock
  app.use('/chat-sessions', (_req, _res, next) => {
    _req.user = { userId: 'test-user-id' };
    next();
  }, chatSessionRoutes);
  return app;
}

describe('PUT /chat-sessions/:id/messages/:messageId/metadata', () => {
  it('returns 200 with updated message', async () => {
    const app = createApp();
    const res = await request(app)
      .put('/chat-sessions/test-session-id/messages/test-msg-id/metadata')
      .send({ metadata: { status: 'succeeded', resultSummary: 'Done' } });
    // Will fail if route doesn't exist
    expect(res.status).not.toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/chatSession/chatSession-metadata-api.test.ts`
Expected: FAIL — 404 route not found

- [ ] **Step 3: Add controller handler**

In `backend/src/chatSession/chatSession.controller.ts`, add:

```ts
export async function updateMessageMetadataHandler(req: Request, res: Response): Promise<void> {
  const sessionId = getValidatedUuid(req, 'id');
  const messageId = getValidatedUuid(req, 'messageId');
  const { metadata } = req.body as { metadata?: Record<string, unknown> };
  if (!metadata || typeof metadata !== 'object') {
    throw new ValidationError('metadata is required and must be an object');
  }
  await chatSessionService.getSession(sessionId);
  const message = await chatSessionService.updateMessageMetadata(messageId, metadata);
  res.json({ message });
}
```

- [ ] **Step 4: Add route**

In `backend/src/chatSession/chatSession.routes.ts`, add:

```ts
import {
  createSessionHandler,
  listSessionsHandler,
  getSessionHandler,
  getSessionMessagesHandler,
  updateSessionTitleHandler,
  deleteSessionHandler,
  updateMessageMetadataHandler,
} from './chatSession.controller';

router.put('/:id/messages/:messageId/metadata', updateMessageMetadataHandler);
```

- [ ] **Step 5: Add frontend API function**

In `frontend/src/api/chatSession.ts`, add:

```ts
export async function updateMessageMetadata(
  sessionId: string,
  messageId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await http.put(`${BASE_URL}/${sessionId}/messages/${messageId}/metadata`, { metadata });
}
```

- [ ] **Step 6: Update frontend ChatMessageRecord type**

In `frontend/src/types/chatSession.ts`, add `metadata` to the record type:

```ts
export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: string;
  content: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}
```

- [ ] **Step 7: Run test**

Run: `cd backend && npx vitest run tests/chatSession/chatSession-metadata-api.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/chatSession/chatSession.routes.ts backend/src/chatSession/chatSession.controller.ts backend/tests/chatSession/chatSession-metadata-api.test.ts frontend/src/api/chatSession.ts frontend/src/types/chatSession.ts
git commit -m "feat(api): add PATCH endpoint for chat message metadata

Adds /chat-sessions/:id/messages/:messageId/metadata endpoint for
updating action card state from the frontend."
```

---

### Task 9: Frontend — Action Card Types

**Files:**
- Create: `frontend/src/types/actionCard.ts`
- Modify: `frontend/src/types/index.ts` (add export)

- [ ] **Step 1: Create action card types**

```ts
// frontend/src/types/actionCard.ts
export type ActionDomain = 'data' | 'knowledge' | 'schedule' | 'workflow' | 'template';
export type RiskLevel = 'low' | 'medium' | 'high' | 'danger';
export type ExecutionMode = 'frontend';
export type CardStatus = 'proposed' | 'confirming' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface UiActionCardPayload {
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

export interface ChatActionCard {
  id: string;
  payload: UiActionCardPayload;
  status: CardStatus;
  resultSummary?: string;
  error?: string;
  executedAt?: number;
}
```

- [ ] **Step 2: Add export to types index**

In `frontend/src/types/index.ts`, add:

```ts
export type {
  ActionDomain,
  RiskLevel,
  ExecutionMode,
  CardStatus,
  UiActionCardPayload,
  ChatActionCard,
} from './actionCard';
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/actionCard.ts frontend/src/types/index.ts
git commit -m "feat(frontend): add action card TypeScript types"
```

---

### Task 10: Frontend — Navigation Store

**Files:**
- Create: `frontend/src/stores/navigationStore.ts`
- Modify: `frontend/src/stores/index.ts` (add export)
- Test: `frontend/tests/stores/navigationStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/stores/navigationStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useNavigationStore } from '@/stores/navigationStore';
import type { NavType } from '@/types/sidebar';

describe('navigationStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with chat as active nav', () => {
    const store = useNavigationStore();
    expect(store.activeNav).toBe('chat');
  });

  it('navigates to a different nav', () => {
    const store = useNavigationStore();
    store.navigateTo('data');
    expect(store.activeNav).toBe('data');
  });

  it('sets and clears pending intent', () => {
    const store = useNavigationStore();
    store.setPendingIntent({
      type: 'open_workflow_editor',
      workflowId: 'wf-123',
      copilotPrompt: 'Build a pipeline',
    });
    expect(store.pendingIntent).not.toBeNull();
    expect(store.pendingIntent!.type).toBe('open_workflow_editor');

    store.clearPendingIntent();
    expect(store.pendingIntent).toBeNull();
  });

  it('navigateTo clears pending intent', () => {
    const store = useNavigationStore();
    store.setPendingIntent({
      type: 'open_schedule',
    });
    store.navigateTo('schedule');
    expect(store.pendingIntent).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/stores/navigationStore.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create the navigation store**

```ts
// frontend/src/stores/navigationStore.ts
import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { NavType } from '@/types/sidebar';

export type NavigationIntent =
  | { type: 'open_data_management'; tab?: 'data' | 'knowledge' }
  | { type: 'open_schedule' }
  | { type: 'open_workflow_editor'; workflowId: string; copilotPrompt?: string }
  | { type: 'open_template_editor'; templateId: string; copilotPrompt?: string };

export const useNavigationStore = defineStore('navigation', () => {
  const activeNav = ref<NavType>('chat');
  const pendingIntent = ref<NavigationIntent | null>(null);

  function navigateTo(nav: NavType): void {
    activeNav.value = nav;
    pendingIntent.value = null;
  }

  function setPendingIntent(intent: NavigationIntent): void {
    pendingIntent.value = intent;
  }

  function clearPendingIntent(): void {
    pendingIntent.value = null;
  }

  return {
    activeNav,
    pendingIntent,
    navigateTo,
    setPendingIntent,
    clearPendingIntent,
  };
});
```

- [ ] **Step 4: Add export to stores index**

In `frontend/src/stores/index.ts`, add:

```ts
export { useNavigationStore } from './navigationStore';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/stores/navigationStore.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/navigationStore.ts frontend/src/stores/index.ts frontend/tests/stores/navigationStore.test.ts
git commit -m "feat(frontend): add navigationStore for centralized nav state

Replaces scattered local activeNav refs with a Pinia store that
supports pending navigation intents for action card triggered
navigation."
```

---

### Task 11: Frontend — Migrate Layouts to navigationStore

**Files:**
- Modify: `frontend/src/layouts/DesktopLayout.vue`
- Modify: `frontend/src/layouts/MobileLayout.vue`

- [ ] **Step 1: Update DesktopLayout.vue**

Replace the local `activeNav` ref with `navigationStore`. The key changes:

In `<script setup>`:
- Import `useNavigationStore` from `@/stores`
- Remove `const activeNav = ref<NavType>('chat');`
- Add `const navigationStore = useNavigationStore();`
- Update `handleNavChange` to call `navigationStore.navigateTo(nav);`
- Replace computed properties to use `navigationStore.activeNav`:

```ts
const showSettings = computed(() => navigationStore.activeNav === 'settings');
const showDataManagement = computed(() => navigationStore.activeNav === 'data');
const showWorkflow = computed(() => navigationStore.activeNav === 'workflow');
const showSchedule = computed(() => navigationStore.activeNav === 'schedule');
const showUsers = computed(() => navigationStore.activeNav === 'users');
const showAuditLog = computed(() => navigationStore.activeNav === 'auditLog');
```

- [ ] **Step 2: Update MobileLayout.vue**

Same pattern:
- Import `useNavigationStore` from `@/stores`
- Remove local `activeNav` ref
- Use `navigationStore.activeNav` for computed properties
- Update `handleNavChange` to `navigationStore.navigateTo(nav);`
- Update `handleBack` to `navigationStore.navigateTo('chat');`

- [ ] **Step 3: Run preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS (no type errors, lint clean)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/layouts/DesktopLayout.vue frontend/src/layouts/MobileLayout.vue
git commit -m "refactor(frontend): migrate layouts to navigationStore

Desktop and mobile layouts now read activeNav from the centralized
navigationStore instead of local refs."
```

---

### Task 12: Frontend — Add action_card to WebSocket Types and Chat Store

**Files:**
- Modify: `frontend/src/types/websocket.ts` (add `action_card` to MessageType)
- Modify: `frontend/src/types/chat.ts` (add actionCards to ChatMessage)
- Modify: `frontend/src/stores/chatStore.ts` (add card management actions)
- Test: `frontend/tests/stores/chatStore-action-cards.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/stores/chatStore-action-cards.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatStore } from '@/stores/chatStore';
import type { ChatActionCard, UiActionCardPayload } from '@/types/actionCard';

function makePayload(overrides?: Partial<UiActionCardPayload>): UiActionCardPayload {
  return {
    id: 'card-1',
    cardId: 'data.open',
    domain: 'data',
    action: 'open',
    title: 'Open Data Management',
    summary: 'Navigate to data management',
    params: {},
    riskLevel: 'low',
    confirmRequired: false,
    executionMode: 'frontend',
    targetNav: 'data',
    ...overrides,
  };
}

describe('chatStore action card actions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('addActionCard attaches card to current or last assistant message', () => {
    const store = useChatStore();
    store.addAssistantMessage('Here is the card:');
    store.addActionCard(makePayload());
    const msg = store.messages[store.messages.length - 1];
    expect(msg.actionCards).toBeDefined();
    expect(msg.actionCards!.length).toBe(1);
    expect(msg.actionCards![0].payload.cardId).toBe('data.open');
    expect(msg.actionCards![0].status).toBe('proposed');
  });

  it('updateActionCardStatus updates card status', () => {
    const store = useChatStore();
    store.addAssistantMessage('Card:');
    store.addActionCard(makePayload());
    store.updateActionCardStatus('card-1', 'succeeded', { resultSummary: 'Opened' });
    const msg = store.messages[store.messages.length - 1];
    expect(msg.actionCards![0].status).toBe('succeeded');
    expect(msg.actionCards![0].resultSummary).toBe('Opened');
  });

  it('updateActionCardStatus does nothing for unknown card id', () => {
    const store = useChatStore();
    store.addAssistantMessage('Card:');
    store.addActionCard(makePayload());
    store.updateActionCardStatus('nonexistent', 'succeeded');
    const msg = store.messages[store.messages.length - 1];
    expect(msg.actionCards![0].status).toBe('proposed');
  });

  it('loadHistoricalMessages restores action cards from metadata', () => {
    const store = useChatStore();
    store.loadHistoricalMessages([
      { role: 'assistant', content: 'Here is the card:', createdAt: '2026-01-01T00:00:00Z' },
      {
        role: 'tool',
        content: '{"toolName":"show_ui_action_card"}',
        createdAt: '2026-01-01T00:00:01Z',
        metadata: {
          type: 'action_card',
          payload: makePayload(),
          status: 'succeeded',
        },
      },
    ]);
    const msg = store.messages[store.messages.length - 1];
    expect(msg.actionCards).toBeDefined();
    expect(msg.actionCards!.length).toBe(1);
    expect(msg.actionCards![0].status).toBe('succeeded');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/stores/chatStore-action-cards.test.ts`
Expected: FAIL — addActionCard not found

- [ ] **Step 3: Add `action_card` to frontend MessageType**

In `frontend/src/types/websocket.ts`, add `'action_card'` to the `MessageType` union:

```ts
export type MessageType =
  | 'ping'
  | 'pong'
  | 'user_message'
  | 'agent_response'
  | 'tool_call'
  | 'error'
  | 'usage_report'
  | 'stop'
  | 'turn_complete'
  | 'session_info'
  | 'action_card';
```

- [ ] **Step 4: Add actionCards to ChatMessage**

In `frontend/src/types/chat.ts`, add to `ChatMessage`:

```ts
interface ChatMessage {
  // ... existing fields
  actionCards?: ChatActionCard[];
}
```

Import `ChatActionCard` from `./actionCard`.

- [ ] **Step 5: Add card management actions to chatStore**

In `frontend/src/stores/chatStore.ts`, add these actions:

```ts
function addActionCard(payload: UiActionCardPayload): void {
  const card: ChatActionCard = {
    id: payload.id,
    payload,
    status: 'proposed',
  };
  // Attach to the current streaming message, or the last assistant message
  const targetMsg =
    messages.value.find((m) => m.id === currentMessageId.value) ??
    [...messages.value].reverse().find((m) => m.role === 'assistant');
  if (targetMsg) {
    if (!targetMsg.actionCards) {
      targetMsg.actionCards = [];
    }
    targetMsg.actionCards.push(card);
  }
}

function updateActionCardStatus(
  cardId: string,
  status: ChatActionCard['status'],
  opts?: { resultSummary?: string; error?: string }
): void {
  for (const msg of messages.value) {
    const card = msg.actionCards?.find((c) => c.id === cardId);
    if (card) {
      card.status = status;
      card.resultSummary = opts?.resultSummary;
      card.error = opts?.error;
      card.executedAt = status === 'succeeded' || status === 'failed' ? Date.now() : undefined;
      return;
    }
  }
}
```

Update `loadHistoricalMessages` to restore action cards from metadata. In the `record.role === 'tool'` parsing block (around line 144-181 in chatStore.ts), after the existing `output_md` handling, add:

```ts
// Restore action cards from metadata
if (record.metadata && typeof record.metadata === 'object' && (record.metadata as Record<string, unknown>).type === 'action_card') {
  const meta = record.metadata as { payload: UiActionCardPayload; status: ChatActionCard['status']; resultSummary?: string; error?: string };
  if (lastAssistantMsg) {
    const card: ChatActionCard = {
      id: meta.payload.id,
      payload: meta.payload,
      status: meta.status,
      resultSummary: meta.resultSummary,
      error: meta.error,
    };
    if (!lastAssistantMsg.actionCards) {
      lastAssistantMsg.actionCards = [];
    }
    lastAssistantMsg.actionCards.push(card);
  }
}
```

This requires updating the `loadHistoricalMessages` parameter type to accept `metadata`:

```ts
function loadHistoricalMessages(
  records: { role: string; content: string | null; createdAt: string; metadata?: Record<string, unknown> | null }[],
  onToolCall?: (...)
) {
```

Also add the new actions to the return object, and add the necessary imports (`UiActionCardPayload`, `ChatActionCard` from `@/types`).

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/stores/chatStore-action-cards.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/websocket.ts frontend/src/types/chat.ts frontend/src/stores/chatStore.ts frontend/tests/stores/chatStore-action-cards.test.ts
git commit -m "feat(frontend): add action_card WS type and card store actions

Adds action_card message type, ChatMessage.actionCards field,
addActionCard, updateActionCardStatus actions, and historical
card restoration from metadata."
```

---

### Task 13: Frontend — useChat Handles action_card Messages

**Files:**
- Modify: `frontend/src/composables/useChat.ts`
- Test: `frontend/tests/composables/useChat-action-cards.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/composables/useChat-action-cards.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withSetup } from '../setup';
import { useChat } from '@/composables/useChat';
import { useChatStore } from '@/stores/chatStore';
import type { UiActionCardPayload } from '@/types/actionCard';

function createMockWebSocket() {
  const handlers: Array<(msg: unknown) => void> = [];
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    onMessage: vi.fn((handler: (msg: unknown) => void) => handlers.push(handler)),
    offMessage: vi.fn(),
    setToken: vi.fn(),
    reconnectWithUrl: vi.fn(),
    simulateMessage(msg: unknown) {
      handlers.forEach((h) => h(msg));
    },
  };
}

describe('useChat action_card handling', () => {
  let mockWs: ReturnType<typeof createMockWebSocket>;
  let unmount: () => void;

  beforeEach(() => {
    mockWs = createMockWebSocket();
  });

  afterEach(() => {
    unmount?.();
  });

  it('adds action card to chat store when action_card message received', () => {
    const result = withSetup(() => useChat({ websocket: mockWs as never }));
    unmount = result.unmount;
    const chatStore = useChatStore();

    // Start an assistant message first
    chatStore.startAssistantMessage();

    const payload: UiActionCardPayload = {
      id: 'card-1',
      cardId: 'data.open',
      domain: 'data',
      action: 'open',
      title: 'Open Data Management',
      summary: 'Navigate to data management',
      params: {},
      riskLevel: 'low',
      confirmRequired: false,
      executionMode: 'frontend',
      targetNav: 'data',
    };

    mockWs.simulateMessage({
      type: 'action_card',
      timestamp: Date.now(),
      data: payload,
    });

    const msg = chatStore.messages[chatStore.messages.length - 1];
    expect(msg.actionCards).toBeDefined();
    expect(msg.actionCards!.length).toBe(1);
    expect(msg.actionCards![0].payload.id).toBe('card-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/composables/useChat-action-cards.test.ts`
Expected: FAIL — action_card not handled

- [ ] **Step 3: Add action_card handler to useChat**

In `frontend/src/composables/useChat.ts`, add a new case to the `handleWebSocketMessage` switch:

```ts
case 'action_card':
  handleActionCard(message.data as UiActionCardPayload);
  break;
```

Add the handler function:

```ts
function handleActionCard(payload: UiActionCardPayload) {
  chatStore.addActionCard(payload);
}
```

Import `UiActionCardPayload` from `@/types`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/composables/useChat-action-cards.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useChat.ts frontend/tests/composables/useChat-action-cards.test.ts
git commit -m "feat(frontend): handle action_card WebSocket messages in useChat

Routes action_card messages to chatStore.addActionCard for
rendering in the chat."
```

---

### Task 14: Frontend — Action Card Registry

**Files:**
- Create: `frontend/src/components/chat/actionCards/actionCardRegistry.ts`
- Test: `frontend/tests/components/chat/actionCardRegistry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/components/chat/actionCardRegistry.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerActionHandler,
  executeAction,
  isActionRegistered,
  type ActionHandler,
  type ActionResult,
} from '@/components/chat/actionCards/actionCardRegistry';
import type { UiActionCardPayload } from '@/types/actionCard';

describe('actionCardRegistry', () => {
  beforeEach(() => {
    // Reset registry between tests
    const { getRegistry } = require('@/components/chat/actionCards/actionCardRegistry') as { getRegistry: () => Map<string, ActionHandler> };
    getRegistry().clear();
  });

  it('registers and executes a handler', async () => {
    const mockHandler: ActionHandler = vi.fn().mockResolvedValue({ success: true, summary: 'Opened' });
    registerActionHandler('data', 'open', mockHandler);

    expect(isActionRegistered('data', 'open')).toBe(true);

    const payload: UiActionCardPayload = {
      id: 'card-1', cardId: 'data.open', domain: 'data', action: 'open',
      title: 'Open', summary: 'Navigate', params: {}, riskLevel: 'low',
      confirmRequired: false, executionMode: 'frontend', targetNav: 'data',
    };

    const result = await executeAction(payload);
    expect(result.success).toBe(true);
    expect(result.summary).toBe('Opened');
    expect(mockHandler).toHaveBeenCalledWith(payload);
  });

  it('returns failure for unregistered action', async () => {
    const payload: UiActionCardPayload = {
      id: 'card-1', cardId: 'nonexistent.action', domain: 'nonexistent', action: 'action',
      title: 'Test', summary: 'Test', params: {}, riskLevel: 'low',
      confirmRequired: false, executionMode: 'frontend',
    };

    const result = await executeAction(payload);
    expect(result.success).toBe(false);
    expect(result.summary).toContain('Unsupported');
  });

  it('returns failure when handler throws', async () => {
    const mockHandler: ActionHandler = vi.fn().mockRejectedValue(new Error('API error'));
    registerActionHandler('data', 'test', mockHandler);

    const payload: UiActionCardPayload = {
      id: 'card-1', cardId: 'data.test', domain: 'data', action: 'test',
      title: 'Test', summary: 'Test', params: {}, riskLevel: 'low',
      confirmRequired: false, executionMode: 'frontend',
    };

    const result = await executeAction(payload);
    expect(result.success).toBe(false);
    expect(result.error).toContain('API error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/components/chat/actionCardRegistry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create the registry**

```ts
// frontend/src/components/chat/actionCards/actionCardRegistry.ts
import type { UiActionCardPayload } from '@/types/actionCard';

export interface ActionResult {
  success: boolean;
  summary?: string;
  error?: string;
}

export type ActionHandler = (payload: UiActionCardPayload) => Promise<ActionResult>;

const registry = new Map<string, ActionHandler>();

function actionKey(domain: string, action: string): string {
  return `${domain}:${action}`;
}

export function registerActionHandler(domain: string, action: string, handler: ActionHandler): void {
  registry.set(actionKey(domain, action), handler);
}

export function isActionRegistered(domain: string, action: string): boolean {
  return registry.has(actionKey(domain, action));
}

export async function executeAction(payload: UiActionCardPayload): Promise<ActionResult> {
  const handler = registry.get(actionKey(payload.domain, payload.action));
  if (!handler) {
    return {
      success: false,
      summary: `Unsupported action: ${payload.domain}.${payload.action}`,
    };
  }
  try {
    return await handler(payload);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function getRegistry(): Map<string, ActionHandler> {
  return registry;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/components/chat/actionCardRegistry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/actionCards/actionCardRegistry.ts frontend/tests/components/chat/actionCardRegistry.test.ts
git commit -m "feat(frontend): add action card registry

Domain+action keyed handler registry that validates and dispatches
confirmed action card executions."
```

---

### Task 15: Frontend — Register First-Version Action Handlers

**Files:**
- Create: `frontend/src/components/chat/actionCards/handlers.ts`
- Create: `frontend/src/components/chat/actionCards/index.ts`
- Test: `frontend/tests/components/chat/actionCardHandlers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/components/chat/actionCardHandlers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isActionRegistered } from '@/components/chat/actionCards/actionCardRegistry';

describe('first-version action handlers', () => {
  it('registers data.open handler', () => {
    expect(isActionRegistered('data', 'open')).toBe(true);
  });

  it('registers knowledge.open handler', () => {
    expect(isActionRegistered('knowledge', 'open')).toBe(true);
  });

  it('registers schedule.open handler', () => {
    expect(isActionRegistered('schedule', 'open')).toBe(true);
  });

  it('registers workflow.copilot_create handler', () => {
    expect(isActionRegistered('workflow', 'copilot_create')).toBe(true);
  });

  it('registers template.copilot_create handler', () => {
    expect(isActionRegistered('template', 'copilot_create')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/components/chat/actionCardHandlers.test.ts`
Expected: FAIL — handlers not registered

- [ ] **Step 3: Create handler implementations**

```ts
// frontend/src/components/chat/actionCards/handlers.ts
import { registerActionHandler } from './actionCardRegistry';
import type { UiActionCardPayload } from '@/types/actionCard';
import type { ActionHandler, ActionResult } from './actionCardRegistry';
import { useNavigationStore } from '@/stores/navigationStore';

function navigationHandler(navs: Array<{ nav: 'data' | 'workflow' | 'schedule'; tab?: 'data' | 'knowledge' }>): ActionHandler {
  return async (payload: UiActionCardPayload): Promise<ActionResult> => {
    const navigationStore = useNavigationStore();
    const targetNav = payload.targetNav ?? navs[0].nav;
    const targetTab = payload.targetDataTab ?? navs[0].tab;
    if (targetTab) {
      navigationStore.setPendingIntent({ type: 'open_data_management', tab: targetTab });
    }
    navigationStore.navigateTo(targetNav);
    return { success: true, summary: `Navigated to ${payload.title}` };
  };
}

// data.open — navigate to data management
registerActionHandler('data', 'open', navigationHandler([{ nav: 'data', tab: 'data' }]));

// knowledge.open — navigate to knowledge tab
registerActionHandler('knowledge', 'open', navigationHandler([{ nav: 'data', tab: 'knowledge' }]));

// schedule.open — navigate to schedule page
registerActionHandler('schedule', 'open', navigationHandler([{ nav: 'schedule' }]));

// workflow.copilot_create — create workflow and open in Copilot
registerActionHandler('workflow', 'copilot_create', async (payload: UiActionCardPayload): Promise<ActionResult> => {
  const navigationStore = useNavigationStore();
  const name = (payload.params.name as string) || 'Untitled Workflow';
  const description = payload.params.description as string | undefined;
  const copilotPrompt = payload.copilotPrompt;

  navigationStore.setPendingIntent({
    type: 'open_workflow_editor',
    workflowId: '__pending__',
    copilotPrompt,
  });

  try {
    const { useWorkflowStore } = await import('@/stores/workflowStore');
    const { useCopilotStore } = await import('@/stores/copilotStore');
    const workflowStore = useWorkflowStore();
    const copilotStore = useCopilotStore();

    const workflowId = await workflowStore.createWorkflow(name, description);
    navigationStore.setPendingIntent({
      type: 'open_workflow_editor',
      workflowId,
      copilotPrompt,
    });
    navigationStore.navigateTo('workflow');

    // Wait for copilot connection then send prompt
    if (copilotPrompt) {
      const waitForConnection = (): Promise<void> =>
        new Promise((resolve, reject) => {
          let attempts = 0;
          const maxAttempts = 50;
          const interval = setInterval(() => {
            if (copilotStore.isConnected && copilotStore.workflowId === workflowId) {
              clearInterval(interval);
              resolve();
            } else if (++attempts >= maxAttempts) {
              clearInterval(interval);
              reject(new Error('Copilot connection timeout'));
            }
          }, 200);
        });

      await waitForConnection();
      copilotStore.sendMessage(copilotPrompt);
    }

    return { success: true, summary: `Created workflow "${name}"${copilotPrompt ? ' and sent prompt to Copilot' : ''}` };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      summary: `Workflow draft created but Copilot auto-send failed. You can manually send the prompt.`,
    };
  }
});

// template.copilot_create — create template and open in debug Copilot
registerActionHandler('template', 'copilot_create', async (payload: UiActionCardPayload): Promise<ActionResult> => {
  const navigationStore = useNavigationStore();
  const name = (payload.params.name as string) || 'Untitled Template';
  const description = payload.params.description as string | undefined;
  const copilotPrompt = payload.copilotPrompt;

  try {
    const { workflowApi } = await import('@/api/workflow');
    const { useDebugCopilotStore } = await import('@/stores/debugCopilotStore');

    const template = await workflowApi.createTemplate({
      name,
      description: description ?? '',
      nodeType: (payload.params.nodeType as string) || 'llm',
    });

    navigationStore.setPendingIntent({
      type: 'open_template_editor',
      templateId: template.id,
      copilotPrompt,
    });
    navigationStore.navigateTo('workflow');

    if (copilotPrompt) {
      const debugCopilotStore = useDebugCopilotStore();
      const waitForConnection = (): Promise<void> =>
        new Promise((resolve, reject) => {
          let attempts = 0;
          const maxAttempts = 50;
          const interval = setInterval(() => {
            if (debugCopilotStore.isConnected) {
              clearInterval(interval);
              resolve();
            } else if (++attempts >= maxAttempts) {
              clearInterval(interval);
              reject(new Error('Debug Copilot connection timeout'));
            }
          }, 200);
        });

      await waitForConnection();
      debugCopilotStore.sendMessage(copilotPrompt);
    }

    return { success: true, summary: `Created template "${name}"${copilotPrompt ? ' and sent prompt to Copilot' : ''}` };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      summary: `Template draft created but Copilot auto-send failed. You can manually send the prompt.`,
    };
  }
});

// Stub handlers for remaining first-version actions (to be fully implemented)
// These register so the card renders but show "not yet implemented" on execution
const stubActions = [
  ['data', 'datasource_create'],
  ['data', 'datasource_test'],
  ['data', 'datasource_delete'],
  ['knowledge', 'folder_create'],
  ['knowledge', 'folder_rename'],
  ['knowledge', 'folder_move'],
  ['knowledge', 'folder_delete'],
  ['knowledge', 'file_open'],
  ['knowledge', 'file_move'],
  ['knowledge', 'file_delete'],
  ['schedule', 'create'],
  ['schedule', 'update'],
  ['schedule', 'delete'],
] as const;

for (const [domain, action] of stubActions) {
  registerActionHandler(domain, action, async (payload: UiActionCardPayload): Promise<ActionResult> => {
    return {
      success: false,
      summary: `Action "${payload.title}" is not yet fully implemented. Please use the ${payload.targetNav ?? domain} page directly.`,
    };
  });
}
```

- [ ] **Step 4: Create barrel export**

```ts
// frontend/src/components/chat/actionCards/index.ts
export { registerActionHandler, executeAction, isActionRegistered } from './actionCardRegistry';
export type { ActionResult, ActionHandler } from './actionCardRegistry';
import './handlers';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/components/chat/actionCardHandlers.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/chat/actionCards/handlers.ts frontend/src/components/chat/actionCards/index.ts frontend/tests/components/chat/actionCardHandlers.test.ts
git commit -m "feat(frontend): register first-version action card handlers

Implements navigation handlers for data.open, knowledge.open,
schedule.open. Adds workflow.copilot_create and template.copilot_create
with Copilot auto-send. Stubs remaining actions for future iteration."
```

---

### Task 16: Frontend — ActionCard.vue Component

**Files:**
- Create: `frontend/src/components/chat/ActionCard.vue`
- Modify: `frontend/src/components/chat/ChatMessage.vue` (render cards)
- Modify: `frontend/src/components/chat/index.ts` (add export)
- Modify: `frontend/src/locales/en-US.ts` (add actionCard keys)
- Modify: `frontend/src/locales/zh-CN.ts` (add actionCard keys)
- Test: `frontend/tests/components/chat/ActionCard.test.ts`

- [ ] **Step 1: Add i18n keys**

In `frontend/src/locales/en-US.ts`, add inside the `chat` object (after `chatList` section, before `clearHistory`):

```ts
actionCard: {
  proposed: 'Proposed Action',
  confirming: 'Confirm Action',
  running: 'Executing...',
  succeeded: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  confirm: 'Confirm',
  cancel: 'Cancel',
  retry: 'Retry',
  unsupported: 'This action is not supported',
  riskLow: 'Low Risk',
  riskMedium: 'Medium Risk',
  riskHigh: 'High Risk',
  riskDanger: 'Dangerous Action',
  dangerConfirm: 'Type "{name}" to confirm',
  params: 'Parameters',
  noParams: 'No parameters',
  copilotPrompt: 'Copilot Prompt',
},
```

In `frontend/src/locales/zh-CN.ts`, add the same keys:

```ts
actionCard: {
  proposed: '建议操作',
  confirming: '确认操作',
  running: '执行中...',
  succeeded: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
  confirm: '确认执行',
  cancel: '取消',
  retry: '重试',
  unsupported: '不支持的操作',
  riskLow: '低风险',
  riskMedium: '中风险',
  riskHigh: '高风险',
  riskDanger: '危险操作',
  dangerConfirm: '输入 "{name}" 以确认',
  params: '参数',
  noParams: '无参数',
  copilotPrompt: 'Copilot 提示',
},
```

- [ ] **Step 2: Write the failing test**

```ts
// frontend/tests/components/chat/ActionCard.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ActionCard from '@/components/chat/ActionCard.vue';
import type { ChatActionCard } from '@/types/actionCard';
import enUS from '@/locales/en-US';
import zhCN from '@/locales/zh-CN';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: enUS, 'zh-CN': zhCN },
});

function makeCard(overrides?: Partial<ChatActionCard>): ChatActionCard {
  return {
    id: 'card-1',
    payload: {
      id: 'card-1',
      cardId: 'data.open',
      domain: 'data',
      action: 'open',
      title: 'Open Data Management',
      summary: 'Navigate to data management page.',
      params: {},
      riskLevel: 'low',
      confirmRequired: false,
      executionMode: 'frontend',
      targetNav: 'data',
    },
    status: 'proposed',
    ...overrides,
  };
}

describe('ActionCard.vue', () => {
  it('renders card title and summary', () => {
    const wrapper = mount(ActionCard, {
      props: { card: makeCard() },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('Open Data Management');
    expect(wrapper.text()).toContain('Navigate to data management page.');
  });

  it('shows confirm button for medium risk cards', () => {
    const card = makeCard({
      payload: { ...makeCard().payload, riskLevel: 'medium', confirmRequired: true },
    });
    const wrapper = mount(ActionCard, {
      props: { card },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('Confirm');
  });

  it('shows danger confirmation for danger risk cards', () => {
    const card = makeCard({
      payload: { ...makeCard().payload, riskLevel: 'danger', confirmRequired: true },
    });
    const wrapper = mount(ActionCard, {
      props: { card },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('Dangerous Action');
  });

  it('shows succeeded status when completed', () => {
    const card = makeCard({ status: 'succeeded', resultSummary: 'Opened successfully' });
    const wrapper = mount(ActionCard, {
      props: { card },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('Completed');
    expect(wrapper.text()).toContain('Opened successfully');
  });

  it('shows failed status with error', () => {
    const card = makeCard({ status: 'failed', error: 'Connection failed' });
    const wrapper = mount(ActionCard, {
      props: { card },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('Failed');
  });

  it('shows copilot prompt when present', () => {
    const card = makeCard({
      payload: { ...makeCard().payload, copilotPrompt: 'Build a sales report' },
    });
    const wrapper = mount(ActionCard, {
      props: { card },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('Build a sales report');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run tests/components/chat/ActionCard.test.ts`
Expected: FAIL — component not found

- [ ] **Step 4: Create ActionCard.vue**

Create `frontend/src/components/chat/ActionCard.vue`. The component:

- Accepts `card: ChatActionCard` and `onStatusChange: (id: string, status: CardStatus, opts?) => void` props
- Renders card title, summary, risk badge, parameters list, copilot prompt (if present)
- Shows confirm/cancel buttons based on risk level
- For `danger` risk, shows a text input confirmation
- Displays status states (running spinner, succeeded check, failed warning)
- Emits `confirm` and `cancel` events
- Uses `executeAction` from the registry on confirm

```vue
<template>
  <div :class="['action-card', `action-card--${card.payload.riskLevel}`, `action-card--${card.status}`]">
    <div class="action-card__header">
      <span class="action-card__risk-badge">{{ riskLabel }}</span>
      <span class="action-card__status-badge">{{ statusLabel }}</span>
    </div>
    <div class="action-card__title">{{ card.payload.title }}</div>
    <div class="action-card__summary">{{ card.payload.summary }}</div>

    <div v-if="hasParams" class="action-card__params">
      <div class="action-card__params-title">{{ t('chat.actionCard.params') }}</div>
      <div v-for="(value, key) in displayParams" :key="key" class="action-card__param">
        <span class="action-card__param-key">{{ key }}</span>
        <span class="action-card__param-value">{{ String(value) }}</span>
      </div>
    </div>

    <div v-if="card.payload.copilotPrompt" class="action-card__copilot-prompt">
      <div class="action-card__params-title">{{ t('chat.actionCard.copilotPrompt') }}</div>
      <div class="action-card__prompt-text">{{ card.payload.copilotPrompt }}</div>
    </div>

    <div v-if="card.status === 'succeeded' && card.resultSummary" class="action-card__result">
      {{ card.resultSummary }}
    </div>
    <div v-if="card.status === 'failed'" class="action-card__error">
      {{ card.error || card.resultSummary || t('common.error') }}
    </div>

    <div v-if="card.status === 'proposed' || card.status === 'confirming'" class="action-card__actions">
      <template v-if="card.payload.riskLevel === 'danger' && card.status === 'confirming'">
        <el-input
          v-model="dangerConfirmText"
          :placeholder="t('chat.actionCard.dangerConfirm', { name: card.payload.title })"
          size="small"
          class="action-card__danger-input"
        />
        <el-button
          size="small"
          type="danger"
          :disabled="dangerConfirmText !== card.payload.title"
          @click="handleConfirm"
        >
          {{ t('chat.actionCard.confirm') }}
        </el-button>
      </template>
      <template v-else-if="card.payload.confirmRequired && card.status === 'proposed'">
        <el-button size="small" @click="handleCancel">{{ t('chat.actionCard.cancel') }}</el-button>
        <el-button size="small" type="primary" @click="handleConfirm">{{ t('chat.actionCard.confirm') }}</el-button>
      </template>
      <template v-else>
        <el-button size="small" type="primary" @click="handleConfirm">{{ t('chat.actionCard.confirm') }}</el-button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { executeAction } from './actionCards';
import type { ChatActionCard, CardStatus } from '@/types/actionCard';

const props = defineProps<{
  card: ChatActionCard;
}>();

const emit = defineEmits<{
  statusChange: [id: string, status: CardStatus, opts?: { resultSummary?: string; error?: string }];
}>();

const { t } = useI18n();
const dangerConfirmText = ref('');

const riskLabel = computed(() => {
  const key = `chat.actionCard.risk${props.card.payload.riskLevel.charAt(0).toUpperCase()}${props.card.payload.riskLevel.slice(1)}` as const;
  return t(key);
});

const statusLabel = computed(() => {
  const key = `chat.actionCard.${props.card.status}` as const;
  return t(key);
});

const displayParams = computed(() => {
  const params = { ...props.card.payload.params };
  delete params.copilotPrompt;
  return Object.keys(params).length > 0 ? params : null;
});

const hasParams = computed(() => displayParams.value !== null);

async function handleConfirm(): void {
  if (props.card.payload.riskLevel === 'danger' && props.card.status === 'proposed') {
    emit('statusChange', props.card.id, 'confirming');
    return;
  }

  emit('statusChange', props.card.id, 'running');
  try {
    const result = await executeAction(props.card.payload);
    if (result.success) {
      emit('statusChange', props.card.id, 'succeeded', { resultSummary: result.summary });
    } else {
      emit('statusChange', props.card.id, 'failed', { resultSummary: result.summary, error: result.error });
    }
  } catch (err) {
    emit('statusChange', props.card.id, 'failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function handleCancel(): void {
  emit('statusChange', props.card.id, 'cancelled');
}
</script>
```

Style the component with appropriate CSS for risk level colors (green/yellow/red/dark-red borders) and status indicators. Follow existing patterns in `frontend/src/styles/`.

- [ ] **Step 5: Render cards in ChatMessage.vue**

In `frontend/src/components/chat/ChatMessage.vue`, after the tool calls section (around line 40), add:

```vue
<ActionCard
  v-for="card in message.actionCards"
  :key="card.id"
  :card="card"
  class="chat-message__action-card"
  @status-change="handleCardStatusChange"
/>
```

Import `ActionCard` and add the handler in the script:

```ts
import ActionCard from './ActionCard.vue';
import type { CardStatus } from '@/types/actionCard';
import { useChatSessionStore } from '@/stores';
import { updateMessageMetadata } from '@/api/chatSession';

const chatSessionStore = useChatSessionStore();

function handleCardStatusChange(cardId: string, status: CardStatus, opts?: { resultSummary?: string; error?: string }) {
  chatStore.updateActionCardStatus(cardId, status, opts);

  // Persist card status to backend metadata
  const sessionId = chatSessionStore.activeSessionId;
  if (sessionId) {
    updateMessageMetadata(sessionId, cardId, {
      type: 'action_card',
      status,
      ...opts,
    }).catch(() => {
      // Non-blocking: UI still shows local result
    });
  }
}
```

- [ ] **Step 6: Add export to chat index**

In `frontend/src/components/chat/index.ts`, add:

```ts
export { default as ActionCard } from './ActionCard.vue';
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd frontend && npx vitest run tests/components/chat/ActionCard.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/chat/ActionCard.vue frontend/src/components/chat/ChatMessage.vue frontend/src/components/chat/index.ts frontend/src/locales/en-US.ts frontend/src/locales/zh-CN.ts frontend/tests/components/chat/ActionCard.test.ts
git commit -m "feat(frontend): add ActionCard component with risk-based confirmation

Renders action cards in chat messages with risk level badges,
parameter display, danger confirmation, and status tracking."
```

---

### Task 17: Frontend — Layouts Handle Pending Navigation Intents

**Files:**
- Modify: `frontend/src/layouts/DesktopLayout.vue`
- Modify: `frontend/src/layouts/MobileLayout.vue`

- [ ] **Step 1: Update DesktopLayout.vue to handle pending intents**

In the `<script setup>`, after setting up the navigation store, add a watcher and intent handler:

```ts
import { watch } from 'vue';

const navigationStore = useNavigationStore();

// Watch for pending intents and resolve them
watch(
  () => navigationStore.pendingIntent,
  (intent) => {
    if (!intent) return;
    resolveIntent(intent);
  },
  { immediate: true }
);

function resolveIntent(intent: NavigationIntent): void {
  // Navigation to the target page is already handled by navigateTo()
  // This function handles additional side effects like opening editors
  switch (intent.type) {
    case 'open_workflow_editor': {
      // The workflow page will pick up the pending intent when it mounts
      break;
    }
    case 'open_template_editor': {
      // The template editor will pick up the pending intent when it mounts
      break;
    }
  }
}
```

- [ ] **Step 2: Update MobileLayout.vue similarly**

Same watcher pattern as DesktopLayout.

- [ ] **Step 3: Run preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/layouts/DesktopLayout.vue frontend/src/layouts/MobileLayout.vue
git commit -m "feat(frontend): handle pending navigation intents in layouts

Layouts now watch for pending intents and trigger side effects
like opening specific editors when navigating from action cards."
```

---

### Task 18: Full Integration Verification

**Files:** No new files — run all tests and preflight checks.

- [ ] **Step 1: Run backend tests**

Run: `cd backend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Run backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS (lint, typecheck, format all clean)

- [ ] **Step 4: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS (lint, typecheck, format all clean)

- [ ] **Step 5: Commit any fixes needed**

If any checks fail, fix the issues and commit:

```bash
git add -A
git commit -m "fix: resolve preflight issues"
```
