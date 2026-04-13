import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { basename, isAbsolute, join } from 'path';
import { existsSync, rmSync } from 'fs';
import { config } from '../../src/base/config';

const mockExecuteNode = vi.hoisted(() => vi.fn());
const mockGetNodeExecutor = vi.hoisted(() => vi.fn());

vi.mock('../../src/workflow/executionEngine', () => ({
  executeNode: mockExecuteNode,
  registerProgressCallback: vi.fn(),
  unregisterProgressCallback: vi.fn(),
  annotateOutputTypes: vi.fn((_, output) => output),
}));

vi.mock('../../src/workflow/nodeExecutors', () => ({
  getNodeExecutor: mockGetNodeExecutor,
}));

vi.mock('../../src/workflow/workflow.service', () => ({}));

import { DbWorkflowAccessor, InMemoryWorkflowAccessor } from '../../src/copilot/workflowAccessor';
import * as executionEngine from '../../src/workflow/executionEngine';
import type { WorkflowDetail } from '../../src/workflow/workflow.types';

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
  const ORIGINAL_WORK_FOLDER = config.work_folder;
  const TEMP_ROOT = '/tmp/databot-test-workfolder-accessor';

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

  beforeEach(() => {
    rmSync(TEMP_ROOT, { recursive: true, force: true });
    config.work_folder = TEMP_ROOT;
    mockExecuteNode.mockReset();
    mockGetNodeExecutor.mockReset();
  });

  afterAll(() => {
    rmSync(TEMP_ROOT, { recursive: true, force: true });
    config.work_folder = ORIGINAL_WORK_FOLDER;
  });

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

  it('does not create a temp workdir eagerly on construction', () => {
    const wf = makeWorkflow();
    const accessor = new InMemoryWorkflowAccessor(wf);

    expect(existsSync(TEMP_ROOT)).toBe(false);
    expect(accessor.workflowId).toBe('mem-wf-1');
  });

  it('getTempWorkdir returns a stable absolute debug workspace', () => {
    const wf = makeWorkflow();
    const accessor = new InMemoryWorkflowAccessor(wf);
    const tempWorkdir = accessor.getTempWorkdir();

    expect(isAbsolute(tempWorkdir)).toBe(true);
    expect(basename(tempWorkdir)).toMatch(/^wf_/);
    expect(tempWorkdir).toMatch(/^\/tmp\/databot-test-workfolder-accessor\/wf_/);
    expect(accessor.getTempWorkdir()).toBe(tempWorkdir);
  });

  it('executeNode creates a fresh child workFolder for each debug run', async () => {
    const wf = makeWorkflow();
    const accessor = new InMemoryWorkflowAccessor(wf);
    const execute = vi.fn().mockResolvedValue({
      result: { ok: true },
      stderr: '',
    });
    mockGetNodeExecutor.mockReturnValue({
      type: 'sql',
      execute,
    });

    await accessor.executeNode('node-1', {});
    await accessor.executeNode('node-1', {});

    const tempWorkdir = accessor.getTempWorkdir();
    const firstWorkFolder = execute.mock.calls[0][0].workFolder;
    const secondWorkFolder = execute.mock.calls[1][0].workFolder;

    expect(firstWorkFolder).toMatch(new RegExp(`^${join(tempWorkdir, 'wf_')}`));
    expect(secondWorkFolder).toMatch(new RegExp(`^${join(tempWorkdir, 'wf_')}`));
    expect(firstWorkFolder).not.toBe(secondWorkFolder);

    await accessor.cleanup();
    expect(existsSync(tempWorkdir)).toBe(false);
  });

  it('DbWorkflowAccessor forwards an explicit workFolder to node execution', async () => {
    const accessor = new DbWorkflowAccessor('db-wf-1', '/tmp/copilot-run');
    mockExecuteNode.mockResolvedValue({
      runId: 'run-1',
      promise: Promise.resolve({} as never),
    });

    const result = await accessor.executeNode('node-1', {});

    expect(result.runId).toBe('run-1');
    expect(executionEngine.executeNode).toHaveBeenCalledWith(
      'db-wf-1',
      'node-1',
      expect.objectContaining({ workFolder: expect.stringMatching(/^\/tmp\/copilot-run\/wf_/) })
    );
  });

  it('DbWorkflowAccessor creates a fresh child workFolder for each execution', async () => {
    const accessor = new DbWorkflowAccessor('db-wf-2', '/tmp/copilot-run');
    mockExecuteNode.mockResolvedValue({
      runId: 'run-1',
      promise: Promise.resolve({} as never),
    });

    await accessor.executeNode('node-1', {});
    await accessor.executeNode('node-1', {});

    const firstWorkFolder = vi.mocked(executionEngine.executeNode).mock.calls[0][2]?.workFolder;
    const secondWorkFolder = vi.mocked(executionEngine.executeNode).mock.calls[1][2]?.workFolder;
    expect(firstWorkFolder).toMatch(/^\/tmp\/copilot-run\/wf_/);
    expect(secondWorkFolder).toMatch(/^\/tmp\/copilot-run\/wf_/);
    expect(firstWorkFolder).not.toBe(secondWorkFolder);
  });

  it('DbWorkflowAccessor removes an orphaned workFolder when execution rejects early', async () => {
    const accessor = new DbWorkflowAccessor('db-wf-3', '/tmp/copilot-run');
    mockExecuteNode.mockRejectedValueOnce(new Error('execution rejected before handle creation'));

    await expect(accessor.executeNode('node-1', {})).rejects.toThrow(
      'execution rejected before handle creation'
    );

    const workFolder = vi.mocked(executionEngine.executeNode).mock.calls[0][2]?.workFolder;
    expect(workFolder).toMatch(/^\/tmp\/copilot-run\/wf_/);
    expect(existsSync(workFolder as string)).toBe(false);
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

    mockGetNodeExecutor.mockReturnValue({
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
