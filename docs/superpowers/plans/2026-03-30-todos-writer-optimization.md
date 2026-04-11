# TodosWriter Tool Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the `todos_writer` tool by reducing token consumption, improving the parameter schema, and integrating it into the CopilotAgent.

**Architecture:** Rewrite the backend tool with a concise description and minimal return value. Update CoreAgent and CopilotAgent system prompts with task tracking guidance. Add a `todos_update` event to the copilot event system for frontend integration. Update all tests and frontend components to match the new schema.

**Tech Stack:** TypeScript, Express.js, Vue 3, Pinia, Vitest, Element Plus

**Spec:** `docs/superpowers/specs/2026-03-30-todos-writer-optimization-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `backend/src/infrastructure/tools/todosWriter.ts` | Tool class: schema, validation, execution |
| `backend/src/agent/coreAgentSession.ts` | CoreAgent system prompt with task tracking section |
| `backend/src/copilot/copilotPrompt.ts` | CopilotAgent system prompt with task tracking subsection |
| `backend/src/copilot/copilotTools.ts` | Copilot tool registry (add TodosWriter) |
| `backend/src/copilot/copilot.types.ts` | Copilot event types (add CopilotTodosUpdate) |
| `backend/src/copilot/copilotAgent.ts` | Copilot agent (emit todos_update on tool completion) |
| `frontend/src/types/websocket.ts` | Shared TodoItem type |
| `frontend/src/components/chat/TodosStatusBar.vue` | Chat status bar (show activeForm) |
| `frontend/src/stores/copilotStore.ts` | Copilot store (handle todos_update event) |
| `frontend/src/components/workflow/copilot/CopilotHeader.vue` | Copilot header (add TodosStatusBar) |
| `backend/tests/infrastructure/tools/todosWriter/validation.test.ts` | Validation tests |
| `backend/tests/infrastructure/tools/todosWriter/basic-execution.test.ts` | Execution tests |

---

### Task 1: Rewrite TodosWriter Tool — Tests First

**Files:**
- Modify: `backend/tests/infrastructure/tools/todosWriter/validation.test.ts`
- Modify: `backend/tests/infrastructure/tools/todosWriter/basic-execution.test.ts`
- Modify: `backend/src/infrastructure/tools/todosWriter.ts`

- [ ] **Step 1: Update validation tests — change `description` to `content` + `activeForm`**

Apply the following changes to **ALL** test cases in `backend/tests/infrastructure/tools/todosWriter/validation.test.ts` (there are 20+ cases — every single one must be updated):

1. Replace every `{ description: '...', status: '...' }` fixture with `{ content: '...', activeForm: '...', status: '...' }`.
2. Rename test descriptions that mention "description" to say "content" instead (e.g., `'should reject when description is missing'` → `'should reject when content is missing'`).
3. Add new `activeForm`-specific validation tests (shown below).

For example:

```typescript
// Before:
{ description: '读取用户数据', status: 'pending' }
// After:
{ content: '读取用户数据', activeForm: '正在读取用户数据...', status: 'pending' }
```

Also add new validation test cases for `activeForm`:

```typescript
it('should reject when activeForm is missing', () => {
  const params = {
    todos: [{ content: '测试任务', status: 'pending' }],
  };
  const isValid = todosWriter.validate(params);
  expect(isValid).toBe(false);
});

it('should reject when activeForm is empty string', () => {
  const params = {
    todos: [{ content: '测试任务', activeForm: '', status: 'pending' }],
  };
  const isValid = todosWriter.validate(params);
  expect(isValid).toBe(false);
});

it('should reject when activeForm contains only whitespace', () => {
  const params = {
    todos: [{ content: '测试任务', activeForm: '   ', status: 'pending' }],
  };
  const isValid = todosWriter.validate(params);
  expect(isValid).toBe(false);
});

