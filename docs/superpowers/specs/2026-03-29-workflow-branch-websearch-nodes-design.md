# Workflow Branch & Web Search Nodes Design

## Overview

为工作流系统新增两种节点类型：

1. **Branch（分支节点）** — 根据上游输出的某个字段进行条件判断，满足条件走 true 分支，不满足走 false 分支。分支节点本身不做数据透传，下游节点通过 `{{upstreamNodeName.field}}` 直接引用任意上游节点的输出（已有机制）
2. **Web Search（搜索节点）** — 根据上游传入的关键词调用全局配置的搜索引擎进行搜索，结果保存为 Markdown 文件，文件路径传递到下游

## Design Decisions

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 分支边区分方式 | Source Handle 机制 | @vue-flow 原生支持多输出端口，Edge 表只需加可选 `sourceHandle` 字段，改动最小且扩展性好 |
| 条件判断方式 | 简单比较模式（UI 配置） | 项目已有 Python/LLM 节点做复杂逻辑，分支节点保持简单直观，覆盖大多数场景 |
| 搜索结果格式 | Markdown 文件 | 下游最常见场景是喂给 LLM 节点，Markdown 对 LLM 最友好，人类也可直接阅读 |
| 未连接分支行为 | 静默跳过 | 很多场景只需"满足条件才执行"，不应强制两条分支都接节点 |
| 执行引擎方案 | 运行时跳过 | 保持拓扑排序全量遍历，最小化引擎改动，正确处理菱形合并 |

---

## 1. Data Model Changes

### 1.1 Database Schema (Prisma)

**WorkflowEdge** 增加可选字段：

```prisma
model WorkflowEdge {
  id           String
  workflowId   String
  sourceNodeId String
  targetNodeId String
  sourceHandle String?    // 'true' | 'false'，仅分支节点使用，其他节点为 null
  // ... existing relations and constraints
}
```

### 1.2 Backend Types (workflow.types.ts)

新增节点类型常量：

```typescript
export const WorkflowNodeType = {
  Sql: 'sql',
  Python: 'python',
  Llm: 'llm',
  Email: 'email',
  Branch: 'branch',
  WebSearch: 'web_search',
} as const;
```

分支节点配置：

```typescript
export interface BranchNodeConfig {
  nodeType: 'branch';
  field: string;           // 使用模板变量语法，如 "{{sqlNode.totalRows}}"，由引擎的 templateResolver 解析为实际值
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty';
  value: string;           // 比较值（is_empty/is_not_empty 时忽略）
  outputVariable: string;
}
```

> **注意**：`field` 使用 `{{}}` 模板变量语法，与其他节点的模板变量机制一致。引擎在执行前通过 `templateResolver` 将 `field` 解析为实际值字符串，executor 直接拿到解析后的值进行比较，无需访问 `nodeOutputs`。

Web Search 节点配置：

```typescript
export interface WebSearchNodeConfig {
  nodeType: 'web_search';
  keywords: string;        // 搜索关键词，支持模板变量 {{upstream.field}}
  outputVariable: string;
}
```

分支节点输出：

```typescript
export interface BranchNodeOutput {
  result: boolean;
}
```

Web Search 节点输出：

```typescript
export interface WebSearchNodeOutput {
  markdownPath: string;
  totalResults: number;
}
```

将新配置和输出类型加入 `NodeConfig` 和 `NodeOutput` 联合类型。

### 1.3 DTO & Repository Updates

`sourceHandle` 字段需要在以下所有位置同步增加：

- **Prisma Schema**: `WorkflowEdge.sourceHandle` (如 1.1 所述)
- **Backend Types**: `SaveWorkflowEdgeInput.sourceHandle?: string` — 前端保存时传入
- **Backend Types**: `WorkflowEdgeInfo.sourceHandle?: string` — 后端返回给前端
- **Backend Types**: `ExportedWorkflowEdge.sourceHandle?: string` — 工作流导出/导入
- **Repository**: `workflow.repository.ts` 的 save/load 逻辑读写 `sourceHandle`
- **Frontend Types**: `WorkflowEdgeInfo.sourceHandle?: string`

### 1.4 Frontend Types (workflow.ts)

同步增加新节点配置接口和 `NodeConfig` 联合类型。

---

## 2. Branch Node — Backend Execution

### 2.1 BranchNodeExecutor

实现 `NodeExecutor` 接口，文件：`backend/src/workflow/nodeExecutors/branchNodeExecutor.ts`

