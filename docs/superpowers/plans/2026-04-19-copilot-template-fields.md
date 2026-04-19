# Copilot Template Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Copilot tool results expose the actual template-referenceable upstream fields and mark `raw_output` results with `needsUpstreamFix: true` so the model fixes upstream Python outputs before wiring downstream templates.

**Architecture:** Add a focused workflow helper that summarizes template fields from node outputs and formats raw-output diagnostics. Use that helper from Copilot workflow tools and unresolved-template execution errors, then update Copilot prompts to consume `templateFields.fields` instead of inferring fields from intended Python code.

**Tech Stack:** TypeScript, Vitest, existing workflow execution engine, existing Copilot tool registry and prompt strings.

---

## File Structure

- Create `backend/src/workflow/templateFields.ts`
  - Owns `TemplateFieldSummary`, `NodeTemplateFieldSummary`, `buildTemplateFieldSummary`, `buildNodeTemplateFieldSummary`, and `formatRawOutputTemplateDiagnostics`.
  - Keeps template-field detection independent from Copilot tools and execution engine.
- Create `backend/tests/workflow/templateFields.test.ts`
  - Unit tests for field filtering, `raw_output` detection, node metadata, and diagnostic text.
- Modify `backend/src/copilot/copilotTools.ts`
  - Wrap `wf_execute_node` results as `{ runId, output, templateFields, run }`.
  - Wrap `wf_get_run_result` results as `{ run, nodeTemplateFields }`.
  - Wrap full `wf_execute` results as `{ run, nodeTemplateFields }` for consistency.
- Modify `backend/tests/copilot/copilotTools.test.ts`
  - Verify the three tools return template field summaries and preserve existing LLM sanitization.
- Modify `backend/src/workflow/executionEngine.ts`
  - Append actionable raw-output diagnostics to unresolved-template errors.
- Modify `backend/tests/workflow/executionEngine.test.ts`
  - Verify unresolved-template errors include `needsUpstreamFix: true` guidance when upstream output only has `raw_output`.
- Modify `backend/src/copilot/copilotPrompt.ts`
  - Add template-field inspection rules for `wf_execute_node` and `wf_get_run_result`.
- Modify `backend/src/copilot/nodePromptShared.ts`
  - Add Python output contract guidance: assign all downstream fields to `result`, do not only print.
- Modify `backend/tests/copilotPrompt.test.ts`
  - Assert global prompt includes `templateFields.fields` and `needsUpstreamFix`.
- Modify `backend/tests/copilot/nodePromptShared.test.ts`
  - Assert Python guide includes the `raw_output` fix rule.

## Task 1: Add Template Field Summary Helper

**Files:**
- Create: `backend/src/workflow/templateFields.ts`
- Test: `backend/tests/workflow/templateFields.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `backend/tests/workflow/templateFields.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildNodeTemplateFieldSummary,
  buildTemplateFieldSummary,
  formatRawOutputTemplateDiagnostics,
} from '../../src/workflow/templateFields';
import { WorkflowNodeType } from '../../src/workflow/workflow.types';

