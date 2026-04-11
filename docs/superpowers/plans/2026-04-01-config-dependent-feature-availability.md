# Config-Dependent Feature Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When LLM, web search, or SMTP configs are not set up, dependent features degrade gracefully: disabled workflow nodes, filtered copilot prompts, and clear error messages.

**Architecture:** New `GET /api/global-config/status` endpoint returns `{ llm, webSearch, smtp }` booleans. Frontend fetches on load + after config saves, stores in Pinia. Copilot validates LLM before processing and dynamically filters prompt sections and tool registry. Node palette items accept a `disabled` prop with tooltip.

**Tech Stack:** Express.js v5, Prisma v7, Vue 3, Pinia, Element Plus, Vitest

**Spec:** `docs/superpowers/specs/2026-04-01-config-dependent-feature-availability-design.md`

---

### Task 1: Backend — ConfigStatusResponse type and getConfigStatus service

**Files:**
- Modify: `backend/src/globalConfig/globalConfig.types.ts:58` (append)
- Modify: `backend/src/globalConfig/globalConfig.service.ts:352` (append)
- Modify: `backend/tests/globalConfig/globalConfig.service.test.ts:252` (append)

- [ ] **Step 1: Write failing tests for getConfigStatus**

Append to `backend/tests/globalConfig/globalConfig.service.test.ts`. First update the imports at the top of the file:

Add `getConfigStatus` and `invalidateSmtpConfigCache` to the import from `../../src/globalConfig/globalConfig.service`, and add `DEFAULT_SMTP_CONFIG` to the import from `../../src/globalConfig/globalConfig.types`.

Add `invalidateSmtpConfigCache()` to the `beforeEach` block.

Then append a new `describe('getConfigStatus', ...)` block:

```typescript
  describe('getConfigStatus', () => {
    it('should return all false when no config is set', async () => {
      mockGetConfigsByCategory.mockResolvedValue([]);

      const status = await getConfigStatus();

      expect(status).toEqual({ llm: false, webSearch: false, smtp: false });
    });

    it('should return llm true when API key exists', async () => {
      mockGetConfigsByCategory.mockImplementation((category: string) => {
        if (category === 'llm') {
          return Promise.resolve([{ configKey: 'llm_api_key', configValue: 'enc:key' }]);
        }
        return Promise.resolve([]);
      });

      const status = await getConfigStatus();

      expect(status.llm).toBe(true);
      expect(status.webSearch).toBe(false);
      expect(status.smtp).toBe(false);
    });

    it('should return webSearch true when API key exists', async () => {
      mockGetConfigsByCategory.mockImplementation((category: string) => {
        if (category === 'web_search') {
          return Promise.resolve([{ configKey: 'web_search_api_key', configValue: 'enc:key' }]);
        }
        return Promise.resolve([]);
      });

      const status = await getConfigStatus();

      expect(status.webSearch).toBe(true);
    });

    it('should return smtp true when host, user, and pass are all set', async () => {
      mockGetConfigsByCategory.mockImplementation((category: string) => {
        if (category === 'smtp') {
          return Promise.resolve([
            { configKey: 'smtp_host', configValue: 'smtp.example.com' },
            { configKey: 'smtp_user', configValue: 'user@example.com' },
            { configKey: 'smtp_pass', configValue: 'enc:pass123' },
          ]);
        }
        return Promise.resolve([]);
      });

      const status = await getConfigStatus();

      expect(status.smtp).toBe(true);
    });

    it('should return smtp false when host is missing', async () => {
      mockGetConfigsByCategory.mockImplementation((category: string) => {
        if (category === 'smtp') {
          return Promise.resolve([
            { configKey: 'smtp_user', configValue: 'user@example.com' },
            { configKey: 'smtp_pass', configValue: 'enc:pass123' },
          ]);
        }
        return Promise.resolve([]);
      });

      const status = await getConfigStatus();

      expect(status.smtp).toBe(false);
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pnpm vitest run tests/globalConfig/globalConfig.service.test.ts`
Expected: FAIL — `getConfigStatus` not exported

- [ ] **Step 3: Add ConfigStatusResponse type**

Append to `backend/src/globalConfig/globalConfig.types.ts` after line 58:

```typescript

export interface ConfigStatusResponse {
  llm: boolean;
  webSearch: boolean;
  smtp: boolean;
}
```

- [ ] **Step 4: Implement getConfigStatus**

Append to `backend/src/globalConfig/globalConfig.service.ts` after the SMTP section (after line 352). Add the import for `ConfigStatusResponse` at the top.

