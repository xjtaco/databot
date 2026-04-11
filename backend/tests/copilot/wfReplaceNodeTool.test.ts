// backend/tests/copilot/wfReplaceNodeTool.test.ts
import { describe, it, expect } from 'vitest';
import { WfReplaceNodeTool, buildDefaultConfig } from '../../src/copilot/copilotTools';
import { InMemoryWorkflowAccessor } from '../../src/copilot/workflowAccessor';
import type { WorkflowDetail, NodeConfig } from '../../src/workflow/workflow.types';

interface ReplaceResultData {
  id: string;
  name: string;
  type: string;
  config: NodeConfig & Record<string, unknown>;
}

function makeWorkflow(nodeType: 'sql' | 'python' = 'sql'): WorkflowDetail {
  const config =
    nodeType === 'sql'
      ? {
          nodeType: 'sql' as const,
          datasourceId: 'ds1',
          params: {},
          sql: 'SELECT 1',
          outputVariable: 'result',
        }
      : {
          nodeType: 'python' as const,
          params: {},
          script: 'result = {}',
          outputVariable: 'result',
        };

  return {
    id: 'wf-1',
    name: 'Test Workflow',
    description: null,
    nodes: [
      {
        id: 'node-1',
        workflowId: 'wf-1',
        name: 'test_node',
        description: null,
        type: nodeType,
        config,
        positionX: 100,
        positionY: 200,
      },
    ],
    edges: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('WfReplaceNodeTool', () => {
  it('should have correct name and description', () => {
    const accessor = new InMemoryWorkflowAccessor(makeWorkflow());
    const tool = new WfReplaceNodeTool(accessor);
    expect(tool.name).toBe('wf_replace_node');
    expect(tool.description).toContain('Replace a node');
  });

  it('should replace sql node with python type', async () => {
    const accessor = new InMemoryWorkflowAccessor(makeWorkflow('sql'));
    const tool = new WfReplaceNodeTool(accessor);

    const result = await tool.execute({ nodeId: 'node-1', type: 'python' });
    const data = result.data as ReplaceResultData;

    expect(result.success).toBe(true);
    expect(data).toBeDefined();
    expect(data.type).toBe('python');
    expect(data.config.nodeType).toBe('python');
    expect(data.config.script).toBeDefined();
    expect(data.id).toBe('node-1');
    expect(data.name).toBe('test_node');
  });

  it('should replace python node with sql type', async () => {
    const accessor = new InMemoryWorkflowAccessor(makeWorkflow('python'));
    const tool = new WfReplaceNodeTool(accessor);

    const result = await tool.execute({ nodeId: 'node-1', type: 'sql' });
    const data = result.data as ReplaceResultData;

    expect(result.success).toBe(true);
    expect(data.type).toBe('sql');
    expect(data.config.nodeType).toBe('sql');
    expect(data.config.sql).toBeDefined();
  });

  it('should merge config overrides with new type defaults', async () => {
    const accessor = new InMemoryWorkflowAccessor(makeWorkflow('sql'));
    const tool = new WfReplaceNodeTool(accessor);

    const result = await tool.execute({
      nodeId: 'node-1',
      type: 'python',
      config: { outputVariable: 'custom_output' },
    });
    const data = result.data as ReplaceResultData;

    expect(result.success).toBe(true);
    expect(data.config.outputVariable).toBe('custom_output');
    expect(data.config.nodeType).toBe('python');
  });

  it('should force correct nodeType even if configOverride tries to set it', async () => {
    const accessor = new InMemoryWorkflowAccessor(makeWorkflow('sql'));
    const tool = new WfReplaceNodeTool(accessor);

    const result = await tool.execute({
      nodeId: 'node-1',
      type: 'python',
      config: { nodeType: 'sql' },
    });
    const data = result.data as ReplaceResultData;

    expect(result.success).toBe(true);
    expect(data.type).toBe('python');
    expect(data.config.nodeType).toBe('python');
  });

  it('should reject replacing with the same type', async () => {
    const accessor = new InMemoryWorkflowAccessor(makeWorkflow('sql'));
    const tool = new WfReplaceNodeTool(accessor);

    const result = await tool.execute({ nodeId: 'node-1', type: 'sql' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('already of type');
  });

  it('should return error for non-existent node', async () => {
    const accessor = new InMemoryWorkflowAccessor(makeWorkflow());
    const tool = new WfReplaceNodeTool(accessor);

    const result = await tool.execute({ nodeId: 'nonexistent', type: 'python' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should return error when nodeId is missing', async () => {
    const accessor = new InMemoryWorkflowAccessor(makeWorkflow());
    const tool = new WfReplaceNodeTool(accessor);

    const result = await tool.execute({ type: 'python' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('nodeId is required');
  });

  it('should persist type change in accessor', async () => {
    const accessor = new InMemoryWorkflowAccessor(makeWorkflow('sql'));
    const tool = new WfReplaceNodeTool(accessor);

    await tool.execute({ nodeId: 'node-1', type: 'python' });

    const node = await accessor.getNode('node-1');
    expect(node.type).toBe('python');
    expect(node.config.nodeType).toBe('python');
  });
});

describe('buildDefaultConfig', () => {
  it('should return sql config for sql type', () => {
    const config = buildDefaultConfig('sql');
    expect(config.nodeType).toBe('sql');
    expect('sql' in config).toBe(true);
  });

  it('should return python config for python type', () => {
    const config = buildDefaultConfig('python');
    expect(config.nodeType).toBe('python');
    expect('script' in config).toBe(true);
  });

  it('should return llm config for llm type', () => {
    const config = buildDefaultConfig('llm');
    expect(config.nodeType).toBe('llm');
    expect('prompt' in config).toBe(true);
  });

  it('should return email config for email type', () => {
    const config = buildDefaultConfig('email');
    expect(config.nodeType).toBe('email');
    expect('to' in config).toBe(true);
  });

  it('should return branch config for branch type', () => {
    const config = buildDefaultConfig('branch');
    expect(config.nodeType).toBe('branch');
    expect('field' in config).toBe(true);
  });

  it('should return web_search config for web_search type', () => {
    const config = buildDefaultConfig('web_search');
    expect(config.nodeType).toBe('web_search');
    expect('keywords' in config).toBe(true);
  });
});
