# Workflow Node Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the markdown workflow node type, enhance copilot prompts with matplotlib chart guidelines and LLM data volume control, and add params truncation in the LLM node executor.

**Architecture:** Three independent changes: (1) delete the markdown node executor/config/UI and remove all references across ~22 files, (2) update copilot prompt text for Python/LLM/email nodes, (3) add a `truncateParams` function in the LLM executor with tests. Changes are ordered so backend types are cleaned first, then frontend, then prompt enhancements, then LLM truncation.

**Tech Stack:** TypeScript, Vue 3, Vitest

**Spec:** `docs/superpowers/specs/2026-03-29-workflow-node-refactor-design.md`

---

## Task 1: Remove markdown from backend type definitions

**Files:**
- Modify: `backend/src/workflow/workflow.types.ts`

- [ ] **Step 1: Remove Markdown from WorkflowNodeType, configs, and outputs**

In `backend/src/workflow/workflow.types.ts`:

1. Remove `Markdown: 'markdown',` from the `WorkflowNodeType` const object (line 6)
2. Remove the entire `MarkdownNodeConfig` interface (lines ~106-112):
```typescript
// DELETE THIS:
export interface MarkdownNodeConfig {
  nodeType: 'markdown';
  template: string;
  replaceFiles: string[];
  outputVariable: string;
  outputFilename?: string;
}
```
3. Remove `| MarkdownNodeConfig` from the `NodeConfig` union type (line ~129)
4. Remove the entire `MarkdownNodeOutput` interface (lines ~151-154):
```typescript
// DELETE THIS:
export interface MarkdownNodeOutput {
  markdownPath: string;
  contentLength: number;
}
```
5. Remove `| MarkdownNodeOutput` from the `NodeOutput` union type (line ~166)

- [ ] **Step 2: Verify backend compiles**

Run: `cd /data/code/databot/backend && pnpm run typecheck 2>&1 | head -50`

