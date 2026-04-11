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
  };
});

// Mock nodeExecutors
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

vi.mock('../../src/workflow/workflow.repository', () => ({
  findWorkflowById: (...args: unknown[]) => mockFindWorkflowById(...args),
  findRunById: (...args: unknown[]) => mockFindRunById(...args),
  createRun: (...args: unknown[]) => mockCreateRun(...args),
  createNodeRunsBatch: (...args: unknown[]) => mockCreateNodeRunsBatch(...args),
  updateNodeRun: (...args: unknown[]) => mockUpdateNodeRun(...args),
  updateRunStatus: (...args: unknown[]) => mockUpdateRunStatus(...args),
  getRunWorkFolder: (...args: unknown[]) => mockGetRunWorkFolder(...args),
}));

// Mock crypto
vi.mock('crypto', () => ({
  randomBytes: vi.fn((size: number) => {
    const buf = Buffer.alloc(size);
    for (let i = 0; i < size; i++) {
      buf[i] = (i + 0xab) & 0xff;
    }
    return buf;
  }),
}));

import {
  executeWorkflow,
  registerProgressCallback,
  unregisterProgressCallback,
  clearActiveExecutions,
} from '../../src/workflow/executionEngine';
import type {
  WorkflowDetail,
  WorkflowNodeInfo,
  WorkflowRunDetail,
  WorkflowEdgeInfo,
  BranchNodeConfig,
  SqlNodeConfig,
  WsWorkflowEvent,
} from '../../src/workflow/workflow.types';

const now = new Date('2026-03-22T00:00:00Z');

