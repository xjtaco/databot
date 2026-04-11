# wf_patch_node Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `wf_patch_node` copilot tool that performs targeted string replacement within SQL/Python/LLM node text content, avoiding full-field rewrites.

**Architecture:** New `WfPatchNodeTool` class in `copilotTools.ts` following the existing tool pattern (extends `Tool`, constructor takes `workflowId`). Auto-detects target field by `nodeType`. Uses Nth-occurrence string replacement algorithm. Integrated via factory registration.

**Tech Stack:** TypeScript, Vitest, Express.js v5

**Spec:** `docs/superpowers/specs/2026-03-29-wf-patch-node-tool-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/src/copilot/copilotTools.ts` | Modify | Add `WfPatchNodeTool` class, update `COPILOT_TOOL_NAMES`, register in factory |
| `backend/src/copilot/copilotPrompt.ts` | Modify | Update prompt guidelines to mention `wf_patch_node` |
| `backend/tests/wfPatchNodeTool.test.ts` | Create | Unit tests for the new tool |
| `backend/tests/copilotTools.test.ts` | Modify | Update tool count assertion |

---

### Task 1: Add `wf_patch_node` to tool name registry and update existing test

**Files:**
- Modify: `backend/src/copilot/copilotTools.ts:33-51` (COPILOT_TOOL_NAMES array)
- Modify: `backend/tests/copilotTools.test.ts:12-25` (tool name assertions)

- [ ] **Step 1: Add `wf_patch_node` to `COPILOT_TOOL_NAMES`**

In `backend/src/copilot/copilotTools.ts`, insert `'wf_patch_node'` after `'wf_update_node'` in the array:

```typescript
export const COPILOT_TOOL_NAMES = [
  'wf_get_summary',
  'wf_add_node',
  'wf_update_node',
  'wf_patch_node',
  'wf_delete_node',
  // ... rest unchanged
] as const;
```

- [ ] **Step 2: Update `copilotTools.test.ts` assertions**

In `backend/tests/copilotTools.test.ts`, update the tool count from 12 to 13 and add the new tool name check:

```typescript
it('contains all 13 workflow tools', () => {
  expect(COPILOT_TOOL_NAMES).toContain('wf_get_summary');
  expect(COPILOT_TOOL_NAMES).toContain('wf_add_node');
  expect(COPILOT_TOOL_NAMES).toContain('wf_update_node');
  expect(COPILOT_TOOL_NAMES).toContain('wf_patch_node');
  expect(COPILOT_TOOL_NAMES).toContain('wf_delete_node');
  // ... rest of existing assertions unchanged
});
```

Also update the `getAllToolSchemas` assertion from 12 to 13:

```typescript
expect(schemas.length).toBeGreaterThanOrEqual(13);
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd backend && pnpm vitest run tests/copilotTools.test.ts`

Expected: The COPILOT_TOOL_NAMES test passes (name is in array). The `getAllToolSchemas` test will fail because the tool class isn't registered yet — that's expected, we'll fix it in Task 3.

- [ ] **Step 4: Commit**

```bash
git add backend/src/copilot/copilotTools.ts backend/tests/copilotTools.test.ts
git commit -m "feat(copilot): add wf_patch_node to tool name registry"
```

---

### Task 2: Write failing unit tests for `WfPatchNodeTool`

**Files:**
- Create: `backend/tests/wfPatchNodeTool.test.ts`

- [ ] **Step 1: Write the test file**

Create `backend/tests/wfPatchNodeTool.test.ts` with all 12 test cases. The tests use mocked `service.getWorkflow` and `service.saveWorkflow`:

