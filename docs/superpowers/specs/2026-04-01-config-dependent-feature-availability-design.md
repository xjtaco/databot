# Config-Dependent Feature Availability

When global configurations (LLM, web search, SMTP) are not set up, dependent features should gracefully degrade: workflow nodes become unavailable in the palette, copilot prompts exclude unconfigured node types, and chat/copilot interactions return clear error messages guiding users to Settings.

## Context

The system has three global config categories:
- **LLM** (`llm`): Required by Chat, Copilot, and the LLM workflow node
- **Web Search** (`web_search`): Required by the Web Search workflow node and copilot's `web_search` tool
- **SMTP** (`smtp`): Required by the Email workflow node

Currently:
- Chat already validates LLM config before processing messages (`coreAgentSession.ts:182-196`)
- Copilot does NOT validate LLM config — fails at runtime
- All 6 workflow node types are always available in the palette regardless of config state
- Copilot system prompt always includes all node type descriptions
- Node executors only check config at execution time (email executor checks SMTP)

## Design

### 1. Backend: Config Status Endpoint

**New endpoint:** `GET /api/global-config/status`

**Response type** (added to `globalConfig.types.ts`):
```typescript
export interface ConfigStatusResponse {
  llm: boolean;
  webSearch: boolean;
  smtp: boolean;
}
```

**Logic** (new function in `globalConfig.service.ts`):
```typescript
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

Reuses existing cached config getters — no additional DB queries in steady state.

**New handler** in `globalConfig.controller.ts`:
```typescript
export async function getConfigStatusHandler(_req: Request, res: Response): Promise<void> {
  const status = await getConfigStatus();
  res.json(status);
}
```

**New route** in `globalConfig.routes.ts`:
```
GET /status → getConfigStatusHandler
```

### 2. Backend: Copilot LLM Validation

In `copilotAgent.ts` `handleUserMessage()`, add LLM config check before building the system prompt (mirrors chat pattern):

```typescript
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

The `CopilotServerMessage` error type in `copilot.types.ts` needs extending to include `errorType` and `configType` optional fields.

### 3. Backend: Copilot Prompt Filtering

Modify `buildSystemPrompt()` signature in `copilotPrompt.ts`:

```typescript
export function buildSystemPrompt(
  autoFixEnabled: boolean,
  configStatus: ConfigStatusResponse
): string
```

Split `NODE_TYPE_DESCRIPTIONS` into individual section constants (one per node type). The builder conditionally includes each section:

- Always include: the `## Node Type Reference` header, `SQL Query`, `Python Script`, `Branch`
- Include `LLM Generation` only if `configStatus.llm === true`
- Include `Email Sending` only if `configStatus.smtp === true`
- Include `Web Search` only if `configStatus.webSearch === true`
- Each individual section constant includes its own trailing `---` separator; the builder joins included sections and strips the trailing separator from the last one.

Additionally, the `TOOL_USAGE_GUIDELINES` constant references `web_search` in the "Information Gathering Tools" list. This line should be conditionally included only when `configStatus.webSearch === true`.

The caller (`copilotAgent.ts`) fetches config status via `getConfigStatus()` before building the prompt.

**Copilot tool registry filtering:**

Pass `configStatus` to `createCopilotToolRegistry()` by adding it as a third parameter:

```typescript
createCopilotToolRegistry(workflowId, onProgress, configStatus)
```

Inside `createCopilotToolRegistry`:
- When `configStatus.webSearch === false`: skip registering the `web_search` tool
- When `configStatus.llm === false`: skip registering the `wf_add_node` tool's `llm` type option (remove `'llm'` from its allowed types enum)
- When `configStatus.smtp === false`: remove `'email'` from `wf_add_node` allowed types
- When `configStatus.webSearch === false`: remove `'web_search'` from `wf_add_node` allowed types

Since `CopilotAgent` constructs the tool registry in its constructor, and config status should be fetched once per connection, fetch `configStatus` in the constructor (async init pattern) or lazily on first message. The simpler approach: make `createCopilotToolRegistry` accept `configStatus`, and reconstruct the registry in `handleUserMessage()` on the first message (when the system prompt is also built), caching it for subsequent messages in the same session.

### 4. Frontend: Config Status API & Store

**New API function** in `frontend/src/api/globalConfig.ts`:
```typescript
export function getConfigStatus(): Promise<ConfigStatusResponse> {
  return http.get('/global-config/status');
}
```

**New type** in `frontend/src/types/globalConfig.ts` (or inline):
```typescript
export interface ConfigStatusResponse {
  llm: boolean;
  webSearch: boolean;
  smtp: boolean;
}
```

**Extend `globalConfigStore.ts`**:
```typescript
const configStatus = ref<ConfigStatusResponse | null>(null);

async function fetchConfigStatus(): Promise<void> {
  configStatus.value = await globalConfigApi.getConfigStatus();
}

const isLLMConfigured = computed(() => configStatus.value?.llm ?? false);
const isWebSearchConfigured = computed(() => configStatus.value?.webSearch ?? false);
const isSmtpConfigured = computed(() => configStatus.value?.smtp ?? false);
```

Call `fetchConfigStatus()` during app initialization.

**Cache invalidation:** After saving any config (LLM, web search, SMTP) in the store, call `fetchConfigStatus()` to refresh the status. This ensures that if a user configures LLM in Settings and then navigates to the workflow editor, the palette reflects the updated state without requiring a page refresh.