```typescript
// ── Config Status ──────────────────────────────────────────────────────

export async function getConfigStatus(): Promise<ConfigStatusResponse> {
  const llmConfig = await getLLMConfig();
  const wsConfig = await getWebSearchConfig();
  const smtpConfig = await getSmtpConfig();
  return {
    llm: !!llmConfig.apiKey,
    webSearch: !!wsConfig.apiKey,
    smtp: !!(smtpConfig.host && smtpConfig.user && smtpConfig.pass),
  };
}
```

Add `ConfigStatusResponse` to the import from `./globalConfig.types`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pnpm vitest run tests/globalConfig/globalConfig.service.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/globalConfig/globalConfig.types.ts backend/src/globalConfig/globalConfig.service.ts backend/tests/globalConfig/globalConfig.service.test.ts
git commit -m "feat(config): add ConfigStatusResponse type and getConfigStatus service"
```

---

### Task 2: Backend — Config status endpoint (controller + route)

**Files:**
- Modify: `backend/src/globalConfig/globalConfig.controller.ts:1` (add import + handler)
- Modify: `backend/src/globalConfig/globalConfig.routes.ts:30` (add route)

- [ ] **Step 1: Add getConfigStatusHandler to controller**

In `backend/src/globalConfig/globalConfig.controller.ts`, add `getConfigStatus` to the import from `./globalConfig.service` (line 8). Then append the handler after the SMTP handlers (after line 196):

```typescript
// ── Config status handler ──────────────────────────────────────────────

export async function getConfigStatusHandler(_req: Request, res: Response): Promise<void> {
  const status = await getConfigStatus();
  res.json(status);
}
```

- [ ] **Step 2: Add route**

In `backend/src/globalConfig/globalConfig.routes.ts`, add `getConfigStatusHandler` to the import from `./globalConfig.controller` (line 10). Then add the route before the `export` at line 31:

```typescript
// Config status
router.get('/status', getConfigStatusHandler);
```

- [ ] **Step 3: Run backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS (no type errors, lint clean, compiles)

- [ ] **Step 4: Commit**

```bash
git add backend/src/globalConfig/globalConfig.controller.ts backend/src/globalConfig/globalConfig.routes.ts
git commit -m "feat(config): add GET /status endpoint for config availability"
```

---

### Task 3: Backend — Copilot LLM validation

**Files:**
- Modify: `backend/src/copilot/copilot.types.ts:102-105` (extend CopilotErrorEvent)
- Modify: `backend/src/copilot/copilotAgent.ts:41-55` (add LLM check in handleUserMessage)

- [ ] **Step 1: Extend CopilotErrorEvent type**

In `backend/src/copilot/copilot.types.ts`, replace the `CopilotErrorEvent` interface (lines 102-105):

```typescript
export interface CopilotErrorEvent {
  type: 'error';
  message: string;
  errorType?: 'config_missing';
  configType?: 'llm';
}
```

- [ ] **Step 2: Add LLM validation in copilotAgent.ts**

In `backend/src/copilot/copilotAgent.ts`, add the LLM check at the beginning of `handleUserMessage()`, right after the `this.isProcessing = true;` line (after line 46) and before `this.aborted = false;`:

```typescript
    // Check if LLM is configured before processing
    const llmConfig = LLMProviderFactory.getConfig();
    if (!llmConfig.apiKey) {
      this.sendEvent({
        type: 'error',
        message: 'LLM is not configured. Please go to Settings and configure the LLM connection first.',
        errorType: 'config_missing',
        configType: 'llm',
      });
      this.isProcessing = false;
      this.sendEvent({ type: 'turn_done' });
      return;
    }
```

- [ ] **Step 3: Run backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/copilot/copilot.types.ts backend/src/copilot/copilotAgent.ts
git commit -m "feat(copilot): validate LLM config before processing messages"
```

---

### Task 4: Backend — Copilot prompt filtering

**Files:**
- Modify: `backend/src/copilot/copilotPrompt.ts` (split NODE_TYPE_DESCRIPTIONS, make buildSystemPrompt conditional)
- Modify: `backend/tests/copilotPrompt.test.ts` (update existing tests for new 2-arg signature + add new tests)

- [ ] **Step 1: Update existing tests and add new tests**

The existing test file is at `backend/tests/copilotPrompt.test.ts` (NOT in a `copilot/` subdirectory). Update it to use the new 2-argument signature and add new config-filtering tests.

