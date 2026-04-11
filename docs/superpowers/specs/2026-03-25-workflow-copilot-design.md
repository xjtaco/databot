# Workflow Copilot Design Spec

## Overview

Add a Copilot panel to the workflow editor page, enabling users to create, configure, and debug workflows through natural language. A backend agent powered by LLM + tool calling handles the conversation loop, while the frontend displays operation status in real-time.

## Requirements Summary

- Users can describe workflows in natural language; the agent creates nodes, connects them, and configures them automatically
- Agent can access data dictionaries (markdown files in `config.data_dictionary_folder`) and knowledge base (markdown files in `config.knowledge_folder`) for context
- Agent can execute workflows and automatically debug failures (configurable auto-fix mode)
- All operations are visible to the user in real-time as status lines in the chat flow
- Node configurations appear as inline editable cards in the conversation
- Desktop and mobile support

## Architecture

### Module Layout

```
Backend:
  copilot/
  ├── copilot.routes.ts         # HTTP fallback endpoints (if needed)
  ├── copilotWebSocket.ts       # WS connection management at /ws/copilot
  ├── copilotAgent.ts           # Agent loop: LLM + tool calling
  ├── copilotTools.ts           # Workflow manipulation tools registration
  └── copilotPrompt.ts          # System prompt + enriched node descriptions

Frontend:
  components/workflow/copilot/
  ├── WfCopilotPanel.vue        # Main panel (replaces WfConfigPanel at 320px)
  ├── CopilotHeader.vue         # Title + AutoFix toggle
  ├── CopilotMessageList.vue    # Scrollable message list
  ├── CopilotUserMsg.vue        # User message bubble
  ├── CopilotAssistantMsg.vue   # Agent text reply (markdown)
  ├── CopilotToolStatus.vue     # Operation status line
  ├── CopilotNodeCard.vue       # Inline node config card
  ├── CopilotInput.vue          # Input box + send/abort buttons
  └── mobile/
      └── WfMobileCopilot.vue   # Full-screen mobile chat page

  stores/
  └── copilotStore.ts           # Conversation state, WS connection, autoFix toggle
```

### Reused Infrastructure

- `infrastructure/llm/` — LLMProvider + streamChat for agent LLM calls
- `infrastructure/tools/` — ToolRegistry for info-gathering tools (glob, grep, read_file, web_search, sql)
- `workflow/` — service, repository, executionEngine for workflow operations
- `base/config.ts` — data_dictionary_folder, knowledge_folder paths

## WebSocket Protocol

### Connection

`ws://host/ws/copilot?workflowId=<id>`

One connection per workflow editing session. Disconnects and resets on workflow switch.

### Client → Server Messages

```typescript
// User sends a chat message
{ type: 'user_message', content: string }

// Toggle auto-fix mode
{ type: 'set_auto_fix', enabled: boolean }

// Abort current agent execution
{ type: 'abort' }

// Heartbeat
{ type: 'ping' }
```

### Server → Client Messages

```typescript
// Streaming text token from agent
{ type: 'text_delta', content: string }

// Agent text segment finished
{ type: 'text_done' }

// Tool call started (renders as status line in chat)
{ type: 'tool_start', toolName: string, toolCallId: string, summary: string }

// Tool call completed
{ type: 'tool_done', toolCallId: string, success: boolean, summary: string }

// Tool call failed
{ type: 'tool_error', toolCallId: string, error: string }

// Inline node config card
{ type: 'node_config_card', nodeId: string, nodeName: string, nodeType: string, config: NodeConfig }

// Workflow state changed — frontend should reload
{ type: 'workflow_changed', changeType: 'node_added' | 'node_updated' | 'node_deleted' | 'edge_added' | 'edge_deleted', nodeId?: string }

// Workflow execution progress (reuses existing WsWorkflowEvent format)
{ type: 'execution_event', event: WsWorkflowEvent }

// Agent turn finished
{ type: 'turn_done' }

// Heartbeat response
{ type: 'pong' }

// Error
{ type: 'error', message: string }
```

### Typical Interaction Sequence

