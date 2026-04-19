import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
}));

// Mock config
vi.mock('../../src/base/config', () => ({
  config: {
    work_folder: '/tmp/test-work',
  },
}));

// Mock dagValidator
const mockTopologicalSort = vi.fn();
const mockGetUpstreamNodes = vi.fn();
const mockGetDownstreamNodes = vi.fn();

vi.mock('../../src/workflow/dagValidator', () => ({
  topologicalSort: (
    nodes: Array<{ id: string }>,
    edges: Array<{ sourceNodeId: string; targetNodeId: string }>
  ) => mockTopologicalSort(nodes, edges),
  getUpstreamNodes: (
    nodeId: string,
    nodes: Array<{ id: string }>,
    edges: Array<{ sourceNodeId: string; targetNodeId: string }>
  ) => mockGetUpstreamNodes(nodeId, nodes, edges),
  getDownstreamNodes: (
    nodeId: string,
    nodes: Array<{ id: string }>,
    edges: Array<{ sourceNodeId: string; targetNodeId: string }>
  ) => mockGetDownstreamNodes(nodeId, nodes, edges),
}));

// Mock templateResolver
const mockResolveTemplate = vi.fn((s: string, _outputs: Map<string, Record<string, unknown>>) => s);

import type { ParamDefinition } from '../../src/workflow/workflow.types';

function normalizeToParamDefinitions(
  p: Record<string, string | ParamDefinition>
): Record<string, ParamDefinition> {
  const result: Record<string, ParamDefinition> = {};
  for (const [k, v] of Object.entries(p)) {
    result[k] = typeof v === 'string' ? { value: v, type: 'text' as const } : v;
  }
  return result;
}

const mockResolveParamsTemplates = vi.fn(
  (p: Record<string, string | ParamDefinition>, _outputs: Map<string, Record<string, unknown>>) =>
    normalizeToParamDefinitions(p)
);

vi.mock('../../src/workflow/templateResolver', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/workflow/templateResolver')>();
  return {
    resolveTemplate: (s: string, outputs: Map<string, Record<string, unknown>>) =>
      mockResolveTemplate(s, outputs),
    resolveParamsTemplates: (
      p: Record<string, string | ParamDefinition>,
      outputs: Map<string, Record<string, unknown>>
    ) => mockResolveParamsTemplates(p, outputs),
    findUnresolvedTemplates: original.findUnresolvedTemplates,
    flattenResultField: original.flattenResultField,
  };
});

// Mock nodeExecutors
const mockExecute = vi.fn();
const mockGetNodeExecutor = vi.fn();

vi.mock('../../src/workflow/nodeExecutors', () => ({
  getNodeExecutor: (...args: unknown[]) => mockGetNodeExecutor(...args),
}));

// Mock repository
const mockFindWorkflowById = vi.fn();
const mockFindRunById = vi.fn();
const mockCreateRun = vi.fn();
const mockCreateNodeRunsBatch = vi.fn();
const mockUpdateNodeRun = vi.fn();
const mockUpdateRunStatus = vi.fn();
const mockGetRunWorkFolder = vi.fn();
const mockFindLatestSuccessfulNodeRunOutput = vi.fn();

vi.mock('../../src/workflow/workflow.repository', () => ({
  findWorkflowById: (...args: unknown[]) => mockFindWorkflowById(...args),
  findRunById: (...args: unknown[]) => mockFindRunById(...args),
  createRun: (...args: unknown[]) => mockCreateRun(...args),
  createNodeRunsBatch: (...args: unknown[]) => mockCreateNodeRunsBatch(...args),
  updateNodeRun: (...args: unknown[]) => mockUpdateNodeRun(...args),
  updateRunStatus: (...args: unknown[]) => mockUpdateRunStatus(...args),
  getRunWorkFolder: (...args: unknown[]) => mockGetRunWorkFolder(...args),
  findLatestSuccessfulNodeRunOutput: (...args: unknown[]) =>
    mockFindLatestSuccessfulNodeRunOutput(...args),
}));

// Mock crypto - must be done carefully since generateShortId uses randomBytes
vi.mock('crypto', () => ({
  randomBytes: vi.fn((size: number) => {
    // Return a deterministic buffer for testing
    const buf = Buffer.alloc(size);
    for (let i = 0; i < size; i++) {
      buf[i] = (i + 0xab) & 0xff;
    }
    return buf;
  }),
}));

import {
  executeWorkflow,
  executeNode,
  retryFromFailed,
  registerProgressCallback,
  unregisterProgressCallback,
  clearActiveExecutions,
} from '../../src/workflow/executionEngine';
import { WorkflowExecutionError, WorkflowNotFoundError } from '../../src/errors/types';
import type {
  WorkflowDetail,
  WorkflowNodeInfo,
  WorkflowRunDetail,
  SqlNodeConfig,
  PythonNodeConfig,
  LlmNodeConfig,
  WsWorkflowEvent,
} from '../../src/workflow/workflow.types';

const now = new Date('2026-03-22T00:00:00Z');

// Use a monotonic counter to generate unique workflow IDs per test, avoiding
// cross-test pollution of the module-level activeExecutions Set.
let wfIdCounter = 0;
function uniqueWfId(): string {
  return `wf-${++wfIdCounter}`;
}

function makeSqlConfig(overrides: Partial<SqlNodeConfig> = {}): SqlNodeConfig {
  return {
    nodeType: 'sql',
    datasourceId: 'ds-1',
    params: {},
    sql: 'SELECT 1',
    outputVariable: 'sql_result',
    ...overrides,
  };
}

function makePythonConfig(overrides: Partial<PythonNodeConfig> = {}): PythonNodeConfig {
  return {
    nodeType: 'python',
    params: {},
    script: 'print("hi")',
    outputVariable: 'py_result',
    ...overrides,
  };
}

function makeLlmConfig(overrides: Partial<LlmNodeConfig> = {}): LlmNodeConfig {
  return {
    nodeType: 'llm',
    params: {},
    prompt: 'Summarize',
    outputVariable: 'llm_result',
    ...overrides,
  };
}

function makeNode(overrides: Partial<WorkflowNodeInfo> = {}): WorkflowNodeInfo {
  return {
    id: 'node-1',
    workflowId: 'wf-1',
    name: 'Query',
    description: null,
    type: 'sql',
    config: makeSqlConfig(),
    positionX: 0,
    positionY: 0,
    ...overrides,
  };
}