Replace the entire file `backend/tests/copilotPrompt.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../src/copilot/copilotPrompt';
import type { ConfigStatusResponse } from '../src/globalConfig/globalConfig.types';

const ALL_CONFIGURED: ConfigStatusResponse = { llm: true, webSearch: true, smtp: true };
const NONE_CONFIGURED: ConfigStatusResponse = { llm: false, webSearch: false, smtp: false };

describe('buildSystemPrompt', () => {
  it('should include all node types when all configured', () => {
    const prompt = buildSystemPrompt(false, ALL_CONFIGURED);

    expect(prompt).toContain('### LLM Generation (llm)');
    expect(prompt).toContain('### Email Sending (email)');
    expect(prompt).toContain('### Web Search (web_search)');
    expect(prompt).toContain('### SQL Query (sql)');
    expect(prompt).toContain('### Python Script (python)');
    expect(prompt).toContain('### Branch (branch)');
  });

  it('should exclude LLM section when llm is not configured', () => {
    const prompt = buildSystemPrompt(false, { ...ALL_CONFIGURED, llm: false });

    expect(prompt).not.toContain('### LLM Generation (llm)');
    expect(prompt).toContain('### SQL Query (sql)');
    expect(prompt).toContain('### Python Script (python)');
  });

  it('should exclude Email section when smtp is not configured', () => {
    const prompt = buildSystemPrompt(false, { ...ALL_CONFIGURED, smtp: false });

    expect(prompt).not.toContain('### Email Sending (email)');
    expect(prompt).toContain('### SQL Query (sql)');
  });

  it('should exclude Web Search section when webSearch is not configured', () => {
    const prompt = buildSystemPrompt(false, { ...ALL_CONFIGURED, webSearch: false });

    expect(prompt).not.toContain('### Web Search (web_search)');
    expect(prompt).toContain('### SQL Query (sql)');
  });

  it('should exclude web_search from information gathering tools when webSearch not configured', () => {
    const prompt = buildSystemPrompt(false, { ...ALL_CONFIGURED, webSearch: false });

    expect(prompt).not.toContain('- web_search: Search external resources');
  });

  it('should include web_search in information gathering tools when webSearch is configured', () => {
    const prompt = buildSystemPrompt(false, ALL_CONFIGURED);

    expect(prompt).toContain('- web_search: Search external resources');
  });

  it('should exclude all optional sections when none configured', () => {
    const prompt = buildSystemPrompt(false, NONE_CONFIGURED);

    expect(prompt).not.toContain('### LLM Generation (llm)');
    expect(prompt).not.toContain('### Email Sending (email)');
    expect(prompt).not.toContain('### Web Search (web_search)');
    expect(prompt).toContain('### SQL Query (sql)');
    expect(prompt).toContain('### Python Script (python)');
    expect(prompt).toContain('### Branch (branch)');
  });

  it('should always include Role section', () => {
    const prompt = buildSystemPrompt(false, NONE_CONFIGURED);

    expect(prompt).toContain('## Role');
  });

  it('should include auto-fix instructions when enabled', () => {
    const prompt = buildSystemPrompt(true, ALL_CONFIGURED);

    expect(prompt).toContain('## Auto-Fix Mode');
  });

  // Existing tests updated for 2-arg signature
  it('includes role description', () => {
    const prompt = buildSystemPrompt(false, ALL_CONFIGURED);
    expect(prompt).toContain('data workflow builder assistant');
  });

  it('includes output_schema for each node type', () => {
    const prompt = buildSystemPrompt(false, ALL_CONFIGURED);
    expect(prompt).toContain('csvPath');
    expect(prompt).toContain('stderr');
    expect(prompt).toContain('rawResponse');
  });

  it('includes template syntax documentation with examples', () => {
    const prompt = buildSystemPrompt(false, ALL_CONFIGURED);
    expect(prompt).toContain('{{');
    expect(prompt).toContain('Template Syntax Reference');
    expect(prompt).toContain('{{analysis.result}}');
    expect(prompt).toContain('Nested paths supported');
  });

  it('includes auto-fix disabled instructions when false', () => {
    const prompt = buildSystemPrompt(false, ALL_CONFIGURED);
    expect(prompt).toContain('wait for user confirmation');
    expect(prompt).not.toContain('Auto-Fix Mode');
  });

  it('includes WORKSPACE variable guidance for Python nodes', () => {
    const prompt = buildSystemPrompt(false, ALL_CONFIGURED);
    expect(prompt).toContain('WORKSPACE');
    expect(prompt).toContain('os.path.join(WORKSPACE');
  });

  it('contains branch node description', () => {
    const prompt = buildSystemPrompt(false, ALL_CONFIGURED);
    expect(prompt).toContain('branch');
  });

  it('mentions sourceHandle for branch connections', () => {
    const prompt = buildSystemPrompt(false, ALL_CONFIGURED);
    expect(prompt).toContain('sourceHandle');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pnpm vitest run tests/copilotPrompt.test.ts`
