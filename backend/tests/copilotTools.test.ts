// backend/tests/copilotTools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/workflow/workflow.repository');
vi.mock('../src/workflow/workflow.service');
vi.mock('../src/workflow/executionEngine');

import * as service from '../src/workflow/workflow.service';
import { createCopilotToolRegistry, COPILOT_TOOL_NAMES } from '../src/copilot/copilotTools';
import type { WorkflowDetail } from '../src/workflow/workflow.types';

describe('copilotTools', () => {
  describe('COPILOT_TOOL_NAMES', () => {
    it('contains all 13 workflow tools', () => {
      expect(COPILOT_TOOL_NAMES).toContain('wf_get_summary');
      expect(COPILOT_TOOL_NAMES).toContain('wf_add_node');
      expect(COPILOT_TOOL_NAMES).toContain('wf_update_node');
      expect(COPILOT_TOOL_NAMES).toContain('wf_patch_node');
      expect(COPILOT_TOOL_NAMES).toContain('wf_delete_node');
      expect(COPILOT_TOOL_NAMES).toContain('wf_get_node');
      expect(COPILOT_TOOL_NAMES).toContain('wf_connect_nodes');
      expect(COPILOT_TOOL_NAMES).toContain('wf_disconnect_nodes');
      expect(COPILOT_TOOL_NAMES).toContain('wf_get_upstream');
      expect(COPILOT_TOOL_NAMES).toContain('wf_get_downstream');
      expect(COPILOT_TOOL_NAMES).toContain('wf_execute');
      expect(COPILOT_TOOL_NAMES).toContain('wf_execute_node');
      expect(COPILOT_TOOL_NAMES).toContain('wf_get_run_result');
    });
  });

  describe('createCopilotToolRegistry', () => {
    it('returns a ToolRegistryClass with execute and getAllToolSchemas', () => {
      const registry = createCopilotToolRegistry('test-workflow-id');
      expect(typeof registry.execute).toBe('function');
      expect(typeof registry.getAllToolSchemas).toBe('function');
    });

    it('getAllToolSchemas returns schemas for all tools', () => {
      const registry = createCopilotToolRegistry('test-workflow-id');
      const schemas = registry.getAllToolSchemas();
      expect(schemas.length).toBeGreaterThanOrEqual(13);
      for (const schema of schemas) {
        expect(schema).toHaveProperty('name');
        expect(schema).toHaveProperty('description');
        expect(schema).toHaveProperty('parameters');
      }
    });

    it('execute returns error for unknown tool', async () => {
      const registry = createCopilotToolRegistry('test-workflow-id');
      await expect(registry.execute('unknown_tool', {})).rejects.toThrow(
        "Tool 'unknown_tool' not found"
      );
    });
  });

  describe('scoped file tools', () => {
    it('scoped_glob rejects paths outside allowed directories', async () => {
      const registry = createCopilotToolRegistry('test-workflow-id');
      const result = await registry.execute('scoped_glob', { pattern: '*.md', path: '/etc' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed');
    });
  });

  describe('wf_add_node default configs', () => {
    const WORKFLOW_ID = 'test-wf-id';

    function makeEmptyWorkflow(): WorkflowDetail {
      return {
        id: WORKFLOW_ID,
        name: 'Test Workflow',
        description: null,
        nodes: [],
        edges: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    beforeEach(() => {
      const wf = makeEmptyWorkflow();
      vi.mocked(service.getWorkflow).mockResolvedValue(wf);
      vi.mocked(service.saveWorkflow).mockImplementation(async (_id, input) => ({
        ...wf,
        nodes: input.nodes.map((n) => ({
          id: n.id ?? `new-${n.name}`,
          workflowId: WORKFLOW_ID,
          name: n.name,
          description: n.description ?? null,
          type: n.type,
          config: n.config,
          positionX: n.positionX,
          positionY: n.positionY,
        })),
        edges: input.edges.map((e) => ({
          id: 'edge-1',
          workflowId: WORKFLOW_ID,
          sourceNodeId: e.sourceNodeId,
          targetNodeId: e.targetNodeId,
          sourceHandle: e.sourceHandle,
        })),
      }));
    });

    it('wf_add_node creates branch node with default config', async () => {
      const registry = createCopilotToolRegistry(WORKFLOW_ID);
      const result = await registry.execute('wf_add_node', {
        name: 'My Branch',
        type: 'branch',
      });

      expect(result.success).toBe(true);
      const data = result.data as {
        config: { nodeType: string; field: string };
      };
      expect(data.config.nodeType).toBe('branch');
      expect(data.config.field).toBe('');
    });

    it('wf_add_node creates web_search node with default config', async () => {
      const registry = createCopilotToolRegistry(WORKFLOW_ID);
      const result = await registry.execute('wf_add_node', {
        name: 'My Web Search',
        type: 'web_search',
      });

      expect(result.success).toBe(true);
      const data = result.data as { config: { nodeType: string; keywords: string } };
      expect(data.config.nodeType).toBe('web_search');
      expect(data.config.keywords).toBe('');
    });
  });

  describe('wf_connect_nodes with sourceHandle', () => {
    const WORKFLOW_ID = 'test-wf-id';

    function makeWorkflowWithNodes(): WorkflowDetail {
      return {
        id: WORKFLOW_ID,
        name: 'Test Workflow',
        description: null,
        nodes: [
          {
            id: 'n1',
            workflowId: WORKFLOW_ID,
            name: 'Branch',
            description: null,
            type: 'branch',
            config: {
              nodeType: 'branch',
              field: '{{sql.totalRows}}',
              outputVariable: 'branch_result',
            },
            positionX: 200,
            positionY: 200,
          },
          {
            id: 'n2',
            workflowId: WORKFLOW_ID,
            name: 'Send Email',
            description: null,
            type: 'email',
            config: {
              nodeType: 'email',
              to: 'user@example.com',
              subject: 'Report',
              contentSource: 'inline',
              body: 'Hello',
              isHtml: true,
              outputVariable: 'email_result',
            },
            positionX: 200,
            positionY: 400,
          },
        ],
        edges: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    it('wf_connect_nodes passes sourceHandle to edge when provided', async () => {
      const wf = makeWorkflowWithNodes();
      vi.mocked(service.getWorkflow).mockResolvedValue(wf);

      let capturedEdges: Array<{
        sourceNodeId: string;
        targetNodeId: string;
        sourceHandle?: string;
      }> = [];
      vi.mocked(service.saveWorkflow).mockImplementation(async (_id, input) => {
        capturedEdges = input.edges;
        return {
          ...wf,
          nodes: wf.nodes,
          edges: input.edges.map((e) => ({
            id: 'edge-1',
            workflowId: WORKFLOW_ID,
            sourceNodeId: e.sourceNodeId,
            targetNodeId: e.targetNodeId,
            sourceHandle: e.sourceHandle,
          })),
        };
      });

      const registry = createCopilotToolRegistry(WORKFLOW_ID);
      const result = await registry.execute('wf_connect_nodes', {
        sourceNodeId: 'n1',
        targetNodeId: 'n2',
        sourceHandle: 'true',
      });

      expect(result.success).toBe(true);
      expect(capturedEdges).toHaveLength(1);
      expect(capturedEdges[0].sourceHandle).toBe('true');
    });
  });
});