```typescript
// backend/tests/wfPatchNodeTool.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/workflow/workflow.repository');
vi.mock('@/workflow/workflow.service');
vi.mock('@/workflow/executionEngine');

import * as service from '@/workflow/workflow.service';
import { createCopilotToolRegistry } from '@/copilot/copilotTools';
import type { WorkflowDetail } from '@/workflow/workflow.types';

const WORKFLOW_ID = 'test-wf-id';

function makeWorkflow(overrides: Partial<WorkflowDetail> = {}): WorkflowDetail {
  return {
    id: WORKFLOW_ID,
    name: 'Test Workflow',
    description: null,
    nodes: [],
    edges: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSqlNode(id: string, sql: string) {
  return {
    id,
    workflowId: WORKFLOW_ID,
    name: `sql-${id}`,
    description: null,
    type: 'sql' as const,
    config: { nodeType: 'sql' as const, datasourceId: 'ds1', sql, outputVariable: 'result' },
    positionX: 200,
    positionY: 200,
  };
}

function makePythonNode(id: string, script: string) {
  return {
    id,
    workflowId: WORKFLOW_ID,
    name: `python-${id}`,
    description: null,
    type: 'python' as const,
    config: {
      nodeType: 'python' as const,
      params: {},
      script,
      outputVariable: 'result',
    },
    positionX: 200,
    positionY: 200,
  };
}

function makeLlmNode(id: string, prompt: string) {
  return {
    id,
    workflowId: WORKFLOW_ID,
    name: `llm-${id}`,
    description: null,
    type: 'llm' as const,
    config: {
      nodeType: 'llm' as const,
      params: {},
      prompt,
      outputVariable: 'result',
    },
    positionX: 200,
    positionY: 200,
  };
}

function makeEmailNode(id: string) {
  return {
    id,
    workflowId: WORKFLOW_ID,
    name: `email-${id}`,
    description: null,
    type: 'email' as const,
    config: {
      nodeType: 'email' as const,
      to: 'test@example.com',
      subject: 'Test',
      contentSource: 'inline' as const,
      body: 'Hello',
      isHtml: true,
      outputVariable: 'email_result',
    },
    positionX: 200,
    positionY: 200,
  };
}

describe('WfPatchNodeTool', () => {
  let registry: ReturnType<typeof createCopilotToolRegistry>;

  beforeEach(() => {
    registry = createCopilotToolRegistry(WORKFLOW_ID);
  });

  it('replaces the first occurrence in a SQL node by default', async () => {
    const node = makeSqlNode('n1', 'SELECT * FROM users WHERE status = "active"');
    const wf = makeWorkflow({ nodes: [node] });

    vi.mocked(service.getWorkflow).mockResolvedValue(wf);
    vi.mocked(service.saveWorkflow).mockImplementation(async (_id, input) => ({
      ...wf,
      nodes: input.nodes.map((n) => ({
        id: n.id ?? 'n1',
        workflowId: WORKFLOW_ID,
        name: n.name,
        description: n.description ?? null,
        type: n.type,
        config: n.config,
        positionX: n.positionX,
        positionY: n.positionY,
      })),
    }));

    const result = await registry.execute('wf_patch_node', {
      nodeId: 'n1',
      old_string: 'status = "active"',
      new_string: 'status = "inactive"',
    });

    expect(result.success).toBe(true);
    const data = result.data as { config: { sql: string } };
    expect(data.config.sql).toBe('SELECT * FROM users WHERE status = "inactive"');
  });

  it('replaces the 2nd occurrence when occurrence=2', async () => {
    const node = makeSqlNode('n1', 'SELECT id, id FROM users WHERE id > 0');
    const wf = makeWorkflow({ nodes: [node] });

    vi.mocked(service.getWorkflow).mockResolvedValue(wf);
    vi.mocked(service.saveWorkflow).mockImplementation(async (_id, input) => ({
      ...wf,
      nodes: input.nodes.map((n) => ({
        id: n.id ?? 'n1',
        workflowId: WORKFLOW_ID,
        name: n.name,
        description: n.description ?? null,
        type: n.type,
        config: n.config,
        positionX: n.positionX,
        positionY: n.positionY,
      })),
    }));

    const result = await registry.execute('wf_patch_node', {
      nodeId: 'n1',
      old_string: 'id',
      new_string: 'user_id',
      occurrence: 2,
    });

    expect(result.success).toBe(true);
    const data = result.data as { config: { sql: string } };
    expect(data.config.sql).toBe('SELECT id, user_id FROM users WHERE id > 0');
  });

  it('patches config.script for a Python node', async () => {
    const node = makePythonNode('n1', 'import pandas as pd\ndf = pd.read_csv(path)\nprint(df)');
    const wf = makeWorkflow({ nodes: [node] });

    vi.mocked(service.getWorkflow).mockResolvedValue(wf);
    vi.mocked(service.saveWorkflow).mockImplementation(async (_id, input) => ({
      ...wf,
      nodes: input.nodes.map((n) => ({
        id: n.id ?? 'n1',
        workflowId: WORKFLOW_ID,
        name: n.name,
        description: n.description ?? null,
        type: n.type,
        config: n.config,
        positionX: n.positionX,
        positionY: n.positionY,
      })),
    }));

    const result = await registry.execute('wf_patch_node', {
      nodeId: 'n1',
      old_string: 'print(df)',
      new_string: 'result = df.to_dict()',
    });

    expect(result.success).toBe(true);
    const data = result.data as { config: { script: string } };
    expect(data.config.script).toBe(
      'import pandas as pd\ndf = pd.read_csv(path)\nresult = df.to_dict()'
    );
  });

  it('patches config.prompt for an LLM node', async () => {
    const node = makeLlmNode('n1', 'Summarize the following data:\n{{data.result}}');
    const wf = makeWorkflow({ nodes: [node] });

    vi.mocked(service.getWorkflow).mockResolvedValue(wf);
    vi.mocked(service.saveWorkflow).mockImplementation(async (_id, input) => ({
      ...wf,
      nodes: input.nodes.map((n) => ({
        id: n.id ?? 'n1',
        workflowId: WORKFLOW_ID,
        name: n.name,
        description: n.description ?? null,
        type: n.type,
        config: n.config,
        positionX: n.positionX,
        positionY: n.positionY,
      })),
    }));

    const result = await registry.execute('wf_patch_node', {
      nodeId: 'n1',
      old_string: 'Summarize',
      new_string: 'Analyze',
    });

    expect(result.success).toBe(true);
    const data = result.data as { config: { prompt: string } };
    expect(data.config.prompt).toBe('Analyze the following data:\n{{data.result}}');
  });

  it('patches a multi-line SQL fragment', async () => {
    const sql = 'SELECT *\nFROM users\nWHERE age > 18\nORDER BY name';
    const node = makeSqlNode('n1', sql);
    const wf = makeWorkflow({ nodes: [node] });

    vi.mocked(service.getWorkflow).mockResolvedValue(wf);
    vi.mocked(service.saveWorkflow).mockImplementation(async (_id, input) => ({
      ...wf,
      nodes: input.nodes.map((n) => ({
        id: n.id ?? 'n1',
        workflowId: WORKFLOW_ID,
        name: n.name,
        description: n.description ?? null,
        type: n.type,
        config: n.config,
        positionX: n.positionX,
        positionY: n.positionY,
      })),
    }));

    const result = await registry.execute('wf_patch_node', {
      nodeId: 'n1',
      old_string: 'WHERE age > 18\nORDER BY name',
      new_string: 'WHERE age >= 21\nORDER BY created_at DESC',
    });

    expect(result.success).toBe(true);
    const data = result.data as { config: { sql: string } };
    expect(data.config.sql).toBe('SELECT *\nFROM users\nWHERE age >= 21\nORDER BY created_at DESC');
  });

  it('deletes a fragment when new_string is empty', async () => {
    const node = makeSqlNode('n1', 'SELECT * FROM users WHERE 1=1 AND status = "active"');
    const wf = makeWorkflow({ nodes: [node] });

    vi.mocked(service.getWorkflow).mockResolvedValue(wf);
    vi.mocked(service.saveWorkflow).mockImplementation(async (_id, input) => ({
      ...wf,
      nodes: input.nodes.map((n) => ({
        id: n.id ?? 'n1',
        workflowId: WORKFLOW_ID,
        name: n.name,
        description: n.description ?? null,
        type: n.type,
        config: n.config,
        positionX: n.positionX,
        positionY: n.positionY,
      })),
    }));

    const result = await registry.execute('wf_patch_node', {
      nodeId: 'n1',
      old_string: ' AND status = "active"',
      new_string: '',
    });

    expect(result.success).toBe(true);
    const data = result.data as { config: { sql: string } };
    expect(data.config.sql).toBe('SELECT * FROM users WHERE 1=1');
  });

  it('returns error when old_string is not found', async () => {
    const node = makeSqlNode('n1', 'SELECT 1');
    const wf = makeWorkflow({ nodes: [node] });
    vi.mocked(service.getWorkflow).mockResolvedValue(wf);

    const result = await registry.execute('wf_patch_node', {
      nodeId: 'n1',
      old_string: 'no_match',
      new_string: 'replacement',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('old_string not found in node content');
  });

  it('returns error when occurrence exceeds match count', async () => {
    const node = makeSqlNode('n1', 'SELECT id FROM users');
    const wf = makeWorkflow({ nodes: [node] });
    vi.mocked(service.getWorkflow).mockResolvedValue(wf);

    const result = await registry.execute('wf_patch_node', {
      nodeId: 'n1',
      old_string: 'id',
      new_string: 'user_id',
      occurrence: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('exceeds total matches');
  });

  it('returns error when occurrence is less than 1', async () => {
    const node = makeSqlNode('n1', 'SELECT 1');
    const wf = makeWorkflow({ nodes: [node] });
    vi.mocked(service.getWorkflow).mockResolvedValue(wf);

    const result = await registry.execute('wf_patch_node', {
      nodeId: 'n1',
      old_string: 'SELECT',
      new_string: 'SELECT DISTINCT',
      occurrence: 0,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('occurrence must be a positive integer');
  });

  it('returns error for email node type', async () => {
    const node = makeEmailNode('n1');
    const wf = makeWorkflow({ nodes: [node] });
    vi.mocked(service.getWorkflow).mockResolvedValue(wf);

    const result = await registry.execute('wf_patch_node', {
      nodeId: 'n1',
      old_string: 'Hello',
      new_string: 'Hi',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('does not support email nodes');
  });

  it('returns error when old_string equals new_string', async () => {
    const node = makeSqlNode('n1', 'SELECT 1');
    const wf = makeWorkflow({ nodes: [node] });
    vi.mocked(service.getWorkflow).mockResolvedValue(wf);

    const result = await registry.execute('wf_patch_node', {
      nodeId: 'n1',
      old_string: 'SELECT',
      new_string: 'SELECT',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('old_string and new_string cannot be the same');
  });

  it('returns error when nodeId is missing', async () => {
    const result = await registry.execute('wf_patch_node', {
      old_string: 'a',
      new_string: 'b',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('nodeId is required');
  });

  it('returns error when nodeId does not match any node', async () => {
    const node = makeSqlNode('n1', 'SELECT 1');
    const wf = makeWorkflow({ nodes: [node] });
    vi.mocked(service.getWorkflow).mockResolvedValue(wf);

    const result = await registry.execute('wf_patch_node', {
      nodeId: 'nonexistent',
      old_string: 'SELECT',
      new_string: 'SELECT DISTINCT',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Node 'nonexistent' not found");
  });

  it('returns error when old_string is empty', async () => {
    const node = makeSqlNode('n1', 'SELECT 1');
    const wf = makeWorkflow({ nodes: [node] });
    vi.mocked(service.getWorkflow).mockResolvedValue(wf);

    const result = await registry.execute('wf_patch_node', {
      nodeId: 'n1',
      old_string: '',
      new_string: 'something',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('old_string cannot be empty');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pnpm vitest run tests/wfPatchNodeTool.test.ts`