Expected: FAIL — `buildSystemPrompt` expects 1 argument but got 2

- [ ] **Step 3: Refactor copilotPrompt.ts**

Rewrite `backend/src/copilot/copilotPrompt.ts` to split `NODE_TYPE_DESCRIPTIONS` into per-node constants and make `buildSystemPrompt` accept `ConfigStatusResponse`. Also make `TOOL_USAGE_GUIDELINES` a function that conditionally includes web_search.

Split the monolithic `NODE_TYPE_DESCRIPTIONS` constant into:
- `NODE_TYPE_HEADER` = `## Node Type Reference`
- `NODE_TYPE_SQL` = the SQL Query section (lines 9-23) with trailing `---`
- `NODE_TYPE_PYTHON` = the Python Script section (lines 26-45) with trailing `---`
- `NODE_TYPE_LLM` = the LLM Generation section (lines 49-61) with trailing `---`
- `NODE_TYPE_EMAIL` = the Email Sending section (lines 65-91) with trailing `---`
- `NODE_TYPE_BRANCH` = the Branch section (lines 94-111) with trailing `---`
- `NODE_TYPE_WEB_SEARCH` = the Web Search section (lines 114-127), no trailing `---`

Update `buildSystemPrompt` signature to:
```typescript
export function buildSystemPrompt(
  autoFixEnabled: boolean,
  configStatus: ConfigStatusResponse
): string
```

Build NODE_TYPE_DESCRIPTIONS dynamically:
```typescript
const nodeTypeSections = [NODE_TYPE_SQL, NODE_TYPE_PYTHON];
if (configStatus.llm) nodeTypeSections.push(NODE_TYPE_LLM);
if (configStatus.smtp) nodeTypeSections.push(NODE_TYPE_EMAIL);
nodeTypeSections.push(NODE_TYPE_BRANCH);
if (configStatus.webSearch) nodeTypeSections.push(NODE_TYPE_WEB_SEARCH);
const nodeTypeDescriptions = NODE_TYPE_HEADER + '\n\n' + nodeTypeSections.join('\n\n');
```

Convert `TOOL_USAGE_GUIDELINES` to a function `buildToolUsageGuidelines(configStatus)` that conditionally includes the `- web_search: Search external resources` line.

Add import at the top:
```typescript
import type { ConfigStatusResponse } from '../globalConfig/globalConfig.types';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pnpm vitest run tests/copilotPrompt.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Update copilotAgent.ts to pass configStatus**

In `backend/src/copilot/copilotAgent.ts`:

Add import at top:
```typescript
import { getConfigStatus } from '../globalConfig/globalConfig.service';
```

In `handleUserMessage()`, where the system prompt is built (around line 50, inside the `if (this.context.getTotalTokens() === 0)` block), change:
```typescript
const systemPrompt = buildSystemPrompt(this.autoFixEnabled);
```
to:
```typescript
const configStatus = await getConfigStatus();
const systemPrompt = buildSystemPrompt(this.autoFixEnabled, configStatus);
```

- [ ] **Step 6: Run backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/copilot/copilotPrompt.ts backend/tests/copilotPrompt.test.ts backend/src/copilot/copilotAgent.ts
git commit -m "feat(copilot): filter prompt node types based on config availability"
```

---

### Task 5: Backend — Copilot tool registry filtering

**Files:**
- Modify: `backend/src/copilot/copilotTools.ts:227-270` (WfAddNodeTool constructor) and `1174-1199` (createCopilotToolRegistry)
- Modify: `backend/src/copilot/copilotAgent.ts:28` (registry rebuild on first message)
- Modify: `backend/tests/copilotAgent.test.ts:4-13` (add getConfigStatus mock)

- [ ] **Step 1: Modify WfAddNodeTool to accept allowed types**

In `backend/src/copilot/copilotTools.ts`, change `WfAddNodeTool` to store allowed types as a private field and use it in both the schema and validation.

Add a private field and update the constructor (around line 250):
```typescript
  private workflowId: string;
  private allowedTypes: string[];

  constructor(workflowId: string, allowedTypes?: string[]) {
    super();
    this.workflowId = workflowId;
    this.allowedTypes = allowedTypes ?? ['sql', 'python', 'llm', 'email', 'branch', 'web_search'];
    this.parameters = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Node name (must be unique within the workflow)' },
        type: {
          type: 'string',
          enum: this.allowedTypes,
          description: 'Node type',
        },
        config: {
          type: 'object',
          description: 'Optional partial node configuration to override defaults',
          properties: {},
          required: [],
        },
      },
      required: ['name', 'type'],
    };
  }
```

