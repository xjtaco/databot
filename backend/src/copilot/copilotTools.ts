// backend/src/copilot/copilotTools.ts

import { resolve, sep } from 'path';
import { Tool, ToolRegistryClass } from '../infrastructure/tools/tools';
import { ToolParams, ToolResult, JSONSchemaObject } from '../infrastructure/tools/types';
import { GlobTool } from '../infrastructure/tools/globTool';
import { GrepTool } from '../infrastructure/tools/grepTool';
import { ReadFileTool } from '../infrastructure/tools/readFileTool';
import { sanitizeForLlm } from '../infrastructure/tools/objectSanitizer';
import { WebSearch } from '../infrastructure/tools/webSearch';
import { SqlTool } from '../infrastructure/tools/sqlTool';
import { TodosWriter } from '../infrastructure/tools/todosWriter';
import { config } from '../base/config';
import * as repository from '../workflow/workflow.repository';
import * as service from '../workflow/workflow.service';
import * as executionEngine from '../workflow/executionEngine';
import * as templateRepository from '../workflow/customNodeTemplate.repository';
import * as templateService from '../workflow/customNodeTemplate.service';
import type { WsWorkflowEvent } from '../workflow/workflow.types';
import { DbWorkflowAccessor } from './workflowAccessor';
import type { WorkflowAccessor } from './workflowAccessor';
import { getUpstreamNodes, getDownstreamNodes } from '../workflow/dagValidator';
import {
  WorkflowNodeTypeValue,
  SaveWorkflowInput,
  SaveWorkflowNodeInput,
  SaveWorkflowEdgeInput,
  NodeConfig,
  SqlNodeConfig,
  PythonNodeConfig,
  LlmNodeConfig,
  EmailNodeConfig,
  BranchNodeConfig,
  WebSearchNodeConfig,
  WorkflowNodeInfo,
} from '../workflow/workflow.types';
import type { ConfigStatusResponse } from '../globalConfig/globalConfig.types';
import logger from '../utils/logger';

// ── Tool name registry ────────────────────────────────────

export const COPILOT_TOOL_NAMES = [
  'wf_get_summary',
  'wf_add_node',
  'wf_update_node',
  'wf_patch_node',
  'wf_delete_node',
  'wf_get_node',
  'wf_connect_nodes',
  'wf_disconnect_nodes',
  'wf_get_upstream',
  'wf_get_downstream',
  'wf_execute',
  'wf_execute_node',
  'wf_get_run_result',
  'scoped_glob',
  'scoped_grep',
  'scoped_read_file',
  'web_search',
  'sql',
  'todos_writer',
  'wf_search_custom_nodes',
] as const;

// ── Default node config builders ─────────────────────────

function buildDefaultSqlConfig(): SqlNodeConfig {
  return {
    nodeType: 'sql',
    datasourceId: '',
    params: {},
    sql: '',
    outputVariable: 'result',
  };
}

function buildDefaultPythonConfig(): PythonNodeConfig {
  return {
    nodeType: 'python',
    params: {},
    script: '# Write your Python script here\nresult = {}',
    outputVariable: 'result',
  };
}

function buildDefaultLlmConfig(): LlmNodeConfig {
  return {
    nodeType: 'llm',
    params: {},
    prompt: '',
    outputVariable: 'result',
  };
}

function buildDefaultEmailConfig(): EmailNodeConfig {
  return {
    nodeType: 'email',
    to: '',
    subject: '',
    contentSource: 'inline',
    body: '',
    isHtml: true,
    outputVariable: 'email_result',
  };
}

export function buildDefaultConfig(type: WorkflowNodeTypeValue): NodeConfig {
  switch (type) {
    case 'sql':
      return buildDefaultSqlConfig();
    case 'python':
      return buildDefaultPythonConfig();
    case 'llm':
      return buildDefaultLlmConfig();
    case 'email':
      return buildDefaultEmailConfig();
    case 'branch':
      return {
        nodeType: 'branch',
        field: '',
        outputVariable: 'branch_result',
      } as BranchNodeConfig;
    case 'web_search':
      return {
        nodeType: 'web_search',
        params: {},
        keywords: '',
        outputVariable: 'search_result',
      } as WebSearchNodeConfig;
  }
}

// ── Path validation helpers ───────────────────────────────