Expected: All 14 tests FAIL because the `wf_patch_node` tool is not registered yet — `registry.execute('wf_patch_node', ...)` will throw `"Tool 'wf_patch_node' not found"`.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/wfPatchNodeTool.test.ts
git commit -m "test(copilot): add failing tests for wf_patch_node tool"
```

---

### Task 3: Implement `WfPatchNodeTool` class and register in factory

**Files:**
- Modify: `backend/src/copilot/copilotTools.ts:367` (insert after `WfUpdateNodeTool`, before `WfDeleteNodeTool`)
- Modify: `backend/src/copilot/copilotTools.ts:994` (register in factory after `WfUpdateNodeTool`)

- [ ] **Step 1: Add `WfPatchNodeTool` class**

Insert the following class after `WfUpdateNodeTool` (after line 367, before `class WfDeleteNodeTool`) in `backend/src/copilot/copilotTools.ts`:

```typescript
class WfPatchNodeTool extends Tool {
  name = 'wf_patch_node';
  description =
    'Patch the text content of a node (SQL query, Python script, or LLM prompt) by replacing a specific text fragment. Use this instead of wf_update_node when only a small part of the content needs to change.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node ID to patch' },
      old_string: {
        type: 'string',
        description: 'The exact text fragment to find and replace in the node content',
      },
      new_string: {
        type: 'string',
        description:
          'The replacement text (empty string to delete the fragment)',
      },
      occurrence: {
        type: 'number',
        description: 'Which occurrence to replace (1-based, default: 1)',
        minimum: 1,
      },
    },
    required: ['nodeId', 'old_string', 'new_string'],
  };
  private workflowId: string;

  constructor(workflowId: string) {
    super();
    this.workflowId = workflowId;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const nodeId = params.nodeId as string;
      const oldString = params.old_string as string;
      const newString = params.new_string as string;
      const occurrence = (params.occurrence as number | undefined) ?? 1;

      if (!nodeId || typeof nodeId !== 'string') {
        return { success: false, data: null, error: 'nodeId is required' };
      }
      if (typeof oldString !== 'string' || oldString.length === 0) {
        return { success: false, data: null, error: 'old_string cannot be empty' };
      }
      if (typeof newString !== 'string') {
        return { success: false, data: null, error: 'new_string is required' };
      }
      if (oldString === newString) {
        return {
          success: false,
          data: null,
          error: 'old_string and new_string cannot be the same',
        };
      }
      if (typeof occurrence !== 'number' || occurrence < 1 || !Number.isInteger(occurrence)) {
        return {
          success: false,
          data: null,
          error: 'occurrence must be a positive integer',
        };
      }

      const workflow = await service.getWorkflow(this.workflowId);
      const node = workflow.nodes.find((n) => n.id === nodeId);
      if (!node) {
        return { success: false, data: null, error: `Node '${nodeId}' not found` };
      }

      // Determine target field based on node type
      const targetField = this.getTargetField(node.config);
      if (!targetField) {
        return {
          success: false,
          data: null,
          error:
            'wf_patch_node does not support email nodes. Use wf_update_node instead.',
        };
      }

      const content = node.config[targetField] as string;
      const patched = this.replaceNthOccurrence(content, oldString, newString, occurrence);
      if (typeof patched !== 'string') {
        return patched; // error ToolResult
      }

      const patchedConfig = { ...node.config, [targetField]: patched } as NodeConfig;

      const input = buildSaveInput(workflow);
      const nodeIndex = input.nodes.findIndex((n) => n.id === nodeId);
      if (nodeIndex !== -1) {
        input.nodes[nodeIndex] = { ...input.nodes[nodeIndex], config: patchedConfig };
      }

      const saved = await service.saveWorkflow(this.workflowId, input);
      const updatedNode = saved.nodes.find((n) => n.id === nodeId);

      return {
        success: true,
        data: updatedNode
          ? {
              id: updatedNode.id,
              name: updatedNode.name,
              type: updatedNode.type,
              config: updatedNode.config,
            }
          : null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_patch_node failed', { workflowId: this.workflowId, error: msg });
      return { success: false, data: null, error: msg };
    }
  }

  private getTargetField(
    config: NodeConfig
  ): 'sql' | 'script' | 'prompt' | null {
    switch (config.nodeType) {
      case 'sql':
        return 'sql';
      case 'python':
        return 'script';
      case 'llm':
        return 'prompt';
      case 'email':
        return null;
    }
  }

  private replaceNthOccurrence(
    content: string,
    oldString: string,
    newString: string,
    occurrence: number
  ): string | ToolResult {
    let position = 0;
    let count = 0;

    for (;;) {
      const index = content.indexOf(oldString, position);
      if (index === -1) break;
      count++;
      if (count === occurrence) {
        return (
          content.slice(0, index) + newString + content.slice(index + oldString.length)
        );
      }
      position = index + oldString.length;
    }

    if (count === 0) {
      return { success: false, data: null, error: 'old_string not found in node content' };
    }
    return {
      success: false,
      data: null,
      error: `occurrence ${occurrence} exceeds total matches (${count} found)`,
    };
  }
}
```

- [ ] **Step 2: Register in factory**

In `createCopilotToolRegistry`, add the registration after `WfUpdateNodeTool`:

```typescript
registry.register(new WfUpdateNodeTool(workflowId));
registry.register(new WfPatchNodeTool(workflowId));  // ← add this line
registry.register(new WfDeleteNodeTool(workflowId));
```

- [ ] **Step 3: Run all tests to verify they pass**

Run: `cd backend && pnpm vitest run tests/wfPatchNodeTool.test.ts tests/copilotTools.test.ts`

Expected: All 14 new tests + all existing copilotTools tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/copilot/copilotTools.ts
git commit -m "feat(copilot): implement WfPatchNodeTool for targeted node content editing"
```

