# Workflow Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Copilot panel to the workflow editor that lets users create, configure, and debug workflows through natural language, powered by a backend LLM agent with workflow manipulation tools.

**Architecture:** A new `copilot/` backend module provides a dedicated WebSocket endpoint (`/ws/copilot`) and an agent loop that streams LLM responses and tool call status to the frontend. The frontend replaces the existing `WfConfigPanel` with a `WfCopilotPanel` that renders chat messages, operation status lines, and inline node configuration cards. Workflow tools call existing service/repository/engine functions.

**Tech Stack:** Express.js v5, WebSocket (ws), OpenAI-compatible LLM with tool calling, Vue 3 + Pinia + Element Plus, VueFlow

**Spec:** `docs/superpowers/specs/2026-03-25-workflow-copilot-design.md`

---

## File Structure

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `backend/src/copilot/copilotPrompt.ts` | System prompt builder + enriched node type descriptions |
| `backend/src/copilot/copilotTools.ts` | 12 workflow manipulation tools + scoped info-gathering tool wrappers |
| `backend/src/copilot/copilotAgent.ts` | Agent loop: LLM stream + tool calling + auto-fix logic |
| `backend/src/copilot/copilotWebSocket.ts` | WS endpoint `/ws/copilot`, connection lifecycle, message routing |
| `backend/src/copilot/copilot.types.ts` | WS message types (client/server), CopilotEvent union |
| `backend/src/copilot/index.ts` | Barrel exports |

### Backend — Modified Files

| File | Change |
|------|--------|
| `backend/src/errors/errorCode.ts` | Add E00032-E00034 |
| `backend/src/errors/types.ts` | Add CopilotSessionError, CopilotToolError, CopilotAgentLoopError |
| `backend/src/index.ts` | Call `initCopilotWebSocket(server)` |
| `backend/src/workflow/index.ts` | Export dagValidator functions for copilot tools |

### Backend — Test Files

| File | Coverage |
|------|----------|
| `backend/tests/copilotPrompt.test.ts` | System prompt construction, node descriptions, autoFix switching |
| `backend/tests/copilotTools.test.ts` | Each wf_* tool: params, execution, errors; scoped tool path validation |
| `backend/tests/copilotAgent.test.ts` | Agent loop: conversation, tool calling, abort, limits, auto-fix |
| `backend/tests/copilotWebSocket.test.ts` | WS connection, message routing, heartbeat, cleanup |

### Frontend — New Files

| File | Responsibility |
|------|---------------|
| `frontend/src/stores/copilotStore.ts` | Conversation state, WS connection, autoFix toggle, message handling |
| `frontend/src/components/workflow/copilot/WfCopilotPanel.vue` | Main 320px right panel container |
| `frontend/src/components/workflow/copilot/CopilotHeader.vue` | Title + AutoFix el-switch |
| `frontend/src/components/workflow/copilot/CopilotMessageList.vue` | Scrollable message list with auto-scroll |
| `frontend/src/components/workflow/copilot/CopilotUserMsg.vue` | User message bubble |
| `frontend/src/components/workflow/copilot/CopilotAssistantMsg.vue` | Agent text with markdown rendering |
| `frontend/src/components/workflow/copilot/CopilotToolStatus.vue` | Operation status line (running/success/error) |
| `frontend/src/components/workflow/copilot/CopilotNodeCard.vue` | Inline collapsible node config card |
| `frontend/src/components/workflow/copilot/CopilotInput.vue` | Textarea + send/abort buttons |
| `frontend/src/components/workflow/copilot/mobile/WfMobileCopilot.vue` | Full-screen mobile chat page |

### Frontend — Modified Files

| File | Change |
|------|--------|
| `frontend/src/stores/index.ts` | Export `useCopilotStore` |
| `frontend/src/stores/workflowStore.ts` | Add `handleExecutionEvent()` method |
| `frontend/src/components/workflow/WorkflowPage.vue` | Replace WfConfigPanel with WfCopilotPanel; change node click behavior; add mobile copilot route |
| `frontend/src/locales/zh-CN.ts` | Add `copilot` namespace |
| `frontend/src/locales/en-US.ts` | Add `copilot` namespace |

### Frontend — Test Files

| File | Coverage |
|------|----------|
| `frontend/tests/stores/copilotStore.test.ts` | Actions, WS message handling, state transitions |
| `frontend/tests/components/workflow/copilot/CopilotNodeCard.test.ts` | Collapse/expand, config editing |
| `frontend/tests/components/workflow/copilot/CopilotInput.test.ts` | Send/abort toggle, disabled state |

---

## Task 1: Backend — Error Codes and Types

**Files:**
- Modify: `backend/src/errors/errorCode.ts:1-37`
- Modify: `backend/src/errors/types.ts:220-232`
- Test: `backend/tests/copilotErrors.test.ts`

- [ ] **Step 1: Write failing test for new error types**

```typescript
// backend/tests/copilotErrors.test.ts
import { describe, it, expect } from 'vitest';
import { CopilotSessionError, CopilotToolError, CopilotAgentLoopError } from '@/errors/types';
import { ErrorCode } from '@/errors/errorCode';

describe('Copilot error types', () => {
  it('CopilotSessionError has correct code and status', () => {
    const err = new CopilotSessionError('session lost');
    expect(err.code).toBe('E00032');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('session lost');
    expect(err).toBeInstanceOf(CopilotSessionError);
  });

  it('CopilotToolError has correct code and status', () => {
    const err = new CopilotToolError('tool failed');
    expect(err.code).toBe('E00033');
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('tool failed');
    expect(err).toBeInstanceOf(CopilotToolError);
  });

  it('CopilotAgentLoopError has correct code and status', () => {
    const err = new CopilotAgentLoopError('loop exceeded');
    expect(err.code).toBe('E00034');
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('loop exceeded');
    expect(err).toBeInstanceOf(CopilotAgentLoopError);
  });

  it('ErrorCode constants exist', () => {
    expect(ErrorCode.COPILOT_SESSION_ERROR).toBe('E00032');
    expect(ErrorCode.COPILOT_TOOL_ERROR).toBe('E00033');
    expect(ErrorCode.COPILOT_AGENT_LOOP_ERROR).toBe('E00034');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/copilotErrors.test.ts`
