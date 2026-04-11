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

// Mock dagValidator
const mockValidateDag = vi.fn();
vi.mock('../../src/workflow/dagValidator', () => ({
  validateDag: (...args: unknown[]) => mockValidateDag(...args),
}));

// Mock repository
const mockCreateWorkflow = vi.fn();
const mockFindAllWorkflows = vi.fn();
const mockFindWorkflowById = vi.fn();
const mockSaveWorkflow = vi.fn();
const mockDeleteWorkflow = vi.fn();
const mockFindRunsByWorkflowId = vi.fn();
const mockFindRunById = vi.fn();

vi.mock('../../src/workflow/workflow.repository', () => ({
  createWorkflow: (...args: unknown[]) => mockCreateWorkflow(...args),
  findAllWorkflows: (...args: unknown[]) => mockFindAllWorkflows(...args),
  findWorkflowById: (...args: unknown[]) => mockFindWorkflowById(...args),
  saveWorkflow: (...args: unknown[]) => mockSaveWorkflow(...args),
  deleteWorkflow: (...args: unknown[]) => mockDeleteWorkflow(...args),
  findRunsByWorkflowId: (...args: unknown[]) => mockFindRunsByWorkflowId(...args),
  findRunById: (...args: unknown[]) => mockFindRunById(...args),
}));

import {
  createWorkflow,
  listWorkflows,
  getWorkflow,
  saveWorkflow,
  deleteWorkflow,
  listRuns,
  getRunDetail,
} from '../../src/workflow/workflow.service';
import { WorkflowNotFoundError, WorkflowValidationError } from '../../src/errors/types';
import type {
  WorkflowDetail,
  SaveWorkflowInput,
  SqlNodeConfig,
  PythonNodeConfig,
} from '../../src/workflow/workflow.types';

const now = new Date('2026-03-22T00:00:00Z');