```typescript
// In saveLLMConfig, saveWebSearchConfig, saveSmtpConfig actions:
async function saveLLMConfig(data: LLMConfigForm): Promise<void> {
  // ... existing save logic ...
  await fetchConfigStatus(); // refresh availability
}
```

### 5. Frontend: Node Palette Disabled State

**`WfPaletteItem.vue`** changes:
- Add props: `disabled: boolean` (default false), `disabledReason: string` (tooltip text)
- When `disabled`:
  - Add CSS class `is-disabled` with `opacity: 0.4`, `cursor: not-allowed`
  - Prevent `dragstart` (return early in handler)
  - Wrap in `el-tooltip` showing `disabledReason`

**`WfNodePalette.vue`** changes:
- Import `useGlobalConfigStore` and read config status
- Pass disabled/disabledReason to config-dependent nodes:
  - `llm` node: disabled when `!isLLMConfigured`, reason from i18n `workflow.nodeDisabled.llm`
  - `email` node: disabled when `!isSmtpConfigured`, reason from i18n `workflow.nodeDisabled.smtp`
  - `web_search` node: disabled when `!isWebSearchConfigured`, reason from i18n `workflow.nodeDisabled.webSearch`
- Custom templates: same rules based on their `type` field

### 6. Frontend: Copilot Error Handling

In `copilotStore.ts`, the local `ErrorMsg` interface must be extended with optional `errorType` and `configType` fields to match the backend change:

```typescript
interface ErrorMsg {
  type: 'error';
  message: string;
  errorType?: 'config_missing';
  configType?: 'llm';
}
```

The `handleServerMessage` error case currently pushes error messages as plain assistant messages. Update it to recognize `errorType: 'config_missing'` and render the message as an error (same pattern chat uses — stops loading, displays the error message). The UX is the same as chat: the error text itself tells the user to go to Settings.

### 7. i18n Keys

Existing keys `errors.llmNotConfigured` and `errors.webSearchNotConfigured` are used for chat error messages. Tooltip text for disabled palette items may differ in wording, so add separate keys under `workflow.nodeDisabled`. Also add the missing `errors.smtpNotConfigured` for consistency.

Add to both `zh-CN.ts` and `en-US.ts`:

```typescript
workflow: {
  nodeDisabled: {
    llm: 'LLM 未配置，请前往设置页面进行配置' / 'LLM is not configured. Please go to Settings to configure.',
    webSearch: '网络搜索未配置，请前往设置页面进行配置' / 'Web search is not configured. Please go to Settings to configure.',
    smtp: '邮件发送服务未配置，请前往设置页面进行配置' / 'Email service is not configured. Please go to Settings to configure.',
  }
},
errors: {
  smtpNotConfigured: '邮件发送服务尚未配置...' / 'Email service is not configured...',
}
```

### 8. Testing

**Backend tests** (`backend/tests/`):
- `getConfigStatus()` returns correct booleans for various config states (all configured, none configured, partial)
- `buildSystemPrompt()` excludes correct NODE_TYPE_DESCRIPTIONS sections when config status has false values
- Copilot agent returns `config_missing` error when LLM is not configured

**Frontend tests** (`frontend/tests/`):
- `WfPaletteItem` with `disabled=true` prevents drag and renders tooltip
- `WfNodePalette` correctly computes disabled state from config store
- Global config store `fetchConfigStatus()` updates computed properties

## Files to Modify

### Backend
- `backend/src/globalConfig/globalConfig.types.ts` — add `ConfigStatusResponse`
- `backend/src/globalConfig/globalConfig.service.ts` — add `getConfigStatus()`
- `backend/src/globalConfig/globalConfig.controller.ts` — add `getConfigStatusHandler`
- `backend/src/globalConfig/globalConfig.routes.ts` — add `GET /status`
- `backend/src/copilot/copilot.types.ts` — extend error message type
- `backend/src/copilot/copilotAgent.ts` — add LLM validation, pass config status to prompt builder
- `backend/src/copilot/copilotPrompt.ts` — conditional node type sections
- `backend/src/copilot/copilotTools.ts` — filter tools based on config status

### Frontend
- `frontend/src/api/globalConfig.ts` — add `getConfigStatus()`
- `frontend/src/types/globalConfig.ts` (or equivalent) — add `ConfigStatusResponse`
- `frontend/src/stores/globalConfigStore.ts` — add config status state, actions, and re-fetch after config saves
- `frontend/src/stores/copilotStore.ts` — extend `ErrorMsg` interface, update error handling in `handleServerMessage`
- `frontend/src/components/workflow/WfPaletteItem.vue` — disabled state + tooltip
- `frontend/src/components/workflow/WfNodePalette.vue` — pass disabled based on config
- `frontend/src/locales/zh-CN.ts` — add `nodeDisabled` keys and `errors.smtpNotConfigured`
- `frontend/src/locales/en-US.ts` — add `nodeDisabled` keys and `errors.smtpNotConfigured`

### Tests
- `backend/tests/globalConfig/globalConfig.service.test.ts` — add `getConfigStatus()` tests (extend existing file)
- `backend/tests/copilot/copilotPrompt.test.ts` — new file, new directory
- `frontend/tests/components/workflow/WfPaletteItem.test.ts`
