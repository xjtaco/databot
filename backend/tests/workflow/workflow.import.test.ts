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
const mockFindAllWorkflowNames = vi.fn();
const mockFindWorkflowById = vi.fn();
const mockSaveWorkflow = vi.fn();
const mockFindAllWorkflows = vi.fn();
const mockDeleteWorkflow = vi.fn();
const mockCloneWorkflow = vi.fn();
const mockExportWorkflow = vi.fn();
const mockFindRunsByWorkflowId = vi.fn();
const mockFindRunById = vi.fn();

vi.mock('../../src/workflow/workflow.repository', () => ({
  createWorkflow: (...args: unknown[]) => mockCreateWorkflow(...args),
  findAllWorkflowNames: (...args: unknown[]) => mockFindAllWorkflowNames(...args),
  findWorkflowById: (...args: unknown[]) => mockFindWorkflowById(...args),
  saveWorkflow: (...args: unknown[]) => mockSaveWorkflow(...args),
  findAllWorkflows: (...args: unknown[]) => mockFindAllWorkflows(...args),
  deleteWorkflow: (...args: unknown[]) => mockDeleteWorkflow(...args),
  cloneWorkflow: (...args: unknown[]) => mockCloneWorkflow(...args),
  exportWorkflow: (...args: unknown[]) => mockExportWorkflow(...args),
  findRunsByWorkflowId: (...args: unknown[]) => mockFindRunsByWorkflowId(...args),
  findRunById: (...args: unknown[]) => mockFindRunById(...args),
}));