```
User: "帮我创建一个工作流，先从用户表查数据，然后用 Python 清洗"

Client ──→ { type: 'user_message', content: '帮我创建...' }

Server ──→ { type: 'text_delta', content: '好的，我来帮你...' }
Server ──→ { type: 'text_done' }
Server ──→ { type: 'tool_start', toolName: 'wf_add_node', summary: '创建 SQL 节点 "查询用户表"' }
Server ──→ { type: 'tool_done', success: true, summary: '✓ 节点已创建' }
Server ──→ { type: 'workflow_changed', changeType: 'node_added', nodeId: 'xxx' }
Server ──→ { type: 'node_config_card', nodeId: 'xxx', ... }
Server ──→ { type: 'tool_start', toolName: 'wf_add_node', summary: '创建 Python 节点 "数据清洗"' }
Server ──→ { type: 'tool_done', success: true, summary: '✓ 节点已创建' }
Server ──→ { type: 'workflow_changed', changeType: 'node_added', nodeId: 'yyy' }
Server ──→ { type: 'node_config_card', nodeId: 'yyy', ... }
Server ──→ { type: 'tool_start', toolName: 'wf_connect_nodes', summary: '连接 查询用户表 → 数据清洗' }
Server ──→ { type: 'tool_done', success: true, summary: '✓ 已连接' }
Server ──→ { type: 'workflow_changed', changeType: 'edge_added' }
Server ──→ { type: 'text_delta', content: '工作流已创建完成...' }
Server ──→ { type: 'text_done' }
Server ──→ { type: 'turn_done' }
```

## Backend Agent

### CopilotAgent Core Loop

```typescript
class CopilotAgent {
  messages: Message[]              // Conversation history
  workflowId: string               // Current workflow
  autoFixEnabled: boolean          // Auto-fix toggle
  sendEvent: (event) => void       // WS push callback
  abortController: AbortController // Supports interruption

  async handleUserMessage(content: string) {
    this.messages.push({ role: 'user', content })

    // Agent loop: keep calling LLM until it returns pure text (no tool_calls)
    let toolCallCount = 0
    const MAX_TOOL_CALLS = 20

    while (true) {
      if (toolCallCount >= MAX_TOOL_CALLS) {
        sendEvent({ type: 'error', message: 'Agent reached operation limit' })
        break
      }

      const stream = provider.streamChat(this.messages, {
        tools: this.getAvailableTools()
      })

      // Stream LLM output
      for await (const event of stream) {
        if (abortController.signal.aborted) break
        if (event.type === 'text') sendEvent({ type: 'text_delta', content: event.content })
        if (event.type === 'tool_call') // accumulate tool calls
      }

      if (abortController.signal.aborted) break

      // No tool calls → turn done
      if (noToolCalls) break

      // Execute tool calls, push results to messages, continue loop
      for (const toolCall of toolCalls) {
        toolCallCount++
        sendEvent({ type: 'tool_start', toolName: toolCall.name, ... })
        const result = await ToolRegistry.execute(toolCall.name, toolCall.args)
        sendEvent({ type: 'tool_done', ... })
        // Push node_config_card and workflow_changed events as appropriate
      }

      messages.push(toolCallResults)
    }

    sendEvent({ type: 'turn_done' })
  }
}
```

### Session Management

- One CopilotAgent instance per WebSocket connection
- Conversation history is in-memory only, not persisted
- Cleared when the WebSocket disconnects (workflow switch or page refresh)
- On connect, the agent automatically calls `wf_get_summary` to populate initial context

## Tool System

### Info-Gathering Tools (reuse existing, with scope restriction)

| Tool | Purpose | Scope Restriction |
|------|---------|-------------------|
| `glob` | Search files in data dictionary / knowledge base | Restricted to `config.data_dictionary_folder` and `config.knowledge_folder` |
| `grep` | Search keywords in data dictionary / knowledge base | Same restriction |
| `read_file` | Read markdown files from data dictionary / knowledge base | Same restriction |
| `web_search` | Search the web for additional info | No restriction |
| `sql` | Query data source information_schema for table structure | Restricted to registered datasources |

