import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as workflowService from '../../src/workflow/workflow.service';
import * as repository from '../../src/workflow/workflow.repository';
import { WorkflowNotFoundError } from '../../src/errors/types';
import type { WorkflowListItem, ExportedWorkflow } from '../../src/workflow/workflow.types';

vi.mock('../../src/workflow/workflow.repository');

vi.mock('../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('workflow clone/export service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cloneWorkflow', () => {
    it('should clone a workflow with valid name', async () => {
      const cloned: WorkflowListItem = {
        id: 'new-id',
        name: 'Test (copy)',
        description: null,
        nodeCount: 2,
        lastRunAt: null,
        lastRunStatus: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorName: null,
      };
      vi.mocked(repository.cloneWorkflow).mockResolvedValue(cloned);

      const result = await workflowService.cloneWorkflow('source-id', 'Test (copy)');
      expect(result).toEqual(cloned);
      expect(repository.cloneWorkflow).toHaveBeenCalledWith('source-id', 'Test (copy)');
    });

    it('should throw WorkflowNotFoundError when source not found', async () => {
      vi.mocked(repository.cloneWorkflow).mockRejectedValue(new Error('Source workflow not found'));

      await expect(workflowService.cloneWorkflow('bad-id', 'name')).rejects.toThrow(
        WorkflowNotFoundError
      );
    });

    it('should reject empty name', async () => {
      await expect(workflowService.cloneWorkflow('id', '')).rejects.toThrow(
        'Workflow name must not be empty'
      );
    });
  });

  describe('exportWorkflow', () => {
    it('should return exported workflow structure', async () => {
      const exported: ExportedWorkflow = {
        name: 'Test',
        description: 'desc',
        nodes: [
          {
            name: 'sql_1',
            description: null,
            type: 'sql',
            config: { nodeType: 'sql', datasourceId: '', params: {}, sql: '', outputVariable: 'r' },
            positionX: 0,
            positionY: 0,
          },
        ],
        edges: [{ sourceNodeName: 'sql_1', targetNodeName: 'python_1' }],
      };
      vi.mocked(repository.exportWorkflow).mockResolvedValue(exported);

      const result = await workflowService.exportWorkflow('wf-id');
      expect(result).toEqual(exported);
    });

    it('should throw WorkflowNotFoundError when not found', async () => {
      vi.mocked(repository.exportWorkflow).mockResolvedValue(null);

      await expect(workflowService.exportWorkflow('bad-id')).rejects.toThrow(WorkflowNotFoundError);
    });
  });
});