Expected: FAIL — imports not found

- [ ] **Step 3: Add error codes to errorCode.ts**

In `backend/src/errors/errorCode.ts`, update the `LAST_USED_CODE` comment to `E00034` and add three new codes after line 36:

```typescript
  COPILOT_SESSION_ERROR: 'E00032',
  COPILOT_TOOL_ERROR: 'E00033',
  COPILOT_AGENT_LOOP_ERROR: 'E00034',
```

- [ ] **Step 4: Add error classes to types.ts**

Append to `backend/src/errors/types.ts` after `CustomNodeTemplateNotFoundError`:

```typescript
export class CopilotSessionError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.COPILOT_SESSION_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, CopilotSessionError.prototype);
  }
}

export class CopilotToolError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(
      message,
      ErrorCode.COPILOT_TOOL_ERROR,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      details,
      cause
    );
    Object.setPrototypeOf(this, CopilotToolError.prototype);
  }
}

export class CopilotAgentLoopError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(
      message,
      ErrorCode.COPILOT_AGENT_LOOP_ERROR,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      details,
      cause
    );
    Object.setPrototypeOf(this, CopilotAgentLoopError.prototype);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pnpm vitest run tests/copilotErrors.test.ts`
Expected: PASS — all 4 tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/src/errors/errorCode.ts backend/src/errors/types.ts backend/tests/copilotErrors.test.ts
git commit -m "feat(copilot): add error codes E00032-E00034 and error types"
```

---

## Task 2: Backend — Copilot Types

**Files:**
- Create: `backend/src/copilot/copilot.types.ts`
- Create: `backend/src/copilot/index.ts`

- [ ] **Step 1: Create copilot types file**

```typescript
// backend/src/copilot/copilot.types.ts
import { NodeConfig, WsWorkflowEvent } from '@/workflow/workflow.types';

// ── Client → Server Messages ─────────────────────────────
export interface CopilotUserMessage {
  type: 'user_message';
  content: string;
}

export interface CopilotSetAutoFix {
  type: 'set_auto_fix';
  enabled: boolean;
}

export interface CopilotAbort {
  type: 'abort';
}

export interface CopilotPing {
  type: 'ping';
}

export type CopilotClientMessage =
  | CopilotUserMessage
  | CopilotSetAutoFix
  | CopilotAbort
  | CopilotPing;

// ── Server → Client Messages ─────────────────────────────
export interface CopilotTextDelta {
  type: 'text_delta';
  content: string;
}

export interface CopilotTextDone {
  type: 'text_done';
}

export interface CopilotToolStart {
  type: 'tool_start';
  toolName: string;
  toolCallId: string;
  summary: string;
}

export interface CopilotToolDone {
  type: 'tool_done';
  toolCallId: string;
  success: boolean;
  summary: string;
}

export interface CopilotToolErrorEvent {
  type: 'tool_error';
  toolCallId: string;
  error: string;
}

export interface CopilotNodeConfigCard {
  type: 'node_config_card';
  nodeId: string;
  nodeName: string;
  nodeType: string;
  config: NodeConfig;
}

export interface CopilotWorkflowChanged {
  type: 'workflow_changed';
  changeType: 'node_added' | 'node_updated' | 'node_deleted' | 'edge_added' | 'edge_deleted';
  nodeId?: string;
}

export interface CopilotExecutionEvent {
  type: 'execution_event';
  event: WsWorkflowEvent;
}

export interface CopilotTurnDone {
  type: 'turn_done';
}

export interface CopilotPong {
  type: 'pong';
}

export interface CopilotErrorEvent {
  type: 'error';
  message: string;
}

export type CopilotServerMessage =
  | CopilotTextDelta
  | CopilotTextDone
  | CopilotToolStart
  | CopilotToolDone
  | CopilotToolErrorEvent
  | CopilotNodeConfigCard
  | CopilotWorkflowChanged
  | CopilotExecutionEvent
  | CopilotTurnDone
  | CopilotPong
  | CopilotErrorEvent;

// ── Agent Configuration ──────────────────────────────────
export const COPILOT_MAX_TOOL_CALLS_PER_TURN = 20;
export const COPILOT_MAX_AUTO_FIX_RETRIES = 3;
```

- [ ] **Step 2: Create barrel index**

```typescript
// backend/src/copilot/index.ts
export * from './copilot.types';
export { initCopilotWebSocket } from './copilotWebSocket';
```

Note: More exports will be added as files are created.

- [ ] **Step 3: Verify compilation**

Run: `cd backend && pnpm tsc --noEmit`
Expected: No errors (types-only file, no runtime dependencies yet)

- [ ] **Step 4: Commit**

```bash
git add backend/src/copilot/copilot.types.ts backend/src/copilot/index.ts
git commit -m "feat(copilot): add WebSocket message types and constants"
```

---

## Task 3: Backend — System Prompt and Node Descriptions

**Files:**
- Create: `backend/src/copilot/copilotPrompt.ts`
- Test: `backend/tests/copilotPrompt.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/tests/copilotPrompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/copilot/copilotPrompt';