Expected: Type errors in files that still reference `MarkdownNodeConfig`, `MarkdownNodeOutput`, or `'markdown'` type — this is expected and will be fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
cd /data/code/databot
git add backend/src/workflow/workflow.types.ts
git commit -m "refactor(workflow): remove markdown node from type definitions"
```

---

## Task 2: Remove markdown executor and registration

**Files:**
- Delete: `backend/src/workflow/nodeExecutors/markdownExecutor.ts`
- Delete: `backend/tests/workflow/nodeExecutors/markdownExecutor.test.ts`
- Modify: `backend/src/workflow/nodeExecutors/index.ts`

- [ ] **Step 1: Delete markdownExecutor source and test**

```bash
cd /data/code/databot
rm backend/src/workflow/nodeExecutors/markdownExecutor.ts
rm backend/tests/workflow/nodeExecutors/markdownExecutor.test.ts
```

- [ ] **Step 2: Remove from executor registry**

In `backend/src/workflow/nodeExecutors/index.ts`, remove:
- Line 7: `import { MarkdownExecutor } from './markdownExecutor';`
- Line 19: `registerExecutor(new MarkdownExecutor());`

After edit, the file should have 4 imports (Sql, Python, Llm, Email) and 4 `registerExecutor` calls.

- [ ] **Step 3: Commit**

```bash
cd /data/code/databot
git add -A backend/src/workflow/nodeExecutors/ backend/tests/workflow/nodeExecutors/
git commit -m "refactor(workflow): delete markdown executor and test"
```

---

## Task 3: Remove markdown from executionEngine

**Files:**
- Modify: `backend/src/workflow/executionEngine.ts`
- Modify: `backend/tests/workflow/outputTypeAnnotation.test.ts`

- [ ] **Step 1: Clean executionEngine imports and markdown references**

In `backend/src/workflow/executionEngine.ts`:

1. Remove `MarkdownNodeConfig` from the import block (line 22)
2. Remove the `markdown` entry from `fileFieldMap` in `annotateOutputTypes` (line ~109):
```typescript
// BEFORE:
const fileFieldMap: Record<string, Record<string, OutputValueType>> = {
  sql: { csvPath: 'csvFile' },
  python: { csvPath: 'csvFile' },
  markdown: { markdownPath: 'markdownFile' },
};
// AFTER:
const fileFieldMap: Record<string, Record<string, OutputValueType>> = {
  sql: { csvPath: 'csvFile' },
  python: { csvPath: 'csvFile' },
};
```
3. Remove the `case 'markdown':` block from the `resolveNodeConfig` switch (lines ~500-507):
```typescript
// DELETE THIS:
case 'markdown': {
  const mdConfig = config as MarkdownNodeConfig;
  return {
    ...mdConfig,
    template: resolveTemplate(mdConfig.template, nodeOutputs),
    replaceFiles: mdConfig.replaceFiles.map((f) => resolveTemplate(f, nodeOutputs)),
  };
}
```
4. Remove the markdown preview branch from `buildPreview` (lines ~565-570):
```typescript
// DELETE THIS:
if ('markdownPath' in output) {
  return {
    type: 'markdown',
    markdownPath: output.markdownPath,
    contentLength: output.contentLength,
  };
}
```

**Note:** Keep the `inferFileType` function's `'.md': 'markdownFile'` mapping — Python nodes now generate markdown files, so this is still needed.

- [ ] **Step 2: Remove markdown test case from outputTypeAnnotation.test.ts**

In `backend/tests/workflow/outputTypeAnnotation.test.ts`, remove the test case:
```typescript
// DELETE THIS:
it('wraps Markdown markdownPath as markdownFile', () => {
  const output = { markdownPath: '/data/report.md', contentLength: 500 };
  const result = annotateOutputTypes('markdown', output);
  expect(result.markdownPath).toEqual({ value: '/data/report.md', type: 'markdownFile' });
});
```

- [ ] **Step 3: Run backend tests**

Run: `cd /data/code/databot/backend && pnpm test -- --run 2>&1 | tail -20`

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
cd /data/code/databot
git add backend/src/workflow/executionEngine.ts backend/tests/workflow/outputTypeAnnotation.test.ts
git commit -m "refactor(workflow): remove markdown from execution engine and tests"
```

---

## Task 4: Remove markdown from copilot prompt and tools

**Files:**
- Modify: `backend/src/copilot/copilotPrompt.ts`
- Modify: `backend/src/copilot/copilotTools.ts`

- [ ] **Step 1: Remove markdown section from copilotPrompt.ts**

In `backend/src/copilot/copilotPrompt.ts`, remove the entire "Markdown 报告（markdown）" section from `NODE_TYPE_DESCRIPTIONS` (lines 58-80), including the `---` separator before it. The section starts with `### Markdown 报告（markdown）` and ends just before `### 邮件发送（email）`.

- [ ] **Step 2: Remove markdown default config from copilotTools.ts**

In `backend/src/copilot/copilotTools.ts`:

1. Remove `MarkdownNodeConfig` from the import (line 26)
2. Remove the `buildDefaultMarkdownConfig()` function (lines 83-90):
```typescript
// DELETE THIS:
function buildDefaultMarkdownConfig(): MarkdownNodeConfig {
  return {
    nodeType: 'markdown',
    template: '',
    replaceFiles: [],
    outputVariable: 'md_output',
  };
}
```
3. Remove the `case 'markdown':` branch from the `buildDefaultConfig` switch (lines ~113-114):
```typescript
// DELETE THIS:
case 'markdown':
  return buildDefaultMarkdownConfig();
```
4. Remove `'markdown'` from the `WfAddNodeTool` parameter enum array (line ~228):
```typescript
// BEFORE:
enum: ['sql', 'python', 'llm', 'markdown', 'email'],
// AFTER:
enum: ['sql', 'python', 'llm', 'email'],
```
5. Remove `'markdown'` from the validation array in `WfAddNodeTool` (line ~256):
```typescript
// BEFORE:
if (!type || !['sql', 'python', 'llm', 'markdown', 'email'].includes(type)) {
// AFTER:
if (!type || !['sql', 'python', 'llm', 'email'].includes(type)) {
```
6. Update the error message (line ~260):
```typescript
// BEFORE:
error: "type must be 'sql', 'python', 'llm', 'markdown', or 'email'",
// AFTER:
error: "type must be 'sql', 'python', 'llm', or 'email'",
```