执行逻辑：
1. 从 `resolvedConfig` 取出 `field`（已被 templateResolver 解析为实际值字符串）、`operator`、`value`
2. 对 `field`（解析后的值）和 `value` 执行比较运算
3. 返回 `{ result: boolean }`
4. 不写文件，不产生副作用，不需要访问 `nodeOutputs`（`NodeExecutionContext` 接口无需修改）

**比较运算逻辑**：
- 数值比较（`gt/lt/gte/lte`）：将两侧转为 number，转换失败则报错
- 字符串比较（`eq/neq/contains/not_contains`）：转为字符串后比较
- 空值判断（`is_empty/is_not_empty`）：检查 `null/undefined/''`

### 2.2 Execution Engine Changes (executionEngine.ts)

在 `executeNodes()` 的主循环中增加分支跳过逻辑：

```
维护 blockedEdgeIds: Set<string>

对每个待执行节点:
  1. 获取该节点的所有入边
  2. 如果有入边 且 所有入边都在 blockedEdgeIds 中 → 跳过该节点
     - 发送 'node_skipped' 事件
     - 将该节点的所有出边加入 blockedEdgeIds
     - continue
  3. 正常执行该节点
  4. 如果该节点是 branch 类型且执行成功:
     - 读取 output.result (true/false)
     - 找到该节点所有出边
     - 将 sourceHandle 与 result 不匹配的出边加入 blockedEdgeIds
       (result=true → 阻断 sourceHandle='false' 的边，反之亦然)
```

**菱形合并处理**：一个节点从 true 和 false 两条路径都可达时，只要有一条入边不在 blockedEdgeIds 中，该节点就正常执行。

**对现有节点无影响**：非分支节点出边没有 sourceHandle，不会被阻断。

---

## 3. Web Search Node — Backend Execution

### 3.1 WebSearchNodeExecutor

实现 `NodeExecutor` 接口，文件：`backend/src/workflow/nodeExecutors/webSearchNodeExecutor.ts`

执行流程：
1. 从 `resolvedConfig` 取出 `keywords`（模板变量已由引擎预先解析）
2. 通过 `globalConfig.service` 获取 Web Search 配置（类型、apiKey、numResults、timeout）
3. 调用现有 `infrastructure/tools/webSearch.ts` 中的搜索实现
4. 将搜索结果格式化为 Markdown，写入 `workFolder/{nodeName}_search.md`

**Markdown 输出格式**：

```markdown
# 搜索结果: {keywords}

## 1. {title}
- **来源**: {url}

{snippet}

---

## 2. {title}
...
```

5. 返回 `{ markdownPath: string, totalResults: number }`
   - `markdownPath` 被引擎自动包装为 `TypedOutputValue`（type: `'markdownFile'`）
   - 下游节点通过 `{{webSearchNode.markdownPath}}` 获取文件路径

### 3.2 Infrastructure Reuse & Adaptation

- 复用 `globalConfig` 中已有的 `web_search` 配置类别
- 复用 `fileHelpers.ts` 中的文件命名工具函数
- **搜索接口适配**：现有 `webSearch.ts` 的 `search()` 返回格式化的 `string[]`，不是结构化对象。需要在搜索提供商层新增返回结构化结果（`{ title, url, snippet }`）的方法，或在 executor 中解析已有的格式化字符串。推荐前者。
- **输出类型注册**：`executionEngine.ts` 的 `annotateOutputTypes` 函数有硬编码的 `fileFieldMap`，需要为 web_search 节点的 `markdownPath` 字段增加映射
- **Preview 构建**：`buildPreview` 函数使用属性名做节点类型识别（如 `'result' in output`），branch 节点的 `result: boolean` 可能与 python 节点的 `result` 冲突，需要用 `nodeType` 字段来区分而非属性名推断

---

## 4. Frontend Changes

### 4.1 Node Palette (WfNodePalette.vue)

新增两个节点类型拖拽入口：
- **Branch** — 图标: `Split`（分叉），颜色: `#f59e0b`（琥珀色）
- **Web Search** — 图标: `Search`，颜色: `#06b6d4`（青色）

### 4.2 Canvas Node (WfCanvasNode.vue)

分支节点特殊处理：
- 底部显示两个输出 Handle（@vue-flow `Handle` 组件，`position=Bottom`）
- 左侧 handle id 为 `'true'`，右侧为 `'false'`，分别标注"是"/"否"
- 其他节点保持单个默认输出 handle 不变

### 4.3 Config Panels

