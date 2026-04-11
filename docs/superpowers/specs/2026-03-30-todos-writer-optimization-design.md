# TodosWriter Tool Optimization Design

## Background

The current `todos_writer` tool has several design issues:

1. **Bloated tool description (~80 lines)**: Sent as part of the tool schema on every LLM API call, wasting significant tokens
2. **Redundant return value**: The tool echoes back the full formatted todo list to the LLM via `result.data`, but the LLM already knows what it just sent - only the frontend needs this data
3. **Missing `activeForm` field**: No dedicated field for in-progress display text, limiting the frontend's ability to show dynamic status
4. **Not available in CopilotAgent**: The workflow builder agent has no task tracking capability

## Design

### Approach

Adopt Claude TodoWrite patterns: split description into `content` + `activeForm`, minimize LLM return value, move verbose guidance to system prompts, and register the tool in CopilotAgent.

### 1. Parameter Schema Redesign

**Current:**
```typescript
{
  todos: [{
    description: string,
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  }]
}
```

**New:**
```typescript
{
  todos: [{
    content: string,      // Required. Task description (imperative): "Query sales data"
    activeForm: string,    // Required. In-progress display text: "Querying sales data..."
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  }]
}
```

All three fields (`content`, `activeForm`, `status`) are required in the JSON schema. The `validate()` method must check `content` and `activeForm` for existence, string type, and non-emptiness (same rigor as the current `description` check).

### 2. Tool Description

Replace the current ~80 line description with a concise version (~5 lines). Move the detailed usage guidelines and examples into each agent's system prompt.

**New tool description:**
```
Manage subtask lists for tracking complex multi-step tasks. Each todo item has: content (task description in imperative form), activeForm (present continuous form shown during execution), and status. Only one task can be in_progress at a time. Send the complete list on each call (full replacement).
```

### 3. Return Value Optimization

**Current:** `result.data` contains a full formatted text of the todo list + statistics, which gets serialized and sent back to the LLM as the tool response.

**New:** `result.data` returns only a brief confirmation string. The full todo data is placed exclusively in `result.metadata` for frontend consumption.

```typescript
return {
  success: true,
  data: 'Todos updated successfully.',  // Minimal LLM feedback
  metadata: {
    parameters: params,
    todos: todos,          // Full todo array for frontend
    count: todos.length,
    completed,
    inProgress,
    pending,
    cancelled,
  },
};
```

### 4. System Prompt Integration

#### CoreAgent (`coreAgentSession.ts`)

Replace the single-line reference at step 3 ("If you need to record the plan, use the `todos_writer` tool") with a dedicated section:

```
## Task Tracking

For complex tasks requiring 3 or more steps, use the `todos_writer` tool to create and maintain a subtask list:
- Break down the task into subtasks immediately after understanding the user's request.
- Before starting a subtask, mark it as in_progress; after completion, mark it as completed immediately.
- Update the list in real-time as plans evolve; mark obsolete tasks as cancelled.
- Do not use this tool for simple tasks that can be completed in 2 steps or fewer.
- Do not use other methods (e.g. text lists) to record plans.
```

#### CopilotAgent (`copilotPrompt.ts`)

Add a new subsection under `TOOL_USAGE_GUIDELINES`:

```
### Task Tracking (todos_writer)

For complex workflow building tasks that involve creating or configuring multiple nodes, use the `todos_writer` tool to track subtask progress. This helps users see your current progress during multi-step workflow construction. Do not use for simple single-node operations.
```

### 5. CopilotAgent Integration

The CopilotAgent has its own event system (`CopilotServerMessage`) separate from the CoreAgent's WebSocket messages. Simply registering `TodosWriter` is insufficient — the copilot must also forward todo metadata to its frontend.

#### 5a. Tool Registration (`copilotTools.ts`)

1. Add `'todos_writer'` to the `COPILOT_TOOL_NAMES` array.
2. In `createCopilotToolRegistry()`, register a `TodosWriter` instance:
   ```typescript
   import { TodosWriter } from '../infrastructure/tools/todosWriter';
   // inside createCopilotToolRegistry():
   registry.register(new TodosWriter());
   ```

#### 5b. New Event Type (`copilot.types.ts`)

Add a new `CopilotTodosUpdate` message type:

```typescript
export interface CopilotTodosUpdate {
  type: 'todos_update';
  todos: Array<{ content: string; activeForm: string; status: string }>;
  stats: { count: number; completed: number; inProgress: number; pending: number; cancelled: number };
}
```

Add `CopilotTodosUpdate` to the `CopilotServerMessage` union type.

#### 5c. Event Emission (`copilotAgent.ts`)

In the `onToolCallComplete` callback, detect `todos_writer` results and emit the new event:

```typescript
onToolCallComplete: (tc: ToolCall, result: ToolCallResult) => {
  // ... existing logic ...

  // Forward todos_writer metadata to frontend
  if (tc.function.name === 'todos_writer' && result.metadata?.todos) {
    this.sendEvent({
      type: 'todos_update',
      todos: result.metadata.todos,
      stats: {
        count: result.metadata.count,
        completed: result.metadata.completed,
        inProgress: result.metadata.inProgress,
        pending: result.metadata.pending,
        cancelled: result.metadata.cancelled,
      },
    });
  }
}
```