describe('buildSystemPrompt', () => {
  it('includes role description', () => {
    const prompt = buildSystemPrompt(false);
    expect(prompt).toContain('数据工作流构建助手');
  });

  it('includes all three node type descriptions', () => {
    const prompt = buildSystemPrompt(false);
    expect(prompt).toContain('SQL 查询');
    expect(prompt).toContain('Python 脚本');
    expect(prompt).toContain('LLM 生成');
  });

  it('includes output_schema for each node type', () => {
    const prompt = buildSystemPrompt(false);
    expect(prompt).toContain('csvPath');
    expect(prompt).toContain('stderr');
    expect(prompt).toContain('rawResponse');
  });

  it('includes template syntax documentation', () => {
    const prompt = buildSystemPrompt(false);
    expect(prompt).toContain('{{');
  });

  it('includes auto-fix disabled instructions when false', () => {
    const prompt = buildSystemPrompt(false);
    expect(prompt).toContain('等待用户确认');
    expect(prompt).not.toContain('自动修复');
  });

  it('includes auto-fix enabled instructions when true', () => {
    const prompt = buildSystemPrompt(true);
    expect(prompt).toContain('自动修复');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/copilotPrompt.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement copilotPrompt.ts**

Create `backend/src/copilot/copilotPrompt.ts` with:
- `buildSystemPrompt(autoFixEnabled: boolean): string` — main export
- Sections: ROLE, NODE_TYPE_DESCRIPTIONS (SQL/Python/LLM with capabilities, config_schema, output_schema, usage_tips from the spec), TOOL_USAGE_GUIDELINES, AUTO_FIX_INSTRUCTIONS (conditional on flag), OUTPUT_FORMAT_RULES
- Node descriptions use the exact JSON structures from the design spec section "Enriched Node Type Descriptions"
- Auto-fix disabled text: instruct agent to report errors and suggest fixes, wait for user confirmation
- Auto-fix enabled text: instruct agent to automatically attempt fixes up to 3 times

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm vitest run tests/copilotPrompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/copilot/copilotPrompt.ts backend/tests/copilotPrompt.test.ts
git commit -m "feat(copilot): add system prompt builder with enriched node descriptions"
```

---

## Task 4: Backend — Workflow Manipulation Tools

This is the largest backend task. It implements the 12 workflow tools plus scoped info-gathering wrappers.

**Files:**
- Create: `backend/src/copilot/copilotTools.ts`
- Modify: `backend/src/workflow/index.ts` (export dagValidator functions)
- Test: `backend/tests/copilotTools.test.ts`

- [ ] **Step 1: Export dagValidator from workflow index**

In `backend/src/workflow/index.ts`, add:
```typescript
export { getUpstreamNodes, getDownstreamNodes } from './dagValidator';
```

- [ ] **Step 2: Write failing tests for key tools**

```typescript
// backend/tests/copilotTools.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the repository and service before imports
vi.mock('@/workflow/workflow.repository');
vi.mock('@/workflow/workflow.service');
vi.mock('@/workflow/executionEngine');

import {
  createCopilotToolExecutor,
  COPILOT_TOOL_NAMES,
} from '@/copilot/copilotTools';

describe('copilotTools', () => {
  describe('COPILOT_TOOL_NAMES', () => {
    it('contains all 12 workflow tools', () => {
      expect(COPILOT_TOOL_NAMES).toContain('wf_get_summary');
      expect(COPILOT_TOOL_NAMES).toContain('wf_add_node');
      expect(COPILOT_TOOL_NAMES).toContain('wf_update_node');
      expect(COPILOT_TOOL_NAMES).toContain('wf_delete_node');
      expect(COPILOT_TOOL_NAMES).toContain('wf_get_node');
      expect(COPILOT_TOOL_NAMES).toContain('wf_connect_nodes');
      expect(COPILOT_TOOL_NAMES).toContain('wf_disconnect_nodes');
      expect(COPILOT_TOOL_NAMES).toContain('wf_get_upstream');
      expect(COPILOT_TOOL_NAMES).toContain('wf_get_downstream');
      expect(COPILOT_TOOL_NAMES).toContain('wf_execute');
      expect(COPILOT_TOOL_NAMES).toContain('wf_execute_node');
      expect(COPILOT_TOOL_NAMES).toContain('wf_get_run_result');
    });
  });

  describe('createCopilotToolExecutor', () => {
    it('returns an object with execute and getToolSchemas', () => {
      const executor = createCopilotToolExecutor('test-workflow-id');
      expect(typeof executor.execute).toBe('function');
      expect(typeof executor.getToolSchemas).toBe('function');
    });

    it('getToolSchemas returns schemas for all tools', () => {
      const executor = createCopilotToolExecutor('test-workflow-id');
      const schemas = executor.getToolSchemas();
      expect(schemas.length).toBeGreaterThanOrEqual(12);
      for (const schema of schemas) {
        expect(schema).toHaveProperty('name');
        expect(schema).toHaveProperty('description');
        expect(schema).toHaveProperty('parameters');
      }
    });

    it('execute throws on unknown tool name', async () => {
      const executor = createCopilotToolExecutor('test-workflow-id');
      const result = await executor.execute('unknown_tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });
  });

  describe('scoped file tools', () => {
    it('scoped_glob rejects paths outside allowed directories', async () => {
      const executor = createCopilotToolExecutor('test-workflow-id');
      const result = await executor.execute('scoped_glob', { pattern: '*.md', path: '/etc' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/copilotTools.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement copilotTools.ts**

Create `backend/src/copilot/copilotTools.ts` with:

**Design pattern:** Instead of registering tools globally in ToolRegistry (which would leak them to the chat agent), create a `createCopilotToolExecutor(workflowId)` factory that returns a scoped executor. This keeps copilot tools isolated.

```typescript
// Key exports:
export const COPILOT_TOOL_NAMES: string[]  // list of all tool names
export function createCopilotToolExecutor(workflowId: string): CopilotToolExecutor

interface CopilotToolExecutor {
  execute(toolName: string, params: Record<string, unknown>): Promise<ToolResult>
  getToolSchemas(): Array<{ name: string; description: string; parameters: JSONSchemaObject }>
}
```

**Tool implementations:**
- `wf_get_summary` — calls `repository.findWorkflowById(workflowId)`, returns formatted summary of nodes (id, name, type, outputVariable) and edges (source→target)
- `wf_add_node` — calls `service.getWorkflow()` to get current state, appends new node to input, calls `service.saveWorkflow()`, returns new node id. Auto-positions nodes if position not provided (grid layout below existing nodes)
- `wf_update_node` — similar read-modify-save pattern, merges partial config into existing node config
- `wf_delete_node` — removes node and its edges from input, saves
- `wf_get_node` — reads workflow, finds node by id, returns full config
- `wf_connect_nodes` — adds edge to input, saves (DAG validation happens in service.saveWorkflow)
- `wf_disconnect_nodes` — removes edge from input, saves
- `wf_get_upstream` — calls `getUpstreamNodes()` from dagValidator, returns node names
- `wf_get_downstream` — calls `getDownstreamNodes()`, returns node names
- `wf_execute` — calls `executionEngine.executeWorkflow()`, returns run summary
- `wf_execute_node` — calls `executionEngine.executeNode()`, returns run summary
- `wf_get_run_result` — calls `repository.findRunById()`, returns formatted result

**Scoped info-gathering wrappers:**
- `scoped_glob`, `scoped_grep`, `scoped_read_file` — wrap existing tools with path validation against `config.data_dictionary_folder` and `config.knowledge_folder`
- `web_search` — pass through to existing ToolRegistry
- `sql` — pass through to existing ToolRegistry

Each tool has a JSON Schema definition for its parameters.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pnpm vitest run tests/copilotTools.test.ts`
Expected: PASS

- [ ] **Step 6: Run preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS — no lint/type errors

- [ ] **Step 7: Commit**

```bash
git add backend/src/copilot/copilotTools.ts backend/src/workflow/index.ts backend/tests/copilotTools.test.ts
git commit -m "feat(copilot): implement 12 workflow manipulation tools + scoped info tools"
```

---

## Task 5: Backend — Copilot Agent Loop

**Files:**
- Create: `backend/src/copilot/copilotAgent.ts`
- Test: `backend/tests/copilotAgent.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/tests/copilotAgent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/infrastructure/llm/factory');
vi.mock('@/copilot/copilotTools');
vi.mock('@/copilot/copilotPrompt');

import { CopilotAgent } from '@/copilot/copilotAgent';
import type { CopilotServerMessage } from '@/copilot/copilot.types';

describe('CopilotAgent', () => {
  let events: CopilotServerMessage[];
  let agent: CopilotAgent;

  beforeEach(() => {
    events = [];
    agent = new CopilotAgent('test-workflow-id', (event) => {
      events.push(event);
    });
  });

  it('constructs with correct initial state', () => {
    expect(agent.autoFixEnabled).toBe(false);
  });

  it('setAutoFix updates the flag', () => {
    agent.setAutoFix(true);
    expect(agent.autoFixEnabled).toBe(true);
  });

  it('abort sets the abort signal', () => {
    agent.abort();
    // Should not throw; verifies abort controller exists
  });

  it('sends turn_done at end of handleUserMessage', async () => {
    // Mock LLM to return simple text (no tool calls)
    // Implementation will need to mock LLMProviderFactory.getProvider().streamChat()
    // to yield a content event then done event
    // This test verifies the turn_done event is always sent
  });
});
```

Note: Full tests will mock `LLMProviderFactory.getProvider()` to return a mock provider whose `streamChat()` yields controlled `StreamEvent` sequences. Test scenarios:
1. Simple text response (no tools) → text_delta + text_done + turn_done
2. Tool call response → tool_start + tool_done + text_delta + turn_done
3. Abort mid-execution → turn_done still sent
4. Tool call limit exceeded → error event + turn_done
5. LLM API error → error event + turn_done

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/copilotAgent.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement copilotAgent.ts**

Create `backend/src/copilot/copilotAgent.ts`:

```typescript
export class CopilotAgent {
  private messages: Message[]
  private workflowId: string
  autoFixEnabled: boolean
  private sendEvent: (event: CopilotServerMessage) => void
  private abortController: AbortController
  private toolExecutor: CopilotToolExecutor

  constructor(workflowId: string, sendEvent: (event: CopilotServerMessage) => void)

  setAutoFix(enabled: boolean): void
  abort(): void

  async handleUserMessage(content: string): Promise<void>
  // Main loop:
  // 1. Push user message to messages array
  // 2. Build system prompt via buildSystemPrompt(autoFixEnabled)
  // 3. Loop: call provider.streamChat(messages, { tools })
  // 4. Process StreamEvent:
  //    - type 'content' → sendEvent({ type: 'text_delta', content })
  //    - type 'tool_call' → accumulate tool calls
  //    - type 'tool_call_result' → NOT used (we handle tool execution ourselves)
  //    - type 'done' → check if tool calls accumulated
  // 5. If tool calls: execute each, send tool_start/tool_done, push results to messages
  //    Also send workflow_changed and node_config_card events as appropriate
  // 6. If no tool calls: send text_done, break loop
  // 7. Check abort signal and tool call count limit between iterations
  // 8. Always send turn_done at the end (in finally block)
}
```

**Important implementation detail:** The existing `OpenAIProvider.streamChat()` auto-executes tool calls internally (lines 218-223 in openai.ts). The copilot agent needs to handle tool execution itself to send intermediate events. Two approaches:
- **Option A:** Call `streamChat()` WITHOUT tools, then manually handle tool calls from the response. But this breaks the streaming tool call accumulation.
- **Option B (recommended):** Use `provider.chat()` (non-streaming) for tool call rounds, and only stream text responses. This simplifies the agent loop while still streaming text to the user.
- **Option C:** Create a `streamChatRaw()` variant that yields tool calls without auto-executing. This is the cleanest but requires modifying OpenAIProvider.

Recommended: Start with **Option B** (non-streaming for tool rounds). Text streaming happens when the LLM returns no tool calls. This can be enhanced to full streaming later.

Actual implementation: call `provider.chat()` in a loop. When the response has `toolCalls`, execute them and continue. When no `toolCalls`, stream the final text response character-by-character (simulated streaming for consistent UX), or use `streamChat()` for the final text-only call.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pnpm vitest run tests/copilotAgent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/copilot/copilotAgent.ts backend/tests/copilotAgent.test.ts
git commit -m "feat(copilot): implement agent loop with LLM + tool calling"
```

---

## Task 6: Backend — Copilot WebSocket

**Files:**
- Create: `backend/src/copilot/copilotWebSocket.ts`
- Modify: `backend/src/copilot/index.ts` (update exports)
- Modify: `backend/src/index.ts` (add init call)
- Test: `backend/tests/copilotWebSocket.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/tests/copilotWebSocket.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/copilot/copilotAgent');

// Test that initCopilotWebSocket exports correctly
import { initCopilotWebSocket } from '@/copilot/copilotWebSocket';

describe('copilotWebSocket', () => {
  it('exports initCopilotWebSocket function', () => {
    expect(typeof initCopilotWebSocket).toBe('function');
  });
});
```

Note: Full WS integration tests will require a test HTTP server. Key scenarios to test:
1. Connection with valid workflowId → accepted
2. Connection without workflowId → closed with 4000
3. Connection with invalid workflowId (not UUID) → closed with 4001
4. user_message → triggers agent.handleUserMessage
5. set_auto_fix → updates agent.autoFixEnabled
6. abort → calls agent.abort()
7. ping → responds with pong
8. Disconnect → cleans up agent

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pnpm vitest run tests/copilotWebSocket.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement copilotWebSocket.ts**

Create `backend/src/copilot/copilotWebSocket.ts` following the exact pattern from `workflow/workflowWebSocket.ts`:

```typescript
import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { IncomingMessage } from 'http';
import logger from '@/utils/logger';
import { CopilotAgent } from './copilotAgent';
import type { CopilotClientMessage, CopilotServerMessage } from './copilot.types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let wss: WebSocketServer | null = null;

export function initCopilotWebSocket(server: HttpServer): void {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = new globalThis.URL(request.url ?? '', `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname !== '/ws/copilot') return;
    wss!.handleUpgrade(request, socket, head, (ws) => {
      wss!.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    // Parse workflowId from query
    // Validate UUID format
    // Create CopilotAgent instance with sendEvent callback
    // Route incoming messages to agent methods
    // Cleanup on close/error
  });
}
```

Key behaviors:
- Parses `workflowId` from query string (required, UUID format)
- Creates one `CopilotAgent` per connection
- Routes parsed JSON messages to agent methods based on `type`
- `sendEvent` callback: `ws.send(JSON.stringify(event))` with readyState check
- Cleanup: no explicit cleanup needed (agent is GC'd with connection)
- Error handling: wraps message parsing in try/catch, logs errors

- [ ] **Step 4: Update copilot/index.ts exports**

Ensure `initCopilotWebSocket` is exported from the barrel.

- [ ] **Step 5: Wire into server startup**

In `backend/src/index.ts`, add import and init call:
- Import: `import { initCopilotWebSocket } from './copilot';`
- After line 94 (`initWorkflowWebSocket(server)`), add: `initCopilotWebSocket(server);`

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pnpm vitest run tests/copilotWebSocket.test.ts`
Expected: PASS

- [ ] **Step 7: Run full backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/copilot/ backend/src/index.ts backend/tests/copilotWebSocket.test.ts
git commit -m "feat(copilot): add WebSocket endpoint /ws/copilot with agent lifecycle"
```

---

## Task 7: Frontend — i18n Keys

**Files:**
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`

- [ ] **Step 1: Add copilot namespace to zh-CN.ts**

Add after the `workflow` section:

```typescript
copilot: {
  title: 'Copilot',
  autoFix: '自动修复',
  placeholder: '描述你想要的工作流...',
  send: '发送',
  abort: '中断',
  reconnecting: '正在重连...',
  disconnected: '连接已断开',
  turnLimit: 'Agent 达到操作上限，请检查当前状态',
  toolStatus: {
    creating: '创建节点 {name}...',
    created: '节点已创建',
    updating: '更新节点 {name}...',
    updated: '节点已更新',
    connecting: '连接 {source} → {target}...',
    connected: '已连接',
    executing: '执行工作流...',
    executionDone: '执行完成',
    executionFailed: '执行失败: {error}',
    fixAttempt: '尝试修复 (第{n}次)...',
  },
},
```

- [ ] **Step 2: Add copilot namespace to en-US.ts**

```typescript
copilot: {
  title: 'Copilot',
  autoFix: 'Auto Fix',
  placeholder: 'Describe the workflow you want...',
  send: 'Send',
  abort: 'Abort',
  reconnecting: 'Reconnecting...',
  disconnected: 'Disconnected',
  turnLimit: 'Agent reached operation limit, please check current status',
  toolStatus: {
    creating: 'Creating node {name}...',
    created: 'Node created',
    updating: 'Updating node {name}...',
    updated: 'Node updated',
    connecting: 'Connecting {source} → {target}...',
    connected: 'Connected',
    executing: 'Executing workflow...',
    executionDone: 'Execution complete',
    executionFailed: 'Execution failed: {error}',
    fixAttempt: 'Fix attempt #{n}...',
  },
},
```

- [ ] **Step 3: Verify compilation**

Run: `cd frontend && pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/locales/zh-CN.ts frontend/src/locales/en-US.ts
git commit -m "feat(copilot): add i18n keys for copilot UI"
```

---

## Task 8: Frontend — Copilot Store

**Files:**
- Create: `frontend/src/stores/copilotStore.ts`
- Modify: `frontend/src/stores/index.ts`
- Modify: `frontend/src/stores/workflowStore.ts` (add handleExecutionEvent)
- Test: `frontend/tests/stores/copilotStore.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// frontend/tests/stores/copilotStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCopilotStore } from '@/stores/copilotStore';

describe('copilotStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with correct defaults', () => {
    const store = useCopilotStore();
    expect(store.isConnected).toBe(false);
    expect(store.workflowId).toBeNull();
    expect(store.messages).toEqual([]);
    expect(store.isAgentThinking).toBe(false);
    expect(store.autoFixEnabled).toBe(false);
  });

  it('reset clears all state', () => {
    const store = useCopilotStore();
    store.messages.push({ type: 'user', content: 'test' });
    store.isAgentThinking = true;
    store.reset();
    expect(store.messages).toEqual([]);
    expect(store.isAgentThinking).toBe(false);
  });

  describe('handleServerMessage', () => {
    it('handles text_delta by appending to assistant message', () => {
      const store = useCopilotStore();
      store.handleServerMessage({ type: 'text_delta', content: 'Hello' });
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0]).toEqual({ type: 'assistant', content: 'Hello', done: false });
    });

    it('handles text_delta by appending to existing assistant message', () => {
      const store = useCopilotStore();
      store.handleServerMessage({ type: 'text_delta', content: 'Hello' });
      store.handleServerMessage({ type: 'text_delta', content: ' world' });
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0]).toEqual({ type: 'assistant', content: 'Hello world', done: false });
    });

    it('handles text_done by marking assistant message done', () => {
      const store = useCopilotStore();
      store.handleServerMessage({ type: 'text_delta', content: 'Hi' });
      store.handleServerMessage({ type: 'text_done' });
      expect(store.messages[0]).toEqual({ type: 'assistant', content: 'Hi', done: true });
    });

    it('handles tool_start by adding tool_status message', () => {
      const store = useCopilotStore();
      store.handleServerMessage({
        type: 'tool_start',
        toolName: 'wf_add_node',
        toolCallId: 'tc1',
        summary: 'Creating node',
      });
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0]).toEqual({
        type: 'tool_status',
        toolCallId: 'tc1',
        toolName: 'wf_add_node',
        status: 'running',
        summary: 'Creating node',
      });
    });

    it('handles tool_done by updating tool_status', () => {
      const store = useCopilotStore();
      store.handleServerMessage({
        type: 'tool_start',
        toolName: 'wf_add_node',
        toolCallId: 'tc1',
        summary: 'Creating node',
      });
      store.handleServerMessage({
        type: 'tool_done',
        toolCallId: 'tc1',
        success: true,
        summary: 'Node created',
      });
      expect(store.messages[0]).toMatchObject({
        type: 'tool_status',
        status: 'success',
        summary: 'Node created',
      });
    });

    it('handles turn_done by clearing isAgentThinking', () => {
      const store = useCopilotStore();
      store.isAgentThinking = true;
      store.handleServerMessage({ type: 'turn_done' });
      expect(store.isAgentThinking).toBe(false);
    });

    it('handles error by adding assistant message', () => {
      const store = useCopilotStore();
      store.isAgentThinking = true;
      store.handleServerMessage({ type: 'error', message: 'Something went wrong' });
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0]).toEqual({
        type: 'assistant',
        content: 'Something went wrong',
        done: true,
      });
      expect(store.isAgentThinking).toBe(false);
    });

    it('handles node_config_card by adding card message', () => {
      const store = useCopilotStore();
      store.handleServerMessage({
        type: 'node_config_card',
        nodeId: 'n1',
        nodeName: 'Query',
        nodeType: 'sql',
        config: { nodeType: 'sql', datasourceId: 'ds1', sql: 'SELECT 1', outputVariable: 'q' },
      });
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0]).toMatchObject({ type: 'node_config_card', nodeId: 'n1' });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/stores/copilotStore.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement copilotStore.ts**

Create `frontend/src/stores/copilotStore.ts` using composition API pattern:

State:
- `isConnected: ref(false)`
- `workflowId: ref<string | null>(null)`
- `messages: ref<CopilotMessage[]>([])`
- `isAgentThinking: ref(false)`
- `autoFixEnabled: ref(false)`

Types (define at top of file):
```typescript
export type CopilotMessage =
  | { type: 'user'; content: string }
  | { type: 'assistant'; content: string; done: boolean }
  | { type: 'tool_status'; toolCallId: string; toolName: string; status: 'running' | 'success' | 'error'; summary: string }
  | { type: 'node_config_card'; nodeId: string; nodeName: string; nodeType: string; config: NodeConfig }
```

Actions:
- `connect(wfId: string)` — stores workflowId, creates WebSocket to `/ws/copilot?workflowId=<id>`, registers message handler
- `disconnect()` — closes WS, resets isConnected
- `sendMessage(content: string)` — pushes user message, sends via WS, sets isAgentThinking=true
- `setAutoFix(enabled: boolean)` — sends via WS, updates local state
- `abort()` — sends abort via WS
- `reset()` — clears messages, sets isAgentThinking=false
- `handleServerMessage(msg: CopilotServerMessage)` — the switch statement from spec
- `appendNodeConfigCard(nodeId, nodeName, nodeType, config)` — for canvas node clicks

Internal WS message handling: use `useWebSocket` composable pattern but create the connection manually (since it needs to be called imperatively, not in setup). Use raw WebSocket with reconnect logic.

- [ ] **Step 4: Add handleExecutionEvent to workflowStore**

In `frontend/src/stores/workflowStore.ts`, add a new method that maps `WsWorkflowEvent` to execution state updates:

```typescript
function handleExecutionEvent(event: WsWorkflowEvent): void {
  switch (event.type) {
    case 'node_start':
      updateNodeExecutionStatus(event.nodeId, 'running');
      break;
    case 'node_complete':
      updateNodeExecutionStatus(event.nodeId, 'completed');
      break;
    case 'node_error':
      updateNodeExecutionStatus(event.nodeId, 'failed');
      break;
    case 'node_skipped':
      updateNodeExecutionStatus(event.nodeId, 'skipped');
      break;
    case 'run_complete':
      isExecuting.value = false;
      break;
  }
}
```

Add `handleExecutionEvent` to the return object.

Also define or import the `WsWorkflowEvent` type in the frontend. Add to `frontend/src/types/workflow.ts` (or wherever the workflow types are defined).

- [ ] **Step 5: Export from stores/index.ts**

Add: `export { useCopilotStore } from './copilotStore';`

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run tests/stores/copilotStore.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/stores/copilotStore.ts frontend/src/stores/index.ts frontend/src/stores/workflowStore.ts frontend/tests/stores/copilotStore.test.ts
git commit -m "feat(copilot): add copilot store with WS message handling"
```

---

## Task 9: Frontend — Copilot UI Components (Desktop)

**Files:**
- Create: `frontend/src/components/workflow/copilot/CopilotHeader.vue`
- Create: `frontend/src/components/workflow/copilot/CopilotUserMsg.vue`
- Create: `frontend/src/components/workflow/copilot/CopilotAssistantMsg.vue`
- Create: `frontend/src/components/workflow/copilot/CopilotToolStatus.vue`
- Create: `frontend/src/components/workflow/copilot/CopilotInput.vue`
- Test: `frontend/tests/components/workflow/copilot/CopilotInput.test.ts`

These are simpler, presentational components. Build them first before the composite ones.

- [ ] **Step 1: Write failing test for CopilotInput**

```typescript
// frontend/tests/components/workflow/copilot/CopilotInput.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import CopilotInput from '@/components/workflow/copilot/CopilotInput.vue';

describe('CopilotInput', () => {
  it('renders textarea', () => {
    const wrapper = mount(CopilotInput, {
      props: { disabled: false },
    });
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('disables input when disabled prop is true', () => {
    const wrapper = mount(CopilotInput, {
      props: { disabled: true },
    });
    // El-input disabled state
    expect(wrapper.find('.is-disabled').exists()).toBe(true);
  });

  it('emits send event with content', async () => {
    const wrapper = mount(CopilotInput, {
      props: { disabled: false },
    });
    // Set value and trigger send
    await wrapper.find('textarea').setValue('Hello');
    await wrapper.find('.copilot-input__send-btn').trigger('click');
    expect(wrapper.emitted('send')).toBeTruthy();
    expect(wrapper.emitted('send')![0]).toEqual(['Hello']);
  });

  it('emits abort event when thinking', async () => {
    const wrapper = mount(CopilotInput, {
      props: { disabled: true, isThinking: true },
    });
    await wrapper.find('.copilot-input__abort-btn').trigger('click');
    expect(wrapper.emitted('abort')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/components/workflow/copilot/CopilotInput.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement all simple components**

**CopilotHeader.vue:**
- Props: `autoFixEnabled: boolean`
- Emits: `update:autoFixEnabled`
- Template: flex row with "Copilot" title (i18n) + `el-switch` for auto-fix
- Style: 48px height, border-bottom, padding

**CopilotUserMsg.vue:**
- Props: `content: string`
- Template: right-aligned message bubble with user content
- Style: blue-ish background, rounded corners, max-width 85%

**CopilotAssistantMsg.vue:**
- Props: `content: string`, `done: boolean`
- Template: left-aligned message with markdown rendering (use `v-html` with a markdown-to-html utility, or simple `white-space: pre-wrap` for MVP)
- Style: light background, rounded corners

**CopilotToolStatus.vue:**
- Props: `status: 'running' | 'success' | 'error'`, `summary: string`
- Template: single line with status icon (▶/✓/✗) and summary text
- Style: compact, monospace-feel, color-coded by status

**CopilotInput.vue:**
- Props: `disabled: boolean`, `isThinking: boolean`
- Emits: `send(content: string)`, `abort()`
- Template: `el-input` textarea (autosize, 1-4 rows) + conditional send/abort button
- Enter to send (without shift), Shift+Enter for newline
- Style: border-top, padding, fixed at bottom

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run tests/components/workflow/copilot/CopilotInput.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workflow/copilot/
git commit -m "feat(copilot): add simple UI components (header, messages, input)"
```

---

## Task 10: Frontend — CopilotNodeCard

**Files:**
- Create: `frontend/src/components/workflow/copilot/CopilotNodeCard.vue`
- Test: `frontend/tests/components/workflow/copilot/CopilotNodeCard.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// frontend/tests/components/workflow/copilot/CopilotNodeCard.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import CopilotNodeCard from '@/components/workflow/copilot/CopilotNodeCard.vue';

describe('CopilotNodeCard', () => {
  const defaultProps = {
    nodeId: 'n1',
    nodeName: 'Query Users',
    nodeType: 'sql',
    config: {
      nodeType: 'sql' as const,
      datasourceId: 'ds1',
      sql: 'SELECT * FROM users WHERE active = true',
      outputVariable: 'users',
    },
  };

  it('renders collapsed by default', () => {
    const wrapper = mount(CopilotNodeCard, { props: defaultProps });
    expect(wrapper.find('.copilot-node-card__summary').exists()).toBe(true);
    expect(wrapper.find('.copilot-node-card__expanded').exists()).toBe(false);
  });

  it('shows node name and type icon', () => {
    const wrapper = mount(CopilotNodeCard, { props: defaultProps });
    expect(wrapper.text()).toContain('Query Users');
  });

  it('shows config summary in collapsed state', () => {
    const wrapper = mount(CopilotNodeCard, { props: defaultProps });
    expect(wrapper.text()).toContain('SELECT * FROM users');
  });

  it('expands on click', async () => {
    const wrapper = mount(CopilotNodeCard, { props: defaultProps });
    await wrapper.find('.copilot-node-card__header').trigger('click');
    expect(wrapper.find('.copilot-node-card__expanded').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run tests/components/workflow/copilot/CopilotNodeCard.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement CopilotNodeCard.vue**

Structure:
- Props: `nodeId`, `nodeName`, `nodeType`, `config` (NodeConfig)
- Internal state: `isExpanded: ref(false)`
- Collapsed: node type icon (colored) + name + config summary (first 50 chars of sql/script/prompt)
- Expanded: renders the appropriate config component (WfConfigSqlQuery / WfConfigPythonScript / WfConfigLlmGenerate)
- On config change in expanded mode: emits `configUpdated` event for parent to call `workflowStore.updateNodeConfig()`
- Style: card with border, rounded corners, subtle background, click-to-toggle header

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run tests/components/workflow/copilot/CopilotNodeCard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workflow/copilot/CopilotNodeCard.vue frontend/tests/components/workflow/copilot/CopilotNodeCard.test.ts
git commit -m "feat(copilot): add inline node config card component"
```

---

## Task 11: Frontend — CopilotMessageList and WfCopilotPanel

**Files:**
- Create: `frontend/src/components/workflow/copilot/CopilotMessageList.vue`
- Create: `frontend/src/components/workflow/copilot/WfCopilotPanel.vue`

- [ ] **Step 1: Implement CopilotMessageList.vue**

- Props: `messages: CopilotMessage[]`
- Emits: `configUpdated(nodeId: string, updates: Partial<NodeConfig>)`
- Template: scrollable container that renders each message by type:
  - `type === 'user'` → `<CopilotUserMsg>`
  - `type === 'assistant'` → `<CopilotAssistantMsg>`
  - `type === 'tool_status'` → `<CopilotToolStatus>`
  - `type === 'node_config_card'` → `<CopilotNodeCard>`
- Auto-scroll to bottom on new messages (use `nextTick` + `scrollTo`)
- Style: flex-grow, overflow-y auto, padding

- [ ] **Step 2: Implement WfCopilotPanel.vue**

The main container that orchestrates everything:

```vue
<template>
  <div class="wf-copilot-panel">
    <CopilotHeader
      :auto-fix-enabled="copilotStore.autoFixEnabled"
      @update:auto-fix-enabled="copilotStore.setAutoFix"
    />
    <CopilotMessageList
      :messages="copilotStore.messages"
      @config-updated="handleConfigUpdated"
    />
    <CopilotInput
      :disabled="copilotStore.isAgentThinking"
      :is-thinking="copilotStore.isAgentThinking"
      @send="copilotStore.sendMessage"
      @abort="copilotStore.abort"
    />
  </div>
</template>
```

- Uses `copilotStore` and `workflowStore`
- `handleConfigUpdated(nodeId, updates)` → calls `workflowStore.updateNodeConfig(nodeId, updates)`
- Watches `workflowStore.selectedNodeId` — when a node is clicked on canvas, calls `copilotStore.appendNodeConfigCard(...)` to add an inline config card
- Style: 320px width, flex column, full height, border-left

- [ ] **Step 3: Verify compilation**

Run: `cd frontend && pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/workflow/copilot/CopilotMessageList.vue frontend/src/components/workflow/copilot/WfCopilotPanel.vue
git commit -m "feat(copilot): add message list and main copilot panel"
```

---

## Task 12: Frontend — Integrate CopilotPanel into WorkflowPage

**Files:**
- Modify: `frontend/src/components/workflow/WorkflowPage.vue`

- [ ] **Step 1: Replace WfConfigPanel with WfCopilotPanel in desktop layout**

In `WorkflowPage.vue`:
1. Replace the `WfConfigPanel` import with `WfCopilotPanel`
2. In the desktop editor template section, replace `<WfConfigPanel v-if="store.selectedNode" />` with `<WfCopilotPanel />`
3. Add lifecycle: on `loadForEditing(id)`, call `copilotStore.connect(id)`; on `closeEditor()`, call `copilotStore.disconnect()`
4. Change canvas node click: instead of just setting `selectedNodeId`, also append a config card to copilot (this is handled inside WfCopilotPanel's watcher)

- [ ] **Step 2: Verify desktop layout works**

Run: `cd frontend && pnpm tsc --noEmit`
Expected: No type errors

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/workflow/WorkflowPage.vue
git commit -m "feat(copilot): integrate copilot panel into workflow editor page"
```

---

## Task 13: Frontend — Mobile Copilot

**Files:**
- Create: `frontend/src/components/workflow/copilot/mobile/WfMobileCopilot.vue`
- Modify: `frontend/src/components/workflow/WorkflowPage.vue` (mobile section)

- [ ] **Step 1: Implement WfMobileCopilot.vue**

Full-screen mobile chat page:
- Header: back button + "Copilot" title + AutoFix toggle
- Body: `<CopilotMessageList>` (reuses desktop component)
- Footer: `<CopilotInput>` (reuses desktop component)
- Back button emits `back` event to return to mobile node list

- [ ] **Step 2: Add copilot entry point in mobile WorkflowPage**

In the mobile section of `WorkflowPage.vue`:
- Add a "Copilot" button (floating or in header)
- When clicked, show `WfMobileCopilot` in full-screen mode (conditional rendering)
- Back button returns to node list view

- [ ] **Step 3: Verify compilation**

Run: `cd frontend && pnpm run preflight`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/workflow/copilot/mobile/WfMobileCopilot.vue frontend/src/components/workflow/WorkflowPage.vue
git commit -m "feat(copilot): add full-screen mobile copilot view"
```

---

## Task 14: Full Integration Test and Preflight

**Files:** No new files

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && pnpm vitest run`
Expected: All tests pass

- [ ] **Step 2: Run backend preflight**

Run: `cd backend && pnpm run preflight`
Expected: ESLint + TypeScript + Prettier all pass

- [ ] **Step 3: Run all frontend tests**

Run: `cd frontend && pnpm vitest run`
Expected: All tests pass

- [ ] **Step 4: Run frontend preflight**

Run: `cd frontend && pnpm run preflight`
Expected: ESLint + TypeScript + Prettier all pass

- [ ] **Step 5: Fix any issues found**

Address any lint errors, type errors, or test failures.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "fix(copilot): address preflight issues"
```

(Only if there were fixes needed.)