function makeWorkflow(overrides: Partial<WorkflowDetail> = {}): WorkflowDetail {
  return {
    id: 'wf-1',
    name: 'Test Workflow',
    description: null,
    nodes: [makeNode()],
    edges: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeRunDetail(overrides: Partial<WorkflowRunDetail> = {}): WorkflowRunDetail {
  return {
    id: 'run-1',
    workflowId: 'wf-1',
    status: 'completed',
    startedAt: now,
    completedAt: now,
    errorMessage: null,
    nodeRuns: [],
    ...overrides,
  };
}

/** Set up default repository mocks for a successful single-node execution. */
function setupSuccessfulExecution(workflow: WorkflowDetail, runId = 'run-1'): void {
  mockFindWorkflowById.mockResolvedValue(workflow);
  mockTopologicalSort.mockReturnValue(workflow.nodes.map((n) => n.id));
  mockCreateRun.mockResolvedValue({
    id: runId,
    workflowId: workflow.id,
    status: 'running',
    startedAt: now,
    completedAt: null,
    errorMessage: null,
  });

  let nodeRunCounter = 0;
  mockCreateNodeRunsBatch.mockImplementation((_runId: string, nodeIds: string[]) =>
    nodeIds.map((nodeId) => ({
      id: `nr-${++nodeRunCounter}`,
      runId: _runId,
      nodeId,
      status: 'pending',
      inputs: null,
      outputs: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    }))
  );

  mockUpdateNodeRun.mockResolvedValue(undefined);
  mockUpdateRunStatus.mockResolvedValue(undefined);
  mockGetNodeExecutor.mockReturnValue({ type: 'sql', execute: mockExecute });
  mockExecute.mockResolvedValue({
    csvPath: '/tmp/out.csv',
    totalRows: 5,
    columns: ['id', 'name'],
    previewData: [{ id: 1, name: 'test' }],
  });
  mockFindRunById.mockResolvedValue(makeRunDetail({ workflowId: workflow.id }));
}

describe('executionEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearActiveExecutions();
    // Restore default implementations for template mocks
    mockResolveTemplate.mockImplementation((s: string) => s);
    mockResolveParamsTemplates.mockImplementation((p: Record<string, string | ParamDefinition>) =>
      normalizeToParamDefinitions(p)
    );
  });

  // ── generateShortId (via crypto.randomBytes) ──────────
  describe('generateShortId (internal, via crypto)', () => {
    it('should produce a hex string used in work folder name', async () => {
      const wfId = uniqueWfId();
      const workflow = makeWorkflow({ id: wfId, nodes: [makeNode({ workflowId: wfId })] });
      setupSuccessfulExecution(workflow);

      const handle = await executeWorkflow(wfId);
      await handle.promise;

      // The createRun call receives workFolder; verify its format
      const createRunCall = mockCreateRun.mock.calls[0] as [string, string, string];
      const workFolder = createRunCall[2];
      // workFolder = /tmp/test-work/wf_<12-char hex>
      expect(workFolder).toMatch(/^\/tmp\/test-work\/wf_[0-9a-f]{12}$/);
    });
  });

  // ── Concurrent execution guard ────────────────────────
  describe('concurrent execution guard', () => {
    it('should throw WorkflowExecutionError when workflow is already executing', async () => {
      // Use a unique workflowId to avoid polluting other tests
      const wfId = uniqueWfId();
      const workflow = makeWorkflow({ id: wfId, nodes: [makeNode({ workflowId: wfId })] });
      mockFindWorkflowById.mockResolvedValue(workflow);
      mockTopologicalSort.mockReturnValue(['node-1']);
      mockCreateRun.mockResolvedValue({
        id: 'run-conc',
        workflowId: wfId,
        status: 'running',
        startedAt: now,
        completedAt: null,
        errorMessage: null,
      });
      mockCreateNodeRunsBatch.mockImplementation((_runId: string, nodeIds: string[]) =>
        nodeIds.map((nodeId) => ({
          id: `nr-conc-${nodeId}`,
          runId: _runId,
          nodeId,
          status: 'pending',
          inputs: null,
          outputs: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        }))
      );

      // Make execute hang so the first call stays "active", but resolvable
      let resolveExec: ((value: Record<string, unknown>) => void) | undefined;
      const hangingExec = new Promise<Record<string, unknown>>((resolve) => {
        resolveExec = resolve;
      });
      mockGetNodeExecutor.mockReturnValue({
        type: 'sql',
        execute: () => hangingExec,
      });
      mockUpdateNodeRun.mockResolvedValue(undefined);
      mockUpdateRunStatus.mockResolvedValue(undefined);
      mockFindRunById.mockResolvedValue(makeRunDetail({ workflowId: wfId }));

      // Start first execution (will hang on the node executor)
      const firstHandlePromise = executeWorkflow(wfId);

      // Give the first execution a moment to register in activeExecutions
      // (executeWorkflow awaits createRun before adding to activeExecutions)
      await new Promise((r) => setTimeout(r, 10));

      // Second call should reject immediately
      await expect(executeWorkflow(wfId)).rejects.toThrow(WorkflowExecutionError);
      await expect(executeWorkflow(wfId)).rejects.toThrow('Workflow is already executing');

      // Clean up: resolve the hanging execution so the lock is released
      resolveExec!({
        csvPath: '/tmp/out.csv',
        totalRows: 1,
        columns: ['id'],
        previewData: [{ id: 1 }],
      });
      const firstHandle = await firstHandlePromise;
      await firstHandle.promise;
    });

    it('should release lock after execution completes', async () => {
      const wfId = uniqueWfId();
      const workflow = makeWorkflow({ id: wfId, nodes: [makeNode({ workflowId: wfId })] });

      setupSuccessfulExecution(workflow);
      const firstHandle = await executeWorkflow(wfId);
      await firstHandle.promise;

      // Second execution should succeed because lock was released
      setupSuccessfulExecution(workflow);
      const secondHandle = await executeWorkflow(wfId);
      await expect(secondHandle.promise).resolves.toBeDefined();
    });

    it('should release lock even after execution fails', async () => {
      const wfId = uniqueWfId();
      const workflow = makeWorkflow({ id: wfId, nodes: [makeNode({ workflowId: wfId })] });

      setupSuccessfulExecution(workflow);
      mockExecute.mockRejectedValue(new Error('SQL error'));

      const firstHandle = await executeWorkflow(wfId);
      await firstHandle.promise;

      // Lock should be released; re-setup for success
      setupSuccessfulExecution(workflow);
      const secondHandle = await executeWorkflow(wfId);
      await expect(secondHandle.promise).resolves.toBeDefined();
    });
  });

  // ── executeWorkflow ───────────────────────────────────
  describe('executeWorkflow', () => {
    it('should throw WorkflowNotFoundError for missing workflow', async () => {
      mockFindWorkflowById.mockResolvedValue(null);

      await expect(executeWorkflow('non-existent-id')).rejects.toThrow(WorkflowNotFoundError);
    });

    it('should execute a single-node workflow successfully', async () => {
      const wfId = uniqueWfId();
      const workflow = makeWorkflow({ id: wfId, nodes: [makeNode({ workflowId: wfId })] });
      const runId = `run-${wfId}`;
      setupSuccessfulExecution(workflow, runId);

      const handle = await executeWorkflow(wfId);
      expect(handle.runId).toBeDefined();
      const result = await handle.promise;

      expect(mockCreateRun).toHaveBeenCalledWith(wfId, 'running', expect.stringMatching(/wf_/));
      expect(mockCreateNodeRunsBatch).toHaveBeenCalledWith(runId, ['node-1'], 'pending');
      expect(mockUpdateNodeRun).toHaveBeenCalledWith(
        'nr-1',
        expect.objectContaining({
          status: 'running',
        })
      );
      expect(mockGetNodeExecutor).toHaveBeenCalledWith('sql');
      expect(result).toBeDefined();
    });

    it('should pass params as virtual namespace in nodeOutputs', async () => {
      const wfId = uniqueWfId();
      const workflow = makeWorkflow({ id: wfId, nodes: [makeNode({ workflowId: wfId })] });
      setupSuccessfulExecution(workflow);

      const handle = await executeWorkflow(wfId, { startDate: '2026-01-01' });
      await handle.promise;

      // The executor should have been called (params are stored in nodeOutputs)
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should mark run as completed on success', async () => {
      const wfId = uniqueWfId();
      const runId = `run-${wfId}`;
      const workflow = makeWorkflow({ id: wfId, nodes: [makeNode({ workflowId: wfId })] });
      setupSuccessfulExecution(workflow, runId);

      const handle = await executeWorkflow(wfId);
      await handle.promise;

      expect(mockUpdateRunStatus).toHaveBeenCalledWith(runId, 'completed', undefined);
    });

    it('should mark run as failed when a node fails', async () => {
      const wfId = uniqueWfId();
      const runId = `run-${wfId}`;
      const workflow = makeWorkflow({ id: wfId, nodes: [makeNode({ workflowId: wfId })] });
      setupSuccessfulExecution(workflow, runId);
      mockExecute.mockRejectedValue(new Error('Query timeout'));

      const handle = await executeWorkflow(wfId);
      await handle.promise;

      expect(mockUpdateNodeRun).toHaveBeenCalledWith(
        'nr-1',
        expect.objectContaining({
          status: 'failed',
          errorMessage: 'Query timeout',
        })
      );
      expect(mockUpdateRunStatus).toHaveBeenCalledWith(runId, 'failed', 'One or more nodes failed');
    });

    it('should skip downstream nodes after a failure', async () => {
      const wfId = uniqueWfId();
      const nodeA = makeNode({ id: 'node-a', name: 'A', workflowId: wfId });
      const nodeB = makeNode({ id: 'node-b', name: 'B', workflowId: wfId });
      const workflow = makeWorkflow({
        id: wfId,
        nodes: [nodeA, nodeB],
        edges: [
          {
            id: 'e1',
            workflowId: wfId,
            sourceNodeId: 'node-a',
            targetNodeId: 'node-b',
          },
        ],
      });

      mockFindWorkflowById.mockResolvedValue(workflow);
      mockTopologicalSort.mockReturnValue(['node-a', 'node-b']);
      mockCreateRun.mockResolvedValue({
        id: 'run-skip',
        workflowId: wfId,
        status: 'running',
        startedAt: now,
        completedAt: null,
        errorMessage: null,
      });

      let nodeRunCounter = 0;
      mockCreateNodeRunsBatch.mockImplementation((_runId: string, nodeIds: string[]) =>
        nodeIds.map((nodeId) => ({
          id: `nr-${++nodeRunCounter}`,
          runId: _runId,
          nodeId,
          status: 'pending',
          inputs: null,
          outputs: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        }))
      );
      mockUpdateNodeRun.mockResolvedValue(undefined);
      mockUpdateRunStatus.mockResolvedValue(undefined);
      mockGetNodeExecutor.mockReturnValue({ type: 'sql', execute: mockExecute });
      mockExecute.mockRejectedValue(new Error('node-a failed'));
      mockFindRunById.mockResolvedValue(makeRunDetail({ status: 'failed', workflowId: wfId }));

      const handle = await executeWorkflow(wfId);
      await handle.promise;

      // node-b should be skipped
      const updateCalls = mockUpdateNodeRun.mock.calls as Array<[string, Record<string, unknown>]>;
      const skippedCall = updateCalls.find(([, data]) => data.status === 'skipped');
      expect(skippedCall).toBeDefined();
      expect(skippedCall?.[0]).toBe('nr-2'); // node-b's nodeRunId
    });
  });

  // ── Skipped nodes use node_skipped event type ─────────
  describe('skipped node progress events', () => {
    it('should emit node_skipped event type for skipped downstream nodes', async () => {
      const wfId = uniqueWfId();
      const runId = 'run-skip-evt';
      const nodeA = makeNode({ id: 'node-a', name: 'NodeA', workflowId: wfId });
      const nodeB = makeNode({ id: 'node-b', name: 'NodeB', workflowId: wfId });
      const workflow = makeWorkflow({
        id: wfId,
        nodes: [nodeA, nodeB],
        edges: [
          {
            id: 'e1',
            workflowId: wfId,
            sourceNodeId: 'node-a',
            targetNodeId: 'node-b',
          },
        ],
      });

      mockFindWorkflowById.mockResolvedValue(workflow);
      mockTopologicalSort.mockReturnValue(['node-a', 'node-b']);
      mockCreateRun.mockResolvedValue({
        id: runId,
        workflowId: wfId,
        status: 'running',
        startedAt: now,
        completedAt: null,
        errorMessage: null,
      });

      let nodeRunCounter = 0;
      mockCreateNodeRunsBatch.mockImplementation((_runId: string, nodeIds: string[]) =>
        nodeIds.map((nodeId) => ({
          id: `nr-${++nodeRunCounter}`,
          runId: _runId,
          nodeId,
          status: 'pending',
          inputs: null,
          outputs: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        }))
      );
      mockUpdateNodeRun.mockResolvedValue(undefined);
      mockUpdateRunStatus.mockResolvedValue(undefined);
      mockGetNodeExecutor.mockReturnValue({ type: 'sql', execute: mockExecute });
      mockExecute.mockRejectedValue(new Error('boom'));
      mockFindRunById.mockResolvedValue(makeRunDetail({ status: 'failed', workflowId: wfId }));

      const events: WsWorkflowEvent[] = [];
      registerProgressCallback(runId, (event) => {
        events.push(event);
      });

      try {
        const handle = await executeWorkflow(wfId);
        await handle.promise;
      } finally {
        unregisterProgressCallback(runId);
      }

      const skippedEvents = events.filter((e) => e.type === 'node_skipped');
      expect(skippedEvents).toHaveLength(1);
      expect(skippedEvents[0]).toEqual({
        type: 'node_skipped',
        runId,
        nodeId: 'node-b',
        nodeName: 'NodeB',
      });
    });
  });

  // ── executeNode ───────────────────────────────────────
  describe('executeNode', () => {
    it('should throw WorkflowNotFoundError for missing workflow', async () => {
      mockFindWorkflowById.mockResolvedValue(null);

      await expect(executeNode('non-existent-id', 'node-1')).rejects.toThrow(WorkflowNotFoundError);
    });

    it('should call getUpstreamNodes to find subgraph', async () => {
      const wfId = uniqueWfId();
      const workflow = makeWorkflow({ id: wfId, nodes: [makeNode({ workflowId: wfId })] });
      mockFindWorkflowById.mockResolvedValue(workflow);
      mockGetUpstreamNodes.mockReturnValue(['node-1']);
      mockCreateRun.mockResolvedValue({
        id: 'run-en',
        workflowId: wfId,
        status: 'running',
        startedAt: now,
        completedAt: null,
        errorMessage: null,
      });
      mockCreateNodeRunsBatch.mockImplementation((_runId: string, nodeIds: string[]) =>
        nodeIds.map((nodeId) => ({
          id: `nr-en-${nodeId}`,
          runId: _runId,
          nodeId,
          status: 'pending',
          inputs: null,
          outputs: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        }))
      );
      mockUpdateNodeRun.mockResolvedValue(undefined);
      mockUpdateRunStatus.mockResolvedValue(undefined);
      mockGetNodeExecutor.mockReturnValue({ type: 'sql', execute: mockExecute });
      mockExecute.mockResolvedValue({
        csvPath: '/tmp/out.csv',
        totalRows: 1,
        columns: ['id'],
        previewData: [{ id: 1 }],
      });
      mockFindRunById.mockResolvedValue(makeRunDetail({ workflowId: wfId }));

      const handle = await executeNode(wfId, 'node-1');
      await handle.promise;

      expect(mockGetUpstreamNodes).toHaveBeenCalledWith('node-1', [{ id: 'node-1' }], []);
    });
  });

  // ── retryFromFailed ───────────────────────────────────
  describe('retryFromFailed', () => {
    it('should throw WorkflowNotFoundError for missing workflow', async () => {
      mockFindWorkflowById.mockResolvedValue(null);

      await expect(retryFromFailed('non-existent-id', 'run-1')).rejects.toThrow(
        WorkflowNotFoundError
      );
    });

    it('should throw WorkflowNotFoundError for missing run', async () => {
      const wfId = uniqueWfId();
      mockFindWorkflowById.mockResolvedValue(makeWorkflow({ id: wfId }));
      mockFindRunById.mockResolvedValue(null);

      await expect(retryFromFailed(wfId, 'missing')).rejects.toThrow(WorkflowNotFoundError);
    });

    it('should throw WorkflowNotFoundError when run workflowId does not match', async () => {
      const wfId = uniqueWfId();
      mockFindWorkflowById.mockResolvedValue(makeWorkflow({ id: wfId }));
      mockFindRunById.mockResolvedValue(makeRunDetail({ workflowId: 'wf-other' }));

      await expect(retryFromFailed(wfId, 'run-1')).rejects.toThrow(WorkflowNotFoundError);
    });

    it('should throw WorkflowExecutionError when run is not failed', async () => {
      const wfId = uniqueWfId();
      mockFindWorkflowById.mockResolvedValue(makeWorkflow({ id: wfId }));
      mockFindRunById.mockResolvedValue(makeRunDetail({ status: 'completed', workflowId: wfId }));

      await expect(retryFromFailed(wfId, 'run-1')).rejects.toThrow(WorkflowExecutionError);
      await expect(retryFromFailed(wfId, 'run-1')).rejects.toThrow('Can only retry failed runs');
    });

    it('should throw WorkflowExecutionError when no failed node found in run', async () => {
      const wfId = uniqueWfId();
      mockFindWorkflowById.mockResolvedValue(
        makeWorkflow({ id: wfId, nodes: [makeNode({ workflowId: wfId })] })
      );
      mockFindRunById.mockResolvedValue(
        makeRunDetail({
          status: 'failed',
          workflowId: wfId,
          nodeRuns: [
            {
              id: 'nr-1',
              runId: 'run-1',
              nodeId: 'node-1',
              status: 'completed',
              inputs: null,
              outputs: null,
              errorMessage: null,
              startedAt: now,
              completedAt: now,
            },
          ],
        })
      );

      await expect(retryFromFailed(wfId, 'run-1')).rejects.toThrow(WorkflowExecutionError);
      await expect(retryFromFailed(wfId, 'run-1')).rejects.toThrow('No failed node found in run');
    });

    it('should restore completed node outputs keyed by outputVariable', async () => {
      const wfId = uniqueWfId();
      const nodeA = makeNode({
        id: 'node-a',
        name: 'QueryNode',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'query_data' }),
      });
      const nodeB = makeNode({
        id: 'node-b',
        name: 'ProcessNode',
        workflowId: wfId,
        type: 'python',
        config: makePythonConfig({ outputVariable: 'processed' }),
      });

      const workflow = makeWorkflow({
        id: wfId,
        nodes: [nodeA, nodeB],
        edges: [
          {
            id: 'e1',
            workflowId: wfId,
            sourceNodeId: 'node-a',
            targetNodeId: 'node-b',
          },
        ],
      });

      const completedOutputs = { csvPath: '/tmp/data.csv', totalRows: 10 };

      // First findRunById call is for the existing failed run
      mockFindWorkflowById.mockResolvedValue(workflow);
      mockFindRunById
        .mockResolvedValueOnce(
          makeRunDetail({
            status: 'failed',
            workflowId: wfId,
            nodeRuns: [
              {
                id: 'nr-1',
                runId: 'run-1',
                nodeId: 'node-a',
                status: 'completed',
                inputs: null,
                outputs: completedOutputs,
                errorMessage: null,
                startedAt: now,
                completedAt: now,
              },
              {
                id: 'nr-2',
                runId: 'run-1',
                nodeId: 'node-b',
                status: 'failed',
                inputs: null,
                outputs: null,
                errorMessage: 'Script crashed',
                startedAt: now,
                completedAt: now,
              },
            ],
          })
        )
        // Second findRunById call is after re-execution to return the result
        .mockResolvedValueOnce(makeRunDetail({ status: 'completed', workflowId: wfId }));

      mockGetRunWorkFolder.mockResolvedValue('/tmp/existing-work');
      mockGetDownstreamNodes.mockReturnValue(['node-b']);
      mockCreateRun.mockResolvedValue({
        id: 'run-retry',
        workflowId: wfId,
        status: 'running',
        startedAt: now,
        completedAt: null,
        errorMessage: null,
      });
      mockCreateNodeRunsBatch.mockImplementation((_runId: string, nodeIds: string[]) =>
        nodeIds.map((nodeId) => ({
          id: `nr-new-${nodeId}`,
          runId: _runId,
          nodeId,
          status: 'pending',
          inputs: null,
          outputs: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        }))
      );
      mockUpdateNodeRun.mockResolvedValue(undefined);
      mockUpdateRunStatus.mockResolvedValue(undefined);
      mockGetNodeExecutor.mockReturnValue({
        type: 'python',
        execute: mockExecute,
      });
      mockExecute.mockResolvedValue({
        result: { processed: true },
        stderr: '',
      });

      const handle = await retryFromFailed(wfId, 'run-1');
      const result = await handle.promise;

      expect(result).toBeDefined();
      // Verify that getRunWorkFolder was called to reuse existing folder
      expect(mockGetRunWorkFolder).toHaveBeenCalledWith('run-1');
    });

    it('should throw WorkflowExecutionError when work folder is not found for retry', async () => {
      const wfId = uniqueWfId();
      const workflow = makeWorkflow({
        id: wfId,
        nodes: [makeNode({ workflowId: wfId })],
      });
      mockFindWorkflowById.mockResolvedValue(workflow);
      mockFindRunById.mockResolvedValue(
        makeRunDetail({
          status: 'failed',
          workflowId: wfId,
          nodeRuns: [
            {
              id: 'nr-1',
              runId: 'run-1',
              nodeId: 'node-1',
              status: 'failed',
              inputs: null,
              outputs: null,
              errorMessage: 'error',
              startedAt: now,
              completedAt: now,
            },
          ],
        })
      );
      mockGetDownstreamNodes.mockReturnValue(['node-1']);
      mockGetRunWorkFolder.mockResolvedValue(null);

      await expect(retryFromFailed(wfId, 'run-1')).rejects.toThrow(WorkflowExecutionError);
      await expect(retryFromFailed(wfId, 'run-1')).rejects.toThrow(
        'Failed to find work folder for retry'
      );
    });
  });

  // ── resolveNodeConfig ─────────────────────────────────
  describe('resolveNodeConfig (via executeWorkflow)', () => {
    it('should resolve SQL node config template', async () => {
      const wfId = uniqueWfId();
      const workflow = makeWorkflow({
        id: wfId,
        nodes: [
          makeNode({
            id: 'node-1',
            name: 'SQLQuery',
            workflowId: wfId,
            type: 'sql',
            config: makeSqlConfig({ sql: 'SELECT * FROM {{params.table}}' }),
          }),
        ],
      });
      setupSuccessfulExecution(workflow);

      // Override resolveTemplate to verify it's called with the SQL template
      mockResolveTemplate.mockImplementation((s: string) => {
        if (s === 'SELECT * FROM {{params.table}}') {
          return 'SELECT * FROM users';
        }
        return s;
      });

      const handle = await executeWorkflow(wfId, { table: 'users' });
      await handle.promise;

      expect(mockResolveTemplate).toHaveBeenCalledWith(
        'SELECT * FROM {{params.table}}',
        expect.anything()
      );
    });

    it('should resolve SQL node config params templates', async () => {
      const wfId = uniqueWfId();
      const workflow = makeWorkflow({
        id: wfId,
        nodes: [
          makeNode({
            id: 'node-1',
            name: 'SQLQuery',
            workflowId: wfId,
            type: 'sql',
            config: makeSqlConfig({
              sql: 'SELECT * FROM {{params.table}}',
              params: { filter: '{{params.filter_value}}' },
            }),
          }),
        ],
      });
      setupSuccessfulExecution(workflow);

      const handle = await executeWorkflow(wfId, { table: 'users', filter_value: 'active' });
      await handle.promise;

      // Both resolveTemplate (for sql) and resolveParamsTemplates (for params) should be called
      expect(mockResolveTemplate).toHaveBeenCalled();
      expect(mockResolveParamsTemplates).toHaveBeenCalled();
    });

    it('should resolve Python node config templates', async () => {
      const wfId = uniqueWfId();
      const workflow = makeWorkflow({
        id: wfId,
        nodes: [
          makeNode({
            id: 'node-1',
            name: 'PyScript',
            workflowId: wfId,
            type: 'python',
            config: makePythonConfig({
              script: 'process({{params.input}})',
              params: { key: '{{params.value}}' },
            }),
          }),
        ],
      });
      setupSuccessfulExecution(workflow);

      const handle = await executeWorkflow(wfId, { input: 'data', value: '42' });
      await handle.promise;

      // Both resolveTemplate (for script) and resolveParamsTemplates (for params) should be called
      expect(mockResolveTemplate).toHaveBeenCalled();
      expect(mockResolveParamsTemplates).toHaveBeenCalled();
    });

    it('should resolve LLM node config templates', async () => {
      const wfId = uniqueWfId();
      const workflow = makeWorkflow({
        id: wfId,
        nodes: [
          makeNode({
            id: 'node-1',
            name: 'LLMNode',
            workflowId: wfId,
            type: 'llm',
            config: makeLlmConfig({
              prompt: 'Analyze: {{params.topic}}',
              params: { context: '{{params.ctx}}' },
            }),
          }),
        ],
      });
      setupSuccessfulExecution(workflow);

      const handle = await executeWorkflow(wfId, { topic: 'sales', ctx: 'Q1' });
      await handle.promise;

      expect(mockResolveTemplate).toHaveBeenCalled();
      expect(mockResolveParamsTemplates).toHaveBeenCalled();
    });

    it('should pass through unknown node type config without resolution', async () => {
      // This tests the default branch of resolveNodeConfig.
      // We simulate by constructing a config with an unrecognized nodeType.
      const wfId = uniqueWfId();
      const customConfig = {
        nodeType: 'custom_unknown' as 'sql',
        datasourceId: 'ds-1',
        params: {},
        sql: 'SELECT 1',
        outputVariable: 'result',
      };

      const workflow = makeWorkflow({
        id: wfId,
        nodes: [
          makeNode({
            id: 'node-1',
            name: 'CustomNode',
            workflowId: wfId,
            config: customConfig,
          }),
        ],
      });
      setupSuccessfulExecution(workflow);
      // Clear any mock calls from setup
      mockResolveTemplate.mockClear();

      const handle = await executeWorkflow(wfId);
      await handle.promise;

      // For an unknown nodeType, resolveTemplate should not be called
      // (the default case just returns config as-is)
      expect(mockResolveTemplate).not.toHaveBeenCalled();
    });
  });

  // ── Progress callbacks ────────────────────────────────
  describe('progress callbacks', () => {
    it('should send node_start and node_complete events on success', async () => {
      const wfId = uniqueWfId();
      const runId = `run-prog-${wfId}`;
      const workflow = makeWorkflow({
        id: wfId,
        nodes: [makeNode({ workflowId: wfId })],
      });
      setupSuccessfulExecution(workflow, runId);

      const events: WsWorkflowEvent[] = [];
      registerProgressCallback(runId, (event) => {
        events.push(event);
      });

      try {
        const handle = await executeWorkflow(wfId);
        await handle.promise;
      } finally {
        unregisterProgressCallback(runId);
      }

      const startEvents = events.filter((e) => e.type === 'node_start');
      const completeEvents = events.filter((e) => e.type === 'node_complete');
      const runCompleteEvents = events.filter((e) => e.type === 'run_complete');

      expect(startEvents).toHaveLength(1);
      expect(startEvents[0]).toEqual({
        type: 'node_start',
        runId,
        nodeId: 'node-1',
        nodeName: 'Query',
      });

      expect(completeEvents).toHaveLength(1);
      expect(runCompleteEvents).toHaveLength(1);
      expect(runCompleteEvents[0]).toEqual({
        type: 'run_complete',
        runId,
        status: 'completed',
      });
    });

    it('should send node_error and failed run_complete events on failure', async () => {
      const wfId = uniqueWfId();
      const runId = `run-err-${wfId}`;
      const workflow = makeWorkflow({
        id: wfId,
        nodes: [makeNode({ workflowId: wfId })],
      });
      setupSuccessfulExecution(workflow, runId);
      mockExecute.mockRejectedValue(new Error('Connection refused'));

      const events: WsWorkflowEvent[] = [];
      registerProgressCallback(runId, (event) => {
        events.push(event);
      });

      try {
        const handle = await executeWorkflow(wfId);
        await handle.promise;
      } finally {
        unregisterProgressCallback(runId);
      }

      const errorEvents = events.filter((e) => e.type === 'node_error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]).toEqual({
        type: 'node_error',
        runId,
        nodeId: 'node-1',
        nodeName: 'Query',
        error: 'Connection refused',
      });

      const runCompleteEvents = events.filter((e) => e.type === 'run_complete');
      expect(runCompleteEvents[0]).toEqual({
        type: 'run_complete',
        runId,
        status: 'failed',
      });
    });

    it('should not throw if progress callback itself throws', async () => {
      const wfId = uniqueWfId();
      const runId = `run-cberr-${wfId}`;
      const workflow = makeWorkflow({
        id: wfId,
        nodes: [makeNode({ workflowId: wfId })],
      });
      setupSuccessfulExecution(workflow, runId);

      registerProgressCallback(runId, () => {
        throw new Error('callback error');
      });

      try {
        // Should not throw despite callback errors
        const handle = await executeWorkflow(wfId);
        await expect(handle.promise).resolves.toBeDefined();
      } finally {
        unregisterProgressCallback(runId);
      }
    });
  });

  // ── Output storage and outputVariable keying ──────────
  describe('output storage', () => {
    it('should store outputs under both node name and outputVariable', async () => {
      const wfId = uniqueWfId();
      const nodeA = makeNode({
        id: 'node-a',
        name: 'QueryData',
        workflowId: wfId,
        type: 'sql',
        config: makeSqlConfig({ outputVariable: 'data_output' }),
      });
      const nodeB = makeNode({
        id: 'node-b',
        name: 'Process',
        workflowId: wfId,
        type: 'python',
        config: makePythonConfig({
          script: 'use {{data_output.csvPath}}',
          params: {},
        }),
      });

      const workflow = makeWorkflow({
        id: wfId,
        nodes: [nodeA, nodeB],
        edges: [
          {
            id: 'e1',
            workflowId: wfId,
            sourceNodeId: 'node-a',
            targetNodeId: 'node-b',
          },
        ],
      });

      const runId = `run-output-${wfId}`;
      mockFindWorkflowById.mockResolvedValue(workflow);
      mockTopologicalSort.mockReturnValue(['node-a', 'node-b']);
      mockCreateRun.mockResolvedValue({
        id: runId,
        workflowId: wfId,
        status: 'running',
        startedAt: now,
        completedAt: null,
        errorMessage: null,
      });

      let nodeRunCounter = 0;
      mockCreateNodeRunsBatch.mockImplementation((_runId: string, nodeIds: string[]) =>
        nodeIds.map((nodeId) => ({
          id: `nr-${++nodeRunCounter}`,
          runId: _runId,
          nodeId,
          status: 'pending',
          inputs: null,
          outputs: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        }))
      );
      mockUpdateNodeRun.mockResolvedValue(undefined);
      mockUpdateRunStatus.mockResolvedValue(undefined);

      const sqlOutput = {
        csvPath: '/tmp/data.csv',
        totalRows: 100,
        columns: ['id'],
        previewData: [{ id: 1 }],
      };

      mockGetNodeExecutor.mockReturnValue({
        type: 'sql',
        execute: mockExecute,
      });
      mockExecute
        .mockResolvedValueOnce(sqlOutput)
        .mockResolvedValueOnce({ result: {}, stderr: '' });
      mockFindRunById.mockResolvedValue(makeRunDetail({ workflowId: wfId }));

      // Capture what nodeOutputs map is passed to resolveTemplate on 2nd call
      const capturedOutputMaps: Array<Map<string, Record<string, unknown>>> = [];
      mockResolveTemplate.mockImplementation(
        (s: string, outputs: Map<string, Record<string, unknown>>) => {
          capturedOutputMaps.push(new Map(outputs));
          // Return resolved string so validateResolvedConfig does not reject it
          return s.replace(/\{\{[^}]+\}\}/g, '/tmp/data.csv');
        }
      );

      const handle = await executeWorkflow(wfId);
      await handle.promise;

      // When processing node-b, the outputs map should have entries
      // for both "QueryData" (node name) and "data_output" (outputVariable)
      expect(capturedOutputMaps.length).toBeGreaterThanOrEqual(1);
      const lastMap = capturedOutputMaps[capturedOutputMaps.length - 1];
      expect(lastMap.has('QueryData')).toBe(true);
      expect(lastMap.has('data_output')).toBe(true);
      // csvPath is annotated as TypedOutputValue after annotateOutputTypes
      const annotatedSqlOutput = {
        ...sqlOutput,
        csvPath: { value: sqlOutput.csvPath, type: 'csvFile' },
      };
      expect(lastMap.get('QueryData')).toEqual(annotatedSqlOutput);
      expect(lastMap.get('data_output')).toEqual(annotatedSqlOutput);
    });
  });

  // ── Unresolved template validation ──────────
  describe('unresolved template validation', () => {
    it('should fail node when resolved config still contains template variables', async () => {
      const wfId = uniqueWfId();
      const nodeA = makeNode({
        id: 'node-a',
        name: 'Reporter',
        workflowId: wfId,
        type: 'python',
        config: makePythonConfig({
          script: 'open("{{upstream.result.chart_path}}")',
          params: {},
        }),
      });

      const workflow = makeWorkflow({ id: wfId, nodes: [nodeA], edges: [] });
      const runId = `run-unresolved-${wfId}`;
      mockFindWorkflowById.mockResolvedValue(workflow);
      mockTopologicalSort.mockReturnValue(['node-a']);
      mockCreateRun.mockResolvedValue({
        id: runId,
        workflowId: wfId,
        status: 'running',
        startedAt: now,
        completedAt: null,
        errorMessage: null,
      });

      let nodeRunCounter = 0;
      mockCreateNodeRunsBatch.mockImplementation((_runId: string, nodeIds: string[]) =>
        nodeIds.map((nodeId) => ({
          id: `nr-${++nodeRunCounter}`,
          runId: _runId,
          nodeId,
          status: 'pending',
          inputs: null,
          outputs: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        }))
      );
      mockUpdateNodeRun.mockResolvedValue(undefined);
      mockUpdateRunStatus.mockResolvedValue(undefined);
      mockGetNodeExecutor.mockReturnValue({ type: 'python', execute: mockExecute });

      // resolveTemplate returns string as-is, leaving {{...}} unresolved
      mockResolveTemplate.mockImplementation((s: string) => s);
      mockFindRunById.mockResolvedValue(makeRunDetail({ status: 'failed', workflowId: wfId }));

      const handle = await executeWorkflow(wfId);
      await handle.promise;

      // The node should be marked as failed with a clear error about unresolved templates
      const updateCalls = mockUpdateNodeRun.mock.calls as Array<[string, Record<string, unknown>]>;
      const failedCall = updateCalls.find(([, data]) => data.status === 'failed');
      expect(failedCall).toBeDefined();
      expect(failedCall?.[1].errorMessage).toContain('unresolved template variables');
      expect(failedCall?.[1].errorMessage).toContain('upstream.result.chart_path');

      // Executor should NOT have been called (validation prevents execution)
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('appends raw-output diagnostics when an upstream output has raw_output', async () => {
      const wfId = uniqueWfId();
      const nodeA = makeNode({
        id: 'node-a',
        name: 'Ecommerce Monthly',
        workflowId: wfId,
        type: 'python',
        config: makePythonConfig({
          outputVariable: 'ecommerce_monthly',
        }),
      });
      const nodeB = makeNode({
        id: 'node-b',
        name: 'Reporter',
        workflowId: wfId,
        type: 'llm',
        config: makeLlmConfig({
          prompt: 'Summarize {{ecommerce_monthly.months}}',
          outputVariable: 'report',
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
      const runId = `run-unresolved-raw-${wfId}`;
      mockFindWorkflowById.mockResolvedValue(workflow);
      mockCreateRun.mockResolvedValue({
        id: runId,
        workflowId: wfId,
        status: 'running',
        startedAt: now,
        completedAt: null,
        errorMessage: null,
      });

      let nodeRunCounter = 0;
      mockCreateNodeRunsBatch.mockImplementation((_runId: string, nodeIds: string[]) =>
        nodeIds.map((nodeId) => ({
          id: `nr-${++nodeRunCounter}`,
          runId: _runId,
          nodeId,
          status: 'pending',
          inputs: null,
          outputs: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        }))
      );
      mockUpdateNodeRun.mockResolvedValue(undefined);
      mockUpdateRunStatus.mockResolvedValue(undefined);
      mockGetUpstreamNodes.mockReturnValue(['node-a', 'node-b']);
      mockFindLatestSuccessfulNodeRunOutput.mockResolvedValue({
        csvPath: '/tmp/ecommerce-monthly.csv',
        stderr: '',
        raw_output: '{"months":["2026-01"]}',
      });
      mockGetNodeExecutor.mockReturnValue({ type: 'llm', execute: mockExecute });
      mockFindRunById.mockResolvedValue(makeRunDetail({ workflowId: wfId }));

      // Keep the unresolved placeholder in place so validation fails.
      mockResolveTemplate.mockImplementation((s: string) => s);

      const handle = await executeNode(wfId, 'node-b', { cascade: false });
      await handle.promise;

      const updateCalls = mockUpdateNodeRun.mock.calls as Array<[string, Record<string, unknown>]>;
      const failedCall = updateCalls.find(([, data]) => data.status === 'failed');
      expect(failedCall).toBeDefined();
      expect(failedCall?.[1].errorMessage).toContain('unresolved template variables');
      expect(failedCall?.[1].errorMessage).toContain('ecommerce_monthly.months');
      expect(failedCall?.[1].errorMessage).toContain('Raw-output upstream nodes need fixes');
      expect(failedCall?.[1].errorMessage).toContain('ecommerce_monthly: needsUpstreamFix: true');
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  // ── executeNode: non-cascade, cascade, and mockInputs modes ──
  describe('executeNode execution modes', () => {
    function makeTwoNodeWorkflow(wfId: string) {
      const nodeA = makeNode({
        id: 'node-a',
        name: 'QueryNode',
        workflowId: wfId,
        type: 'sql',
        config: makeSqlConfig({ outputVariable: 'query_data' }),
      });
      const nodeB = makeNode({
        id: 'node-b',
        name: 'ProcessNode',
        workflowId: wfId,
        type: 'python',
        config: makePythonConfig({ outputVariable: 'processed' }),
      });
      return makeWorkflow({
        id: wfId,
        nodes: [nodeA, nodeB],
        edges: [
          {
            id: 'e1',
            workflowId: wfId,
            sourceNodeId: 'node-a',
            targetNodeId: 'node-b',
          },
        ],
      });
    }

    function setupBaseExecution(workflow: WorkflowDetail, runId: string): void {
      mockFindWorkflowById.mockResolvedValue(workflow);
      mockCreateRun.mockResolvedValue({
        id: runId,
        workflowId: workflow.id,
        status: 'running',
        startedAt: now,
        completedAt: null,
        errorMessage: null,
      });

      let nodeRunCounter = 0;
      mockCreateNodeRunsBatch.mockImplementation((_runId: string, nodeIds: string[]) =>
        nodeIds.map((nodeId) => ({
          id: `nr-${++nodeRunCounter}`,
          runId: _runId,
          nodeId,
          status: 'pending',
          inputs: null,
          outputs: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        }))
      );
      mockUpdateNodeRun.mockResolvedValue(undefined);
      mockUpdateRunStatus.mockResolvedValue(undefined);
      mockFindRunById.mockResolvedValue(makeRunDetail({ workflowId: workflow.id }));
    }

    it('non-cascade uses historical outputs and runs only target node', async () => {
      const wfId = uniqueWfId();
      const workflow = makeTwoNodeWorkflow(wfId);
      const runId = `run-nc-${wfId}`;

      setupBaseExecution(workflow, runId);
      mockGetUpstreamNodes.mockReturnValue(['node-a', 'node-b']);

      // Historical output for nodeA
      const historicalOutput = {
        csvPath: '/tmp/historical.csv',
        totalRows: 42,
        columns: ['id'],
        previewData: [{ id: 1 }],
      };
      mockFindLatestSuccessfulNodeRunOutput.mockResolvedValue(historicalOutput);

      const pythonExecute = vi.fn().mockResolvedValue({ result: { done: true }, stderr: '' });
      mockGetNodeExecutor.mockReturnValue({ type: 'python', execute: pythonExecute });

      const handle = await executeNode(wfId, 'node-b', { cascade: false });
      await handle.promise;

      // Should have queried historical output for upstream node
      expect(mockFindLatestSuccessfulNodeRunOutput).toHaveBeenCalledWith('node-a');

      // Only nodeB should have been executed (createNodeRunsBatch called with ['node-b'])
      expect(mockCreateNodeRunsBatch).toHaveBeenCalledWith(runId, ['node-b'], 'pending');

      // Executor should have been called exactly once (for nodeB)
      expect(pythonExecute).toHaveBeenCalledTimes(1);
    });

    it('non-cascade flattens historical Python result fields before template resolution', async () => {
      const wfId = uniqueWfId();
      const nodeA = makeNode({
        id: 'node-a',
        name: 'SummaryNode',
        workflowId: wfId,
        type: 'python',
        config: makePythonConfig({ outputVariable: 'summary_data' }),
      });
      const nodeB = makeNode({
        id: 'node-b',
        name: 'ReportNode',
        workflowId: wfId,
        type: 'llm',
        config: makeLlmConfig({
          outputVariable: 'report',
          prompt: 'Summarize {{summary_data.summary_text}} from {{summary_data.csvPath}}',
        }),
      });
      const workflow = makeWorkflow({
        id: wfId,
        nodes: [nodeA, nodeB],
        edges: [
          {
            id: 'e1',
            workflowId: wfId,
            sourceNodeId: 'node-a',
            targetNodeId: 'node-b',
          },
        ],
      });
      const runId = `run-nc-flat-${wfId}`;

      setupBaseExecution(workflow, runId);
      mockGetUpstreamNodes.mockReturnValue(['node-a', 'node-b']);
      mockFindLatestSuccessfulNodeRunOutput.mockResolvedValue({
        result: {
          csvPath: '/tmp/from-result.csv',
          summary_text: 'sales up',
        },
        csvPath: undefined,
        stderr: '',
      });

      const capturedOutputMaps: Array<Map<string, Record<string, unknown>>> = [];
      mockResolveTemplate.mockImplementation(
        (s: string, outputs: Map<string, Record<string, unknown>>) => {
          capturedOutputMaps.push(new Map(outputs));
          return s.replace(/\{\{summary_data\.summary_text\}\}/g, 'sales up').replace(
            /\{\{summary_data\.csvPath\}\}/g,
            '/tmp/from-result.csv'
          );
        }
      );

      const llmExecute = vi.fn().mockResolvedValue({
        result: { ok: true },
        rawResponse: '{"ok":true}',
      });
      mockGetNodeExecutor.mockReturnValue({ type: 'llm', execute: llmExecute });

      const handle = await executeNode(wfId, 'node-b', { cascade: false });
      await handle.promise;

      expect(llmExecute).toHaveBeenCalledTimes(1);
      const lastMap = capturedOutputMaps[capturedOutputMaps.length - 1];
      expect(lastMap.get('summary_data')).toMatchObject({
        csvPath: '/tmp/from-result.csv',
        summary_text: 'sales up',
        stderr: '',
      });
      expect(lastMap.get('SummaryNode')).toMatchObject({
        csvPath: '/tmp/from-result.csv',
        summary_text: 'sales up',
        stderr: '',
      });
    });

    it('non-cascade throws WorkflowExecutionError on missing historical output', async () => {
      const wfId = uniqueWfId();
      const runId = `run-noncas-fail-${wfId}`;
      const workflow = makeTwoNodeWorkflow(wfId);

      mockFindWorkflowById.mockResolvedValue(workflow);
      mockCreateRun.mockResolvedValue({
        id: runId,
        workflowId: wfId,
        status: 'running',
        startedAt: now,
        completedAt: null,
        errorMessage: null,
      });
      mockUpdateRunStatus.mockResolvedValue(undefined);
      mockGetUpstreamNodes.mockReturnValue(['node-a', 'node-b']);

      // No historical output available
      mockFindLatestSuccessfulNodeRunOutput.mockResolvedValue(null);

      await expect(executeNode(wfId, 'node-b', { cascade: false })).rejects.toThrow(
        WorkflowExecutionError
      );
      await expect(executeNode(wfId, 'node-b', { cascade: false })).rejects.toThrow(
        /No historical output found for upstream node 'QueryNode'/
      );

      // Verify the run was marked as failed before throwing
      expect(mockUpdateRunStatus).toHaveBeenCalledWith(
        runId,
        'failed',
        "No historical output for 'QueryNode'"
      );
    });

    it('cascade=true runs all upstream nodes including target', async () => {
      const wfId = uniqueWfId();
      const workflow = makeTwoNodeWorkflow(wfId);
      const runId = `run-cas-${wfId}`;

      setupBaseExecution(workflow, runId);
      mockGetUpstreamNodes.mockReturnValue(['node-a', 'node-b']);

      const executeFn = vi.fn();
      executeFn
        .mockResolvedValueOnce({
          csvPath: '/tmp/out.csv',
          totalRows: 5,
          columns: ['id'],
          previewData: [{ id: 1 }],
        })
        .mockResolvedValueOnce({ result: { done: true }, stderr: '' });
      mockGetNodeExecutor.mockReturnValue({ type: 'sql', execute: executeFn });

      const handle = await executeNode(wfId, 'node-b', { cascade: true });
      await handle.promise;

      // Both nodes should have been scheduled
      expect(mockCreateNodeRunsBatch).toHaveBeenCalledWith(runId, ['node-a', 'node-b'], 'pending');

      // Executor called twice (once per node)
      expect(executeFn).toHaveBeenCalledTimes(2);

      // findLatestSuccessfulNodeRunOutput should NOT have been called
      expect(mockFindLatestSuccessfulNodeRunOutput).not.toHaveBeenCalled();
    });

    it('mockInputs skips upstream and runs only target node', async () => {
      const wfId = uniqueWfId();
      const workflow = makeTwoNodeWorkflow(wfId);
      const runId = `run-mock-${wfId}`;

      setupBaseExecution(workflow, runId);

      const pythonExecute = vi.fn().mockResolvedValue({ result: { done: true }, stderr: '' });
      mockGetNodeExecutor.mockReturnValue({ type: 'python', execute: pythonExecute });

      const mockData = { csvPath: '/tmp/mock.csv', totalRows: 10 };
      const handle = await executeNode(wfId, 'node-b', {
        mockInputs: { query_data: mockData },
      });
      await handle.promise;

      // Only nodeB should have been scheduled
      expect(mockCreateNodeRunsBatch).toHaveBeenCalledWith(runId, ['node-b'], 'pending');

      // Executor called exactly once (for nodeB)
      expect(pythonExecute).toHaveBeenCalledTimes(1);

      // Should NOT look up historical outputs or upstream nodes
      expect(mockFindLatestSuccessfulNodeRunOutput).not.toHaveBeenCalled();
      expect(mockGetUpstreamNodes).not.toHaveBeenCalled();
    });

    it('mockInputs takes priority over cascade=true', async () => {
      const wfId = uniqueWfId();
      const workflow = makeTwoNodeWorkflow(wfId);
      const runId = `run-priority-${wfId}`;

      setupBaseExecution(workflow, runId);

      const pythonExecute = vi.fn().mockResolvedValue({ result: { done: true }, stderr: '' });
      mockGetNodeExecutor.mockReturnValue({ type: 'python', execute: pythonExecute });

      const mockData = { csvPath: '/tmp/mock.csv', totalRows: 10 };
      const handle = await executeNode(wfId, 'node-b', {
        mockInputs: { query_data: mockData },
        cascade: true,
      });
      await handle.promise;

      // Only nodeB should have been scheduled (mockInputs wins)
      expect(mockCreateNodeRunsBatch).toHaveBeenCalledWith(runId, ['node-b'], 'pending');

      // Executor called once (nodeB only)
      expect(pythonExecute).toHaveBeenCalledTimes(1);

      // getUpstreamNodes should not have been called (mockInputs wins)
      expect(mockGetUpstreamNodes).not.toHaveBeenCalled();
    });
  });
});