- [ ] **Step 3: Run backend typecheck**

Run: `cd /data/code/databot/backend && pnpm run typecheck 2>&1 | tail -10`

Expected: No type errors in backend.

- [ ] **Step 4: Commit**

```bash
cd /data/code/databot
git add backend/src/copilot/copilotPrompt.ts backend/src/copilot/copilotTools.ts
git commit -m "refactor(workflow): remove markdown from copilot prompt and tools"
```

---

## Task 5: Remove markdown from frontend types and constants

**Files:**
- Modify: `frontend/src/types/workflow.ts`
- Modify: `frontend/src/constants/workflow.ts`
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`

- [ ] **Step 1: Remove markdown from frontend type definitions**

In `frontend/src/types/workflow.ts`:

1. Remove `'markdown'` from `WorkflowNodeType` union (line 1):
```typescript
// BEFORE:
export type WorkflowNodeType = 'sql' | 'python' | 'llm' | 'markdown' | 'email';
// AFTER:
export type WorkflowNodeType = 'sql' | 'python' | 'llm' | 'email';
```
2. Remove the entire `MarkdownNodeConfig` interface (lines 115-121)
3. Remove `| MarkdownNodeConfig` from the `NodeConfig` union type (line ~138)

- [ ] **Step 2: Remove markdown color from constants**

In `frontend/src/constants/workflow.ts`, remove the `markdown` entry (line 7):
```typescript
// BEFORE:
export const NODE_COLORS: Record<WorkflowNodeType, string> = {
  sql: '#3B82F6',
  python: '#22C55E',
  llm: '#A855F7',
  markdown: '#F59E0B',
  email: '#EC4899',
};
// AFTER:
export const NODE_COLORS: Record<WorkflowNodeType, string> = {
  sql: '#3B82F6',
  python: '#22C55E',
  llm: '#A855F7',
  email: '#EC4899',
};
```

- [ ] **Step 3: Remove markdown i18n keys from zh-CN.ts**

In `frontend/src/locales/zh-CN.ts`, remove:
- `markdown: 'Markdown 输出',` from `nodeTypes` (line ~346)
- `markdownTemplate: 'Markdown 模板',` (line ~366)
- `markdownInsertVariable: '插入变量',` (line ~367)
- `markdownInsertFile: '插入文件占位符',` (line ~368)
- `markdownPreview: '预览',` (line ~369)
- `markdownOutputFilename: '输出文件名',` (line ~370)
- `markdownOutputFilenamePlaceholder: '可选，默认自动生成',` (line ~371)
- `markdownOutput: 'Markdown 输出',` from preview section (line ~414)

- [ ] **Step 4: Remove markdown i18n keys from en-US.ts**

In `frontend/src/locales/en-US.ts`, remove the same set of keys:
- `markdown: 'Markdown Output',` from `nodeTypes` (line ~352)
- `markdownTemplate: 'Markdown Template',` (line ~372)
- `markdownInsertVariable: 'Insert Variable',` (line ~373)
- `markdownInsertFile: 'Insert File Placeholder',` (line ~374)
- `markdownPreview: 'Preview',` (line ~375)
- `markdownOutputFilename: 'Output Filename',` (line ~376)
- `markdownOutputFilenamePlaceholder: 'Optional, auto-generated by default',` (line ~377)
- `markdownOutput: 'Markdown Output',` from preview section (line ~420)

- [ ] **Step 5: Commit**

```bash
cd /data/code/databot
git add frontend/src/types/workflow.ts frontend/src/constants/workflow.ts frontend/src/locales/zh-CN.ts frontend/src/locales/en-US.ts
git commit -m "refactor(workflow): remove markdown from frontend types, constants, and i18n"
```

---

## Task 6: Remove markdown from frontend components

**Files:**
- Delete: `frontend/src/components/workflow/config/WfConfigMarkdown.vue`
- Modify: `frontend/src/components/workflow/WfNodePalette.vue`
- Modify: `frontend/src/components/workflow/WfConfigPanel.vue`
- Modify: `frontend/src/components/workflow/WfCanvasNode.vue`
- Modify: `frontend/src/components/workflow/WfNodePreview.vue`
- Modify: `frontend/src/components/workflow/WfEditorCanvas.vue`
- Modify: `frontend/src/components/workflow/WorkflowPage.vue`
- Modify: `frontend/src/components/workflow/mobile/WfMobileNodeConfigSheet.vue`
- Modify: `frontend/src/components/workflow/copilot/CopilotNodeCard.vue`
- Modify: `frontend/src/stores/workflowStore.ts`

- [ ] **Step 1: Delete WfConfigMarkdown.vue**

```bash
rm /data/code/databot/frontend/src/components/workflow/config/WfConfigMarkdown.vue
```

- [ ] **Step 2: Remove markdown from WfNodePalette.vue**

Remove the markdown palette item (lines 24-30):
```vue
<!-- DELETE THIS: -->
<WfPaletteItem
  type="markdown"
  :label="t('workflow.nodeTypes.markdown')"
  :color="NODE_COLORS.markdown"