describe('templateFields', () => {
  it('lists top-level defined fields and excludes sanitizer metadata', () => {
    const summary = buildTemplateFieldSummary({
      csvPath: '/tmp/out.csv',
      months: ['2026-01'],
      total_cost: 12,
      missing: undefined,
      _sanitized: { applied: true },
    });

    expect(summary).toEqual({
      fields: ['csvPath', 'months', 'total_cost'],
      hasRawOutput: false,
      needsUpstreamFix: false,
      warnings: [],
    });
  });

  it('marks raw_output as an upstream fix signal', () => {
    const summary = buildTemplateFieldSummary({
      csvPath: '/tmp/out.csv',
      stderr: '',
      raw_output: '{"months":["2026-01"]}',
    });

    expect(summary.fields).toEqual(['csvPath', 'stderr', 'raw_output']);
    expect(summary.hasRawOutput).toBe(true);
    expect(summary.needsUpstreamFix).toBe(true);
    expect(summary.warnings).toContain(
      'raw_output is not a structured template field source. Fix the upstream Python node by assigning downstream fields to result, then re-run it.'
    );
  });

  it('adds node identity and preferred reference names', () => {
    const summary = buildNodeTemplateFieldSummary({
      node: {
        id: 'node-1',
        workflowId: 'wf-1',
        name: 'Process Ecommerce',
        type: WorkflowNodeType.Python,
        config: {
          nodeType: 'python',
          params: {},
          script: 'result = {"months": []}',
          outputVariable: 'ecommerce_monthly',
        },
        positionX: 0,
        positionY: 0,
      },
      output: { months: ['2026-01'] },
    });

    expect(summary).toMatchObject({
      nodeId: 'node-1',
      nodeName: 'Process Ecommerce',
      nodeType: 'python',
      outputVariable: 'ecommerce_monthly',
      referenceNames: ['ecommerce_monthly', 'Process Ecommerce'],
      fields: ['months'],
      needsUpstreamFix: false,
    });
  });

  it('formats raw_output diagnostics for unresolved template errors', () => {
    const message = formatRawOutputTemplateDiagnostics(
      new Map([
        ['ecommerce_monthly', { csvPath: '/tmp/out.csv', stderr: '', raw_output: 'printed only' }],
        ['tiktok_monthly', { csvPath: '/tmp/tiktok.csv', totalRows: 2 }],
      ])
    );

    expect(message).toContain('Raw-output upstream nodes need fixes before downstream templates can reference computed fields:');
    expect(message).toContain('- ecommerce_monthly: needsUpstreamFix: true');
    expect(message).toContain('assign `result = {"months": value}`');
    expect(message).not.toContain('tiktok_monthly');
  });
});
```

- [ ] **Step 2: Run helper test to verify it fails**

Run:

```bash
cd backend
pnpm vitest run tests/workflow/templateFields.test.ts
```

Expected:

```text
FAIL  tests/workflow/templateFields.test.ts
Error: Failed to resolve import "../../src/workflow/templateFields"
```

- [ ] **Step 3: Implement helper**

Create `backend/src/workflow/templateFields.ts`:

```ts
import type {
  NodeConfig,
  WorkflowNodeInfo,
  WorkflowNodeRunInfo,
  WorkflowNodeTypeValue,
} from './workflow.types';

const INTERNAL_TEMPLATE_FIELD_KEYS = new Set(['_sanitized']);

export const RAW_OUTPUT_TEMPLATE_WARNING =
  'raw_output is not a structured template field source. Fix the upstream Python node by assigning downstream fields to result, then re-run it.';

export interface TemplateFieldSummary {
  fields: string[];
  hasRawOutput: boolean;
  needsUpstreamFix: boolean;
  warnings: string[];
}

export interface NodeTemplateFieldSummary extends TemplateFieldSummary {
  nodeId?: string;
  nodeName?: string;
  nodeType?: WorkflowNodeTypeValue | string;
  outputVariable?: string;
  referenceNames: string[];
}

type NodeIdentity = Pick<WorkflowNodeInfo, 'id' | 'name' | 'type' | 'config'>;

interface BuildNodeTemplateFieldSummaryInput {
  node?: NodeIdentity;
  nodeRun?: Pick<WorkflowNodeRunInfo, 'nodeId' | 'nodeName' | 'nodeType'>;
  output: Record<string, unknown>;
}

export function buildTemplateFieldSummary(output: Record<string, unknown>): TemplateFieldSummary {
  const fields = Object.entries(output)
    .filter(([key, value]) => !INTERNAL_TEMPLATE_FIELD_KEYS.has(key) && value !== undefined)
    .map(([key]) => key);
  const hasRawOutput = fields.includes('raw_output');

  return {
    fields,
    hasRawOutput,
    needsUpstreamFix: hasRawOutput,
    warnings: hasRawOutput ? [RAW_OUTPUT_TEMPLATE_WARNING] : [],
  };
}

export function buildNodeTemplateFieldSummary(
  input: BuildNodeTemplateFieldSummaryInput
): NodeTemplateFieldSummary {
  const base = buildTemplateFieldSummary(input.output);
  const nodeId = input.node?.id ?? input.nodeRun?.nodeId;
  const nodeName = input.node?.name ?? input.nodeRun?.nodeName;
  const nodeType = input.node?.type ?? input.nodeRun?.nodeType;
  const outputVariable = input.node ? getOutputVariable(input.node.config) : undefined;
  const referenceNames = uniqueDefined([outputVariable, nodeName]);

  return {
    nodeId,
    nodeName,
    nodeType,
    outputVariable,
    referenceNames,
    ...base,
  };
}