> **Security**: The copilot's glob/grep/read_file tools MUST restrict access to `config.data_dictionary_folder` and `config.knowledge_folder` only. They must NOT allow reading arbitrary files on the system. This is implemented by wrapping existing tools with path validation in copilotTools.ts.

### Workflow Manipulation Tools (new)

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `wf_get_summary` | Get full workflow summary (nodes, edges, status) | — |
| `wf_add_node` | Add a node | name, type, config, position? |
| `wf_update_node` | Update node config | nodeId, config (partial merge) |
| `wf_delete_node` | Delete a node | nodeId |
| `wf_get_node` | Get single node details | nodeId |
| `wf_connect_nodes` | Connect two nodes | sourceNodeId, targetNodeId |
| `wf_disconnect_nodes` | Disconnect two nodes | sourceNodeId, targetNodeId |
| `wf_get_upstream` | Get upstream dependency chain | nodeId |
| `wf_get_downstream` | Get downstream dependency chain | nodeId |
| `wf_execute` | Execute entire workflow | params? |
| `wf_execute_node` | Execute single node (with upstream) | nodeId, params? |
| `wf_get_run_result` | Get execution result details | runId |

### Tool Implementation Pattern

Workflow tools call existing service/repository/engine functions:

```
wf_add_node execution chain:
  CopilotAgent → ToolRegistry.execute('wf_add_node', params)
    → WorkflowCopilotTools.addNode(workflowId, params)
      → repository.findWorkflowById()   // read current state
      → service.saveWorkflow()           // save with new node
      → return { nodeId, summary }
      → Agent pushes node_config_card + workflow_changed events
      → Frontend workflowStore reloads, canvas auto-updates
```

## Auto-Fix Debugging Loop

When `autoFixEnabled = true` and execution fails:

```
wf_execute → failure → Agent receives error in tool result
  → Agent analyzes root cause
  → Agent calls wf_update_node to fix config
  → Agent calls wf_execute again
  → Loop until success or max retries (3)
```

When `autoFixEnabled = false`:
- Agent reports the error and suggests a fix plan
- Waits for user confirmation before making changes

The auto-fix behavior is controlled by instructions in the system prompt that change based on the `autoFixEnabled` flag. The toggle is a UI button in CopilotHeader that sends `{ type: 'set_auto_fix', enabled: boolean }` over WebSocket.

## Enriched Node Type Descriptions

Stored in `copilotPrompt.ts` and injected into the system prompt. These descriptions help the agent correctly understand and configure each node type.

### SQL Node

```json
{
  "type": "sql",
  "displayName": "SQL 查询",
  "description": "连接外部数据源执行 SQL 查询，结果自动导出为 CSV 文件。支持 PostgreSQL、MySQL、SQLite。",
  "capabilities": [
    "执行任意 SQL 查询（SELECT、聚合、JOIN 等）",
    "查询结果自动保存为 CSV，路径通过 csvPath 字段传递给下游",
    "返回 totalRows、columns、previewData（前3行）供下游参考"
  ],
  "config_schema": {
    "datasourceId": "必填。已注册数据源的 ID，可通过系统中已有数据源列表获取",
    "sql": "必填。SQL 查询语句。支持 {{nodeName.field}} 模板语法引用上游节点输出",
    "outputVariable": "必填。输出变量名，下游节点通过此名称引用本节点输出"
  },
  "output_schema": {
    "csvPath": "string — 结果 CSV 文件的绝对路径",
    "totalRows": "number — 查询返回的总行数",
    "columns": "string[] — 列名列表",
    "previewData": "Record<string,unknown>[] — 前3行预览数据"
  },
  "usage_tips": [
    "datasourceId 需要先确认用户有哪些可用数据源",
    "使用 {{上游节点名.field}} 引用上游输出，如 {{params.startDate}}",
    "下游 Python 节点可通过 csvPath 读取 CSV 做进一步处理"
  ]
}
```

### Python Node

