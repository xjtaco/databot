// backend/tests/copilot/copilotTools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/workflow/workflow.repository', () => ({
  findWorkflowById: vi.fn(),
}));
vi.mock('../../src/workflow/nodeExecutors', () => ({
  getNodeExecutor: vi.fn(),
}));
vi.mock('../../src/workflow/customNodeTemplate.repository', () => ({
  findAllTemplates: vi.fn(),
}));
vi.mock('../../src/workflow/executionEngine', () => ({
  executeWorkflow: vi.fn(),
  registerProgressCallback: vi.fn(),
  unregisterProgressCallback: vi.fn(),
}));

import * as templateRepository from '../../src/workflow/customNodeTemplate.repository';
import * as executionEngine from '../../src/workflow/executionEngine';
import {
  createCopilotToolRegistry,
  COPILOT_TOOL_NAMES,
  WfExecuteNodeTool,
  WfGetNodeTool,
  WfGetRunResultTool,
  WfSearchCustomNodesTool,
} from '../../src/copilot/copilotTools';
import {
  InMemoryWorkflowAccessor,
  type WorkflowAccessor,
} from '../../src/copilot/workflowAccessor';
import type {
  CustomNodeTemplateInfo,
  WorkflowDetail,
  WorkflowRunDetail,
} from '../../src/workflow/workflow.types';
import { WorkflowNodeType } from '../../src/workflow/workflow.types';

function makeBase64(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let index = 0; index < length; index++) {
    result += chars[index % chars.length];
  }
  return result;
}

function expectRunResultSanitized(
  data: unknown,
  rawOutput: string,
  rawBase64Payload: string,
  expectedMimeType: string
): void {
  const serialized = JSON.stringify(data);

  expect(serialized).not.toContain(rawOutput);
  expect(serialized).not.toContain(rawBase64Payload);
  expect(data).toMatchObject({
    _sanitized: {
      applied: true,
      reasons: expect.arrayContaining(['large_text', 'base64']),
    },
    output: {
      _summary: {
        kind: 'text',
        chars: rawOutput.length,
      },
    },
    image: {
      _summary: {
        kind: 'base64',
        mimeType: expectedMimeType,
        chars: rawBase64Payload.length,
      },
    },
  });
}

function makeTemplate(
  id: string,
  name: string,
  description: string | null
): CustomNodeTemplateInfo {
  return {
    id,
    name,
    description,
    type: 'sql',
    config: { nodeType: 'sql', datasourceId: '', params: {}, sql: '', outputVariable: 'result' },
    createdAt: new Date(),
    updatedAt: new Date(),
    creatorName: null,
  };
}

function makeRunDetail(overrides: Partial<WorkflowRunDetail> = {}): WorkflowRunDetail {
  return {
    id: 'run-1',
    workflowId: 'wf-1',
    status: 'completed',
    startedAt: new Date('2026-04-13T00:00:00.000Z'),
    completedAt: new Date('2026-04-13T00:01:00.000Z'),
    errorMessage: null,
    nodeRuns: [],
    ...overrides,
  };
}

const SAMPLE_TEMPLATES: CustomNodeTemplateInfo[] = [
  makeTemplate('t1', 'Sales Report SQL', 'Queries the sales database'),
  makeTemplate('t2', 'Python ETL', 'Extracts and transforms data'),
  makeTemplate('t3', 'LLM Summarizer', 'Summarizes text with an LLM'),
  makeTemplate('t4', 'Monthly Revenue', null),
];