export function formatRawOutputTemplateDiagnostics(
  nodeOutputs: Map<string, Record<string, unknown>>
): string {
  const lines: string[] = [];
  for (const [name, output] of nodeOutputs) {
    const summary = buildTemplateFieldSummary(output);
    if (!summary.needsUpstreamFix) continue;
    lines.push(
      `  - ${name}: needsUpstreamFix: true. raw_output means the upstream node printed data instead of returning structured result fields. Fix that Python node to assign \`result = {"months": value}\` or another exact downstream field map, re-run it, then reference only fields listed in templateFields.fields.`
    );
  }

  if (lines.length === 0) return '';
  return [
    'Raw-output upstream nodes need fixes before downstream templates can reference computed fields:',
    ...lines,
  ].join('\n');
}

function getOutputVariable(config: NodeConfig): string | undefined {
  if ('outputVariable' in config && typeof config.outputVariable === 'string') {
    return config.outputVariable;
  }
  return undefined;
}

function uniqueDefined(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
```

- [ ] **Step 4: Run helper test to verify it passes**

Run:

```bash
cd backend
pnpm vitest run tests/workflow/templateFields.test.ts
```

Expected:

```text
PASS  tests/workflow/templateFields.test.ts
```

- [ ] **Step 5: Commit helper**

```bash
git add backend/src/workflow/templateFields.ts backend/tests/workflow/templateFields.test.ts
git commit -m "feat(workflow): summarize template fields"
```

## Task 2: Return Template Fields From Copilot Run Tools

**Files:**
- Modify: `backend/src/copilot/copilotTools.ts`
- Modify: `backend/tests/copilot/copilotTools.test.ts`

- [ ] **Step 1: Write failing Copilot tool tests**

Add these tests to `backend/tests/copilot/copilotTools.test.ts` in the existing `WfExecuteNodeTool` and `WfGetRunResultTool` describe blocks:

Extend the type imports at the top of `backend/tests/copilot/copilotTools.test.ts`:

```ts
import type { WorkflowAccessor } from '../../src/copilot/workflowAccessor';
import {
  WorkflowNodeType,
  type CustomNodeTemplateInfo,
  type WorkflowDetail,
  type WorkflowRunDetail,
} from '../../src/workflow/workflow.types';
```

Update the existing sanitization assertions because run results are now wrapped:

```ts
// WfGetRunResultTool sanitization test
expectRunResultSanitized((result.data as { run: unknown }).run, longOutput, base64Payload, 'image/png');

// WfExecuteTool sanitization test
expectRunResultSanitized((result.data as { run: unknown }).run, longOutput, base64Payload, 'image/png');
expect((result.data as { run: { startedAt: string; completedAt: string } }).run).toMatchObject({
  startedAt: startedAt.toISOString(),
  completedAt: completedAt.toISOString(),
});

// WfExecuteNodeTool sanitization test
expectRunResultSanitized(
  (result.data as { output: unknown }).output,
  longOutput,
  base64Payload,
  'image/png'
);
```

```ts
  it('returns templateFields and needsUpstreamFix for execute-node raw output', async () => {
    const accessor = {
      workflowId: 'wf-1',
      getWorkflow: vi.fn().mockResolvedValue({
        id: 'wf-1',
        name: 'Workflow',
        description: null,
        createdAt: new Date('2026-04-19T00:00:00Z'),
        updatedAt: new Date('2026-04-19T00:00:00Z'),
        nodes: [
          {
            id: 'node-1',
            workflowId: 'wf-1',
            name: 'Process Ecommerce',
            type: WorkflowNodeType.Python,
            config: {
              nodeType: 'python',
              params: {},
              script: 'print({"months": []})',
              outputVariable: 'ecommerce_monthly',
            },
            positionX: 0,
            positionY: 0,
          },
        ],
        edges: [],
      }),
      getNode: vi.fn(),
      updateNode: vi.fn(),
      executeNode: vi.fn().mockResolvedValue({ runId: 'run-1' }),
      getRunResult: vi.fn().mockResolvedValue({
        id: 'run-1',
        workflowId: 'wf-1',
        status: 'completed',
        startedAt: new Date('2026-04-19T00:00:00Z'),
        completedAt: new Date('2026-04-19T00:01:00Z'),
        errorMessage: null,
        nodeRuns: [
          {
            id: 'nr-1',
            runId: 'run-1',
            nodeId: 'node-1',
            status: 'completed',
            inputs: null,
            outputs: { csvPath: '/tmp/out.csv', stderr: '', raw_output: '{"months":[]}' },
            errorMessage: null,
            startedAt: new Date('2026-04-19T00:00:00Z'),
            completedAt: new Date('2026-04-19T00:01:00Z'),
            nodeName: 'Process Ecommerce',
            nodeType: 'python',
          },
        ],
      }),
    } satisfies WorkflowAccessor;

    const tool = new WfExecuteNodeTool(accessor);
    const result = await tool.execute({ nodeId: 'node-1' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      runId: 'run-1',
      output: { csvPath: '/tmp/out.csv', stderr: '', raw_output: '{"months":[]}' },
      templateFields: {
        nodeId: 'node-1',
        outputVariable: 'ecommerce_monthly',
        fields: ['csvPath', 'stderr', 'raw_output'],
        hasRawOutput: true,
        needsUpstreamFix: true,
      },
    });
  });
```

Add this test to the `WfGetRunResultTool` describe block:

```ts
  it('wraps run results with nodeTemplateFields', async () => {
    const accessor = {
      workflowId: 'wf-1',
      getWorkflow: vi.fn().mockResolvedValue({
        id: 'wf-1',
        name: 'Workflow',
        description: null,
        createdAt: new Date('2026-04-19T00:00:00Z'),
        updatedAt: new Date('2026-04-19T00:00:00Z'),
        nodes: [
          {
            id: 'node-1',
            workflowId: 'wf-1',
            name: 'Process Ecommerce',
            type: WorkflowNodeType.Python,
            config: {
              nodeType: 'python',
              params: {},
              script: 'result = {"months": []}',
              outputVariable: 'ecommerce_monthly',
            },
            positionX: 0,
            positionY: 0,
          },
        ],
        edges: [],
      }),
      getNode: vi.fn(),
      updateNode: vi.fn(),
      executeNode: vi.fn(),
      getRunResult: vi.fn().mockResolvedValue({
        id: 'run-1',
        workflowId: 'wf-1',
        status: 'completed',
        startedAt: new Date('2026-04-19T00:00:00Z'),
        completedAt: new Date('2026-04-19T00:01:00Z'),
        errorMessage: null,
        nodeRuns: [
          {
            id: 'nr-1',
            runId: 'run-1',
            nodeId: 'node-1',
            status: 'completed',
            inputs: null,
            outputs: { months: ['2026-01'], total_cost: 100 },
            errorMessage: null,
            startedAt: new Date('2026-04-19T00:00:00Z'),
            completedAt: new Date('2026-04-19T00:01:00Z'),
            nodeName: 'Process Ecommerce',
            nodeType: 'python',
          },
        ],
      }),
    } satisfies WorkflowAccessor;

    const tool = new WfGetRunResultTool(accessor);
    const result = await tool.execute({ runId: 'run-1' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      run: { id: 'run-1' },
      nodeTemplateFields: [
        {
          nodeId: 'node-1',
          outputVariable: 'ecommerce_monthly',
          referenceNames: ['ecommerce_monthly', 'Process Ecommerce'],
          fields: ['months', 'total_cost'],
          needsUpstreamFix: false,
        },
      ],
    });
  });
```

- [ ] **Step 2: Run Copilot tool tests to verify they fail**

Run:

```bash
cd backend
pnpm vitest run tests/copilot/copilotTools.test.ts
```

Expected:

```text
FAIL  tests/copilot/copilotTools.test.ts
AssertionError: expected ... to match object
```

- [ ] **Step 3: Add Copilot tool result helpers**

Modify imports in `backend/src/copilot/copilotTools.ts`:

```ts
import {
  buildNodeTemplateFieldSummary,
  buildTemplateFieldSummary,
  type NodeTemplateFieldSummary,
  type TemplateFieldSummary,
} from '../workflow/templateFields';
```

Add these helper types and functions above `class WfExecuteTool`:

```ts
interface ToolRunTemplatePayload {
  run: Record<string, unknown>;
  nodeTemplateFields: NodeTemplateFieldSummary[];
}

interface ExecuteNodeTemplatePayload extends ToolRunTemplatePayload {
  runId: string;
  output: Record<string, unknown> | null;
  templateFields: NodeTemplateFieldSummary | TemplateFieldSummary | null;
}

async function buildRunTemplatePayload(
  accessor: WorkflowAccessor,
  runDetail: Record<string, unknown>
): Promise<ToolRunTemplatePayload> {
  const nodeRuns = Array.isArray(runDetail.nodeRuns) ? runDetail.nodeRuns : [];
  if (nodeRuns.length === 0) {
    return {
      run: runDetail,
      nodeTemplateFields: [],
    };
  }

  const workflow = await accessor.getWorkflow();
  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));

  const nodeTemplateFields = nodeRuns
    .filter(isRecord)
    .map((nodeRun) => {
      const output = getNodeRunOutput(nodeRun);
      if (!output) return null;
      const nodeId = typeof nodeRun.nodeId === 'string' ? nodeRun.nodeId : undefined;
      return buildNodeTemplateFieldSummary({
        node: nodeId ? nodesById.get(nodeId) : undefined,
        nodeRun: {
          nodeId,
          nodeName: typeof nodeRun.nodeName === 'string' ? nodeRun.nodeName : undefined,
          nodeType: typeof nodeRun.nodeType === 'string' ? nodeRun.nodeType : undefined,
        },
        output,
      });
    })
    .filter((summary): summary is NodeTemplateFieldSummary => summary !== null);

  return {
    run: runDetail,
    nodeTemplateFields,
  };
}