Update the validation in `execute()` (around line 268) to use the stored field:
```typescript
      if (!type || !this.allowedTypes.includes(type)) {
        return {
          success: false,
          data: null,
          error: `type must be one of: ${this.allowedTypes.join(', ')}`,
        };
      }
```

- [ ] **Step 2: Update createCopilotToolRegistry to accept configStatus**

Add import at top of `copilotTools.ts`:
```typescript
import type { ConfigStatusResponse } from '../globalConfig/globalConfig.types';
```

Change the function signature (line 1174):
```typescript
export function createCopilotToolRegistry(
  workflowId: string,
  onProgress?: (event: WsWorkflowEvent) => void,
  configStatus?: ConfigStatusResponse
): ToolRegistryClass {
```

Build allowed types and conditionally register tools:
```typescript
  // Build allowed node types based on config status
  const allTypes = ['sql', 'python', 'llm', 'email', 'branch', 'web_search'];
  const allowedTypes = configStatus
    ? allTypes.filter((t) => {
        if (t === 'llm') return configStatus.llm;
        if (t === 'email') return configStatus.smtp;
        if (t === 'web_search') return configStatus.webSearch;
        return true;
      })
    : allTypes;

  const registry = new ToolRegistryClass();

  registry.register(new WfGetSummaryTool(workflowId));
  registry.register(new WfAddNodeTool(workflowId, allowedTypes));
  // ... all other registrations unchanged ...
  if (!configStatus || configStatus.webSearch) {
    registry.register(new CopilotWebSearchTool());
  }
  // ... rest unchanged ...
```

- [ ] **Step 3: Update copilotAgent.ts for lazy registry rebuild**

In `backend/src/copilot/copilotAgent.ts`:

Keep the `toolRegistry` field typed as `ToolRegistryClass` (non-null). Keep the constructor's default init as-is (it provides a registry before config status is known).

In `handleUserMessage()`, inside the `if (this.context.getTotalTokens() === 0)` block (after the LLM check, where configStatus is already fetched for the system prompt), rebuild the registry with config status:

```typescript
      const configStatus = await getConfigStatus();
      const systemPrompt = buildSystemPrompt(this.autoFixEnabled, configStatus);
      this.context.addSystemMessage(systemPrompt);
      // Rebuild tool registry with config-aware filtering
      this.toolRegistry = createCopilotToolRegistry(
        this.workflowId,
        (event) => { this.sendEvent({ type: 'execution_event', event }); },
        configStatus
      );
```

This replaces the existing 3 lines in the `if` block. The `toolRegistry` remains non-null throughout — it starts with the default (all tools) from the constructor and gets replaced with a filtered version on first message.

- [ ] **Step 4: Update copilotAgent tests to mock getConfigStatus**

In `backend/tests/copilotAgent.test.ts`, add a mock for `getConfigStatus` alongside the other mocks (after line 13):

```typescript
vi.mock('../src/globalConfig/globalConfig.service', () => ({
  getConfigStatus: vi.fn().mockResolvedValue({ llm: true, webSearch: true, smtp: true }),
}));
```

This ensures existing tests continue to pass — they'll get a fully-configured status by default.

- [ ] **Step 5: Run all backend tests**

Run: `cd backend && pnpm vitest run`
Expected: ALL PASS

- [ ] **Step 6: Run backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/copilot/copilotTools.ts backend/src/copilot/copilotAgent.ts backend/tests/copilotAgent.test.ts
git commit -m "feat(copilot): filter tool registry based on config availability"
```

---

### Task 6: Frontend — ConfigStatusResponse type and API

**Files:**
- Modify: `frontend/src/types/globalConfig.ts:29` (append type)
- Modify: `frontend/src/api/globalConfig.ts:50` (append function)

- [ ] **Step 1: Add ConfigStatusResponse type**

Append to `frontend/src/types/globalConfig.ts` after line 29:

```typescript

export interface ConfigStatusResponse {
  llm: boolean;
  webSearch: boolean;
  smtp: boolean;
}
```

- [ ] **Step 2: Add getConfigStatus API function**

Append to `frontend/src/api/globalConfig.ts` after line 50. First add `ConfigStatusResponse` to the type import at the top:

```typescript
// Config status
export async function getConfigStatus(): Promise<ConfigStatusResponse> {
  return http.get<ConfigStatusResponse>('/global-config/status');
}
```

- [ ] **Step 3: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/globalConfig.ts frontend/src/api/globalConfig.ts
git commit -m "feat(frontend): add ConfigStatusResponse type and getConfigStatus API"
```