describe('WfSearchCustomNodesTool', () => {
  let tool: WfSearchCustomNodesTool;

  beforeEach(() => {
    tool = new WfSearchCustomNodesTool();
    vi.resetAllMocks();
    vi.mocked(templateRepository.findAllTemplates).mockResolvedValue(SAMPLE_TEMPLATES);
  });

  it('has the correct tool name', () => {
    expect(tool.name).toBe('wf_search_custom_nodes');
  });

  it('returns error when pattern is missing', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/pattern is required/i);
  });

  it('filters templates by regex match on name', async () => {
    const result = await tool.execute({ pattern: '^Sales' });
    expect(result.success).toBe(true);
    const data = result.data as { id: string; name: string }[];
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('t1');
  });

  it('filters templates by regex match on description', async () => {
    const result = await tool.execute({ pattern: 'transforms' });
    expect(result.success).toBe(true);
    const data = result.data as { id: string }[];
    expect(data.some((d) => d.id === 't2')).toBe(true);
  });

  it('regex match is case-insensitive', async () => {
    const result = await tool.execute({ pattern: 'llm' });
    expect(result.success).toBe(true);
    const data = result.data as { id: string }[];
    expect(data.some((d) => d.id === 't3')).toBe(true);
  });

  it('returns all matching templates for broad pattern', async () => {
    const result = await tool.execute({ pattern: '.*' });
    expect(result.success).toBe(true);
    const data = result.data as { id: string }[];
    expect(data).toHaveLength(SAMPLE_TEMPLATES.length);
  });

  it('returns empty array when nothing matches', async () => {
    const result = await tool.execute({ pattern: 'zzz_no_match' });
    expect(result.success).toBe(true);
    const data = result.data as { id: string }[];
    expect(data).toHaveLength(0);
  });

  it('falls back to substring match on invalid regex', async () => {
    // '[invalid' is not a valid regex
    const result = await tool.execute({ pattern: '[invalid' });
    expect(result.success).toBe(true);
    // substring '[invalid' won't match anything — confirms fallback ran without throwing
    const data = result.data as { id: string }[];
    expect(Array.isArray(data)).toBe(true);
  });

  it('falls back to substring match and finds results when keyword matches', async () => {
    // Use a keyword that is also an invalid-ish regex but matches via substring
    // We mock a template with the string literal '(sql)' in the name to force this path
    const withLiteralParen: CustomNodeTemplateInfo = makeTemplate(
      't5',
      'Report (sql)',
      'Has parens'
    );
    vi.mocked(templateRepository.findAllTemplates).mockResolvedValue([withLiteralParen]);

    // '(sql)' is a valid regex actually, so use something truly invalid that also appears in text
    // Inject a template with text '[data]' and search with '[data]' (invalid regex bracket)
    const withBracket: CustomNodeTemplateInfo = makeTemplate('t6', 'Report [data]', null);
    vi.mocked(templateRepository.findAllTemplates).mockResolvedValue([withBracket]);

    const result = await tool.execute({ pattern: '[data]' });
    expect(result.success).toBe(true);
    const data = result.data as { id: string }[];
    // '[data]' is invalid regex; fallback substring match on 'Report [data]' should succeed
    expect(data.some((d) => d.id === 't6')).toBe(true);
  });

  it('returns only id, name, description, type fields', async () => {
    const result = await tool.execute({ pattern: 'Sales' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>[];
    expect(data).toHaveLength(1);
    const item = data[0];
    expect(Object.keys(item).sort()).toEqual(['description', 'id', 'name', 'type']);
  });

  it('caps results at 20', async () => {
    const many: CustomNodeTemplateInfo[] = Array.from({ length: 30 }, (_, i) =>
      makeTemplate(`id-${i}`, `Template ${i}`, 'common description')
    );
    vi.mocked(templateRepository.findAllTemplates).mockResolvedValue(many);

    const result = await tool.execute({ pattern: 'Template' });
    expect(result.success).toBe(true);
    const data = result.data as { id: string }[];
    expect(data).toHaveLength(20);
  });

  it('handles null description without crashing', async () => {
    const result = await tool.execute({ pattern: 'Monthly' });
    expect(result.success).toBe(true);
    const data = result.data as { id: string }[];
    expect(data.some((d) => d.id === 't4')).toBe(true);
  });
});