```json
{
  "type": "python",
  "displayName": "Python 脚本",
  "description": "在安全沙箱（Docker）中执行 Python 脚本。可接收上游参数，处理数据并输出结果。",
  "capabilities": [
    "在隔离的 Docker 容器中执行，确保安全",
    "通过 params 接收上游节点的输出数据",
    "脚本中通过 params 字典访问输入参数",
    "通过 result 变量输出 JSON 结果给下游",
    "可选输出 CSV 文件"
  ],
  "config_schema": {
    "params": "键值对。key 为参数名，value 支持 {{nodeName.field}} 模板引用上游输出",
    "script": "必填。Python 脚本代码。通过 params 字典获取输入，将结果赋值给 result 变量",
    "timeout": "可选。执行超时毫秒数，默认 120000",
    "outputVariable": "必填。输出变量名"
  },
  "output_schema": {
    "result": "Record<string,unknown> — result 变量的 JSON 值",
    "csvPath": "string | undefined — 若脚本生成了 CSV 文件则返回路径",
    "stderr": "string — 标准错误输出，用于调试"
  },
  "usage_tips": [
    "脚本模板: import json; params = json.loads(open('params.json').read()); ... result = {...}",
    "result 变量必须是可 JSON 序列化的 dict",
    "可用 pandas 处理 CSV: pd.read_csv(params['csvPath'])",
    "stderr 输出可用于调试但不会传递给下游"
  ]
}
```

### LLM Node

```json
{
  "type": "llm",
  "displayName": "LLM 生成",
  "description": "调用大语言模型处理文本任务。输入提示词 + 上游参数，输出必须为 JSON 格式。",
  "capabilities": [
    "使用系统配置的 LLM 提供商（当前为 OpenAI 兼容接口）",
    "自动将 params 注入到提示词上下文中",
    "强制 JSON 输出格式，适合结构化数据生成",
    "适合: 文本分类、数据提取、摘要生成、格式转换等"
  ],
  "config_schema": {
    "params": "键值对。key 为参数名，value 支持 {{nodeName.field}} 模板引用",
    "prompt": "必填。提示词。描述需要 LLM 完成的任务，params 会自动注入到提示词前",
    "outputVariable": "必填。输出变量名"
  },
  "output_schema": {
    "result": "Record<string,unknown> — LLM 返回的 JSON 对象",
    "rawResponse": "string — LLM 原始文本响应"
  },
  "usage_tips": [
    "提示词中明确要求输出 JSON 的结构，如: '返回格式: {\"category\": string, \"confidence\": number}'",
    "params 会自动以列表形式注入到提示词前面",
    "temperature 固定 0.2，适合结构化输出",
    "响应会尝试多种方式解析 JSON（直接解析、code block 提取、正则匹配）"
  ]
}
```

## Frontend Components

### CopilotStore (Pinia)

```typescript
// stores/copilotStore.ts
interface CopilotState {
  isConnected: boolean
  workflowId: string | null
  messages: CopilotMessage[]
  isAgentThinking: boolean        // Input disabled while agent is working
  autoFixEnabled: boolean
}

type CopilotMessage =
  | { type: 'user'; content: string }
  | { type: 'assistant'; content: string; done: boolean }
  | { type: 'tool_status'; toolCallId: string; toolName: string; status: 'running' | 'success' | 'error'; summary: string }
  | { type: 'node_config_card'; nodeId: string; nodeName: string; nodeType: string; config: NodeConfig }

// Actions
connect(workflowId: string)      // Establish WS connection
disconnect()                      // Close connection
sendMessage(content: string)      // Send user message
setAutoFix(enabled: boolean)      // Toggle auto-fix
abort()                           // Interrupt current execution
reset()                           // Clear conversation (on workflow switch)
```

### WS Message Handling in Store