**WfConfigBranch.vue**：
- 上游变量选择器 — 下拉列表列出所有上游节点的输出字段（`field`）
- 运算符选择器 — 下拉列表（等于、不等于、大于、小于、包含、为空等）
- 比较值输入框 — 运算符为 `is_empty`/`is_not_empty` 时隐藏

**WfConfigWebSearch.vue**：
- 关键词输入框 — 支持 `{{}}` 模板变量，提示可引用上游变量
- 只读显示当前全局搜索引擎配置（类型、结果数量），引导用户去设置页修改

### 4.4 Node Preview (WfNodePreview.vue)

- **Branch**: 显示条件表达式和判断结果（true/false）
- **Web Search**: 显示搜索关键词、结果数量，Markdown 文件内容预览

### 4.5 Constants (workflow.ts)

```typescript
NODE_COLORS: { branch: '#f59e0b', web_search: '#06b6d4' }
// NODE_ICONS 增加对应图标
```

### 4.6 i18n

在 `zh-CN.ts` 和 `en-US.ts` 中增加所有新文案：节点名称、配置标签、运算符文本、提示信息等。

---

## 5. Copilot Adaptation

Copilot 需要能够通过自然语言创建、配置和连接分支节点与搜索节点。

### 5.1 System Prompt (copilotPrompt.ts)

在 `NODE_TYPE_DESCRIPTIONS` 中新增两种节点的描述：

**Branch 节点描述**：
- 功能：根据上游输出进行条件判断，控制工作流分支走向
- 配置字段：`field`（上游变量路径）、`operator`（比较运算符）、`value`（比较值）、`outputVariable`
- 输出字段：`result`（boolean）
- 使用提示：连接下游时必须指定 `sourceHandle`（`'true'` 或 `'false'`）

**Web Search 节点描述**：
- 功能：调用全局配置的搜索引擎搜索关键词，结果保存为 Markdown 文件
- 配置字段：`keywords`（支持 `{{}}` 模板变量）、`outputVariable`
- 输出字段：`markdownPath`（Markdown 文件路径）、`totalResults`（结果数量）
- 使用提示：搜索引擎配置在全局设置中管理，节点本身不需要配置搜索引擎参数

### 5.2 Tools (copilotTools.ts)

**wf_add_node**：
- `buildDefaultConfig()` 增加 `branch` 和 `web_search` 类型的默认配置生成

**wf_connect_nodes**：
- 工具参数增加可选的 `sourceHandle` 字段
- 当源节点为 branch 类型时，LLM 需指定 `sourceHandle` 为 `'true'` 或 `'false'`
- 保存 edge 时将 `sourceHandle` 存入数据库

### 5.3 Frontend — CopilotNodeCard.vue

内联节点配置卡片需要支持渲染新节点类型的配置表单，复用 `WfConfigBranch.vue` 和 `WfConfigWebSearch.vue` 组件。

### 5.4 Testing

- 后端：`copilotTools.test.ts` 增加 branch/web_search 节点的创建、连接（含 sourceHandle）测试
- 后端：`copilotPrompt.test.ts` 验证新节点描述包含在 system prompt 中

---

## 6. Edge Cases

### Branch Node
- 上游变量路径不存在 → 视为 `null`，由运算符决定结果（`is_empty` 返回 true 等）
- 数值比较时值无法转为 number → 节点报错，标记 failed，下游跳过
- 分支节点没有任何出边 → 正常执行但不影响下游

### Web Search Node
- 搜索 API 失败（网络超时、API key 无效）→ 节点报错，标记 failed
- 搜索返回 0 条结果 → 正常完成，生成仅含标题的 Markdown，`totalResults: 0`
- 关键词为空字符串 → 节点报错

### DAG Validation
- 分支形成的菱形结构不是环，现有 Kahn 算法正确处理，无需修改 `dagValidator.ts`

---

## 7. Testing

### Backend Tests (`backend/tests/`)

- `branchNodeExecutor.test.ts` — 所有运算符、数值/字符串比较、空值判断、类型转换失败
- `webSearchNodeExecutor.test.ts` — 正常搜索、空结果、API 失败、关键词为空
- `executionEngine.test.ts` — 分支跳过逻辑、菱形合并、单侧分支、嵌套分支

### Frontend Tests (`frontend/tests/`)

- 分支配置面板：运算符切换、值输入框显示/隐藏
- Web Search 配置面板

### Copilot Tests

- `copilotTools.test.ts` — branch/web_search 节点创建、sourceHandle 连接
- `copilotPrompt.test.ts` — 新节点描述存在于 system prompt