describe('WfGetNodeTool', () => {
  function makeWorkflow(): WorkflowDetail {
    const oversizedPrompt = 'abc '.repeat(400);

    return {
      id: 'wf-node-sanitize',
      name: 'Node sanitize workflow',
      description: null,
      nodes: [
        {
          id: 'node-1',
          workflowId: 'wf-node-sanitize',
          name: 'Large LLM node',
          description: null,
          type: 'llm',
          config: {
            nodeType: 'llm',
            params: {},
            prompt: oversizedPrompt,
            outputVariable: 'result',
          },
          positionX: 0,
          positionY: 0,
        },
      ],
      edges: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it('sanitizes successful node responses with oversized config fields', async () => {
    const workflow = makeWorkflow();
    const accessor = new InMemoryWorkflowAccessor(workflow);
    const tool = new WfGetNodeTool(accessor);
    const oversizedPrompt = 'abc '.repeat(400);

    const result = await tool.execute({ nodeId: 'node-1' });

    expect(result.success).toBe(true);
    expect(JSON.stringify(result.data)).not.toContain(oversizedPrompt);
    expect(result.data).toEqual({
      _sanitized: {
        applied: true,
        reasons: ['large_text'],
      },
      id: 'node-1',
      workflowId: 'wf-node-sanitize',
      name: 'Large LLM node',
      description: null,
      type: 'llm',
      config: {
        nodeType: 'llm',
        params: {},
        prompt: {
          _summary: {
            kind: 'text',
            chars: 'abc '.repeat(400).length,
            preview: 'abc '.repeat(40),
          },
        },
        outputVariable: 'result',
      },
      positionX: 0,
      positionY: 0,
    });
  });
});

describe('WfGetRunResultTool', () => {
  it('sanitizes base64 and long output fields from run results', async () => {
    const longOutput = 'debug output '.repeat(80);
    const base64Payload = makeBase64(600);
    const accessor = {
      workflowId: 'wf-run-result',
      getWorkflow: vi.fn(),
      getNode: vi.fn(),
      updateNode: vi.fn(),
      executeNode: vi.fn(),
      getRunResult: vi.fn().mockResolvedValue({
        output: longOutput,
        image: `data:image/png;base64,${base64Payload}`,
      }),
    };
    const tool = new WfGetRunResultTool(accessor);

    const result = await tool.execute({ runId: 'run-123' });

    expect(result.success).toBe(true);
    expectRunResultSanitized(
      (result.data as { run: unknown }).run,
      longOutput,
      base64Payload,
      'image/png'
    );
  });

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

  it('builds nodeTemplateFields from full run results with more than five node runs', async () => {
    const nodes = Array.from({ length: 6 }, (_, index) => ({
      id: `node-${index + 1}`,
      workflowId: 'wf-large',
      name: `Node ${index + 1}`,
      type: WorkflowNodeType.Python,
      config: {
        nodeType: 'python' as const,
        params: {},
        script: `result = {"field_${index + 1}": ${index + 1}}`,
        outputVariable: `node_${index + 1}_output`,
      },
      positionX: index,
      positionY: index,
    }));
    const nodeRuns = nodes.map((node, index) => ({
      id: `nr-${index + 1}`,
      runId: 'run-large',
      nodeId: node.id,
      status: 'completed' as const,
      inputs: null,
      outputs: { [`field_${index + 1}`]: index + 1 },
      errorMessage: null,
      startedAt: new Date('2026-04-19T00:00:00Z'),
      completedAt: new Date('2026-04-19T00:01:00Z'),
      nodeName: node.name,
      nodeType: node.type,
    }));
    const accessor = {
      workflowId: 'wf-large',
      getWorkflow: vi.fn().mockResolvedValue({
        id: 'wf-large',
        name: 'Large Workflow',
        description: null,
        createdAt: new Date('2026-04-19T00:00:00Z'),
        updatedAt: new Date('2026-04-19T00:00:00Z'),
        nodes,
        edges: [],
      }),
      getNode: vi.fn(),
      updateNode: vi.fn(),
      executeNode: vi.fn(),
      getRunResult: vi.fn().mockResolvedValue({
        id: 'run-large',
        workflowId: 'wf-large',
        status: 'completed',
        startedAt: new Date('2026-04-19T00:00:00Z'),
        completedAt: new Date('2026-04-19T00:01:00Z'),
        errorMessage: null,
        nodeRuns,
      }),
    } satisfies WorkflowAccessor;

    const tool = new WfGetRunResultTool(accessor);
    const result = await tool.execute({ runId: 'run-large' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      status: 'completed',
    });
    expect((result.data as { nodeTemplateFields: unknown[] }).nodeTemplateFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-1',
          outputVariable: 'node_1_output',
          fields: ['field_1'],
        }),
        expect.objectContaining({
          nodeId: 'node-6',
          outputVariable: 'node_6_output',
          fields: ['field_6'],
        }),
      ])
    );
    expect((result.data as { nodeTemplateFields: unknown[] }).nodeTemplateFields).toHaveLength(6);
  });
});