#### 5d. Copilot Frontend (`copilotStore.ts`)

The `copilotStore.ts` has its own local `CopilotServerMessage` type union (mirroring the backend type). Add a matching `TodosUpdate` interface and include it in that union:

```typescript
interface TodosUpdate {
  type: 'todos_update';
  todos: Array<{ content: string; activeForm: string; status: string }>;
  stats: { count: number; completed: number; inProgress: number; pending: number; cancelled: number };
}
```

Handle the new `todos_update` event in `handleServerMessage()`:

```typescript
case 'todos_update':
  todosStore.updateTodos(msg.todos, msg.stats);
  break;
```

Import and use the shared `useTodosStore` from the copilot store. The `TodosStatusBar` component should be added to the copilot panel header (`WfCopilotPanel.vue` or `CopilotHeader.vue`, whichever is more appropriate for the layout).

### 6. Frontend Changes

#### Type Definition (`frontend/src/types/websocket.ts`)

```typescript
export interface TodoItem {
  content: string;       // Was: description
  activeForm: string;    // New field
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}
```

#### TodosStatusBar.vue

- Display `activeForm` for the in-progress task directly on the status badge (no need to open the drawer).
- In the drawer list, change `todo.description` to `todo.content` for all task items.

```html
<!-- Status badge with current task preview -->
<div class="todos-status__summary">
  <el-icon class="todos-status__icon" :class="{ spinning: hasInProgress }">
    <Loading v-if="hasInProgress" />
    <Finished v-else />
  </el-icon>
  <span class="todos-status__progress">{{ progressText }}</span>
  <span v-if="currentTask" class="todos-status__current">
    {{ currentTask.activeForm }}
  </span>
</div>
```

#### todosStore.ts

No structural changes needed. The store uses the `TodoItem` type from `@/types`; the type change propagates automatically. The `currentTask` computed property returns the in-progress `TodoItem`, which the `TodosStatusBar` accesses for `activeForm`.

#### useChat.ts

No changes needed. The handler reads `result.todos` from metadata and passes to store — field name changes are transparent.

#### i18n Locales

The `activeForm` content is dynamically generated by the LLM, not a static UI string, so no new locale entries are needed for it. However, if a tooltip or label is added for the current-task preview on the badge, add it to `frontend/src/locales/{zh-CN,en-US}.ts`.

### 7. CoreAgent System Prompt Adjustment

In the "Data Analysis Tasks" workflow (step 3), remove the inline TodosWriter reference and replace with a cross-reference to the new section:

**Before:**
```
3. **Plan:** ... If you need to record the plan, use the `todos_writer` tool. *Do not* use other methods to record plans. ...
```

**After:**
```
3. **Plan:** ... If the task is complex, use task tracking (see "Task Tracking" section below). *Do not* use other methods to record plans. ...
```

The detailed guidance lives in the new `## Task Tracking` section added after the existing workflow steps.

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/infrastructure/tools/todosWriter.ts` | Rewrite: new schema (`content` + `activeForm`), concise description, minimal return value, updated validation |
| `backend/src/agent/coreAgentSession.ts` | Add `## Task Tracking` section, update step 3 cross-reference |
| `backend/src/copilot/copilotPrompt.ts` | Add task tracking subsection to `TOOL_USAGE_GUIDELINES` |
| `backend/src/copilot/copilotTools.ts` | Register TodosWriter, add to `COPILOT_TOOL_NAMES` |
| `backend/src/copilot/copilot.types.ts` | Add `CopilotTodosUpdate` event type to `CopilotServerMessage` union |
| `backend/src/copilot/copilotAgent.ts` | Detect `todos_writer` in `onToolCallComplete`, emit `todos_update` event |
| `frontend/src/types/websocket.ts` | Update `TodoItem` interface (`description` → `content` + `activeForm`) |
| `frontend/src/components/chat/TodosStatusBar.vue` | Show `activeForm` on badge, change `todo.description` → `todo.content` in drawer |
| `frontend/src/stores/copilotStore.ts` | Handle `todos_update` event, forward to `todosStore` |
| `frontend/src/components/workflow/copilot/CopilotHeader.vue` | Add `TodosStatusBar` to copilot header |
| `backend/tests/infrastructure/tools/todosWriter/validation.test.ts` | Update fixtures: `description` → `content` + `activeForm`, add `activeForm` validation tests |
| `backend/tests/infrastructure/tools/todosWriter/basic-execution.test.ts` | Update assertions: `result.data` is now a string, check `result.metadata` for todo array and stats |

## Token Savings Estimate

- **Tool description**: ~80 lines (~1500 tokens) reduced to ~5 lines (~80 tokens) = **~1400 tokens saved per API call**
- **Return value**: Full formatted list (~200-500 tokens depending on task count) reduced to single confirmation line (~10 tokens) = **~200-500 tokens saved per tool invocation**
