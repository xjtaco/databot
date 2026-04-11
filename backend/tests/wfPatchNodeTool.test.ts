// backend/tests/wfPatchNodeTool.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/workflow/workflow.repository');
vi.mock('../src/workflow/workflow.service');
vi.mock('../src/workflow/executionEngine');

import * as service from '../src/workflow/workflow.service';
import { createCopilotToolRegistry } from '../src/copilot/copilotTools';
import type { WorkflowDetail } from '../src/workflow/workflow.types';

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
    config: {
      nodeType: 'sql' as const,
      datasourceId: 'ds1',
      params: {},
      sql,
      outputVariable: 'result',
    },
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