import { importWorkflow } from '../../src/workflow/workflow.service';
import { WorkflowValidationError } from '../../src/errors/types';
import type {
  WorkflowDetail,
  SqlNodeConfig,
  PythonNodeConfig,
  ExportedWorkflow,
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

function makeSqlConfig(): SqlNodeConfig {
  return {
    nodeType: 'sql',
    datasourceId: 'ds-1',
    params: {},
    sql: 'SELECT 1',
    outputVariable: 'result',
  };
}

function makePythonConfig(): PythonNodeConfig {
  return { nodeType: 'python', params: {}, script: 'result = {}', outputVariable: 'result' };
}

describe('importWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateDag.mockReturnValue(undefined);
  });

  it('should import without conflict when name is unique', async () => {
    const detail = makeWorkflowDetail({ id: 'wf-new', name: 'My Workflow' });
    mockFindAllWorkflowNames.mockResolvedValue([]);
    mockCreateWorkflow.mockResolvedValue(detail);
    mockFindWorkflowById.mockResolvedValue(detail);
    mockSaveWorkflow.mockResolvedValue(detail);

    const input: ExportedWorkflow = {
      name: 'My Workflow',
      description: null,
      nodes: [
        {
          name: 'sql_1',
          description: null,
          type: 'sql',
          config: makeSqlConfig(),
          positionX: 0,
          positionY: 0,
        },
      ],
      edges: [],
    };

    const result = await importWorkflow(input);

    expect(result.name).toBe('My Workflow');
    expect(result.renamed).toBe(false);
    expect(result.id).toBe('wf-new');
  });

  it('should auto-rename with (1) suffix on name conflict', async () => {
    const renamedDetail = makeWorkflowDetail({ id: 'wf-new', name: 'My Workflow(1)' });
    mockFindAllWorkflowNames.mockResolvedValue(['My Workflow']);
    mockCreateWorkflow.mockResolvedValue(renamedDetail);
    mockFindWorkflowById.mockResolvedValue(renamedDetail);
    mockSaveWorkflow.mockResolvedValue(renamedDetail);

    const input: ExportedWorkflow = {
      name: 'My Workflow',
      description: null,
      nodes: [
        {
          name: 'sql_1',
          description: null,
          type: 'sql',
          config: makeSqlConfig(),
          positionX: 0,
          positionY: 0,
        },
      ],
      edges: [],
    };

    const result = await importWorkflow(input);

    expect(result.name).toBe('My Workflow(1)');
    expect(result.renamed).toBe(true);
  });

  it('should increment suffix when multiple conflicts exist', async () => {
    const renamedDetail = makeWorkflowDetail({ id: 'wf-new', name: 'Test(3)' });
    mockFindAllWorkflowNames.mockResolvedValue(['Test', 'Test(1)', 'Test(2)']);
    mockCreateWorkflow.mockResolvedValue(renamedDetail);
    mockFindWorkflowById.mockResolvedValue(renamedDetail);
    mockSaveWorkflow.mockResolvedValue(renamedDetail);

    const input: ExportedWorkflow = {
      name: 'Test',
      description: null,
      nodes: [
        {
          name: 'sql_1',
          description: null,
          type: 'sql',
          config: makeSqlConfig(),
          positionX: 0,
          positionY: 0,
        },
      ],
      edges: [],
    };

    const result = await importWorkflow(input);

    expect(result.name).toBe('Test(3)');
    expect(result.renamed).toBe(true);
  });

  it('should convert edge node names to tempIds correctly', async () => {
    const detail = makeWorkflowDetail({ id: 'wf-new', name: 'Edge Test' });
    mockFindAllWorkflowNames.mockResolvedValue([]);
    mockCreateWorkflow.mockResolvedValue(detail);
    mockFindWorkflowById.mockResolvedValue(detail);
    mockSaveWorkflow.mockResolvedValue(detail);

    const input: ExportedWorkflow = {
      name: 'Edge Test',
      description: null,
      nodes: [
        {
          name: 'sql_1',
          description: null,
          type: 'sql',
          config: makeSqlConfig(),
          positionX: 0,
          positionY: 0,
        },
        {
          name: 'python_1',
          description: null,
          type: 'python',
          config: makePythonConfig(),
          positionX: 200,
          positionY: 0,
        },
      ],
      edges: [{ sourceNodeName: 'sql_1', targetNodeName: 'python_1', sourceHandle: 'default' }],
    };

    await importWorkflow(input);

    expect(mockSaveWorkflow).toHaveBeenCalledOnce();
    const [, saveInput] = mockSaveWorkflow.mock.calls[0] as [
      string,
      {
        nodes: { tempId: string; name: string }[];
        edges: { sourceNodeId: string; targetNodeId: string }[];
      },
    ];

    expect(saveInput.nodes[0].tempId).toBe('sql_1');
    expect(saveInput.nodes[1].tempId).toBe('python_1');
    expect(saveInput.edges[0].sourceNodeId).toBe('sql_1');
    expect(saveInput.edges[0].targetNodeId).toBe('python_1');
  });

  it('should throw WorkflowValidationError when edge references non-existent node', async () => {
    mockFindAllWorkflowNames.mockResolvedValue([]);

    const input: ExportedWorkflow = {
      name: 'Bad Edge Workflow',
      description: null,
      nodes: [
        {
          name: 'sql_1',
          description: null,
          type: 'sql',
          config: makeSqlConfig(),
          positionX: 0,
          positionY: 0,
        },
      ],
      edges: [{ sourceNodeName: 'sql_1', targetNodeName: 'nonexistent_node' }],
    };

    await expect(importWorkflow(input)).rejects.toThrow(WorkflowValidationError);
    await expect(importWorkflow(input)).rejects.toThrow('nonexistent_node');
  });

  it('should throw WorkflowValidationError for empty name', async () => {
    mockFindAllWorkflowNames.mockResolvedValue([]);

    const input: ExportedWorkflow = {
      name: '',
      description: null,
      nodes: [],
      edges: [],
    };

    await expect(importWorkflow(input)).rejects.toThrow(WorkflowValidationError);
    await expect(importWorkflow(input)).rejects.toThrow('Workflow name must not be empty');
  });
});
