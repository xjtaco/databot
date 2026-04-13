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
  WfExecuteNodeTool,
  WfGetNodeTool,
  WfGetRunResultTool,
  WfSearchCustomNodesTool,
} from '../../src/copilot/copilotTools';
import { InMemoryWorkflowAccessor } from '../../src/copilot/workflowAccessor';
import type { CustomNodeTemplateInfo, WorkflowDetail } from '../../src/workflow/workflow.types';

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
    expectRunResultSanitized(result.data, longOutput, base64Payload, 'image/png');
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

    vi.mocked(executionEngine.executeWorkflow).mockResolvedValue({
      runId: 'run-789',
      promise: Promise.resolve({
        output: longOutput,
        image: `data:image/png;base64,${base64Payload}`,
        startedAt,
        completedAt,
      }),
    } as Awaited<ReturnType<typeof executionEngine.executeWorkflow>>);

    const registry = createCopilotToolRegistry(
      'wf-execute',
      undefined,
      undefined,
      '/tmp/copilot-run'
    );
    const result = await registry.execute('wf_execute', {});

    expect(result.success).toBe(true);
    expectRunResultSanitized(result.data, longOutput, base64Payload, 'image/png');
    expect(result.data).toMatchObject({
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    });
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
    expectRunResultSanitized(result.data, longOutput, base64Payload, 'image/png');
  });
});