function isAllowedPath(testPath: string): boolean {
  const resolved = resolve(testPath);
  const allowedPrefixes = [
    config.data_dictionary_folder,
    config.knowledge_folder,
    config.work_folder,
    config.upload.directory,
  ];
  return allowedPrefixes.some((prefix) => {
    const resolvedPrefix = resolve(prefix);
    return resolved === resolvedPrefix || resolved.startsWith(resolvedPrefix + sep);
  });
}

function pathNotAllowedError(path: string): ToolResult {
  return {
    success: false,
    data: null,
    error: `Path '${path}' is not allowed. Must be under: ${config.data_dictionary_folder}, ${config.knowledge_folder}, ${config.work_folder}, or ${config.upload.directory}`,
  };
}

// ── buildSaveInput helper ─────────────────────────────────

function buildSaveInput(workflow: {
  name: string;
  description: string | null;
  nodes: WorkflowNodeInfo[];
  edges: { id: string; sourceNodeId: string; targetNodeId: string }[];
}): SaveWorkflowInput {
  const nodes: SaveWorkflowNodeInput[] = workflow.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    description: n.description ?? undefined,
    type: n.type,
    config: n.config,
    positionX: n.positionX,
    positionY: n.positionY,
  }));
  const edges: SaveWorkflowEdgeInput[] = workflow.edges.map((e) => ({
    sourceNodeId: e.sourceNodeId,
    targetNodeId: e.targetNodeId,
  }));
  return {
    name: workflow.name,
    description: workflow.description ?? undefined,
    nodes,
    edges,
  };
}

// ── Workflow tool subclasses ──────────────────────────────

class WfGetSummaryTool extends Tool {
  name = 'wf_get_summary';
  description = 'Get a summary of the current workflow: all nodes and edges.';
  parameters: JSONSchemaObject = { type: 'object', properties: {}, required: [] };
  private workflowId: string;

  constructor(workflowId: string) {
    super();
    this.workflowId = workflowId;
  }