```typescript
onMessage(data) {
  switch (data.type) {
    case 'text_delta':
      // Append to last assistant message, or create new one
      appendToLastAssistantMessage(data.content)
      break
    case 'text_done':
      // Mark current assistant message as done (for markdown rendering)
      markLastAssistantDone()
      break
    case 'tool_start':
      messages.push({ type: 'tool_status', status: 'running', summary: data.summary, ... })
      break
    case 'tool_done':
      updateToolStatus(data.toolCallId, data.success ? 'success' : 'error', data.summary)
      break
    case 'tool_error':
      updateToolStatus(data.toolCallId, 'error', data.error)
      break
    case 'node_config_card':
      messages.push({ type: 'node_config_card', ... })
      break
    case 'workflow_changed':
      workflowStore.loadForEditing(workflowId)
      break
    case 'execution_event':
      workflowStore.handleExecutionEvent(data.event)
      break
    case 'turn_done':
      isAgentThinking = false
      break
    case 'error':
      messages.push({ type: 'assistant', content: data.message, done: true })
      isAgentThinking = false
      break
  }
}
```

### Component Hierarchy

```
WfCopilotPanel.vue (320px right panel)
├── CopilotHeader.vue
│   ├── "Copilot" title
│   └── AutoFix toggle (el-switch)
├── CopilotMessageList.vue (scrollable, flex-grow)
│   ├── CopilotUserMsg.vue         — User message bubble
│   ├── CopilotAssistantMsg.vue    — Agent text (markdown rendered)
│   ├── CopilotToolStatus.vue      — Operation status line
│   │   running: "▶ 创建 SQL 节点 '查询用户表'..."
│   │   success: "✓ 节点已创建"
│   │   error:   "✗ 执行失败: connection refused"
│   └── CopilotNodeCard.vue        — Inline node config card
│       ├── Collapsed: type icon + name + config summary
│       └── Expanded: reuses WfConfigSqlQuery / WfConfigPythonScript / WfConfigLlmGenerate
├── CopilotInput.vue (pinned bottom)
│   ├── el-input (textarea, autosize)
│   └── Send button / Abort button (switches based on isAgentThinking)

Mobile:
WfMobileCopilot.vue (full-screen)
├── Header with back button
├── Same CopilotMessageList
└── Same CopilotInput
```

### CopilotNodeCard Interaction

- **Collapsed (default)**: Node type icon + name + config summary (e.g., first 50 chars of SQL)
- **Expanded**: Reuses existing config components (WfConfigSqlQuery / WfConfigPythonScript / WfConfigLlmGenerate) for editing
- **On edit**: Calls `workflowStore.updateNodeConfig()` to save, canvas syncs automatically
- **On canvas node click**: copilotStore appends a node_config_card message for that node, scrolls to bottom

### WorkflowPage Layout Changes

```
Desktop (before): Palette(200px) | Canvas(flex) | ConfigPanel(320px)
Desktop (after):  Palette(200px) | Canvas(flex) | CopilotPanel(320px)

Canvas node click behavior:
  Before: selectedNodeId → ConfigPanel shows config
  After:  selectedNodeId → CopilotPanel appends node_config_card
```

### Frontend Sync Mechanism

When a workflow tool executes successfully on the backend:
1. Backend pushes `workflow_changed` event with changeType and relevant IDs
2. Frontend copilotStore receives event, calls `workflowStore.loadForEditing(workflowId)`
3. VueFlow canvas auto-re-renders via existing deep watcher on `editorWorkflow`

## Error Handling

### WebSocket Connection

- Auto-reconnect with exponential backoff (reuses existing useWebSocket pattern: 1s → 30s max)
- Conversation history preserved in copilotStore memory on reconnect
- Backend agent session is lost on disconnect; reconnect shows status message to user
- CopilotPanel displays reconnection status indicator

### Agent Execution

- Tool execution errors → returned to LLM as tool results; agent decides next step
- LLM API failure → pushes `{ type: 'error', message }` to frontend, ends current turn
- Agent loop timeout → max 20 tool calls per turn to prevent infinite loops
- Abort signal → checked between each tool call and LLM iteration

### Auto-Fix

- Max 3 retry attempts per execution failure
- Each fix attempt pushes a status line so user can observe the process
- After 3 failures, agent stops and reports the situation

### New Error Types