---

### Task 4: Update copilot system prompt

**Files:**
- Modify: `backend/src/copilot/copilotPrompt.ts:102-104` (WORKFLOW_BUILD_GUIDELINES)
- Modify: `backend/src/copilot/copilotPrompt.ts:110-113` (TOOL_USAGE_GUIDELINES)

- [ ] **Step 1: Update `WORKFLOW_BUILD_GUIDELINES`**

In `backend/src/copilot/copilotPrompt.ts`, change line 104 from:

```
每次添加（wf_add_node）或修改（wf_update_node）节点配置后，必须使用 wf_execute_node 执行该节点验证其能正确运行。如果执行失败，分析错误并修复配置后重新验证，直到执行成功为止。
```

to:

```
每次添加（wf_add_node）或修改（wf_update_node / wf_patch_node）节点配置后，必须使用 wf_execute_node 执行该节点验证其能正确运行。如果执行失败，分析错误并修复配置后重新验证，直到执行成功为止。
```

- [ ] **Step 2: Update `TOOL_USAGE_GUIDELINES`**

In `backend/src/copilot/copilotPrompt.ts`, in the `TOOL_USAGE_GUIDELINES` section, add a bullet under the workflow tools list (after line 114, before the `### 信息收集工具` section at line 116):

```
- 修复节点中的 SQL/Python/Prompt 内容时，优先使用 wf_patch_node 进行局部替换，避免用 wf_update_node 重写整个字段。只需提供出错部分的原文和修正后的文本即可
```

- [ ] **Step 3: Run copilot prompt tests**

Run: `cd backend && pnpm vitest run tests/copilotPrompt.test.ts`

Expected: PASS (prompt tests typically check structure, not exact wording).

- [ ] **Step 4: Commit**

```bash
git add backend/src/copilot/copilotPrompt.ts
git commit -m "docs(copilot): add wf_patch_node guidance to system prompt"
```

---

### Task 5: Run full preflight

- [ ] **Step 1: Run backend preflight**

Run: `cd backend && pnpm run preflight`

This runs ESLint, TypeScript compiler, Prettier, and all tests. Fix any issues that arise.

- [ ] **Step 2: Final commit if preflight required fixes**

Only if preflight flagged issues — fix and commit.