>
  <FileText :size="16" />
</WfPaletteItem>
```

Also in the custom templates section, remove the `<FileText>` conditional (line 54):
```vue
<!-- DELETE THIS LINE: -->
<FileText v-else-if="tmpl.type === 'markdown'" :size="16" />
```

If `FileText` is no longer used anywhere in the file, remove it from the lucide import (line 64).

- [ ] **Step 3: Remove markdown from WfConfigPanel.vue**

1. Remove from template — the icon line (line 11) and config component line (line 26):
```vue
<!-- DELETE: -->
<FileText v-else-if="node.type === 'markdown'" :size="18" />
<!-- DELETE: -->
<WfConfigMarkdown v-else-if="node.type === 'markdown'" :node="node" />
```
2. Remove from imports — `FileText` from lucide import (line 39), `WfConfigMarkdown` import (line 45):
```typescript
// DELETE:
import WfConfigMarkdown from './config/WfConfigMarkdown.vue';
```
Remove `FileText` from the lucide destructuring if no longer used.

- [ ] **Step 4: Remove markdown from WfCanvasNode.vue**

1. Remove from template (line 22):
```vue
<!-- DELETE: -->
<FileText v-else-if="data.nodeType === 'markdown'" :size="12" />
```
2. Remove from SCSS — the `&--markdown` block (lines 86-88):
```scss
// DELETE:
&--markdown {
  --node-color-rgb: 245, 158, 11;
}
```
3. Remove `FileText` from lucide import (line 48) if no longer used.

- [ ] **Step 5: Remove markdown from WfNodePreview.vue**

Remove the entire markdown preview template block (lines 78-97):
```vue
<!-- DELETE THIS ENTIRE BLOCK: -->
<!-- Markdown preview -->
<template v-else-if="nodeType === 'markdown'">
  <template v-if="fileOutputs.length > 0">
    ...
  </template>
  <template v-else-if="markdownPreviewData">
    ...
  </template>
</template>
```

Remove the `markdownPreviewData` computed (lines 297-300):
```typescript
// DELETE:
const markdownPreviewData = computed((): string | null => {
  if (props.nodeType !== 'markdown' || !props.nodeRun.outputs) return null;
  return JSON.stringify(props.nodeRun.outputs, null, 2);
});
```

- [ ] **Step 6: Remove markdown from WfEditorCanvas.vue**

1. Remove `MarkdownNodeConfig` from the import (line 54)
2. Remove the `case 'markdown':` branch from `getContentPreview` (lines 145-146):
```typescript
// DELETE:
case 'markdown':
  return ((config as MarkdownNodeConfig).template || '').split('\n')[0].substring(0, 50);