it('should reject when activeForm is not a string', () => {
  const params = {
    todos: [{ content: '测试任务', activeForm: 123, status: 'pending' }],
  };
  const isValid = todosWriter.validate(params);
  expect(isValid).toBe(false);
});
```

- [ ] **Step 2: Update execution tests — change fixtures and assertions**

In `backend/tests/infrastructure/tools/todosWriter/basic-execution.test.ts`:

1. Change all `{ description: '...', status: '...' }` to `{ content: '...', activeForm: '...', status: '...' }`.
2. Change all assertions on `result.data` — it is now a **string** (`'Todos updated successfully.'`), not an object. Stats are in `result.metadata`.

For example, the first test becomes:

```typescript
it('should return success with minimal data for LLM', async () => {
  const params = {
    todos: [
      { content: '读取用户数据', activeForm: '正在读取用户数据...', status: 'pending' },
      { content: '分析数据趋势', activeForm: '正在分析数据趋势...', status: 'pending' },
      { content: '生成报告', activeForm: '正在生成报告...', status: 'pending' },
    ],
  };

  const result = await todosWriter.execute(params);

  expect(result.success).toBe(true);
  // result.data is now a simple string for LLM
  expect(result.data).toBe('Todos updated successfully.');
  // Stats are in metadata
  expect(result.metadata).toBeDefined();
  expect(result.metadata!.count).toBe(3);
  expect(result.metadata!.pending).toBe(3);
  expect(result.metadata!.completed).toBe(0);
  expect(result.metadata!.inProgress).toBe(0);
});
```

Apply the same pattern to all execution tests: assert `result.data` is the string `'Todos updated successfully.'` and check stats on `result.metadata`.

For the "zero tasks in_progress" and "exactly one task in_progress" tests in validation.test.ts (the `execute()` error scenarios section), update them similarly:

```typescript
it('should allow zero tasks in_progress', async () => {
  const params = {
    todos: [
      { content: '任务1', activeForm: '正在执行任务1...', status: 'pending' },
      { content: '任务2', activeForm: '正在执行任务2...', status: 'pending' },
    ],
  };
  const result = await todosWriter.execute(params);
  expect(result.success).toBe(true);
  expect(result.metadata!.inProgress).toBe(0);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /data/code/databot/backend && pnpm vitest run tests/infrastructure/tools/todosWriter/ --reporter=verbose`

Expected: Many failures because the implementation still uses the old schema.

- [ ] **Step 4: Rewrite `todosWriter.ts` implementation**

Rewrite `backend/src/infrastructure/tools/todosWriter.ts` with:

1. **Concise description** (replace ~80 lines with ~5 lines):

```typescript
description = `Manage subtask lists for tracking complex multi-step tasks. Each todo item has: content (task description in imperative form), activeForm (present continuous form shown during execution), and status (pending, in_progress, completed, cancelled). Only one task can be in_progress at a time. Send the complete list on each call (full replacement).`;
```

2. **New parameters schema** — add `content` and `activeForm` fields, remove `description`:

```typescript
parameters: JSONSchemaObject = {
  type: 'object',
  properties: {
    todos: {
      type: 'array',
      description: 'Complete list of todo items, which will replace the existing list.',
      items: {
        type: 'object',
        description: 'A single todo item.',
        properties: {
          content: {
            type: 'string',
            description: 'Task description in imperative form.',
          },
          activeForm: {
            type: 'string',
            description: 'Present continuous form shown during execution.',
          },
          status: {
            type: 'string',
            description: 'Current status of the task.',
            enum: ['pending', 'in_progress', 'completed', 'cancelled'],
          },
        },
        required: ['content', 'activeForm', 'status'],
      },
    },
  },
  required: ['todos'],
};
```

3. **Update `TodoItem` interface**:

```typescript
interface TodoItem {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}
```

4. **Update `validate()` method** — check `content` and `activeForm` instead of `description`:

```typescript
validate(params: ToolParams): boolean {
  if (params.todos === undefined || params.todos === null || !Array.isArray(params.todos)) {
    return false;
  }

  const todos = params.todos as unknown[];
  for (const todo of todos) {
    if (typeof todo !== 'object' || todo === null) {
      return false;
    }

    const todoItem = todo as Record<string, unknown>;

    // Check content
    if (typeof todoItem.content !== 'string' || todoItem.content.trim() === '') {
      return false;
    }

    // Check activeForm
    if (typeof todoItem.activeForm !== 'string' || todoItem.activeForm.trim() === '') {
      return false;
    }

    // Check status
    if (typeof todoItem.status !== 'string') {
      return false;
    }
    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(todoItem.status)) {
      return false;
    }
  }

  return true;
}
```

5. **Update `execute()` method** — return minimal `data`, put full info in `metadata`:

```typescript
async execute(params: ToolParams): Promise<ToolResult> {
  const todos = params.todos as TodoItem[];

  if (!this.validate(params)) {
    throw new ToolExecutionError('Invalid parameters');
  }

  try {
    const inProgressCount = todos.filter((t) => t.status === 'in_progress').length;
    if (inProgressCount > 1) {
      throw new ToolExecutionError(
        `Only one subtask can be in in_progress status, currently ${inProgressCount} are in progress`
      );
    }

    const completed = todos.filter((t) => t.status === 'completed').length;
    const pending = todos.filter((t) => t.status === 'pending').length;
    const cancelled = todos.filter((t) => t.status === 'cancelled').length;

    logger.info(
      `TodosWriter executed: ${todos.length} tasks (completed: ${completed}, in_progress: ${inProgressCount}, pending: ${pending}, cancelled: ${cancelled})`
    );

    return {
      success: true,
      data: 'Todos updated successfully.',
      metadata: {
        parameters: params,
        todos: todos,
        count: todos.length,
        completed,
        inProgress: inProgressCount,
        pending,
        cancelled,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`TodosWriter execution failed:`, errorMessage);

    if (error instanceof ToolExecutionError) {
      throw error;
    }
    throw new ToolExecutionError(errorMessage, error instanceof Error ? error : undefined);
  }
}
```

6. Remove the `TodosWriterResultData` interface and `STATUS_DISPLAY` constant (no longer needed).

7. **IMPORTANT:** Preserve the global registration line at the bottom of the file:

```typescript
// Register the todos writer tool instance
ToolRegistry.register(new TodosWriter());
```

This is required for the CoreAgent, which uses the global `ToolRegistry` singleton.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /data/code/databot/backend && pnpm vitest run tests/infrastructure/tools/todosWriter/ --reporter=verbose`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/infrastructure/tools/todosWriter.ts backend/tests/infrastructure/tools/todosWriter/
git commit -m "refactor(tools): rewrite TodosWriter with new schema and minimal return value

- Replace description field with content + activeForm
- Reduce tool description from ~80 lines to ~5 lines
- Return minimal string to LLM, put full data in metadata
- Update all tests for new schema and assertions"
```

---

### Task 2: Update CoreAgent System Prompt

**Files:**
- Modify: `backend/src/agent/coreAgentSession.ts:45` (CORE_PROMPT step 3)

- [ ] **Step 1: Replace step 3 TodosWriter reference with cross-reference**

In `backend/src/agent/coreAgentSession.ts`, find the line in `CORE_PROMPT` (line 45):

```
3. **Plan:** Develop a coherent plan based on your understanding from steps 1 and 2. Share an extremely concise but clear plan with the user if it helps them understand your approach. If you need to record the plan, use the \`${ToolName.TodosWriter}\` tool. *Do not* use other methods to record plans. As part of the plan, write test scripts to verify that intermediate results and final outputs of data analysis meet expectations. Use logging or debug statements during this process to reach the solution.
```

Replace with:

```
3. **Plan:** Develop a coherent plan based on your understanding from steps 1 and 2. Share an extremely concise but clear plan with the user if it helps them understand your approach. If the task is complex, use task tracking (see "Task Tracking" section below). *Do not* use other methods to record plans. As part of the plan, write test scripts to verify that intermediate results and final outputs of data analysis meet expectations. Use logging or debug statements during this process to reach the solution.
```

- [ ] **Step 2: Add the Task Tracking section**

Insert the following after the `## Tool Usage` section (before the closing backtick of `CORE_PROMPT`), at the end of the prompt string, just before the final backtick `` ` as const; ``:

```
## Task Tracking

For complex tasks requiring 3 or more steps, use the \`${ToolName.TodosWriter}\` tool to create and maintain a subtask list:
- Break down the task into subtasks immediately after understanding the user's request.
- Before starting a subtask, mark it as in_progress; after completion, mark it as completed immediately.
- Update the list in real-time as plans evolve; mark obsolete tasks as cancelled.
- Do not use this tool for simple tasks that can be completed in 2 steps or fewer.
- Do not use other methods (e.g. text lists) to record plans.
```

- [ ] **Step 3: Run backend preflight to verify compilation**

Run: `cd /data/code/databot/backend && pnpm run typecheck`

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/agent/coreAgentSession.ts
git commit -m "refactor(agent): enhance CoreAgent system prompt with Task Tracking section"
```

---

### Task 3: CopilotAgent Backend Integration

**Files:**
- Modify: `backend/src/copilot/copilotTools.ts:35,1195` (COPILOT_TOOL_NAMES + registry)
- Modify: `backend/src/copilot/copilot.types.ts:91-102` (add CopilotTodosUpdate)
- Modify: `backend/src/copilot/copilotAgent.ts:96-120` (emit todos_update)
- Modify: `backend/src/copilot/copilotPrompt.ts:144-187` (add task tracking guidance)

- [ ] **Step 1: Add CopilotTodosUpdate event type**

In `backend/src/copilot/copilot.types.ts`, add the new interface before the `CopilotServerMessage` union:

```typescript
export interface CopilotTodosUpdate {
  type: 'todos_update';
  todos: Array<{
    content: string;
    activeForm: string;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  }>;
  stats: {
    count: number;
    completed: number;
    inProgress: number;
    pending: number;
    cancelled: number;
  };
}
```

Then add `CopilotTodosUpdate` to the `CopilotServerMessage` union type (between `CopilotExecutionEvent` and `CopilotTurnDone`):

```typescript
export type CopilotServerMessage =
  | CopilotTextDelta
  | CopilotTextDone
  | CopilotToolStart
  | CopilotToolDone
  | CopilotToolErrorEvent
  | CopilotNodeConfigCard
  | CopilotWorkflowChanged
  | CopilotExecutionEvent
  | CopilotTodosUpdate        // <-- add this
  | CopilotTurnDone
  | CopilotPong
  | CopilotErrorEvent;
```

- [ ] **Step 2: Register TodosWriter in copilot tool registry**

In `backend/src/copilot/copilotTools.ts`:

1. Add import at top (after existing imports):

```typescript
import { TodosWriter } from '../infrastructure/tools/todosWriter';
```

2. Add `'todos_writer'` to `COPILOT_TOOL_NAMES` array (line 35, after `'sql'`):

```typescript
export const COPILOT_TOOL_NAMES = [
  // ... existing entries ...
  'sql',
  'todos_writer',
] as const;
```

3. Add `registry.register(new TodosWriter());` in `createCopilotToolRegistry()`, after `registry.register(new CopilotSqlTool());` (line 1195):

```typescript
  registry.register(new CopilotSqlTool());
  registry.register(new TodosWriter());

  return registry;
```

- [ ] **Step 3: Emit todos_update in copilotAgent.ts**

In `backend/src/copilot/copilotAgent.ts`, in the `onToolCallComplete` callback (after line 119, after `this.emitNodeConfigCard(...)`), add:

```typescript
            // Forward todos_writer metadata to frontend
            if (tc.function.name === 'todos_writer' && result.metadata?.todos) {
              this.sendEvent({
                type: 'todos_update',
                todos: result.metadata.todos as Array<{
                  content: string;
                  activeForm: string;
                  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
                }>,
                stats: {
                  count: result.metadata.count as number,
                  completed: result.metadata.completed as number,
                  inProgress: result.metadata.inProgress as number,
                  pending: result.metadata.pending as number,
                  cancelled: result.metadata.cancelled as number,
                },
              });
            }
```

- [ ] **Step 4: Add task tracking guidance to copilot system prompt**

In `backend/src/copilot/copilotPrompt.ts`, add to `TOOL_USAGE_GUIDELINES` string, at the end (before the closing backtick), after the "Information Gathering Tools" subsection:

```
### Task Tracking (todos_writer)

For complex workflow building tasks that involve creating or configuring multiple nodes, use the \`todos_writer\` tool to track subtask progress. This helps users see your current progress during multi-step workflow construction. Do not use for simple single-node operations.
```

- [ ] **Step 5: Run backend preflight to verify**

Run: `cd /data/code/databot/backend && pnpm run typecheck`

Expected: No TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/copilot/copilot.types.ts backend/src/copilot/copilotTools.ts backend/src/copilot/copilotAgent.ts backend/src/copilot/copilotPrompt.ts
git commit -m "feat(copilot): integrate TodosWriter tool with todos_update event forwarding"
```

---

### Task 4: Frontend — Update TodoItem Type and TodosStatusBar

**Files:**
- Modify: `frontend/src/types/websocket.ts:49-54`
- Modify: `frontend/src/components/chat/TodosStatusBar.vue`

- [ ] **Step 1: Update TodoItem interface**

In `frontend/src/types/websocket.ts`, replace:

```typescript
export interface TodoItem {
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}
```

With:

```typescript
export interface TodoItem {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}
```

- [ ] **Step 2: Update TodosStatusBar.vue — badge and drawer**

In `frontend/src/components/chat/TodosStatusBar.vue`:

1. In the template, update the status badge area to show `activeForm` for current task. Replace the `<div class="todos-status__summary">` block:

```html
    <div class="todos-status__summary">
      <el-icon class="todos-status__icon" :class="{ spinning: hasInProgress }">
        <Loading v-if="hasInProgress" />
        <Finished v-else />
      </el-icon>
      <span class="todos-status__progress">{{ progressText }}</span>
      <span v-if="currentTask" class="todos-status__current">{{ currentTask.activeForm }}</span>
    </div>
```

2. In the drawer list, change `todo.description` to `todo.content` on line 26:

```html
        <span class="todo-item__text">{{ todo.content }}</span>
```

3. Add CSS for the new `__current` element inside `.todos-status` (after `&__progress`):

```scss
  &__current {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary);
  }
```

- [ ] **Step 3: Run frontend preflight to verify**

Run: `cd /data/code/databot/frontend && pnpm run typecheck`

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/websocket.ts frontend/src/components/chat/TodosStatusBar.vue
git commit -m "feat(ui): update TodoItem type and show activeForm in status bar"
```

---

### Task 5: Frontend — Copilot Store and Header Integration

**Files:**
- Modify: `frontend/src/stores/copilotStore.ts:26-88,213-291`
- Modify: `frontend/src/components/workflow/copilot/CopilotHeader.vue`

- [ ] **Step 1: Add TodosUpdate type and handler to copilotStore.ts**

In `frontend/src/stores/copilotStore.ts`:

1. Add import for `useTodosStore` (line 4, after the useWorkflowStore import):

```typescript
import { useTodosStore } from './todosStore';
```

2. Add `TodosUpdate` interface alongside the existing server message types (after `ErrorMsg` interface, before the `CopilotServerMessage` type):

```typescript
interface TodosUpdate {
  type: 'todos_update';
  todos: Array<{
    content: string;
    activeForm: string;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  }>;
  stats: {
    count: number;
    completed: number;
    inProgress: number;
    pending: number;
    cancelled: number;
  };
}
```

3. Add `TodosUpdate` to the `CopilotServerMessage` union:

```typescript
type CopilotServerMessage =
  | TextDelta
  | TextDone
  | ToolStart
  | ToolDone
  | ToolError
  | NodeConfigCard
  | WorkflowChanged
  | ExecutionEvent
  | TodosUpdate          // <-- add this
  | TurnDone
  | Pong
  | ErrorMsg;
```

4. In `handleServerMessage()`, add a case for `'todos_update'` (before `case 'turn_done':`):

```typescript
      case 'todos_update': {
        const todosStore = useTodosStore();
        todosStore.updateTodos(msg.todos, msg.stats);
        break;
      }
```

5. In the `reset()` function, clear the todos store:

```typescript
  function reset(): void {
    messages.value = [];
    isAgentThinking.value = false;
    const todosStore = useTodosStore();
    todosStore.clear();
  }
```

- [ ] **Step 2: Add TodosStatusBar to CopilotHeader.vue**

In `frontend/src/components/workflow/copilot/CopilotHeader.vue`, update to include the `TodosStatusBar`:

```vue
<template>
  <div class="copilot-header">
    <span class="copilot-header__title">{{ $t('copilot.title') }}</span>
    <TodosStatusBar />
  </div>
</template>

<script setup lang="ts">
import TodosStatusBar from '@/components/chat/TodosStatusBar.vue';
</script>
```

- [ ] **Step 3: Run frontend preflight to verify**

Run: `cd /data/code/databot/frontend && pnpm run typecheck`

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/copilotStore.ts frontend/src/components/workflow/copilot/CopilotHeader.vue
git commit -m "feat(copilot): handle todos_update events and show TodosStatusBar in header"
```

---

### Task 6: Full Preflight Verification

**Files:** None (verification only)

- [ ] **Step 1: Run backend preflight**

Run: `cd /data/code/databot/backend && pnpm run preflight`

Expected: All lint, typecheck, build, and tests pass.

- [ ] **Step 2: Run frontend preflight**

Run: `cd /data/code/databot/frontend && pnpm run preflight`

Expected: All lint, typecheck, and build pass.

- [ ] **Step 3: Fix any issues found and re-run preflight until clean**

If any step fails, fix the issue and re-run the relevant preflight command.