describe('WfExecuteTool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sanitizes successful run details and preserves timestamp dates as ISO strings', async () => {
    const longOutput = 'debug output '.repeat(80);
    const base64Payload = makeBase64(600);
    const startedAt = new Date('2026-04-13T01:02:03.456Z');
    const completedAt = new Date('2026-04-13T01:05:06.789Z');
    const runDetail = {
      ...makeRunDetail({
        id: 'run-789',
        workflowId: 'wf-execute',
        startedAt,
        completedAt,
      }),
      output: longOutput,
      image: `data:image/png;base64,${base64Payload}`,
    } as WorkflowRunDetail & { output: string; image: string };

    vi.mocked(executionEngine.executeWorkflow).mockResolvedValue({
      runId: 'run-789',
      promise: Promise.resolve(runDetail),
    } as Awaited<ReturnType<typeof executionEngine.executeWorkflow>>);

    const registry = createCopilotToolRegistry(
      'wf-execute',
      undefined,
      undefined,
      '/tmp/copilot-run'
    );
    const result = await registry.execute('wf_execute', {});

    expect(result.success).toBe(true);
    expectRunResultSanitized(
      (result.data as { run: unknown }).run,
      longOutput,
      base64Payload,
      'image/png'
    );
    expect((result.data as { run: unknown }).run).toMatchObject({
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    });
    expect(result.data).toMatchObject({ status: 'completed' });
  });
});

describe('WfExecuteNodeTool', () => {
  it('sanitizes fetched run results before returning them', async () => {
    const longOutput = 'debug output '.repeat(80);
    const base64Payload = makeBase64(600);
    const accessor = {
      workflowId: 'wf-exec-node',
      getWorkflow: vi.fn(),
      getNode: vi.fn(),
      updateNode: vi.fn(),
      executeNode: vi.fn().mockResolvedValue({ runId: 'run-456' }),
      getRunResult: vi.fn().mockResolvedValue({
        output: longOutput,
        image: `data:image/png;base64,${base64Payload}`,
      }),
    };

    const tool = new WfExecuteNodeTool(accessor);
    const result = await tool.execute({ nodeId: 'node-exec' });

    expect(result.success).toBe(true);
    expectRunResultSanitized(
      (result.data as { output: unknown }).output,
      longOutput,
      base64Payload,
      'image/png'
    );
  });

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
      status: 'completed',
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
});

describe('createCopilotToolRegistry', () => {
  it('includes sql and bash tools', () => {
    const registry = createCopilotToolRegistry('wf-test', undefined, undefined, '/tmp/test');
    expect(() => registry.get('sql')).not.toThrow();
    expect(() => registry.get('bash')).not.toThrow();
  });

  it('registers all tools listed in COPILOT_TOOL_NAMES', () => {
    const registry = createCopilotToolRegistry('wf-test', undefined, undefined, '/tmp/test');
    for (const name of COPILOT_TOOL_NAMES) {
      expect(() => registry.get(name)).not.toThrow(`tool "${name}" not registered`);
    }
  });
});