function makeWorkflowDetail(overrides: Partial<WorkflowDetail> = {}): WorkflowDetail {
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

function makeSqlConfig(overrides: Partial<SqlNodeConfig> = {}): SqlNodeConfig {
  return {
    nodeType: 'sql',
    datasourceId: 'ds-1',
    params: {},
    sql: 'SELECT 1',
    outputVariable: 'result',
    ...overrides,
  };
}

function makePythonConfig(overrides: Partial<PythonNodeConfig> = {}): PythonNodeConfig {
  return {
    nodeType: 'python',
    params: {},
    script: 'print("hello")',
    outputVariable: 'py_result',
    ...overrides,
  };
}

function makeSaveInput(overrides: Partial<SaveWorkflowInput> = {}): SaveWorkflowInput {
  return {
    name: 'Updated Workflow',
    nodes: [
      {
        id: 'node-1',
        name: 'Query Node',
        type: 'sql',
        config: makeSqlConfig(),
        positionX: 0,
        positionY: 0,
      },
    ],
    edges: [],
    ...overrides,
  };
}

describe('workflow.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── createWorkflow ──────────────────────────────────────
  describe('createWorkflow', () => {
    it('should create a workflow with a valid name', async () => {
      const detail = makeWorkflowDetail();
      mockCreateWorkflow.mockResolvedValue(detail);

      const result = await createWorkflow('Test Workflow');

      expect(mockCreateWorkflow).toHaveBeenCalledWith('Test Workflow', undefined, undefined);
      expect(result).toEqual(detail);
    });

    it('should create a workflow with name and description', async () => {
      const detail = makeWorkflowDetail({ description: 'A test' });
      mockCreateWorkflow.mockResolvedValue(detail);

      const result = await createWorkflow('Test Workflow', 'A test');

      expect(mockCreateWorkflow).toHaveBeenCalledWith('Test Workflow', 'A test', undefined);
      expect(result.description).toBe('A test');
    });

    it('should throw WorkflowValidationError for empty name', async () => {
      await expect(createWorkflow('')).rejects.toThrow(WorkflowValidationError);
      await expect(createWorkflow('')).rejects.toThrow('Workflow name must not be empty');
    });

    it('should throw WorkflowValidationError for whitespace-only name', async () => {
      await expect(createWorkflow('   ')).rejects.toThrow(WorkflowValidationError);
      await expect(createWorkflow('   ')).rejects.toThrow('Workflow name must not be empty');
    });

    it('should throw WorkflowValidationError for name exceeding 255 characters', async () => {
      const longName = 'a'.repeat(256);
      await expect(createWorkflow(longName)).rejects.toThrow(WorkflowValidationError);
      await expect(createWorkflow(longName)).rejects.toThrow(
        'Workflow name must not exceed 255 characters'
      );
    });

    it('should accept a name of exactly 255 characters', async () => {
      const name = 'a'.repeat(255);
      const detail = makeWorkflowDetail({ name });
      mockCreateWorkflow.mockResolvedValue(detail);

      const result = await createWorkflow(name);
      expect(result.name).toBe(name);
    });
  });

  // ── listWorkflows ───────────────────────────────────────
  describe('listWorkflows', () => {
    it('should delegate to repository', async () => {
      const list = [
        {
          id: 'wf-1',
          name: 'W1',
          description: null,
          nodeCount: 2,
          lastRunAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ];
      mockFindAllWorkflows.mockResolvedValue(list);

      const result = await listWorkflows();
      expect(result).toEqual(list);
      expect(mockFindAllWorkflows).toHaveBeenCalledOnce();
    });
  });

  // ── getWorkflow ─────────────────────────────────────────
  describe('getWorkflow', () => {
    it('should return workflow when found', async () => {
      const detail = makeWorkflowDetail();
      mockFindWorkflowById.mockResolvedValue(detail);

      const result = await getWorkflow('wf-1');
      expect(result).toEqual(detail);
    });

    it('should throw WorkflowNotFoundError when not found', async () => {
      mockFindWorkflowById.mockResolvedValue(null);

      await expect(getWorkflow('missing')).rejects.toThrow(WorkflowNotFoundError);
    });
  });

  // ── saveWorkflow ────────────────────────────────────────
  describe('saveWorkflow', () => {
    it('should save a valid workflow', async () => {
      const existing = makeWorkflowDetail();
      const updated = makeWorkflowDetail({ name: 'Updated Workflow' });
      mockFindWorkflowById.mockResolvedValue(existing);
      mockSaveWorkflow.mockResolvedValue(updated);

      const input = makeSaveInput();
      const result = await saveWorkflow('wf-1', input);

      expect(mockSaveWorkflow).toHaveBeenCalledWith('wf-1', input);
      expect(result.name).toBe('Updated Workflow');
    });

    it('should throw WorkflowNotFoundError if workflow does not exist', async () => {
      mockFindWorkflowById.mockResolvedValue(null);

      await expect(saveWorkflow('missing', makeSaveInput())).rejects.toThrow(WorkflowNotFoundError);
    });

    it('should throw WorkflowValidationError for empty name', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());

      const input = makeSaveInput({ name: '' });
      await expect(saveWorkflow('wf-1', input)).rejects.toThrow(WorkflowValidationError);
      await expect(saveWorkflow('wf-1', input)).rejects.toThrow('Workflow name must not be empty');
    });

    // ── Edge validation with || fix (source-only invalid) ──
    it('should throw when edge has source referencing non-existent node', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());

      const input = makeSaveInput({
        nodes: [
          {
            id: 'node-1',
            name: 'Node A',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 0,
            positionY: 0,
          },
        ],
        edges: [{ sourceNodeId: 'non-existent', targetNodeId: 'node-1' }],
      });

      await expect(saveWorkflow('wf-1', input)).rejects.toThrow(WorkflowValidationError);
      await expect(saveWorkflow('wf-1', input)).rejects.toThrow(
        'Edge references non-existent node'
      );
    });

    // ── Edge validation with || fix (target-only invalid) ──
    it('should throw when edge has target referencing non-existent node', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());

      const input = makeSaveInput({
        nodes: [
          {
            id: 'node-1',
            name: 'Node A',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 0,
            positionY: 0,
          },
        ],
        edges: [{ sourceNodeId: 'node-1', targetNodeId: 'non-existent' }],
      });

      await expect(saveWorkflow('wf-1', input)).rejects.toThrow(WorkflowValidationError);
      await expect(saveWorkflow('wf-1', input)).rejects.toThrow(
        'Edge references non-existent node'
      );
    });

    it('should accept edge where both source and target are valid nodes', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());
      mockSaveWorkflow.mockResolvedValue(makeWorkflowDetail());

      const input = makeSaveInput({
        nodes: [
          {
            id: 'node-1',
            name: 'Node A',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 0,
            positionY: 0,
          },
          {
            id: 'node-2',
            name: 'Node B',
            type: 'python',
            config: makePythonConfig(),
            positionX: 100,
            positionY: 0,
          },
        ],
        edges: [{ sourceNodeId: 'node-1', targetNodeId: 'node-2' }],
      });

      await expect(saveWorkflow('wf-1', input)).resolves.toBeDefined();
      expect(mockValidateDag).toHaveBeenCalled();
    });

    // ── Node type validation ──
    it('should throw WorkflowValidationError for invalid node type', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());

      const input = makeSaveInput({
        nodes: [
          {
            id: 'node-1',
            name: 'Bad Node',
            // Force an invalid node type for testing
            type: 'invalid_type' as 'sql',
            config: makeSqlConfig(),
            positionX: 0,
            positionY: 0,
          },
        ],
      });

      await expect(saveWorkflow('wf-1', input)).rejects.toThrow(WorkflowValidationError);
      await expect(saveWorkflow('wf-1', input)).rejects.toThrow('Invalid node type');
    });

    it('should accept valid node types: sql, python, llm', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());
      mockSaveWorkflow.mockResolvedValue(makeWorkflowDetail());

      const input = makeSaveInput({
        nodes: [
          {
            id: 'n1',
            name: 'SQL Node',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 0,
            positionY: 0,
          },
          {
            id: 'n2',
            name: 'Python Node',
            type: 'python',
            config: makePythonConfig(),
            positionX: 100,
            positionY: 0,
          },
          {
            id: 'n3',
            name: 'LLM Node',
            type: 'llm',
            config: { nodeType: 'llm', params: {}, prompt: 'hello', outputVariable: 'llm_out' },
            positionX: 200,
            positionY: 0,
          },
        ],
      });

      await expect(saveWorkflow('wf-1', input)).resolves.toBeDefined();
    });

    // ── Unique node names validation ──
    it('should throw WorkflowValidationError for duplicate node names', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());

      const input = makeSaveInput({
        nodes: [
          {
            id: 'n1',
            name: 'Same Name',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 0,
            positionY: 0,
          },
          {
            id: 'n2',
            name: 'Same Name',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 100,
            positionY: 0,
          },
        ],
      });

      await expect(saveWorkflow('wf-1', input)).rejects.toThrow(WorkflowValidationError);
      await expect(saveWorkflow('wf-1', input)).rejects.toThrow('Duplicate node name');
    });

    it('should throw for duplicate names after trimming whitespace', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());

      const input = makeSaveInput({
        nodes: [
          {
            id: 'n1',
            name: '  Query  ',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 0,
            positionY: 0,
          },
          {
            id: 'n2',
            name: 'Query',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 100,
            positionY: 0,
          },
        ],
      });

      await expect(saveWorkflow('wf-1', input)).rejects.toThrow('Duplicate node name');
    });

    it('should throw for empty node name', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());

      const input = makeSaveInput({
        nodes: [
          {
            id: 'n1',
            name: '',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 0,
            positionY: 0,
          },
        ],
      });

      await expect(saveWorkflow('wf-1', input)).rejects.toThrow(WorkflowValidationError);
      await expect(saveWorkflow('wf-1', input)).rejects.toThrow('Node name must not be empty');
    });

    it('should throw for whitespace-only node name', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());

      const input = makeSaveInput({
        nodes: [
          {
            id: 'n1',
            name: '   ',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 0,
            positionY: 0,
          },
        ],
      });

      await expect(saveWorkflow('wf-1', input)).rejects.toThrow('Node name must not be empty');
    });

    // ── Uses tempId for node identity when id is missing ──
    it('should use tempId for node identity in edge validation when id is absent', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());
      mockSaveWorkflow.mockResolvedValue(makeWorkflowDetail());

      const input = makeSaveInput({
        nodes: [
          {
            tempId: 'temp-1',
            name: 'Node A',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 0,
            positionY: 0,
          },
          {
            tempId: 'temp-2',
            name: 'Node B',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 100,
            positionY: 0,
          },
        ],
        edges: [{ sourceNodeId: 'temp-1', targetNodeId: 'temp-2' }],
      });

      await expect(saveWorkflow('wf-1', input)).resolves.toBeDefined();
    });

    it('should fall back to name for node identity when both id and tempId are absent', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());
      mockSaveWorkflow.mockResolvedValue(makeWorkflowDetail());

      const input = makeSaveInput({
        nodes: [
          {
            name: 'Source',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 0,
            positionY: 0,
          },
          {
            name: 'Target',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 100,
            positionY: 0,
          },
        ],
        edges: [{ sourceNodeId: 'Source', targetNodeId: 'Target' }],
      });

      await expect(saveWorkflow('wf-1', input)).resolves.toBeDefined();
    });

    it('should call validateDag with mapped nodes and edges', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());
      mockSaveWorkflow.mockResolvedValue(makeWorkflowDetail());

      const input = makeSaveInput({
        nodes: [
          {
            id: 'n1',
            name: 'A',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 0,
            positionY: 0,
          },
          {
            id: 'n2',
            name: 'B',
            type: 'sql',
            config: makeSqlConfig(),
            positionX: 100,
            positionY: 0,
          },
        ],
        edges: [{ sourceNodeId: 'n1', targetNodeId: 'n2' }],
      });

      await saveWorkflow('wf-1', input);

      expect(mockValidateDag).toHaveBeenCalledWith(
        [{ id: 'n1' }, { id: 'n2' }],
        [{ sourceNodeId: 'n1', targetNodeId: 'n2' }]
      );
    });
  });

  // ── deleteWorkflow ──────────────────────────────────────
  describe('deleteWorkflow', () => {
    it('should delete an existing workflow', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());
      mockDeleteWorkflow.mockResolvedValue(undefined);

      await expect(deleteWorkflow('wf-1')).resolves.toBeUndefined();
      expect(mockDeleteWorkflow).toHaveBeenCalledWith('wf-1');
    });

    it('should throw WorkflowNotFoundError when workflow does not exist', async () => {
      mockFindWorkflowById.mockResolvedValue(null);

      await expect(deleteWorkflow('missing')).rejects.toThrow(WorkflowNotFoundError);
      await expect(deleteWorkflow('missing')).rejects.toThrow('Workflow not found');
      expect(mockDeleteWorkflow).not.toHaveBeenCalled();
    });
  });

  // ── listRuns ────────────────────────────────────────────
  describe('listRuns', () => {
    it('should return paginated runs for an existing workflow', async () => {
      mockFindWorkflowById.mockResolvedValue(makeWorkflowDetail());
      const runs = [
        {
          id: 'run-1',
          workflowId: 'wf-1',
          status: 'completed',
          startedAt: now,
          completedAt: now,
          errorMessage: null,
        },
      ];
      const page = { runs, total: 1, page: 1, pageSize: 20 };
      mockFindRunsByWorkflowId.mockResolvedValue(page);

      const result = await listRuns('wf-1', { page: 1, pageSize: 20 });
      expect(result).toEqual(page);
    });

    it('should throw WorkflowNotFoundError if workflow does not exist', async () => {
      mockFindWorkflowById.mockResolvedValue(null);

      await expect(listRuns('missing', { page: 1, pageSize: 20 })).rejects.toThrow(
        WorkflowNotFoundError
      );
    });
  });

  // ── getRunDetail ────────────────────────────────────────
  describe('getRunDetail', () => {
    it('should return run detail when found and workflowId matches', async () => {
      const runDetail = {
        id: 'run-1',
        workflowId: 'wf-1',
        status: 'completed' as const,
        startedAt: now,
        completedAt: now,
        errorMessage: null,
        nodeRuns: [],
      };
      mockFindRunById.mockResolvedValue(runDetail);

      const result = await getRunDetail('wf-1', 'run-1');
      expect(result).toEqual(runDetail);
    });

    it('should throw WorkflowNotFoundError when run not found', async () => {
      mockFindRunById.mockResolvedValue(null);

      await expect(getRunDetail('wf-1', 'missing')).rejects.toThrow(WorkflowNotFoundError);
    });

    it('should throw WorkflowNotFoundError when workflowId does not match', async () => {
      const runDetail = {
        id: 'run-1',
        workflowId: 'wf-other',
        status: 'completed' as const,
        startedAt: now,
        completedAt: now,
        errorMessage: null,
        nodeRuns: [],
      };
      mockFindRunById.mockResolvedValue(runDetail);

      await expect(getRunDetail('wf-1', 'run-1')).rejects.toThrow(WorkflowNotFoundError);
    });
  });
});