async function buildExecuteNodeTemplatePayload(
  accessor: WorkflowAccessor,
  runId: string,
  nodeId: string,
  runResult: Record<string, unknown>
): Promise<ExecuteNodeTemplatePayload> {
  if (Array.isArray(runResult.nodeRuns)) {
    const payload = await buildRunTemplatePayload(accessor, runResult);
    const nodeRuns = runResult.nodeRuns.filter(isRecord);
    const targetRun =
      nodeRuns.find((nodeRun) => nodeRun.nodeId === nodeId) ??
      (nodeRuns.length === 1 ? nodeRuns[0] : undefined);
    const output = targetRun ? getNodeRunOutput(targetRun) : null;
    const templateFields =
      payload.nodeTemplateFields.find((summary) => summary.nodeId === nodeId) ??
      (payload.nodeTemplateFields.length === 1 ? payload.nodeTemplateFields[0] : null);

    return {
      runId,
      output,
      templateFields,
      ...payload,
    };
  }

  return {
    runId,
    output: runResult,
    templateFields: buildTemplateFieldSummary(runResult),
    run: runResult,
    nodeTemplateFields: [],
  };
}

function getNodeRunOutput(nodeRun: Record<string, unknown>): Record<string, unknown> | null {
  return isRecord(nodeRun.outputs) ? nodeRun.outputs : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
```

- [ ] **Step 4: Use wrappers in Copilot tools**

Modify `WfExecuteTool.execute()` after `const runDetail = await handle.promise;`:

```ts
        const sanitizedRunDetail = sanitizeForLlm(runDetail);
        const data = isRecord(sanitizedRunDetail)
          ? await buildRunTemplatePayload(this.workflowAccessor, sanitizedRunDetail)
          : sanitizedRunDetail;
        return { success: true, data };
```

Because `WfExecuteTool` currently has no accessor property, add this private property to the class and initialize it in the constructor:

```ts
  private workflowAccessor: WorkflowAccessor;
```

```ts
    this.workflowAccessor = new DbWorkflowAccessor(workflowId, tempWorkdir);
```

Modify `WfExecuteNodeTool.execute()`:

```ts
      const { runId } = await this.accessor.executeNode(nodeId, {
        mockInputs,
        onProgress: this.onProgress,
      });
      const runResult = await this.accessor.getRunResult(runId);
      const sanitizedRunResult = sanitizeForLlm(runResult);
      const data = isRecord(sanitizedRunResult)
        ? await buildExecuteNodeTemplatePayload(this.accessor, runId, nodeId, sanitizedRunResult)
        : { runId, output: null, templateFields: null, run: sanitizedRunResult, nodeTemplateFields: [] };
      return { success: true, data };
```

Modify `WfGetRunResultTool.execute()`:

```ts
      const runDetail = await this.accessor.getRunResult(runId);
      const sanitizedRunDetail = sanitizeForLlm(runDetail);
      const data = isRecord(sanitizedRunDetail)
        ? await buildRunTemplatePayload(this.accessor, sanitizedRunDetail)
        : sanitizedRunDetail;
      return { success: true, data };
```

- [ ] **Step 5: Run Copilot tool tests**

Run:

```bash
cd backend
pnpm vitest run tests/copilot/copilotTools.test.ts
```

Expected:

```text
PASS  tests/copilot/copilotTools.test.ts
```

- [ ] **Step 6: Commit Copilot tool result wrappers**

```bash
git add backend/src/copilot/copilotTools.ts backend/tests/copilot/copilotTools.test.ts
git commit -m "feat(copilot): expose template fields in run tools"
```

## Task 3: Add Raw-Output Diagnostics To Template Resolution Errors

**Files:**
- Modify: `backend/src/workflow/executionEngine.ts`
- Modify: `backend/tests/workflow/executionEngine.test.ts`

- [ ] **Step 1: Write failing execution error test**

Add this test in the unresolved-template validation area of `backend/tests/workflow/executionEngine.test.ts`:

```ts
  it('adds needsUpstreamFix guidance when unresolved templates point at raw_output upstreams', async () => {
    const wfId = uniqueWfId();
    const nodeA = makeNode({
      id: 'node-a',
      name: 'Process Ecommerce',
      workflowId: wfId,
      type: 'python',
      config: makePythonConfig({
        outputVariable: 'ecommerce_monthly',
        script: 'print({"months": []})',
      }),
    });
    const nodeB = makeNode({
      id: 'node-b',
      name: 'Report Gen',
      workflowId: wfId,
      type: 'llm',
      config: makeLlmConfig({
        outputVariable: 'report_gen',
        params: {
          months: { value: '{{ecommerce_monthly.months}}', type: 'text' },
        },
        prompt: 'Summarize',
      }),
    });

    const workflow = makeWorkflow({
      id: wfId,
      nodes: [nodeA, nodeB],
      edges: [
        {
          id: 'edge-a-b',
          workflowId: wfId,
          sourceNodeId: 'node-a',
          targetNodeId: 'node-b',
        },
      ],
    });

    mockFindWorkflowById.mockResolvedValue(workflow);
    mockTopologicalSort.mockReturnValue(['node-b']);
    mockGetUpstreamNodes.mockReturnValue(['node-a']);
    mockFindLatestSuccessfulNodeRunOutput.mockResolvedValue({
      csvPath: '/tmp/ecommerce.csv',
      stderr: '',
      raw_output: '{"months":[]}',
    });
    mockCreateRun.mockResolvedValue({
      id: `run-raw-output-${wfId}`,
      workflowId: wfId,
      status: 'running',
      startedAt: now,
      completedAt: null,
      errorMessage: null,
    });
    mockCreateNodeRunsBatch.mockResolvedValue([
      {
        id: 'nr-node-b',
        runId: `run-raw-output-${wfId}`,
        nodeId: 'node-b',
        status: 'pending',
        inputs: null,
        outputs: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      },
    ]);
    mockUpdateNodeRun.mockResolvedValue(undefined);
    mockUpdateRunStatus.mockResolvedValue(undefined);
    mockGetNodeExecutor.mockReturnValue({ type: 'llm', execute: mockExecute });
    mockResolveParamsTemplates.mockImplementation((params) => normalizeToParamDefinitions(params));
    mockFindRunById.mockResolvedValue(makeRunDetail({ status: 'failed', workflowId: wfId }));

    const handle = await executeNode(wfId, 'node-b');
    await handle.promise;

    const updateCalls = mockUpdateNodeRun.mock.calls as Array<[string, Record<string, unknown>]>;
    const failedCall = updateCalls.find(([, data]) => data.status === 'failed');
    expect(failedCall?.[1].errorMessage).toMatch(
      /Raw-output upstream nodes need fixes before downstream templates can reference computed fields:[\s\S]*ecommerce_monthly: needsUpstreamFix: true/
    );
    expect(mockExecute).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run execution engine test to verify it fails**

Run:

```bash
cd backend
pnpm vitest run tests/workflow/executionEngine.test.ts
```

Expected:

```text
FAIL  tests/workflow/executionEngine.test.ts
AssertionError: expected error message to match /Raw-output upstream nodes/
```

- [ ] **Step 3: Append diagnostics in execution engine**

Modify imports in `backend/src/workflow/executionEngine.ts`:

```ts
import { formatRawOutputTemplateDiagnostics } from './templateFields';
```

Modify `validateResolvedConfig()`:

```ts
  if (allUnresolved.length > 0) {
    const vars = [...new Set(allUnresolved)].join(', ');
    const available = formatAvailableOutputs(nodeOutputs);
    const rawOutputDiagnostics = formatRawOutputTemplateDiagnostics(nodeOutputs);
    const diagnosticSuffix = rawOutputDiagnostics ? `\n${rawOutputDiagnostics}` : '';
    throw new WorkflowExecutionError(
      `Node '${nodeName}' has unresolved template variables: ${vars}. ` +
        `Available output variables and their fields:\n${available}${diagnosticSuffix}`
    );
  }
```

- [ ] **Step 4: Run execution engine test**

Run:

```bash
cd backend
pnpm vitest run tests/workflow/executionEngine.test.ts
```

Expected:

```text
PASS  tests/workflow/executionEngine.test.ts
```

- [ ] **Step 5: Commit diagnostics**

```bash
git add backend/src/workflow/executionEngine.ts backend/tests/workflow/executionEngine.test.ts
git commit -m "feat(workflow): explain raw output template failures"
```

## Task 4: Update Copilot Prompt Guidance

**Files:**
- Modify: `backend/src/copilot/copilotPrompt.ts`
- Modify: `backend/src/copilot/nodePromptShared.ts`
- Modify: `backend/tests/copilotPrompt.test.ts`
- Modify: `backend/tests/copilot/nodePromptShared.test.ts`

- [ ] **Step 1: Write failing prompt tests**

Add assertions to the existing prompt tests.

In `backend/tests/copilotPrompt.test.ts`:

```ts
    expect(prompt).toContain('templateFields.fields');
    expect(prompt).toContain('needsUpstreamFix: true');
    expect(prompt).toContain('do not reference fields that are absent from templateFields.fields');
```

In `backend/tests/copilot/nodePromptShared.test.ts`:

```ts
    expect(guide).toContain('If wf_execute_node returns raw_output or needsUpstreamFix: true');
    expect(guide).toContain('assign every downstream field to result');
```

- [ ] **Step 2: Run prompt tests to verify they fail**

Run:

```bash
cd backend
pnpm vitest run tests/copilotPrompt.test.ts tests/copilot/nodePromptShared.test.ts
```

Expected:

```text
FAIL  tests/copilotPrompt.test.ts
FAIL  tests/copilot/nodePromptShared.test.ts
```

- [ ] **Step 3: Update global Copilot template rules**

Modify the `### Template Syntax Reference` rules in `backend/src/copilot/copilotPrompt.ts` by adding these bullets after `Python/LLM result flattening`:

```ts
- **Tool-verified fields**: After running \`wf_execute_node\` or \`wf_get_run_result\`, inspect \`templateFields.fields\` or \`nodeTemplateFields[].fields\`. Only generate downstream \`{{outputVariable.field}}\` references for fields listed there; do not reference fields that are absent from templateFields.fields.
- **Upstream raw output fix**: If a tool result shows \`needsUpstreamFix: true\`, fix and re-run that upstream node before creating or modifying downstream templates. \`raw_output\` means the upstream Python node printed data but did not return structured fields. Change the Python script to assign every downstream field to \`result\`, such as \`result = {"months": months, "total_cost": total_cost}\`.
```

- [ ] **Step 4: Update Python node guide**

Modify the Python node guide in `backend/src/copilot/nodePromptShared.ts` by adding these bullets after the existing downstream reference examples:

```ts
- **Raw-output correction rule**: If \`wf_execute_node\` returns \`raw_output\` or \`needsUpstreamFix: true\`, the node has not exposed computed values as template fields. Do not wire downstream nodes to guessed fields. Patch the Python script to assign every downstream field to \`result\`, re-run the node, then use only fields listed in \`templateFields.fields\`.
- **Structured result example**: For downstream references like \`{{ecommerce_monthly.months}}\`, the Python script must end with \`result = {"months": months, "total_sales_qty": total_sales_qty, "total_sales_amount": total_sales_amount}\`. Printing that dictionary is not enough.
```

- [ ] **Step 5: Run prompt tests**

Run:

```bash
cd backend
pnpm vitest run tests/copilotPrompt.test.ts tests/copilot/nodePromptShared.test.ts
```

Expected:

```text
PASS  tests/copilotPrompt.test.ts
PASS  tests/copilot/nodePromptShared.test.ts
```

- [ ] **Step 6: Commit prompt guidance**

```bash
git add backend/src/copilot/copilotPrompt.ts backend/src/copilot/nodePromptShared.ts backend/tests/copilotPrompt.test.ts backend/tests/copilot/nodePromptShared.test.ts
git commit -m "docs(copilot): guide template field validation"
```

## Task 5: Verification And Final Commit State

**Files:**
- All files changed in Tasks 1-4

- [ ] **Step 1: Run focused regression tests**

Run:

```bash
cd backend
pnpm vitest run tests/workflow/templateFields.test.ts tests/copilot/copilotTools.test.ts tests/workflow/executionEngine.test.ts tests/copilotPrompt.test.ts tests/copilot/nodePromptShared.test.ts
```

Expected:

```text
PASS  tests/workflow/templateFields.test.ts
PASS  tests/copilot/copilotTools.test.ts
PASS  tests/workflow/executionEngine.test.ts
PASS  tests/copilotPrompt.test.ts
PASS  tests/copilot/nodePromptShared.test.ts
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd backend
pnpm run typecheck
```

Expected:

```text
> databot-backend@... typecheck
> tsc --noEmit
```

with exit code `0`.

- [ ] **Step 3: Inspect git diff**

Run:

```bash
git diff --stat
git diff -- backend/src/workflow/templateFields.ts backend/src/copilot/copilotTools.ts backend/src/workflow/executionEngine.ts backend/src/copilot/copilotPrompt.ts backend/src/copilot/nodePromptShared.ts
```

Expected:

```text
backend/src/workflow/templateFields.ts
backend/src/copilot/copilotTools.ts
backend/src/workflow/executionEngine.ts
backend/src/copilot/copilotPrompt.ts
backend/src/copilot/nodePromptShared.ts
```

The diff must show `needsUpstreamFix: true` in helper output, Copilot tool wrappers, unresolved-template diagnostics, and prompt text.

- [ ] **Step 4: Push commits when requested**

Run:

```bash
git push
```

Expected:

```text
main -> main
```

## Self-Review

- Spec coverage:
  - Real template-referenceable fields are exposed by `buildTemplateFieldSummary` and returned through `wf_execute_node`, `wf_get_run_result`, and `wf_execute`.
  - `raw_output` produces `hasRawOutput: true`, `needsUpstreamFix: true`, and a direct warning.
  - The prompt tells Copilot to fix upstream Python nodes before wiring downstream templates when `needsUpstreamFix` is true.
  - Execution errors add the same raw-output diagnosis for human-visible failures.
- Placeholder scan:
  - The plan avoids undefined implementation placeholders and includes concrete paths, test code, implementation code, commands, and expected outcomes.
- Type consistency:
  - `TemplateFieldSummary`, `NodeTemplateFieldSummary`, `buildTemplateFieldSummary`, `buildNodeTemplateFieldSummary`, and `formatRawOutputTemplateDiagnostics` use the same names in helper, tools, diagnostics, and tests.