---

### Task 7: Frontend — Global config store: config status state + refresh after saves

**Files:**
- Modify: `frontend/src/stores/globalConfigStore.ts` (add configStatus, fetchConfigStatus, computeds, refresh on saves)

- [ ] **Step 1: Update the store**

In `frontend/src/stores/globalConfigStore.ts`:

Add `ConfigStatusResponse` to the type import (line 3):
```typescript
import type { LLMConfigForm, WebSearchConfigForm, SmtpConfigForm, ConfigStatusResponse } from '@/types/globalConfig';
```

Add `computed` to the vue import (line 2):
```typescript
import { ref, computed } from 'vue';
```

After the `smtpConfig` ref (line 11), add:
```typescript
  const configStatus = ref<ConfigStatusResponse | null>(null);
```

After the `useAsyncAction` blocks (line 20), add:
```typescript
  async function fetchConfigStatus(): Promise<void> {
    configStatus.value = await globalConfigApi.getConfigStatus();
  }

  const isLLMConfigured = computed(() => configStatus.value?.llm ?? false);
  const isWebSearchConfigured = computed(() => configStatus.value?.webSearch ?? false);
  const isSmtpConfigured = computed(() => configStatus.value?.smtp ?? false);
```

Update the save actions to refresh config status. Change `saveLLMConfig` (around line 27):
```typescript
  const saveLLMConfig = wrapLLMAction(async (config: LLMConfigForm): Promise<void> => {
    llmConfig.value = await globalConfigApi.saveLLMConfig(config);
    await fetchConfigStatus();
  });
```

Similarly for `saveWebSearchConfig` (around line 37):
```typescript
  const saveWebSearchConfig = wrapWebSearchAction(
    async (config: WebSearchConfigForm): Promise<void> => {
      webSearchConfig.value = await globalConfigApi.saveWebSearchConfig(config);
      await fetchConfigStatus();
    }
  );
```

And `saveSmtpConfig` (around line 48):
```typescript
  const saveSmtpConfig = wrapSmtpAction(async (config: SmtpConfigForm): Promise<void> => {
    smtpConfig.value = await globalConfigApi.saveSmtpConfig(config);
    await fetchConfigStatus();
  });
```

Add to the return object:
```typescript
    configStatus,
    fetchConfigStatus,
    isLLMConfigured,
    isWebSearchConfigured,
    isSmtpConfigured,
```

- [ ] **Step 2: Call fetchConfigStatus on app init**

In `frontend/src/App.vue`, add the config status fetch in the `<script setup>` block. Import the store and call `fetchConfigStatus()` at the top level (fire-and-forget — it populates the store reactively, and components that depend on `isLLMConfigured` etc. will update when the data arrives):

```typescript
import { useGlobalConfigStore } from '@/stores';

const globalConfigStore = useGlobalConfigStore();
globalConfigStore.fetchConfigStatus();
```

- [ ] **Step 3: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/globalConfigStore.ts frontend/src/App.vue
git commit -m "feat(frontend): add config status to global config store with auto-refresh"
```

---

### Task 8: Frontend — i18n keys

**Files:**
- Modify: `frontend/src/locales/zh-CN.ts` (add nodeDisabled + smtpNotConfigured)
- Modify: `frontend/src/locales/en-US.ts` (add nodeDisabled + smtpNotConfigured)

- [ ] **Step 1: Add zh-CN keys**

In `frontend/src/locales/zh-CN.ts`, inside the `workflow` object, after the existing `nodeTypes` block, add:

```typescript
    nodeDisabled: {
      llm: 'LLM 未配置，请前往设置页面进行配置',
      webSearch: '网络搜索未配置，请前往设置页面进行配置',
      smtp: '邮件发送服务未配置，请前往设置页面进行配置',
    },
```

Inside the `errors` object, after `webSearchNotConfigured`, add:

```typescript
    smtpNotConfigured: '邮件发送服务尚未配置，请先在设置页面配置邮件服务。',
```

- [ ] **Step 2: Add en-US keys**

In `frontend/src/locales/en-US.ts`, inside the `workflow` object, after the existing `nodeTypes` block, add:

```typescript
    nodeDisabled: {
      llm: 'LLM is not configured. Please go to Settings to configure.',
      webSearch: 'Web search is not configured. Please go to Settings to configure.',
      smtp: 'Email service is not configured. Please go to Settings to configure.',
    },
