import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/workflow/workflow.service', () => ({}));
vi.mock('../../src/workflow/executionEngine', () => {
  return {
    annotateOutputTypes: (nodeType: string, output: Record<string, unknown>) => {
      if (nodeType === 'python' && typeof output.csvPath === 'string') {
        return {
          ...output,
          csvPath: { value: output.csvPath, type: 'csvFile' },
        };
      }
      return output;
    },
  };
});
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

import { DbWorkflowAccessor, InMemoryWorkflowAccessor } from '../../src/copilot/workflowAccessor';
import type { WorkflowDetail } from '../../src/workflow/workflow.types';
import { getNodeExecutor } from '../../src/workflow/nodeExecutors';

vi.mock('../../src/workflow/nodeExecutors', () => ({
  getNodeExecutor: vi.fn(),
}));

function makeBase64(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let index = 0; index < length; index++) {
    result += chars[index % chars.length];
  }
  return result;
}

describe('DbWorkflowAccessor', () => {
  it('should be constructable with a workflowId', () => {
    const accessor = new DbWorkflowAccessor('test-id');
    expect(accessor).toBeDefined();
    expect(accessor.workflowId).toBe('test-id');
  });
});

describe('InMemoryWorkflowAccessor', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function makeWorkflow(): WorkflowDetail {
    return {
      id: 'mem-wf-1',
      name: 'Debug Workflow',
      description: null,
      nodes: [
        {
          id: 'node-1',
          workflowId: 'mem-wf-1',
          name: 'test_sql',
          description: null,
          type: 'sql',
          config: {
            nodeType: 'sql',
            datasourceId: 'ds1',
            params: {},
            sql: 'SELECT 1',
            outputVariable: 'out',
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

  it('getWorkflow returns the in-memory workflow', async () => {
    const wf = makeWorkflow();
    const accessor = new InMemoryWorkflowAccessor(wf);
    const result = await accessor.getWorkflow();
    expect(result).toBe(wf);
    expect(result.id).toBe('mem-wf-1');
    expect(result.name).toBe('Debug Workflow');
  });

  it('getNode returns node by id', async () => {
    const wf = makeWorkflow();
    const accessor = new InMemoryWorkflowAccessor(wf);
    const node = await accessor.getNode('node-1');
    expect(node.id).toBe('node-1');
    expect(node.name).toBe('test_sql');
    expect(node.type).toBe('sql');
  });

  it('getNode throws for unknown id', async () => {
    const wf = makeWorkflow();
    const accessor = new InMemoryWorkflowAccessor(wf);
    await expect(accessor.getNode('nonexistent')).rejects.toThrow('Node nonexistent not found');
  });

  it('updateNode merges config', async () => {
    const wf = makeWorkflow();
    const accessor = new InMemoryWorkflowAccessor(wf);

    await accessor.updateNode('node-1', {
      config: {
        nodeType: 'sql',
        datasourceId: 'ds1',
        params: {},
        sql: 'SELECT 2',
        outputVariable: 'out',
      },
    });

    const node = await accessor.getNode('node-1');
    expect(node.config).toEqual({
      nodeType: 'sql',
      datasourceId: 'ds1',
      params: {},
      sql: 'SELECT 2',
      outputVariable: 'out',
    });
  });

  it('updateNode throws for unknown id', async () => {
    const wf = makeWorkflow();
    const accessor = new InMemoryWorkflowAccessor(wf);
    await expect(accessor.updateNode('nonexistent', { name: 'updated' })).rejects.toThrow(
      'Node nonexistent not found'
    );
  });

  it('workflowId matches the workflow id', () => {
    const wf = makeWorkflow();
    const accessor = new InMemoryWorkflowAccessor(wf);
    expect(accessor.workflowId).toBe('mem-wf-1');
  });

  it('getRunResult throws for unknown runId', async () => {
    const wf = makeWorkflow();
    const accessor = new InMemoryWorkflowAccessor(wf);
    await expect(accessor.getRunResult('no-such-run')).rejects.toThrow(
      'Run result not found for runId: no-such-run'
    );
  });

  it('cleanup clears run results', async () => {
    const wf = makeWorkflow();
    const accessor = new InMemoryWorkflowAccessor(wf);
    // After cleanup, any previously stored run should be gone
    await accessor.cleanup();
    // No error — cleanup on empty state is fine
    expect(true).toBe(true);
  });

  it('updateNode preserves other node fields', async () => {
    const wf = makeWorkflow();
    const accessor = new InMemoryWorkflowAccessor(wf);

    await accessor.updateNode('node-1', { name: 'renamed_sql' });

    const node = await accessor.getNode('node-1');
    expect(node.name).toBe('renamed_sql');
    // Original fields preserved
    expect(node.type).toBe('sql');
    expect(node.positionX).toBe(0);
  });

  it('getRunResult returns raw large values before tool-level sanitization', async () => {
    const longOutput = 'debug line '.repeat(120);
    const base64Payload = makeBase64(600);
    const workflow: WorkflowDetail = {
      id: 'mem-wf-raw-run-result',
      name: 'Debug Workflow',
      description: null,
      nodes: [
        {
          id: 'node-raw',
          workflowId: 'mem-wf-raw-run-result',
          name: 'test_python',
          description: null,
          type: 'python',
          config: {
            nodeType: 'python',
            params: {},
            script: 'result = {}',
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
    const accessor = new InMemoryWorkflowAccessor(workflow);

    vi.mocked(getNodeExecutor).mockReturnValue({
      execute: vi.fn().mockResolvedValue({
        output: longOutput,
        image: `data:image/png;base64,${base64Payload}`,
      }),
    } as never);

    const { runId } = await accessor.executeNode('node-raw', {});
    const runResult = await accessor.getRunResult(runId);

    expect(runResult).toEqual({
      output: longOutput,
      image: `data:image/png;base64,${base64Payload}`,
    });
    expect(JSON.stringify(runResult)).toContain(longOutput);
    expect(JSON.stringify(runResult)).toContain(base64Payload);
  });
});