let wfIdCounter = 0;
function uniqueWfId(): string {
  return `branch-wf-${++wfIdCounter}`;
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

function makeBranchConfig(overrides: Partial<BranchNodeConfig> = {}): BranchNodeConfig {
  return {
    nodeType: 'branch',
    field: '5',
    outputVariable: 'branch_out',
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

function makeEdge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  overrides: Partial<WorkflowEdgeInfo> = {}
): WorkflowEdgeInfo {
  return {
    id,
    workflowId: 'wf-1',
    sourceNodeId,
    targetNodeId,
    ...overrides,
  };
}

function makeWorkflow(overrides: Partial<WorkflowDetail> = {}): WorkflowDetail {
  return {
    id: 'wf-1',
    name: 'Test Workflow',
    description: null,
    nodes: [],
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

/**
 * Set up base repository mocks for a multi-node execution run.
 * Returns an auto-incrementing nodeRunId mapper.
 */
function setupBaseExecution(workflow: WorkflowDetail, runId: string, nodeOrder: string[]): void {
  mockFindWorkflowById.mockResolvedValue(workflow);
  mockTopologicalSort.mockReturnValue(nodeOrder);
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
  mockFindRunById.mockResolvedValue(makeRunDetail({ workflowId: workflow.id, id: runId }));
}

/**
 * Collect the status argument passed to each updateNodeRun call,
 * keyed by the nodeRunId (first argument).
 * Only captures the LAST status update for each nodeRunId (i.e., the final state).
 */
function collectFinalNodeRunStatuses(
  calls: Array<[string, Record<string, unknown>]>
): Map<string, string> {
  const result = new Map<string, string>();
  for (const [nrId, data] of calls) {
    if (typeof data.status === 'string') {
      result.set(nrId, data.status);
    }
  }
  return result;
}

describe('executionEngine branch skip logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearActiveExecutions();
    mockResolveTemplate.mockImplementation((s: string) => s);
    mockResolveParamsTemplates.mockImplementation((p: Record<string, string | ParamDefinition>) =>
      normalizeToParamDefinitions(p)
    );
  });

  // ── Test 1: Branch true path ─────────────────────────────────────────────
  describe('branch true path', () => {
    it('executes the true-handle downstream and skips the false-handle downstream', async () => {
      const wfId = uniqueWfId();
      const runId = `run-${wfId}`;

      // Graph: branchNode --true--> trueNode
      //        branchNode --false--> falseNode
      const branchNode = makeNode({
        id: 'branch-node',
        name: 'Branch',
        type: 'branch',
        workflowId: wfId,
        config: makeBranchConfig(),
      });
      const trueNode = makeNode({
        id: 'true-node',
        name: 'TrueNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'true_result' }),
      });
      const falseNode = makeNode({
        id: 'false-node',
        name: 'FalseNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'false_result' }),
      });

      const workflow = makeWorkflow({
        id: wfId,
        nodes: [branchNode, trueNode, falseNode],
        edges: [
          makeEdge('e-true', 'branch-node', 'true-node', {
            workflowId: wfId,
            sourceHandle: 'true',
          }),
          makeEdge('e-false', 'branch-node', 'false-node', {
            workflowId: wfId,
            sourceHandle: 'false',
          }),
        ],
      });

      const nodeOrder = ['branch-node', 'true-node', 'false-node'];
      setupBaseExecution(workflow, runId, nodeOrder);

      // branch node returns true, sql nodes return CSV output
      mockGetNodeExecutor.mockImplementation((type: string) => {
        if (type === 'branch') {
          return { type: 'branch', execute: vi.fn().mockResolvedValue({ result: true }) };
        }
        return {
          type: 'sql',
          execute: vi.fn().mockResolvedValue({
            csvPath: '/tmp/out.csv',
            totalRows: 5,
            columns: ['id'],
            previewData: [{ id: 1 }],
          }),
        };
      });

      const handle = await executeWorkflow(wfId);
      await handle.promise;

      // nr-1 = branch-node, nr-2 = true-node, nr-3 = false-node
      const updateCalls = mockUpdateNodeRun.mock.calls as Array<[string, Record<string, unknown>]>;
      const statuses = collectFinalNodeRunStatuses(updateCalls);

      expect(statuses.get('nr-1')).toBe('completed'); // branch node completed
      expect(statuses.get('nr-2')).toBe('completed'); // true-node executed
      expect(statuses.get('nr-3')).toBe('skipped'); // false-node skipped
    });
  });

  // ── Test 2: Branch false path ────────────────────────────────────────────
  describe('branch false path', () => {
    it('executes the false-handle downstream and skips the true-handle downstream', async () => {
      const wfId = uniqueWfId();
      const runId = `run-${wfId}`;

      const branchNode = makeNode({
        id: 'branch-node',
        name: 'Branch',
        type: 'branch',
        workflowId: wfId,
        config: makeBranchConfig(),
      });
      const trueNode = makeNode({
        id: 'true-node',
        name: 'TrueNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'true_result' }),
      });
      const falseNode = makeNode({
        id: 'false-node',
        name: 'FalseNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'false_result' }),
      });

      const workflow = makeWorkflow({
        id: wfId,
        nodes: [branchNode, trueNode, falseNode],
        edges: [
          makeEdge('e-true', 'branch-node', 'true-node', {
            workflowId: wfId,
            sourceHandle: 'true',
          }),
          makeEdge('e-false', 'branch-node', 'false-node', {
            workflowId: wfId,
            sourceHandle: 'false',
          }),
        ],
      });

      const nodeOrder = ['branch-node', 'true-node', 'false-node'];
      setupBaseExecution(workflow, runId, nodeOrder);

      // branch node returns false
      mockGetNodeExecutor.mockImplementation((type: string) => {
        if (type === 'branch') {
          return { type: 'branch', execute: vi.fn().mockResolvedValue({ result: false }) };
        }
        return {
          type: 'sql',
          execute: vi.fn().mockResolvedValue({
            csvPath: '/tmp/out.csv',
            totalRows: 0,
            columns: ['id'],
            previewData: [],
          }),
        };
      });

      const handle = await executeWorkflow(wfId);
      await handle.promise;

      const updateCalls = mockUpdateNodeRun.mock.calls as Array<[string, Record<string, unknown>]>;
      const statuses = collectFinalNodeRunStatuses(updateCalls);

      expect(statuses.get('nr-1')).toBe('completed'); // branch node completed
      expect(statuses.get('nr-2')).toBe('skipped'); // true-node skipped
      expect(statuses.get('nr-3')).toBe('completed'); // false-node executed
    });
  });

  // ── Test 3: Diamond merge ────────────────────────────────────────────────
  describe('diamond merge', () => {
    it('executes merge node when at least one incoming edge is active', async () => {
      const wfId = uniqueWfId();
      const runId = `run-${wfId}`;

      // Graph: branchNode --true--> trueNode ---> mergeNode
      //        branchNode --false--> falseNode ---> mergeNode
      // Branch result = true: trueNode runs, falseNode skipped
      // mergeNode has 2 incoming edges: one active (from trueNode), one from skipped falseNode
      // Since not ALL incoming edges are blocked, mergeNode should still execute
      const branchNode = makeNode({
        id: 'branch-node',
        name: 'Branch',
        type: 'branch',
        workflowId: wfId,
        config: makeBranchConfig(),
      });
      const trueNode = makeNode({
        id: 'true-node',
        name: 'TrueNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'true_result' }),
      });
      const falseNode = makeNode({
        id: 'false-node',
        name: 'FalseNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'false_result' }),
      });
      const mergeNode = makeNode({
        id: 'merge-node',
        name: 'MergeNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'merge_result' }),
      });

      const workflow = makeWorkflow({
        id: wfId,
        nodes: [branchNode, trueNode, falseNode, mergeNode],
        edges: [
          makeEdge('e-true', 'branch-node', 'true-node', {
            workflowId: wfId,
            sourceHandle: 'true',
          }),
          makeEdge('e-false', 'branch-node', 'false-node', {
            workflowId: wfId,
            sourceHandle: 'false',
          }),
          makeEdge('e-true-merge', 'true-node', 'merge-node', { workflowId: wfId }),
          makeEdge('e-false-merge', 'false-node', 'merge-node', { workflowId: wfId }),
        ],
      });

      const nodeOrder = ['branch-node', 'true-node', 'false-node', 'merge-node'];
      setupBaseExecution(workflow, runId, nodeOrder);

      // branch result = true: trueNode runs, falseNode skipped
      mockGetNodeExecutor.mockImplementation((type: string) => {
        if (type === 'branch') {
          return { type: 'branch', execute: vi.fn().mockResolvedValue({ result: true }) };
        }
        return {
          type: 'sql',
          execute: vi.fn().mockResolvedValue({
            csvPath: '/tmp/out.csv',
            totalRows: 5,
            columns: ['id'],
            previewData: [{ id: 1 }],
          }),
        };
      });

      const handle = await executeWorkflow(wfId);
      await handle.promise;

      const updateCalls = mockUpdateNodeRun.mock.calls as Array<[string, Record<string, unknown>]>;
      const statuses = collectFinalNodeRunStatuses(updateCalls);

      expect(statuses.get('nr-1')).toBe('completed'); // branch-node
      expect(statuses.get('nr-2')).toBe('completed'); // true-node runs
      expect(statuses.get('nr-3')).toBe('skipped'); // false-node skipped (false edge blocked)
      // merge-node: has 2 incoming edges, but only e-false-merge is blocked (falseNode was
      // skipped because its only incoming edge e-false was blocked).
      // e-true-merge is NOT blocked (trueNode ran). So merge-node should execute.
      expect(statuses.get('nr-4')).toBe('completed'); // merge-node executes
    });
  });

  // ── Test 4: Single-sided branch (only true branch has downstream) ────────
  describe('single-sided branch', () => {
    it('silently ends false branch when no false-handle downstream exists', async () => {
      const wfId = uniqueWfId();
      const runId = `run-${wfId}`;

      // Graph: branchNode --true--> trueNode
      //        (no false-handle connection)
      // Branch result = false → nothing to block on false side, but true-handle edge is blocked
      const branchNode = makeNode({
        id: 'branch-node',
        name: 'Branch',
        type: 'branch',
        workflowId: wfId,
        config: makeBranchConfig(),
      });
      const trueNode = makeNode({
        id: 'true-node',
        name: 'TrueNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'true_result' }),
      });

      const workflow = makeWorkflow({
        id: wfId,
        nodes: [branchNode, trueNode],
        edges: [
          makeEdge('e-true', 'branch-node', 'true-node', {
            workflowId: wfId,
            sourceHandle: 'true',
          }),
        ],
      });

      const nodeOrder = ['branch-node', 'true-node'];
      setupBaseExecution(workflow, runId, nodeOrder);

      // branch result = false → true-handle edge gets blocked
      mockGetNodeExecutor.mockImplementation((type: string) => {
        if (type === 'branch') {
          return { type: 'branch', execute: vi.fn().mockResolvedValue({ result: false }) };
        }
        return {
          type: 'sql',
          execute: vi.fn().mockResolvedValue({
            csvPath: '/tmp/out.csv',
            totalRows: 0,
            columns: ['id'],
            previewData: [],
          }),
        };
      });

      const handle = await executeWorkflow(wfId);
      await handle.promise;

      const updateCalls = mockUpdateNodeRun.mock.calls as Array<[string, Record<string, unknown>]>;
      const statuses = collectFinalNodeRunStatuses(updateCalls);

      expect(statuses.get('nr-1')).toBe('completed'); // branch-node completed
      expect(statuses.get('nr-2')).toBe('skipped'); // true-node skipped since result=false
      // Run completes successfully (no nodes failed)
      expect(mockUpdateRunStatus).toHaveBeenCalledWith(runId, 'completed', undefined);
    });

    it('executes true branch when result is true with no false-handle downstream', async () => {
      const wfId = uniqueWfId();
      const runId = `run-${wfId}`;

      const branchNode = makeNode({
        id: 'branch-node',
        name: 'Branch',
        type: 'branch',
        workflowId: wfId,
        config: makeBranchConfig(),
      });
      const trueNode = makeNode({
        id: 'true-node',
        name: 'TrueNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'true_result' }),
      });

      const workflow = makeWorkflow({
        id: wfId,
        nodes: [branchNode, trueNode],
        edges: [
          makeEdge('e-true', 'branch-node', 'true-node', {
            workflowId: wfId,
            sourceHandle: 'true',
          }),
        ],
      });

      const nodeOrder = ['branch-node', 'true-node'];
      setupBaseExecution(workflow, runId, nodeOrder);

      // branch result = true → true-handle downstream executes
      mockGetNodeExecutor.mockImplementation((type: string) => {
        if (type === 'branch') {
          return { type: 'branch', execute: vi.fn().mockResolvedValue({ result: true }) };
        }
        return {
          type: 'sql',
          execute: vi.fn().mockResolvedValue({
            csvPath: '/tmp/out.csv',
            totalRows: 3,
            columns: ['id'],
            previewData: [{ id: 1 }],
          }),
        };
      });

      const handle = await executeWorkflow(wfId);
      await handle.promise;

      const updateCalls = mockUpdateNodeRun.mock.calls as Array<[string, Record<string, unknown>]>;
      const statuses = collectFinalNodeRunStatuses(updateCalls);

      expect(statuses.get('nr-1')).toBe('completed'); // branch-node completed
      expect(statuses.get('nr-2')).toBe('completed'); // true-node executed
      expect(mockUpdateRunStatus).toHaveBeenCalledWith(runId, 'completed', undefined);
    });
  });

  // ── Test 5: Nested branches ──────────────────────────────────────────────
  describe('nested branches', () => {
    it('correctly skips doubly-nested false branches', async () => {
      const wfId = uniqueWfId();
      const runId = `run-${wfId}`;

      // Graph:
      //   outerBranch --true--> innerBranch --true--> deepNode
      //                         innerBranch --false--> shallowNode
      //   outerBranch --false--> sideNode
      //
      // outer = true, inner = true:
      //   deepNode should run, shallowNode skipped, sideNode skipped
      const outerBranch = makeNode({
        id: 'outer-branch',
        name: 'OuterBranch',
        type: 'branch',
        workflowId: wfId,
        config: makeBranchConfig({ outputVariable: 'outer_out' }),
      });
      const innerBranch = makeNode({
        id: 'inner-branch',
        name: 'InnerBranch',
        type: 'branch',
        workflowId: wfId,
        config: makeBranchConfig({ outputVariable: 'inner_out' }),
      });
      const deepNode = makeNode({
        id: 'deep-node',
        name: 'DeepNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'deep_result' }),
      });
      const shallowNode = makeNode({
        id: 'shallow-node',
        name: 'ShallowNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'shallow_result' }),
      });
      const sideNode = makeNode({
        id: 'side-node',
        name: 'SideNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'side_result' }),
      });

      const workflow = makeWorkflow({
        id: wfId,
        nodes: [outerBranch, innerBranch, deepNode, shallowNode, sideNode],
        edges: [
          makeEdge('e-outer-true', 'outer-branch', 'inner-branch', {
            workflowId: wfId,
            sourceHandle: 'true',
          }),
          makeEdge('e-outer-false', 'outer-branch', 'side-node', {
            workflowId: wfId,
            sourceHandle: 'false',
          }),
          makeEdge('e-inner-true', 'inner-branch', 'deep-node', {
            workflowId: wfId,
            sourceHandle: 'true',
          }),
          makeEdge('e-inner-false', 'inner-branch', 'shallow-node', {
            workflowId: wfId,
            sourceHandle: 'false',
          }),
        ],
      });

      // Topological order
      const nodeOrder = ['outer-branch', 'inner-branch', 'deep-node', 'shallow-node', 'side-node'];
      setupBaseExecution(workflow, runId, nodeOrder);

      // outer = true, inner = true
      // First call = outer (true), second call = inner (true)
      mockGetNodeExecutor.mockImplementation((type: string) => {
        if (type === 'branch') {
          return {
            type: 'branch',
            execute: vi.fn().mockResolvedValue({ result: true }),
          };
        }
        return {
          type: 'sql',
          execute: vi.fn().mockResolvedValue({
            csvPath: '/tmp/out.csv',
            totalRows: 1,
            columns: ['id'],
            previewData: [{ id: 1 }],
          }),
        };
      });

      const handle = await executeWorkflow(wfId);
      await handle.promise;

      const updateCalls = mockUpdateNodeRun.mock.calls as Array<[string, Record<string, unknown>]>;
      const statuses = collectFinalNodeRunStatuses(updateCalls);

      // nr-1=outer-branch, nr-2=inner-branch, nr-3=deep-node, nr-4=shallow-node, nr-5=side-node
      expect(statuses.get('nr-1')).toBe('completed'); // outer-branch ran
      expect(statuses.get('nr-2')).toBe('completed'); // inner-branch ran (outer=true path)
      expect(statuses.get('nr-3')).toBe('completed'); // deep-node ran (inner=true path)
      expect(statuses.get('nr-4')).toBe('skipped'); // shallow-node skipped (inner=false blocked)
      expect(statuses.get('nr-5')).toBe('skipped'); // side-node skipped (outer=false blocked)
    });

    it('skips nested inner branch when outer branch is false', async () => {
      const wfId = uniqueWfId();
      const runId = `run-${wfId}`;

      // outer = false: inner-branch is on the true path → inner-branch skipped
      // since inner-branch is skipped, its outgoing edges are all blocked too
      const outerBranch = makeNode({
        id: 'outer-branch',
        name: 'OuterBranch',
        type: 'branch',
        workflowId: wfId,
        config: makeBranchConfig({ outputVariable: 'outer_out' }),
      });
      const innerBranch = makeNode({
        id: 'inner-branch',
        name: 'InnerBranch',
        type: 'branch',
        workflowId: wfId,
        config: makeBranchConfig({ outputVariable: 'inner_out' }),
      });
      const deepNode = makeNode({
        id: 'deep-node',
        name: 'DeepNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'deep_result' }),
      });
      const sideNode = makeNode({
        id: 'side-node',
        name: 'SideNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig({ outputVariable: 'side_result' }),
      });

      const workflow = makeWorkflow({
        id: wfId,
        nodes: [outerBranch, innerBranch, deepNode, sideNode],
        edges: [
          makeEdge('e-outer-true', 'outer-branch', 'inner-branch', {
            workflowId: wfId,
            sourceHandle: 'true',
          }),
          makeEdge('e-outer-false', 'outer-branch', 'side-node', {
            workflowId: wfId,
            sourceHandle: 'false',
          }),
          makeEdge('e-inner-true', 'inner-branch', 'deep-node', {
            workflowId: wfId,
            sourceHandle: 'true',
          }),
        ],
      });

      const nodeOrder = ['outer-branch', 'inner-branch', 'deep-node', 'side-node'];
      setupBaseExecution(workflow, runId, nodeOrder);

      // outer = false
      mockGetNodeExecutor.mockImplementation((type: string) => {
        if (type === 'branch') {
          return { type: 'branch', execute: vi.fn().mockResolvedValue({ result: false }) };
        }
        return {
          type: 'sql',
          execute: vi.fn().mockResolvedValue({
            csvPath: '/tmp/out.csv',
            totalRows: 0,
            columns: ['id'],
            previewData: [],
          }),
        };
      });

      const handle = await executeWorkflow(wfId);
      await handle.promise;

      const updateCalls = mockUpdateNodeRun.mock.calls as Array<[string, Record<string, unknown>]>;
      const statuses = collectFinalNodeRunStatuses(updateCalls);

      // nr-1=outer-branch, nr-2=inner-branch, nr-3=deep-node, nr-4=side-node
      expect(statuses.get('nr-1')).toBe('completed'); // outer-branch ran
      expect(statuses.get('nr-2')).toBe('skipped'); // inner-branch skipped (outer=false, true path blocked)
      expect(statuses.get('nr-3')).toBe('skipped'); // deep-node: all incoming edges blocked (inner-branch skipped propagates)
      expect(statuses.get('nr-4')).toBe('completed'); // side-node ran (outer=false path)
    });
  });

  // ── Test 6: node_skipped events for branch-skipped nodes ─────────────────
  describe('branch skip events', () => {
    it('emits node_skipped events for branch-blocked nodes', async () => {
      const wfId = uniqueWfId();
      const runId = `run-branch-events`;

      const branchNode = makeNode({
        id: 'branch-node',
        name: 'Branch',
        type: 'branch',
        workflowId: wfId,
        config: makeBranchConfig(),
      });
      const trueNode = makeNode({
        id: 'true-node',
        name: 'TrueNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig(),
      });
      const falseNode = makeNode({
        id: 'false-node',
        name: 'FalseNode',
        type: 'sql',
        workflowId: wfId,
        config: makeSqlConfig(),
      });

      const workflow = makeWorkflow({
        id: wfId,
        nodes: [branchNode, trueNode, falseNode],
        edges: [
          makeEdge('e-true', 'branch-node', 'true-node', {
            workflowId: wfId,
            sourceHandle: 'true',
          }),
          makeEdge('e-false', 'branch-node', 'false-node', {
            workflowId: wfId,
            sourceHandle: 'false',
          }),
        ],
      });

      setupBaseExecution(workflow, runId, ['branch-node', 'true-node', 'false-node']);

      // branch result = true → false-node skipped
      mockGetNodeExecutor.mockImplementation((type: string) => {
        if (type === 'branch') {
          return { type: 'branch', execute: vi.fn().mockResolvedValue({ result: true }) };
        }
        return {
          type: 'sql',
          execute: vi.fn().mockResolvedValue({
            csvPath: '/tmp/out.csv',
            totalRows: 1,
            columns: ['id'],
            previewData: [{ id: 1 }],
          }),
        };
      });

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
        nodeId: 'false-node',
        nodeName: 'FalseNode',
      });
    });
  });
});
