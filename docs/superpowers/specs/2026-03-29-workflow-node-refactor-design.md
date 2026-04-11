# 工作流节点整改设计

## 概述

对工作流节点系统进行三项整改：移除 markdown 节点（由 Python 节点承担报告生成）、在 copilot 提示词中增加 matplotlib 图表和数据量控制规范、在 LLM 节点执行层增加 params 硬截断。

## 背景

当前工作流有 5 种节点：sql、python、llm、markdown、email。其中 markdown 节点的功能（组合 CSV 表格 + Plotly JSON 图表 + 图片 → 生成 markdown 文件）完全可以由 Python 节点完成，且 Python 节点能提供更灵活的数据处理能力。此外，工作流的 copilot 提示词缺少图表生成规范，LLM 节点也缺少对上游数据量的控制。

## 改动一：移除 markdown 节点

### 删除的文件

- `backend/src/workflow/nodeExecutors/markdownExecutor.ts`
- `backend/tests/workflow/nodeExecutors/markdownExecutor.test.ts`
- `frontend/src/components/workflow/config/WfConfigMarkdown.vue`

### 修改的后端文件

| 文件 | 改动 |
|------|------|
| `backend/src/workflow/workflow.types.ts` | 移除 `Markdown` 属性（WorkflowNodeType const 对象）、`MarkdownNodeConfig` 接口、`MarkdownNodeOutput` 接口，从 `NodeConfig` 和 `NodeOutput` 联合类型中删除 |
| `backend/src/workflow/nodeExecutors/index.ts` | 移除 MarkdownExecutor 的 import 和注册 |
| `backend/src/copilot/copilotPrompt.ts` | 移除 "Markdown 报告（markdown）" 整段节点描述 |
| `backend/src/copilot/copilotTools.ts` | 移除 `buildDefaultMarkdownConfig()` 函数、`MarkdownNodeConfig` import、switch case |
| `backend/src/workflow/executionEngine.ts` | 移除 `MarkdownNodeConfig` 的 import；移除 `annotateOutputTypes` 中 `fileFieldMap` 的 `markdown` 映射；移除 `buildPreview` 中 `markdownPath in output` 的 markdown 预览分支 |
| `backend/tests/workflow/outputTypeAnnotation.test.ts` | 移除 markdown 相关的测试用例（`wraps Markdown markdownPath as markdownFile`） |

### 修改的前端文件

| 文件 | 改动 |
|------|------|
| `frontend/src/types/workflow.ts` | 移除 `'markdown'` 类型和 `MarkdownNodeConfig` 接口 |
| `frontend/src/components/workflow/WfNodePalette.vue` | 移除 markdown 节点条目 |
| `frontend/src/components/workflow/WfConfigPanel.vue` | 移除 markdown 图标、条件渲染、WfConfigMarkdown import |
| `frontend/src/components/workflow/WfCanvasNode.vue` | 移除 markdown 图标条件 |
| `frontend/src/components/workflow/WfNodePreview.vue` | 移除 markdown 预览模板和 computed |
| `frontend/src/components/workflow/mobile/WfMobileNodeConfigSheet.vue` | 移除 markdown 条件渲染 |
| `frontend/src/components/workflow/copilot/CopilotNodeCard.vue` | 移除 markdown 图标、条件渲染、import |
| `frontend/src/stores/workflowStore.ts` | 移除 `case 'markdown'` 默认配置 |
| `frontend/src/constants/workflow.ts` | 移除 `markdown` 颜色 |
| `frontend/src/locales/zh-CN.ts` | 移除 markdown 相关 i18n 词条 |
| `frontend/src/locales/en-US.ts` | 移除 markdown 相关 i18n 词条 |
| `frontend/src/components/workflow/WorkflowPage.vue` | 移除 WfConfigMarkdown 的 import 和条件渲染 |
| `frontend/src/components/workflow/WfEditorCanvas.vue` | 移除 `MarkdownNodeConfig` import 和 `getNodeSummary` 中的 `'markdown'` switch case |

