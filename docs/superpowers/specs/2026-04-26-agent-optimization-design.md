# Agent 性能优化设计

## 背景

基于 8 次 agent 运行记录分析（2026-04-25 ~ 2026-04-26），copilot agent 存在严重的 token 消耗问题：
- 最差一次：85 次工具调用、10 次失败、4.4M token、17.5 分钟
- 典型复杂任务：44-48 次工具调用、1.1-1.5M token、6-10 分钟

优化目标：将 copilot 的工具调用和 token 消耗大致减半。

## 方案一：Copilot 工具调用上限

**文件**: `backend/src/copilot/copilot.types.ts`

- `COPILOT_MAX_TOOL_CALLS_PER_TURN` 从 `Infinity` 改为 `80`
- 超限时 agent 正常结束当前 turn，向用户发送分段提示

## 方案二：更早的上下文压缩

**文件**: `backend/src/copilot/copilotAgent.ts`, `backend/src/agent/context.ts`

### 2a. 压缩阈值降至 60K

- `maybeCompressContext` 中默认阈值从 90K 降为 60K
- 这个值应可通过 `config.compressTokenLimit` 配置

### 2b. 压缩时机提前

当前在 `while(true)` 循环末尾检查。改为在 `provider.chat()` 返回后立即检查单次 `promptTokens`：
- 如果单次 prompt > 60K，立即压缩再继续
- 避免后续多轮带着过大的 context 继续消耗 token

### 2c. 压缩 temperature 降至 0.2

- `context.ts` 的 `compressContext` 方法中，LLM 调用的 temperature 从 0.9 改为 0.2
- 压缩/摘要任务需要确定性输出，不应有创造性

## 方案三：减少无效工具调用

### 3a. Workflow 快照缓存

**文件**: `backend/src/copilot/copilotAgent.ts`

- 添加实例变量缓存 workflow snapshot
- 首次调用 `getWorkflowSnapshot()` 后缓存结果
- 结构性变更工具（add/delete/connect/disconnect/replace）成功后，标记缓存为 stale
- `maybeReflowRound` 按需刷新缓存

### 3b. Bash 工具错误信息增强

**文件**: `backend/src/infrastructure/tools/bashTool.ts`

当 bash 执行失败时，在 tool result 中附加：
- exit code
- stderr 前 500 字符
- 完整命令文本

让 agent 能根据具体错误自我修正，而不是反复尝试。

### 3c. wf_add_node 错误消息改善

**文件**: `backend/src/copilot/copilotTools.ts`（WfAddNodeTool）

- `type` 参数缺失或无效时，返回所有可用 node type 枚举值和示例
- `name` 冲突时，返回当前工作流中已有的名称列表

## 方案四：单节点修复循环引导

**文件**: `backend/src/copilot/copilotTools.ts`（WfExecuteNodeTool）

在 `wf_execute_node` 的 tool result 中，当节点执行失败时，附带：
- 当前节点在本次 agent run 中的连续失败次数
- 格式如 `"This node has failed N time(s) in this run. Consider reviewing the root cause."`

不做硬性限制，通过信息引导 LLM 自己决定何时停止重试。

需要在 copilotAgent 层面追踪每个 nodeId 的失败次数，通过 tool result metadata 传递。

## 方案五：Core Agent LLM 调用记录修复

**文件**: `backend/src/agent/coreAgentSession.ts`

- 检查 `recordLlmCall` 的调用位置，确保每次 LLM 交互都被记录
- Run #2 显示 `llmCalls: 0` 但 `toolCalls: 19`，说明记录有缺失
- 确认 stream 模式下 token 使用量的正确收集时机

## 不在本次范围

- Agent prompt 重写（风险大，需要大量测试）
- Debug agent 优化（使用量少，优先级低）
- 前端 UI 改动

## 预期效果

以 Run #7 为基准（85 次调用、4.4M token）：
- 方案一上限 80：直接截断后续无效调用，约省 10-20%
- 方案二更早压缩：每次 LLM 调用 prompt 从 200K+ 降到 60K，约省 40-50% token
- 方案三减少无效调用：bash 失败从 7 次降到 2-3 次，约省 5-10%
- 整体目标：工具调用降到 40-50 次，token 降到 1.5-2M