```

Inside the `errors` object, after `webSearchNotConfigured`, add:

```typescript
    smtpNotConfigured:
      'Email service is not configured. Please go to Settings and configure the SMTP email service first.',
```

- [ ] **Step 3: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/locales/zh-CN.ts frontend/src/locales/en-US.ts
git commit -m "feat(i18n): add nodeDisabled and smtpNotConfigured locale keys"
```

---

### Task 9: Frontend — WfPaletteItem disabled state

**Files:**
- Modify: `frontend/src/components/workflow/WfPaletteItem.vue` (add disabled prop, tooltip, styles)
- Create: `frontend/tests/components/workflow/WfPaletteItem.test.ts`

- [ ] **Step 1: Write failing test**

Create `frontend/tests/components/workflow/WfPaletteItem.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import WfPaletteItem from '@/components/workflow/WfPaletteItem.vue';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});

const mountOpts = {
  global: { plugins: [i18n, createPinia(), ElementPlus] },
};

describe('WfPaletteItem', () => {
  it('should render label text', () => {
    const wrapper = mount(WfPaletteItem, {
      ...mountOpts,
      props: { type: 'sql', label: 'SQL Query', color: '#3B82F6' },
    });
    expect(wrapper.text()).toContain('SQL Query');
  });

  it('should be draggable when not disabled', () => {
    const wrapper = mount(WfPaletteItem, {
      ...mountOpts,
      props: { type: 'sql', label: 'SQL Query', color: '#3B82F6' },
    });
    expect(wrapper.find('.wf-palette-item').attributes('draggable')).toBe('true');
  });

  it('should not be draggable when disabled', () => {
    const wrapper = mount(WfPaletteItem, {
      ...mountOpts,
      props: {
        type: 'llm',
        label: 'LLM Generate',
        color: '#A855F7',
        disabled: true,
        disabledReason: 'LLM not configured',
      },
    });
    expect(wrapper.find('.wf-palette-item').attributes('draggable')).toBe('false');
  });

  it('should have is-disabled class when disabled', () => {
    const wrapper = mount(WfPaletteItem, {
      ...mountOpts,
      props: {
        type: 'llm',
        label: 'LLM Generate',
        color: '#A855F7',
        disabled: true,
        disabledReason: 'LLM not configured',
      },
    });
    expect(wrapper.find('.wf-palette-item').classes()).toContain('is-disabled');
  });

  it('should not have is-disabled class when not disabled', () => {
    const wrapper = mount(WfPaletteItem, {
      ...mountOpts,
      props: { type: 'sql', label: 'SQL Query', color: '#3B82F6' },
    });
    expect(wrapper.find('.wf-palette-item').classes()).not.toContain('is-disabled');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && pnpm vitest run tests/components/workflow/WfPaletteItem.test.ts`
Expected: FAIL — `disabled` prop not recognized, no `is-disabled` class

- [ ] **Step 3: Implement disabled state in WfPaletteItem.vue**

Replace `frontend/src/components/workflow/WfPaletteItem.vue` template and script:

Template:
```vue
<template>
  <el-tooltip
    :content="disabledReason"
    :disabled="!disabled"
    placement="right"
    effect="dark"
  >
    <div
      class="wf-palette-item"
      :class="{ 'is-disabled': disabled }"
      :draggable="!disabled"
      @dragstart="handleDragStart"
    >
      <span class="wf-palette-item__icon" :style="{ color }">
        <slot></slot>
      </span>
      <span class="wf-palette-item__label">{{ label }}</span>
    </div>
  </el-tooltip>
</template>
```

Script:
```vue
<script setup lang="ts">
import { ElTooltip } from 'element-plus';
import type { WorkflowNodeType } from '@/types/workflow';

const props = withDefaults(
  defineProps<{
    type: WorkflowNodeType;
    label: string;
    color: string;
    templateId?: string;
    disabled?: boolean;
    disabledReason?: string;
  }>(),
  {
    disabled: false,
    disabledReason: '',
  }
);

function handleDragStart(event: DragEvent): void {
  if (props.disabled || !event.dataTransfer) return;
  event.dataTransfer.setData('workflow/node-type', props.type);
  if (props.templateId) {
    event.dataTransfer.setData('workflow/template-id', props.templateId);
  }
  event.dataTransfer.effectAllowed = 'move';
}
</script>
```

Add to styles:
```scss
  &.is-disabled {
    opacity: 0.4;
    cursor: not-allowed;

    &:hover {
      background-color: transparent;
    }

    &:active {
      cursor: not-allowed;
      opacity: 0.4;
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && pnpm vitest run tests/components/workflow/WfPaletteItem.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/workflow/WfPaletteItem.vue frontend/tests/components/workflow/WfPaletteItem.test.ts
git commit -m "feat(workflow): add disabled state with tooltip to WfPaletteItem"
```