```typescript
// errors/types.ts additions
CopilotSessionError     (E00032) — Copilot session error (e.g., message sent while WS disconnected)
CopilotToolError        (E00033) — Copilot tool execution error
CopilotAgentLoopError   (E00034) — Agent loop exceeded limit or timed out
```

## i18n

All new UI text defined in `frontend/src/locales/zh-CN.ts` and `en-US.ts`:

```typescript
copilot: {
  title: 'Copilot' / 'Copilot',
  autoFix: '自动修复' / 'Auto Fix',
  placeholder: '描述你想要的工作流...' / 'Describe the workflow you want...',
  send: '发送' / 'Send',
  abort: '中断' / 'Abort',
  reconnecting: '正在重连...' / 'Reconnecting...',
  disconnected: '连接已断开' / 'Disconnected',
  turnLimit: 'Agent 达到操作上限，请检查当前状态' / 'Agent reached operation limit',
  toolStatus: {
    creating: '创建节点 {name}...' / 'Creating node {name}...',
    created: '节点已创建' / 'Node created',
    updating: '更新节点 {name}...' / 'Updating node {name}...',
    updated: '节点已更新' / 'Node updated',
    connecting: '连接 {source} → {target}...' / 'Connecting {source} → {target}...',
    connected: '已连接' / 'Connected',
    executing: '执行工作流...' / 'Executing workflow...',
    executionDone: '执行完成' / 'Execution complete',
    executionFailed: '执行失败: {error}' / 'Execution failed: {error}',
    fixAttempt: '尝试修复 (第{n}次)...' / 'Fix attempt #{n}...',
  }
}
```

## Implementation Notes

These notes address review feedback and should be considered during implementation:

1. **Stream event type mapping**: The existing `StreamEvent` in `infrastructure/llm/types.ts` uses `type: 'content'` (not `'text'`). The agent loop must map these correctly when processing `streamChat()` output.

2. **`workflowStore.handleExecutionEvent` is new**: This method does not exist yet. It needs to be added to workflowStore to map `WsWorkflowEvent` types (`node_start`, `node_complete`, `node_error`, `node_skipped`) to `nodeExecutionStates` updates. The current store updates execution states via polling after API calls; this new method enables real-time WS-driven updates.

3. **ToolRegistry scope isolation**: The global `ToolRegistry` singleton is shared. After registering `wf_*` tools, they will be visible to all consumers of `getAllToolSchemas()`, including the existing chat agent. Solution: copilotAgent uses a whitelist filter in `getAvailableTools()` to select only copilot-relevant tools. The existing chat agent should also be updated to exclude `wf_*` tools from its tool set.

4. **WfNodePreview migration**: The existing `WfNodePreview` component (execution result visualization) currently lives inside `WfConfigPanel`. Since `WfConfigPanel` is being replaced, execution result previews should be displayed within `CopilotNodeCard` (when the node has execution results) or as part of `execution_event` handling in the chat flow.

## Testing Strategy

### Backend Tests (`backend/tests/`)

| Test File | Coverage |
|-----------|----------|
| `copilotAgent.test.ts` | Agent loop: normal conversation, tool calling, auto-fix loop, abort, limit protection |
| `copilotTools.test.ts` | Each wf_* tool: parameter validation, normal execution, error scenarios |
| `copilotWebSocket.test.ts` | WS connection management, message routing, heartbeat, disconnect cleanup |
| `copilotPrompt.test.ts` | System prompt construction, node description injection, autoFix instruction switching |

### Frontend Tests (`frontend/tests/`)

| Test File | Coverage |
|-----------|----------|
| `copilotStore.test.ts` | Store actions, WS message handling, state transitions |
| `CopilotMessageList.test.ts` | Message type rendering, auto-scroll behavior |
| `CopilotNodeCard.test.ts` | Collapse/expand, config editing, save callback |
| `CopilotInput.test.ts` | Send/abort toggle, disabled state |

### Test Focus Areas

- Agent loop edge cases: tool call limit, abort mid-execution, LLM API errors
- WS message → UI state mapping correctness
- Workflow tool operations: concurrent safety, error propagation
- Auto-fix loop: retry counting, stop conditions