  async execute(_params: ToolParams): Promise<ToolResult> {
    try {
      const workflow = await repository.findWorkflowById(this.workflowId);
      if (!workflow) {
        return { success: false, data: null, error: 'Workflow not found' };
      }
      const idToName = new Map(workflow.nodes.map((n) => [n.id, n.name]));
      return {
        success: true,
        data: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          nodes: workflow.nodes.map((n) => ({
            id: n.id,
            name: n.name,
            type: n.type,
            outputVariable: n.config.outputVariable,
          })),
          edges: workflow.edges.map((e) => ({
            sourceNodeName: idToName.get(e.sourceNodeId) ?? e.sourceNodeId,
            targetNodeName: idToName.get(e.targetNodeId) ?? e.targetNodeId,
            sourceNodeId: e.sourceNodeId,
            targetNodeId: e.targetNodeId,
          })),
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_get_summary failed', { workflowId: this.workflowId, error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

class WfAddNodeTool extends Tool {
  name = 'wf_add_node';
  description = 'Add a new node to the workflow. Returns the newly created node details.';
  parameters: JSONSchemaObject;
  private workflowId: string;
  private allowedTypes: string[];

  constructor(workflowId: string, allowedTypes?: string[]) {
    super();
    this.workflowId = workflowId;
    this.allowedTypes = allowedTypes ?? ['sql', 'python', 'llm', 'email', 'branch', 'web_search'];
    this.parameters = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Node name (must be unique within the workflow)' },
        type: {
          type: 'string',
          enum: this.allowedTypes,
          description: 'Node type',
        },
        config: {
          type: 'object',
          description: 'Optional partial node configuration to override defaults',
          properties: {},
          required: [],
        },
        template_id: {
          type: 'string',
          description:
            'Optional custom node template ID. When provided, the template config is used as the initial config instead of the default.',
        },
      },
      required: ['name', 'type'],
    };
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const name = params.name as string;
      const type = params.type as WorkflowNodeTypeValue;
      const configOverride = (params.config ?? {}) as Record<string, unknown>;

      if (!name || typeof name !== 'string') {
        return { success: false, data: null, error: 'name is required' };
      }
      if (!type || !this.allowedTypes.includes(type)) {
        return {
          success: false,
          data: null,
          error: `type must be one of: ${this.allowedTypes.join(', ')}`,
        };
      }

      const workflow = await service.getWorkflow(this.workflowId);

      // Auto-position: below the last existing node
      const maxY =
        workflow.nodes.length > 0 ? Math.max(...workflow.nodes.map((n) => n.positionY)) : 80;
      const positionX = 200;
      const positionY = maxY + 120;

      // Build config: template (or default) + overrides
      const templateId = params.template_id as string | undefined;
      let baseCfg: NodeConfig;
      if (templateId) {
        const template = await templateService.getTemplate(templateId);
        baseCfg = template.config;
      } else {
        baseCfg = buildDefaultConfig(type);
      }
      const nodeConfig = { ...baseCfg, ...configOverride } as NodeConfig;

      const tempId = `new_${Date.now()}`;
      const input = buildSaveInput(workflow);
      input.nodes.push({
        tempId,
        name,
        type,
        config: nodeConfig,
        positionX,
        positionY,
      });

      const saved = await service.saveWorkflow(this.workflowId, input);
      // Find the newly added node by name
      const newNode = saved.nodes.find((n) => n.name === name);

      return {
        success: true,
        data: newNode
          ? {
              id: newNode.id,
              name: newNode.name,
              type: newNode.type,
              config: newNode.config,
              positionX: newNode.positionX,
              positionY: newNode.positionY,
            }
          : null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_add_node failed', { workflowId: this.workflowId, error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

export class WfUpdateNodeTool extends Tool {
  name = 'wf_update_node';
  description = 'Update an existing node configuration by ID. Merges partial config with existing.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node ID to update' },
      config: {
        type: 'object',
        description: 'Partial node configuration to merge into the existing config',
        properties: {},
        required: [],
      },
    },
    required: ['nodeId', 'config'],
  };
  private accessor: WorkflowAccessor;

  constructor(accessor: WorkflowAccessor) {
    super();
    this.accessor = accessor;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const nodeId = params.nodeId as string;
      const configPatch = (params.config ?? {}) as Record<string, unknown>;

      if (!nodeId || typeof nodeId !== 'string') {
        return { success: false, data: null, error: 'nodeId is required' };
      }

      const workflow = await this.accessor.getWorkflow();
      const node = workflow.nodes.find((n) => n.id === nodeId);
      if (!node) {
        return { success: false, data: null, error: `Node '${nodeId}' not found` };
      }

      const mergedConfig = { ...node.config, ...configPatch } as NodeConfig;

      await this.accessor.updateNode(nodeId, { config: mergedConfig });

      return {
        success: true,
        data: {
          id: node.id,
          name: node.name,
          type: node.type,
          config: mergedConfig,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_update_node failed', { workflowId: this.accessor.workflowId, error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

export class WfPatchNodeTool extends Tool {
  name = 'wf_patch_node';
  description =
    'Patch the text content of a node (SQL query, Python script, or LLM prompt) by replacing a specific text fragment. Use this instead of wf_update_node when only a small part of the content needs to change.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node ID to patch' },
      old_string: {
        type: 'string',
        description: 'The exact text fragment to find and replace in the node content',
      },
      new_string: {
        type: 'string',
        description: 'The replacement text (empty string to delete the fragment)',
      },
      occurrence: {
        type: 'number',
        description: 'Which occurrence to replace (1-based, default: 1)',
        minimum: 1,
      },
    },
    required: ['nodeId', 'old_string', 'new_string'],
  };
  private accessor: WorkflowAccessor;

  constructor(accessor: WorkflowAccessor) {
    super();
    this.accessor = accessor;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const nodeId = params.nodeId as string;
      const oldString = params.old_string as string;
      const newString = params.new_string as string;
      const occurrence = (params.occurrence as number | undefined) ?? 1;

      if (!nodeId || typeof nodeId !== 'string') {
        return { success: false, data: null, error: 'nodeId is required' };
      }
      if (typeof oldString !== 'string' || oldString.length === 0) {
        return { success: false, data: null, error: 'old_string cannot be empty' };
      }
      if (typeof newString !== 'string') {
        return { success: false, data: null, error: 'new_string is required' };
      }
      if (oldString === newString) {
        return {
          success: false,
          data: null,
          error: 'old_string and new_string cannot be the same',
        };
      }
      if (typeof occurrence !== 'number' || occurrence < 1 || !Number.isInteger(occurrence)) {
        return {
          success: false,
          data: null,
          error: 'occurrence must be a positive integer',
        };
      }

      const workflow = await this.accessor.getWorkflow();
      const node = workflow.nodes.find((n) => n.id === nodeId);
      if (!node) {
        return { success: false, data: null, error: `Node '${nodeId}' not found` };
      }

      // Determine target field based on node type
      const contentResult = this.getContent(node.config);
      if (contentResult === null) {
        return {
          success: false,
          data: null,
          error: 'wf_patch_node does not support email nodes. Use wf_update_node instead.',
        };
      }

      const { field, content } = contentResult;
      const patched = this.replaceNthOccurrence(content, oldString, newString, occurrence);
      if (typeof patched !== 'string') {
        return patched; // error ToolResult
      }

      const patchedConfig = { ...node.config, [field]: patched } as NodeConfig;

      await this.accessor.updateNode(nodeId, { config: patchedConfig });

      return {
        success: true,
        data: {
          id: node.id,
          name: node.name,
          type: node.type,
          config: patchedConfig,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_patch_node failed', { workflowId: this.accessor.workflowId, error: msg });
      return { success: false, data: null, error: msg };
    }
  }

  private getContent(
    config: NodeConfig
  ): { field: 'sql' | 'script' | 'prompt'; content: string } | null {
    switch (config.nodeType) {
      case 'sql':
        return { field: 'sql', content: config.sql };
      case 'python':
        return { field: 'script', content: config.script };
      case 'llm':
        return { field: 'prompt', content: config.prompt };
      case 'email':
      case 'branch':
      case 'web_search':
        return null;
    }
  }

  private replaceNthOccurrence(
    content: string,
    oldString: string,
    newString: string,
    occurrence: number
  ): string | ToolResult {
    let position = 0;
    let count = 0;

    for (;;) {
      const index = content.indexOf(oldString, position);
      if (index === -1) break;
      count++;
      if (count === occurrence) {
        return content.slice(0, index) + newString + content.slice(index + oldString.length);
      }
      position = index + oldString.length;
    }

    if (count === 0) {
      return { success: false, data: null, error: 'old_string not found in node content' };
    }
    return {
      success: false,
      data: null,
      error: `occurrence ${occurrence} exceeds total matches (${count} found)`,
    };
  }
}

class WfDeleteNodeTool extends Tool {
  name = 'wf_delete_node';
  description = 'Delete a node (and all its edges) from the workflow.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node ID to delete' },
    },
    required: ['nodeId'],
  };
  private workflowId: string;

  constructor(workflowId: string) {
    super();
    this.workflowId = workflowId;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const nodeId = params.nodeId as string;

      if (!nodeId || typeof nodeId !== 'string') {
        return { success: false, data: null, error: 'nodeId is required' };
      }

      const workflow = await service.getWorkflow(this.workflowId);
      const node = workflow.nodes.find((n) => n.id === nodeId);
      if (!node) {
        return { success: false, data: null, error: `Node '${nodeId}' not found` };
      }

      const input = buildSaveInput(workflow);
      input.nodes = input.nodes.filter((n) => n.id !== nodeId);
      input.edges = input.edges.filter(
        (e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId
      );

      await service.saveWorkflow(this.workflowId, input);

      return {
        success: true,
        data: { deleted: true, nodeId, nodeName: node.name },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_delete_node failed', { workflowId: this.workflowId, error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

export class WfGetNodeTool extends Tool {
  name = 'wf_get_node';
  description = 'Get full details of a specific node by ID.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node ID' },
    },
    required: ['nodeId'],
  };
  private accessor: WorkflowAccessor;

  constructor(accessor: WorkflowAccessor) {
    super();
    this.accessor = accessor;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const nodeId = params.nodeId as string;

      if (!nodeId || typeof nodeId !== 'string') {
        return { success: false, data: null, error: 'nodeId is required' };
      }

      const workflow = await this.accessor.getWorkflow();

      const node = workflow.nodes.find((n) => n.id === nodeId);
      if (!node) {
        return { success: false, data: null, error: `Node '${nodeId}' not found` };
      }

      return { success: true, data: sanitizeForLlm(node) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_get_node failed', { workflowId: this.accessor.workflowId, error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

class WfConnectNodesTool extends Tool {
  name = 'wf_connect_nodes';
  description = 'Connect two nodes with a directed edge (source → target).';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      sourceNodeId: { type: 'string', description: 'Source node ID' },
      targetNodeId: { type: 'string', description: 'Target node ID' },
      sourceHandle: {
        type: 'string',
        description:
          'Source handle identifier. Required when source is a branch node: "true" for condition-met path, "false" for condition-not-met path.',
      },
    },
    required: ['sourceNodeId', 'targetNodeId'],
  };
  private workflowId: string;

  constructor(workflowId: string) {
    super();
    this.workflowId = workflowId;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const sourceNodeId = params.sourceNodeId as string;
      const targetNodeId = params.targetNodeId as string;

      if (!sourceNodeId || !targetNodeId) {
        return { success: false, data: null, error: 'sourceNodeId and targetNodeId are required' };
      }

      const workflow = await service.getWorkflow(this.workflowId);
      const input = buildSaveInput(workflow);

      // Check if edge already exists
      const exists = input.edges.some(
        (e) => e.sourceNodeId === sourceNodeId && e.targetNodeId === targetNodeId
      );
      if (exists) {
        return {
          success: true,
          data: { message: 'Edge already exists', sourceNodeId, targetNodeId },
        };
      }

      input.edges.push({
        sourceNodeId,
        targetNodeId,
        sourceHandle: params.sourceHandle as string | undefined,
      });
      await service.saveWorkflow(this.workflowId, input);

      return {
        success: true,
        data: { connected: true, sourceNodeId, targetNodeId },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_connect_nodes failed', { workflowId: this.workflowId, error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

class WfDisconnectNodesTool extends Tool {
  name = 'wf_disconnect_nodes';
  description = 'Remove the edge between two nodes.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      sourceNodeId: { type: 'string', description: 'Source node ID' },
      targetNodeId: { type: 'string', description: 'Target node ID' },
    },
    required: ['sourceNodeId', 'targetNodeId'],
  };
  private workflowId: string;

  constructor(workflowId: string) {
    super();
    this.workflowId = workflowId;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const sourceNodeId = params.sourceNodeId as string;
      const targetNodeId = params.targetNodeId as string;

      if (!sourceNodeId || !targetNodeId) {
        return { success: false, data: null, error: 'sourceNodeId and targetNodeId are required' };
      }

      const workflow = await service.getWorkflow(this.workflowId);
      const input = buildSaveInput(workflow);
      const beforeCount = input.edges.length;
      input.edges = input.edges.filter(
        (e) => !(e.sourceNodeId === sourceNodeId && e.targetNodeId === targetNodeId)
      );

      if (input.edges.length === beforeCount) {
        return {
          success: true,
          data: { message: 'Edge not found', sourceNodeId, targetNodeId },
        };
      }

      await service.saveWorkflow(this.workflowId, input);

      return {
        success: true,
        data: { disconnected: true, sourceNodeId, targetNodeId },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_disconnect_nodes failed', { workflowId: this.workflowId, error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

class WfGetUpstreamTool extends Tool {
  name = 'wf_get_upstream';
  description = 'Get all upstream nodes (dependencies) for a given node, in topological order.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node ID to find upstream dependencies for' },
    },
    required: ['nodeId'],
  };
  private workflowId: string;

  constructor(workflowId: string) {
    super();
    this.workflowId = workflowId;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const nodeId = params.nodeId as string;

      if (!nodeId || typeof nodeId !== 'string') {
        return { success: false, data: null, error: 'nodeId is required' };
      }

      const workflow = await repository.findWorkflowById(this.workflowId);
      if (!workflow) {
        return { success: false, data: null, error: 'Workflow not found' };
      }

      const upstreamIds = getUpstreamNodes(nodeId, workflow.nodes, workflow.edges);
      const idToNode = new Map(workflow.nodes.map((n) => [n.id, n]));

      return {
        success: true,
        data: upstreamIds.map((id) => ({
          id,
          name: idToNode.get(id)?.name ?? id,
          type: idToNode.get(id)?.type,
        })),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_get_upstream failed', { workflowId: this.workflowId, error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

class WfGetDownstreamTool extends Tool {
  name = 'wf_get_downstream';
  description = 'Get all downstream nodes (dependents) for a given node, in topological order.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node ID to find downstream dependents for' },
    },
    required: ['nodeId'],
  };
  private workflowId: string;

  constructor(workflowId: string) {
    super();
    this.workflowId = workflowId;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const nodeId = params.nodeId as string;

      if (!nodeId || typeof nodeId !== 'string') {
        return { success: false, data: null, error: 'nodeId is required' };
      }

      const workflow = await repository.findWorkflowById(this.workflowId);
      if (!workflow) {
        return { success: false, data: null, error: 'Workflow not found' };
      }

      const downstreamIds = getDownstreamNodes(nodeId, workflow.nodes, workflow.edges);
      const idToNode = new Map(workflow.nodes.map((n) => [n.id, n]));

      return {
        success: true,
        data: downstreamIds.map((id) => ({
          id,
          name: idToNode.get(id)?.name ?? id,
          type: idToNode.get(id)?.type,
        })),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_get_downstream failed', { workflowId: this.workflowId, error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

class WfExecuteTool extends Tool {
  name = 'wf_execute';
  description = 'Execute the entire workflow and return run results.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      params: {
        type: 'object',
        description: 'Optional runtime parameters to pass to the workflow',
        properties: {},
        required: [],
      },
    },
    required: [],
  };
  private workflowId: string;
  private onProgress?: (event: WsWorkflowEvent) => void;

  constructor(workflowId: string, onProgress?: (event: WsWorkflowEvent) => void) {
    super();
    this.workflowId = workflowId;
    this.onProgress = onProgress;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const runParams = (params.params ?? undefined) as Record<string, string> | undefined;
      const handle = await executionEngine.executeWorkflow(this.workflowId, runParams);
      if (this.onProgress) {
        executionEngine.registerProgressCallback(handle.runId, this.onProgress);
      }
      try {
        const runDetail = await handle.promise;
        return { success: true, data: sanitizeForLlm(runDetail) };
      } finally {
        executionEngine.unregisterProgressCallback(handle.runId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_execute failed', { workflowId: this.workflowId, error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

export class WfExecuteNodeTool extends Tool {
  name = 'wf_execute_node';
  description =
    'Execute a single workflow node. Without mockInputs: runs this node and all upstream dependencies. With mockInputs: runs ONLY this node using the provided mock data, skipping upstream execution. Use mockInputs for debugging/testing a node in isolation.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Node ID to execute' },
      params: {
        type: 'object',
        description: 'Optional runtime parameters to pass to the execution',
        properties: {},
        required: [],
      },
      mockInputs: {
        type: 'object',
        description:
          'Mock upstream outputs keyed by outputVariable name. When provided, only the target node runs using these as resolved upstream data. Example: {"query_result": {"csvPath": "/path/to/test.csv", "totalRows": 50}}',
        properties: {},
        required: [],
      },
    },
    required: ['nodeId'],
  };
  private accessor: WorkflowAccessor;
  private onProgress?: (event: WsWorkflowEvent) => void;

  constructor(accessor: WorkflowAccessor, onProgress?: (event: WsWorkflowEvent) => void) {
    super();
    this.accessor = accessor;
    this.onProgress = onProgress;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const nodeId = params.nodeId as string;
      const mockInputs = (params.mockInputs ?? undefined) as Record<string, unknown> | undefined;

      if (!nodeId || typeof nodeId !== 'string') {
        return { success: false, data: null, error: 'nodeId is required' };
      }

      const { runId } = await this.accessor.executeNode(nodeId, {
        mockInputs,
        onProgress: this.onProgress,
      });
      const runResult = await this.accessor.getRunResult(runId);
      return { success: true, data: sanitizeForLlm(runResult) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_execute_node failed', { workflowId: this.accessor.workflowId, error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

export class WfGetRunResultTool extends Tool {
  name = 'wf_get_run_result';
  description = 'Get detailed results of a previous workflow run.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      runId: { type: 'string', description: 'Run ID to fetch results for' },
    },
    required: ['runId'],
  };
  private accessor: WorkflowAccessor;

  constructor(accessor: WorkflowAccessor) {
    super();
    this.accessor = accessor;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const runId = params.runId as string;

      if (!runId || typeof runId !== 'string') {
        return { success: false, data: null, error: 'runId is required' };
      }

      const runDetail = await this.accessor.getRunResult(runId);
      return { success: true, data: sanitizeForLlm(runDetail) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_get_run_result failed', {
        workflowId: this.accessor.workflowId,
        error: msg,
      });
      return { success: false, data: null, error: msg };
    }
  }
}

export class WfReplaceNodeTool extends Tool {
  name = 'wf_replace_node';
  description =
    'Replace a node with a different type. Keeps the node ID, name, and position but resets the type and config to defaults for the new type, then merges any provided config overrides.';
  parameters: JSONSchemaObject;
  private accessor: WorkflowAccessor;

  constructor(accessor: WorkflowAccessor, allowedTypes?: string[]) {
    super();
    this.accessor = accessor;
    const types = allowedTypes ?? ['sql', 'python', 'llm', 'email', 'branch', 'web_search'];
    this.parameters = {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node ID to replace' },
        type: {
          type: 'string',
          enum: types,
          description: 'New node type',
        },
        config: {
          type: 'object',
          description: 'Optional partial config to merge on top of the new type defaults',
          properties: {},
          required: [],
        },
      },
      required: ['nodeId', 'type'],
    };
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const nodeId = params.nodeId as string;
      const newType = params.type as WorkflowNodeTypeValue;
      const configOverride = (params.config ?? {}) as Record<string, unknown>;

      if (!nodeId || typeof nodeId !== 'string') {
        return { success: false, data: null, error: 'nodeId is required' };
      }

      const workflow = await this.accessor.getWorkflow();
      const node = workflow.nodes.find((n) => n.id === nodeId);
      if (!node) {
        return { success: false, data: null, error: `Node '${nodeId}' not found` };
      }

      if (node.type === newType) {
        return {
          success: false,
          data: null,
          error: `Node is already of type '${newType}'. Use wf_update_node to modify its config.`,
        };
      }

      const newConfig = {
        ...buildDefaultConfig(newType),
        ...configOverride,
        nodeType: newType,
      } as NodeConfig;
      await this.accessor.updateNode(nodeId, { type: newType, config: newConfig });

      return {
        success: true,
        data: {
          id: node.id,
          name: node.name,
          type: newType,
          config: newConfig,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_replace_node failed', {
        workflowId: this.accessor.workflowId,
        error: msg,
      });
      return { success: false, data: null, error: msg };
    }
  }
}

// ── Scoped file tool subclasses ───────────────────────────

export class ScopedGlobTool extends Tool {
  name = 'scoped_glob';
  description =
    'Find files matching a glob pattern within allowed directories (data dictionary, knowledge folder, or uploads).';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern to match (e.g., **/*.md)' },
      path: {
        type: 'string',
        description: `Directory to search in. Must be under ${config.data_dictionary_folder}, ${config.knowledge_folder}, or ${config.upload.directory}. Defaults to data dictionary folder.`,
      },
    },
    required: ['pattern'],
  };
  private globTool = new GlobTool();

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const path = (params.path as string | undefined) ?? config.data_dictionary_folder;

      if (!isAllowedPath(path)) {
        return pathNotAllowedError(path);
      }

      return this.globTool.execute({ pattern: params.pattern, path });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('scoped_glob failed', { error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

export class ScopedGrepTool extends Tool {
  name = 'scoped_grep';
  description =
    'Search file contents using regex within allowed directories (data dictionary, knowledge folder, or uploads).';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regular expression to search for' },
      path: {
        type: 'string',
        description: `Directory to search in. Must be under ${config.data_dictionary_folder}, ${config.knowledge_folder}, or ${config.upload.directory}. Defaults to data dictionary folder.`,
      },
      include: {
        type: 'string',
        description: 'File pattern to include (e.g., *.md)',
      },
    },
    required: ['pattern'],
  };
  private grepTool = new GrepTool();

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const path = (params.path as string | undefined) ?? config.data_dictionary_folder;
      const include = params.include as string | undefined;

      if (!isAllowedPath(path)) {
        return pathNotAllowedError(path);
      }

      return this.grepTool.execute({
        pattern: params.pattern,
        path,
        ...(include ? { include } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('scoped_grep failed', { error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

export class ScopedReadFileTool extends Tool {
  name = 'scoped_read_file';
  description =
    'Read a file within allowed directories (data dictionary, knowledge folder, or uploads).';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: `Absolute path to the file to read. Must be under ${config.data_dictionary_folder}, ${config.knowledge_folder}, or ${config.upload.directory}.`,
      },
      offset: {
        type: 'number',
        description: 'Optional: 0-based line number to start reading from',
      },
      limit: {
        type: 'number',
        description: 'Optional: Maximum number of lines to read',
      },
    },
    required: ['file_path'],
  };
  private readFileTool = new ReadFileTool();

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const filePath = params.file_path as string;

      if (!filePath || typeof filePath !== 'string') {
        return { success: false, data: null, error: 'file_path is required' };
      }

      if (!isAllowedPath(filePath)) {
        return pathNotAllowedError(filePath);
      }

      const offset = params.offset as number | undefined;
      const limit = params.limit as number | undefined;

      return this.readFileTool.execute({
        absolute_path: filePath,
        ...(offset !== undefined ? { offset } : {}),
        ...(limit !== undefined ? { limit } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('scoped_read_file failed', { error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

// ── Web search and SQL tool wrappers ─────────────────────

class CopilotWebSearchTool extends Tool {
  name = 'web_search';
  description = 'Search the web for information.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  };
  private webSearch = new WebSearch();

  async execute(params: ToolParams): Promise<ToolResult> {
    return this.webSearch.execute(params);
  }
}

class CopilotSqlTool extends Tool {
  name = 'sql';
  description =
    'Execute SQL on a data source using a config file. Useful for exploring data source schema and data.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description: 'SQL query to execute (SELECT/WITH, must include LIMIT clause)',
      },
      conf_file: {
        type: 'string',
        description: 'Absolute path to the data source configuration file',
      },
      output_csv: {
        type: 'string',
        description:
          'Absolute file path for the CSV output of query results. Must be under the work folder directory.',
      },
    },
    required: ['sql', 'conf_file', 'output_csv'],
  };
  private sqlTool = new SqlTool();

  async execute(params: ToolParams): Promise<ToolResult> {
    return this.sqlTool.execute(params);
  }
}

// ── Custom node template search tool ─────────────────────

export class WfSearchCustomNodesTool extends Tool {
  name = 'wf_search_custom_nodes';
  description =
    'Search saved custom node templates by name or description. Returns up to 20 matches.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex pattern or keyword to search in template name and description',
      },
    },
    required: ['pattern'],
  };

  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      const pattern = params.pattern as string;
      if (!pattern || typeof pattern !== 'string') {
        return { success: false, data: null, error: 'pattern is required' };
      }

      const templates = await templateRepository.findAllTemplates();

      let matcher: (text: string) => boolean;
      try {
        const regex = new RegExp(pattern, 'i');
        matcher = (text: string) => regex.test(text);
      } catch {
        // Invalid regex — fall back to case-insensitive substring match
        const lower = pattern.toLowerCase();
        matcher = (text: string) => text.toLowerCase().includes(lower);
      }

      const results = templates
        .filter((t) => matcher(t.name) || matcher(t.description ?? ''))
        .slice(0, 20)
        .map((t) => ({ id: t.id, name: t.name, description: t.description, type: t.type }));

      return { success: true, data: results };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('wf_search_custom_nodes failed', { error: msg });
      return { success: false, data: null, error: msg };
    }
  }
}

// ── Factory function ──────────────────────────────────────

export function createCopilotToolRegistry(
  workflowId: string,
  onProgress?: (event: WsWorkflowEvent) => void,
  configStatus?: ConfigStatusResponse
): ToolRegistryClass {
  const registry = new ToolRegistryClass();
  const accessor = new DbWorkflowAccessor(workflowId);

  // Build allowed node types based on config status
  const allTypes = ['sql', 'python', 'llm', 'email', 'branch', 'web_search'];
  const allowedTypes = configStatus
    ? allTypes.filter((t) => {
        if (t === 'llm') return configStatus.llm;
        if (t === 'email') return configStatus.smtp;
        if (t === 'web_search') return configStatus.webSearch;
        return true;
      })
    : allTypes;

  registry.register(new WfGetSummaryTool(workflowId));
  registry.register(new WfAddNodeTool(workflowId, allowedTypes));
  registry.register(new WfUpdateNodeTool(accessor));
  registry.register(new WfPatchNodeTool(accessor));
  registry.register(new WfDeleteNodeTool(workflowId));
  registry.register(new WfGetNodeTool(accessor));
  registry.register(new WfConnectNodesTool(workflowId));
  registry.register(new WfDisconnectNodesTool(workflowId));
  registry.register(new WfGetUpstreamTool(workflowId));
  registry.register(new WfGetDownstreamTool(workflowId));
  registry.register(new WfExecuteTool(workflowId, onProgress));
  registry.register(new WfExecuteNodeTool(accessor, onProgress));
  registry.register(new WfGetRunResultTool(accessor));
  registry.register(new ScopedGlobTool());
  registry.register(new ScopedGrepTool());
  registry.register(new ScopedReadFileTool());
  if (!configStatus || configStatus.webSearch) {
    registry.register(new CopilotWebSearchTool());
  }
  registry.register(new CopilotSqlTool());
  registry.register(new TodosWriter());
  registry.register(new WfSearchCustomNodesTool());

  return registry;
}