---

### Task 10: Frontend — WfNodePalette passes disabled based on config

**Files:**
- Modify: `frontend/src/components/workflow/WfNodePalette.vue` (import store, pass disabled props)

- [ ] **Step 1: Update WfNodePalette.vue**

In `frontend/src/components/workflow/WfNodePalette.vue`:

Add imports in `<script setup>`:
```typescript
import { useGlobalConfigStore } from '@/stores';

const globalConfigStore = useGlobalConfigStore();
```

Update the template. For the `llm` palette item (lines 21-23), add disabled props:
```vue
        <WfPaletteItem
          type="llm"
          :label="t('workflow.nodeTypes.llm')"
          :color="NODE_COLORS.llm"
          :disabled="!globalConfigStore.isLLMConfigured"
          :disabled-reason="t('workflow.nodeDisabled.llm')"
        >
          <Sparkles :size="16" />
        </WfPaletteItem>
```

For the `email` palette item (lines 24-30):
```vue
        <WfPaletteItem
          type="email"
          :label="t('workflow.nodeTypes.email')"
          :color="NODE_COLORS.email"
          :disabled="!globalConfigStore.isSmtpConfigured"
          :disabled-reason="t('workflow.nodeDisabled.smtp')"
        >
          <Mail :size="16" />
        </WfPaletteItem>
```

For the `web_search` palette item (lines 38-44):
```vue
        <WfPaletteItem
          type="web_search"
          :label="t('workflow.nodeTypes.web_search')"
          :color="NODE_COLORS.web_search"
          :disabled="!globalConfigStore.isWebSearchConfigured"
          :disabled-reason="t('workflow.nodeDisabled.webSearch')"
        >
          <Search :size="16" />
        </WfPaletteItem>
```

For custom templates (lines 50-64), add a computed helper and pass disabled:

```typescript
import type { WorkflowNodeType } from '@/types/workflow';

function isNodeTypeDisabled(type: WorkflowNodeType): boolean {
  if (type === 'llm') return !globalConfigStore.isLLMConfigured;
  if (type === 'email') return !globalConfigStore.isSmtpConfigured;
  if (type === 'web_search') return !globalConfigStore.isWebSearchConfigured;
  return false;
}

function getDisabledReason(type: WorkflowNodeType): string {
  if (type === 'llm') return t('workflow.nodeDisabled.llm');
  if (type === 'email') return t('workflow.nodeDisabled.smtp');
  if (type === 'web_search') return t('workflow.nodeDisabled.webSearch');
  return '';
}
```

In the custom template `v-for`:
```vue
        <WfPaletteItem
          v-for="tmpl in store.customTemplates"
          :key="tmpl.id"
          :type="tmpl.type"
          :label="tmpl.name"
          :color="NODE_COLORS[tmpl.type]"
          :template-id="tmpl.id"
          :disabled="isNodeTypeDisabled(tmpl.type)"
          :disabled-reason="getDisabledReason(tmpl.type)"
        >
```

- [ ] **Step 2: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workflow/WfNodePalette.vue
git commit -m "feat(workflow): disable palette nodes when config is unavailable"
```

---

### Task 11: Frontend — Copilot error handling for config_missing

**Files:**
- Modify: `frontend/src/stores/copilotStore.ts` (extend ErrorMsg, update handleServerMessage)

- [ ] **Step 1: Extend ErrorMsg interface**

In `frontend/src/stores/copilotStore.ts`, update the `ErrorMsg` interface (around line 73):

```typescript
interface ErrorMsg {
  type: 'error';
  message: string;
  errorType?: 'config_missing';
  configType?: 'llm';
}
```

- [ ] **Step 2: Verify error handling in handleServerMessage**

The existing `case 'error':` block (around line 308) already pushes the error message as an assistant message, which is visible to the user. The backend error message text is self-explanatory ("LLM is not configured. Please go to Settings..."). The `ErrorMsg` interface extension in Step 1 ensures TypeScript accepts the new fields from the backend — no behavior change needed in the handler itself. The existing code works as-is.

- [ ] **Step 3: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/copilotStore.ts
git commit -m "feat(copilot): handle config_missing error type in copilot store"
```

---

### Task 12: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && pnpm vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Run all frontend tests**

Run: `cd frontend && pnpm vitest run`
Expected: ALL PASS

- [ ] **Step 4: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: PASS