```

- [ ] **Step 7: Remove markdown from WorkflowPage.vue**

1. Remove the markdown config conditional from template (lines 44-47):
```vue
<!-- DELETE: -->
<WfConfigMarkdown
  v-else-if="store.selectedNode.type === 'markdown'"
  :node="store.selectedNode"
/>
```
2. Remove the import (line 193):
```typescript
// DELETE:
import WfConfigMarkdown from './config/WfConfigMarkdown.vue';
```

- [ ] **Step 8: Remove markdown from WfMobileNodeConfigSheet.vue**

1. Remove from template (line 13):
```vue
<!-- DELETE: -->
<WfConfigMarkdown v-else-if="node.type === 'markdown'" :node="node" />
```
2. Remove the import (line 37):
```typescript
// DELETE:
import WfConfigMarkdown from '../config/WfConfigMarkdown.vue';
```

- [ ] **Step 9: Remove markdown from CopilotNodeCard.vue**

1. Remove from template — icon (line 8) and config (line 31):
```vue
<!-- DELETE: -->
<FileText v-else-if="nodeType === 'markdown'" :size="16" />
<!-- DELETE: -->
<WfConfigMarkdown v-else-if="nodeType === 'markdown'" :node="nodeObj" />
```
2. Remove `FileText` from lucide import (line 43) if no longer used
3. Remove WfConfigMarkdown import (line 54):
```typescript
// DELETE:
import WfConfigMarkdown from '../config/WfConfigMarkdown.vue';
```
4. Remove from `configSummary` computed (lines 89-90):
```typescript
// DELETE:
} else if (cfg.nodeType === 'markdown') {
  content = cfg.template;
```

- [ ] **Step 10: Remove markdown from workflowStore.ts**

Remove the `case 'markdown':` block from `getDefaultConfig` (lines 511-517):
```typescript
// DELETE:
case 'markdown':
  return {
    nodeType: 'markdown',
    template: '',
    replaceFiles: [],
    outputVariable: 'output.md',
  };
```

- [ ] **Step 11: Run frontend preflight**

Run: `cd /data/code/databot/frontend && pnpm run preflight 2>&1 | tail -30`

Expected: All checks pass (lint, typecheck, build, tests).

- [ ] **Step 12: Commit**

```bash
cd /data/code/databot
git add -A frontend/src/ frontend/tests/
git commit -m "refactor(workflow): remove markdown from all frontend components"
```

---

## Task 7: Enhance copilot prompt — Python report generation and LLM data control

**Files:**
- Modify: `backend/src/copilot/copilotPrompt.ts`

- [ ] **Step 1: Add report generation guidelines to Python node description**

In `backend/src/copilot/copilotPrompt.ts`, append the following to the Python node section in `NODE_TYPE_DESCRIPTIONS`, after the existing `使用建议` line (line ~39). Insert before the `---` separator that precedes the LLM section:

```
- **报告生成**：当需要生成数据分析报告时，Python 节点负责完成图表生成、数据嵌入和 Markdown 文件组装：
  - 图表：使用 matplotlib，必须设置 \`plt.rcParams['font.sans-serif'] = ['WenQuanYi Zen Hei']\` 和 \`plt.rcParams['axes.unicode_minus'] = False\`，用 \`fig.savefig(os.path.join(WORKSPACE, 'chart.png'), dpi=150, bbox_inches='tight')\` 保存 PNG
  - 图片嵌入：读取 PNG 转 base64，以 \`![描述](data:image/png;base64,{base64_str})\` 格式嵌入 Markdown
  - CSV 嵌入：用 pandas 将 CSV 转为 Markdown 表格嵌入
  - 输出：将组合好的 Markdown 写入 \`os.path.join(WORKSPACE, 'report.md')\`，通过 \`result = {"markdownPath": os.path.join(WORKSPACE, 'report.md')}\` 返回路径
  - 数据量大时先聚合/采样再嵌入，避免 Markdown 文件过大
```

- [ ] **Step 2: Add data volume control guidance to LLM node description**

In the LLM node section's `使用建议` (line ~54), append:

```
- **数据量控制**：LLM 节点不适合处理大量原始数据。传递给 LLM 的 params 应为聚合后的摘要数据（统计值、Top N、关键指标等），不要传入原始 CSV 数据。如果需要处理原始数据，应先用 Python 节点做聚合/摘要，再将结果传给 LLM 节点
```

- [ ] **Step 3: Update email node references to markdown node**

In the email node section, update three places that reference "markdown 节点":

1. In the `描述` line (line ~84), change `使用上游节点（如 markdown 节点）的输出文件` to `使用上游节点（如 Python 节点）的输出文件`
2. In the `能力` line (line ~86), change `可引用上游 markdown 节点生成的文件作为内容` to `可引用上游 Python 节点生成的文件作为内容`
3. In the `配置字段` example (line ~95), change `{{md_output.markdownPath}}` to `{{report_gen.result.markdownPath}}`
4. In the `使用建议` line (line ~108), change `使用 upstream 模式可直接引用 markdown 节点的 markdownPath 字段作为邮件内容` to `使用 upstream 模式可引用 Python 节点 result 中的 markdownPath 字段作为邮件内容（如 {{report_gen.result.markdownPath}}）`

- [ ] **Step 4: Run backend typecheck**

Run: `cd /data/code/databot/backend && pnpm run typecheck 2>&1 | tail -5`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /data/code/databot
git add backend/src/copilot/copilotPrompt.ts
git commit -m "feat(copilot): add matplotlib report guidelines and LLM data volume control"
```

---

## Task 8: Add LLM node params truncation — tests

**Files:**
- Modify: `backend/tests/workflow/llmNodeExecutor.test.ts`

- [ ] **Step 1: Write truncation tests**

Add a new `describe('params truncation', ...)` block to `backend/tests/workflow/llmNodeExecutor.test.ts`. The tests import and call `truncateParams` (a pure function that will be exported from the executor module).

```typescript
import { truncateParams } from '@/workflow/nodeExecutors/llmNodeExecutor';

describe('truncateParams', () => {
  it('returns params unchanged when within limits', () => {
    const params = { key1: 'short value', key2: 'another value' };
    const result = truncateParams(params, 'test-node');
    expect(result).toEqual(params);
  });

  it('truncates a single param exceeding MAX_SINGLE_PARAM_CHARS', () => {
    const longValue = 'x'.repeat(10000);
    const params = { data: longValue, short: 'ok' };
    const result = truncateParams(params, 'test-node');
    expect(result.data.length).toBeLessThan(longValue.length);
    expect(result.data).toContain('...[truncated, original length: 10000 chars]');
    expect(result.short).toBe('ok');
  });

  it('truncates proportionally when total exceeds MAX_TOTAL_PARAMS_CHARS', () => {
    const params: Record<string, string> = {};
    for (let i = 0; i < 10; i++) {
      params[`key${i}`] = 'y'.repeat(5000);
    }
    const result = truncateParams(params, 'test-node');
    const totalLength = Object.values(result).join('').length;
    expect(totalLength).toBeLessThanOrEqual(32000 + 1000); // allow for truncation markers
  });

  it('applies single param truncation before total truncation', () => {
    const params = {
      huge: 'z'.repeat(20000),
      medium: 'm'.repeat(5000),
    };
    const result = truncateParams(params, 'test-node');
    expect(result.huge).toContain('...[truncated');
    expect(result.huge.length).toBeLessThanOrEqual(8100); // 8000 + marker
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /data/code/databot/backend && pnpm test -- --run -t "truncateParams" 2>&1 | tail -10`

Expected: FAIL — `truncateParams` is not exported yet.

- [ ] **Step 3: Commit**

```bash
cd /data/code/databot
git add backend/tests/workflow/llmNodeExecutor.test.ts
git commit -m "test(workflow): add LLM params truncation tests"
```

---

## Task 9: Implement LLM node params truncation

**Files:**
- Modify: `backend/src/workflow/nodeExecutors/llmNodeExecutor.ts`

- [ ] **Step 1: Add truncateParams function**

Add the following at the top of `backend/src/workflow/nodeExecutors/llmNodeExecutor.ts`, after the imports:

```typescript
const MAX_SINGLE_PARAM_CHARS = 8000;
const MAX_TOTAL_PARAMS_CHARS = 32000;

export function truncateParams(
  params: Record<string, string>,
  nodeId: string
): Record<string, string> {
  const result: Record<string, string> = {};

  // Step 1: truncate individual params
  for (const [key, value] of Object.entries(params)) {
    if (value.length > MAX_SINGLE_PARAM_CHARS) {
      logger.warn('LLM node param truncated', {
        nodeId,
        param: key,
        originalLength: value.length,
        truncatedTo: MAX_SINGLE_PARAM_CHARS,
      });
      result[key] =
        value.slice(0, MAX_SINGLE_PARAM_CHARS) +
        `...[truncated, original length: ${value.length} chars]`;
    } else {
      result[key] = value;
    }
  }

  // Step 2: check total length, truncate proportionally if needed
  const totalLength = Object.values(result).reduce((sum, v) => sum + v.length, 0);
  if (totalLength > MAX_TOTAL_PARAMS_CHARS) {
    logger.warn('LLM node total params truncated', {
      nodeId,
      originalTotal: totalLength,
      limit: MAX_TOTAL_PARAMS_CHARS,
    });
    const ratio = MAX_TOTAL_PARAMS_CHARS / totalLength;
    for (const [key, value] of Object.entries(result)) {
      const maxLen = Math.floor(value.length * ratio);
      if (value.length > maxLen) {
        result[key] =
          value.slice(0, maxLen) +
          `...[truncated to fit total limit]`;
      }
    }
  }

  return result;
}
```

- [ ] **Step 2: Apply truncation in the execute method**

In the `execute` method, add truncation before building `userMessage`. Change the params block (lines ~19-24) to:

```typescript
let userMessage = config.prompt;
if (config.params && Object.keys(config.params).length > 0) {
  const stringParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.params)) {
    stringParams[key] = String(value);
  }
  const truncated = truncateParams(stringParams, context.nodeId);
  const paramsContext = Object.entries(truncated)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');
  userMessage = `The following parameters are available from upstream nodes:\n${paramsContext}\n\n${config.prompt}`;
}
```

- [ ] **Step 3: Run truncation tests**

Run: `cd /data/code/databot/backend && pnpm test -- --run -t "truncateParams" 2>&1 | tail -10`

Expected: All truncation tests pass.

- [ ] **Step 4: Run all backend tests**

Run: `cd /data/code/databot/backend && pnpm test -- --run 2>&1 | tail -20`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /data/code/databot
git add backend/src/workflow/nodeExecutors/llmNodeExecutor.ts
git commit -m "feat(workflow): add params truncation to LLM node executor"
```

---

## Task 10: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full backend preflight**

Run: `cd /data/code/databot/backend && pnpm run preflight 2>&1 | tail -30`

Expected: All checks pass (lint, format, typecheck, build, tests).

- [ ] **Step 2: Run full frontend preflight**

Run: `cd /data/code/databot/frontend && pnpm run preflight 2>&1 | tail -30`

Expected: All checks pass (lint, format, typecheck, build, tests).

- [ ] **Step 3: Verify markdownProcessor.ts is still intact**

Run: `cd /data/code/databot/backend && pnpm test -- --run -t "markdownProcessor" 2>&1 | tail -10`

Expected: markdownProcessor tests still pass (used by outputMdTool, not affected by this refactor).