### 保留不动的文件

- `backend/src/utils/markdownProcessor.ts` — 仍被 `outputMdTool.ts`（agent 聊天功能）使用
- `backend/tests/utils/markdownProcessor.test.ts` — 对应的测试保留
- 前端 plotly 渲染能力保留
- 所有 knowledge base 的 markdown 相关组件不受影响

### 数据库

无需迁移。`WorkflowNode.type` 是 String 类型，无 enum 约束。已有使用 markdown 节点的工作流在前端将无法配置该节点类型，但数据库记录不会被破坏。

## 改动二：copilot 提示词增强

### Python 节点 — 报告生成规范

在 `copilotPrompt.ts` 的 Python 节点"使用建议"后追加：

```
### 报告生成规范（Python 节点）

当需要生成数据分析报告时，由 Python 节点完成以下工作：

1. **图表生成**：使用 matplotlib 绑定 WenQuanYi Zen Hei 字体，savefig 输出 PNG 图片
   - 必须设置：plt.rcParams['font.sans-serif'] = ['WenQuanYi Zen Hei']
   - 必须设置：plt.rcParams['axes.unicode_minus'] = False
   - 保存路径：os.path.join(WORKSPACE, 'chart_name.png')

2. **图片嵌入**：将 PNG 转为 base64 data URI 嵌入 markdown
   - 格式：![描述](data:image/png;base64,{base64_str})

3. **CSV 数据嵌入**：读取 CSV 用 pandas 转为 markdown 表格嵌入

4. **Markdown 输出**：将组合好的 markdown 写入文件
   - 路径：os.path.join(WORKSPACE, 'report.md')
   - result 中返回：result = {"markdownPath": "/path/to/report.md"}

5. **数据量控制**：图表和表格数据量大时，先聚合/采样再嵌入，避免 markdown 文件过大
```

### LLM 节点 — 数据量控制指导

在 `copilotPrompt.ts` 的 LLM 节点"使用建议"中追加：

```
- **数据量控制**：LLM 节点不适合处理大量原始数据。传递给 LLM 的 params 应为聚合后的摘要数据（统计值、Top N、关键指标等），不要传入完整的 CSV 路径让 LLM 读取原始数据。如果需要处理原始数据，应先用 Python 节点做聚合/摘要，再将结果传给 LLM 节点。
```

### email 节点 — 引用方式更新

copilot 提示词中 email 节点的使用建议更新为引用 Python 节点的输出：

```
- 使用 upstream 模式可引用 Python 节点 result 中的 markdownPath 字段作为邮件内容（如 {{report_gen.result.markdownPath}}）
```

## 改动三：LLM 节点 params 硬截断

在 `backend/src/workflow/nodeExecutors/llmNodeExecutor.ts` 中增加两层截断：

### 常量定义

```typescript
const MAX_SINGLE_PARAM_CHARS = 8000;
const MAX_TOTAL_PARAMS_CHARS = 32000;
```

### 截断逻辑

1. **单个 param 截断**：遍历所有 params，超过 `MAX_SINGLE_PARAM_CHARS` 的值截断，并追加 `...[truncated, original length: N chars]`（注：params 经执行引擎解析后已是 `Record<string, string>`，值已经是字符串，无需额外序列化）
2. **总量截断**：所有 params 总长度超过 `MAX_TOTAL_PARAMS_CHARS` 时，按比例截断各 param
3. 截断时通过 logger 记录 warning 日志，包含 nodeId 和截断前后的字符数

### 截断时机

在构建 user message（将 params 注入到 prompt）之前执行截断，确保发送给 LLM 的内容不会超限。

## 不在本次范围内

- coreAgentSession.ts 的图表方案不做修改
- 不新增 bash 命令执行节点
- markdownProcessor.ts 保持不动
- 前端 plotly 渲染能力保留
