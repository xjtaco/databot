import {
  WorkflowNotFoundError,
  WorkflowValidationError,
  WorkflowCloneError,
} from '../errors/types';
import logger from '../utils/logger';
import * as repository from './workflow.repository';
import { validateDag } from './dagValidator';
import { autoLayout, validateAutoLayout } from './layout/autoLayout';
import {
  WorkflowListItem,
  WorkflowDetail,
  SaveWorkflowInput,
  WorkflowRunDetail,
  ExportedWorkflow,
  ImportWorkflowResult,
  isValidNodeType,
  ListRunsFilter,
  ListRunsPage,
} from './workflow.types';

export async function createWorkflow(
  name: string,
  description?: string,
  createdBy?: string
): Promise<WorkflowDetail> {
  validateWorkflowName(name);
  const workflow = await repository.createWorkflow(name, description, createdBy);
  logger.info('Created workflow', { workflowId: workflow.id, name });
  return workflow;
}

export async function listWorkflows(): Promise<WorkflowListItem[]> {
  return repository.findAllWorkflows();
}

export async function getWorkflow(id: string): Promise<WorkflowDetail> {
  const workflow = await repository.findWorkflowById(id);
  if (!workflow) {
    throw new WorkflowNotFoundError('Workflow not found');
  }
  return workflow;
}

export async function saveWorkflow(id: string, input: SaveWorkflowInput): Promise<WorkflowDetail> {
  // Validate workflow exists
  const existing = await repository.findWorkflowById(id);
  if (!existing) {
    throw new WorkflowNotFoundError('Workflow not found');
  }

  // Validate name
  validateWorkflowName(input.name);

  // Validate node types
  for (const node of input.nodes) {
    if (!isValidNodeType(node.type)) {
      throw new WorkflowValidationError(`Invalid node type: ${node.type}`);
    }
  }

  // Validate unique node names
  const nodeNames = new Set<string>();
  for (const node of input.nodes) {
    if (!node.name || node.name.trim().length === 0) {
      throw new WorkflowValidationError('Node name must not be empty');
    }
    const normalizedName = node.name.trim();
    if (nodeNames.has(normalizedName)) {
      throw new WorkflowValidationError(`Duplicate node name: ${normalizedName}`);
    }
    nodeNames.add(normalizedName);
  }

  // Build temporary ID set for DAG validation
  const nodeIdSet = new Set<string>();
  for (const node of input.nodes) {
    const id_ = node.id ?? node.tempId ?? node.name;
    nodeIdSet.add(id_);
  }

  // Validate DAG (check for cycles)
  const dagNodes = input.nodes.map((n) => ({ id: n.id ?? n.tempId ?? n.name }));
  const dagEdges = input.edges.map((e) => ({
    sourceNodeId: e.sourceNodeId,
    targetNodeId: e.targetNodeId,
  }));

  // Validate edge references exist
  for (const edge of dagEdges) {
    if (!nodeIdSet.has(edge.sourceNodeId) || !nodeIdSet.has(edge.targetNodeId)) {
      throw new WorkflowValidationError('Edge references non-existent node');
    }
  }

  validateDag(dagNodes, dagEdges);

  const workflow = await repository.saveWorkflow(id, input);
  logger.info('Saved workflow', { workflowId: id, nodeCount: input.nodes.length });
  return workflow;
}

export async function reflowWorkflowLayout(id: string): Promise<WorkflowDetail> {
  const workflow = await getWorkflow(id);
  const layout = autoLayout(workflow.nodes, workflow.edges);

  if (!validateAutoLayout(layout, workflow.nodes)) {
    return workflow;
  }

  const input: SaveWorkflowInput = {
    name: workflow.name,
    description: workflow.description ?? undefined,
    nodes: workflow.nodes.map((node) => {
      const position = layout.positions.get(node.id)!;
      return {
        id: node.id,
        name: node.name,
        description: node.description ?? undefined,
        type: node.type,
        config: node.config,
        positionX: position.x,
        positionY: position.y,
      };
    }),
    edges: workflow.edges.map((edge) => ({
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      sourceHandle: edge.sourceHandle,
    })),
  };

  return saveWorkflow(id, input);
}

export async function deleteWorkflow(id: string): Promise<void> {
  const existing = await repository.findWorkflowById(id);
  if (!existing) {
    throw new WorkflowNotFoundError('Workflow not found');
  }
  await repository.deleteWorkflow(id);
  logger.info('Deleted workflow', { workflowId: id });
}

export async function cloneWorkflow(id: string, name: string): Promise<WorkflowListItem> {
  validateWorkflowName(name);
  try {
    const cloned = await repository.cloneWorkflow(id, name);
    logger.info('Cloned workflow', { sourceId: id, newId: cloned.id, name });
    return cloned;
  } catch (error) {
    if (error instanceof Error && error.message === 'Source workflow not found') {
      throw new WorkflowNotFoundError('Source workflow not found');
    }
    throw new WorkflowCloneError(
      'Failed to clone workflow',
      undefined,
      error instanceof Error ? error : undefined
    );
  }
}

export async function exportWorkflow(id: string): Promise<ExportedWorkflow> {
  const exported = await repository.exportWorkflow(id);
  if (!exported) {
    throw new WorkflowNotFoundError('Workflow not found');
  }
  return exported;
}

export async function importWorkflow(
  input: ExportedWorkflow,
  createdBy?: string
): Promise<ImportWorkflowResult> {
  // Validate name
  if (!input.name || input.name.trim().length === 0) {
    throw new WorkflowValidationError('Workflow name must not be empty');
  }

  // Validate edge references
  const nodeNames = new Set(input.nodes.map((n) => n.name));
  for (const edge of input.edges) {
    if (!nodeNames.has(edge.sourceNodeName)) {
      throw new WorkflowValidationError(
        `Edge references non-existent source node: ${edge.sourceNodeName}`
      );
    }
    if (!nodeNames.has(edge.targetNodeName)) {
      throw new WorkflowValidationError(
        `Edge references non-existent target node: ${edge.targetNodeName}`
      );
    }
  }

  // Resolve name conflicts
  const existingNames = new Set(await repository.findAllWorkflowNames());
  let finalName = input.name.trim();
  let renamed = false;
  if (existingNames.has(finalName)) {
    renamed = true;
    let suffix = 1;
    while (existingNames.has(`${input.name.trim()}(${suffix})`)) {
      suffix++;
    }
    finalName = `${input.name.trim()}(${suffix})`;
  }

  // Create empty workflow
  const created = await repository.createWorkflow(
    finalName,
    input.description ?? undefined,
    createdBy
  );

  // Convert ExportedWorkflow to SaveWorkflowInput
  // Use node names as tempIds so edges can reference them
  const saveInput: SaveWorkflowInput = {
    name: finalName,
    description: input.description ?? undefined,
    nodes: input.nodes.map((n) => ({
      tempId: n.name,
      name: n.name,
      description: n.description ?? undefined,
      type: n.type,
      config: n.config,
      positionX: n.positionX,
      positionY: n.positionY,
    })),
    edges: input.edges.map((e) => ({
      sourceNodeId: e.sourceNodeName,
      targetNodeId: e.targetNodeName,
      sourceHandle: e.sourceHandle,
    })),
  };

  // saveWorkflow validates node types, unique names, DAG, and edge references
  // If validation fails, clean up the empty workflow to avoid orphans
  try {
    await saveWorkflow(created.id, saveInput);
  } catch (err) {
    await repository.deleteWorkflow(created.id);
    throw err;
  }

  logger.info('Imported workflow', { workflowId: created.id, name: finalName, renamed });
  return { id: created.id, name: finalName, renamed };
}

export async function listRuns(workflowId: string, filter: ListRunsFilter): Promise<ListRunsPage> {
  const existing = await repository.findWorkflowById(workflowId);
  if (!existing) {
    throw new WorkflowNotFoundError('Workflow not found');
  }
  return repository.findRunsByWorkflowId(workflowId, filter);
}

export async function getRunDetail(workflowId: string, runId: string): Promise<WorkflowRunDetail> {
  const run = await repository.findRunById(runId);
  if (!run || run.workflowId !== workflowId) {
    throw new WorkflowNotFoundError('Workflow run not found');
  }
  return run;
}

function validateWorkflowName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new WorkflowValidationError('Workflow name must not be empty');
  }
  if (name.trim().length > 255) {
    throw new WorkflowValidationError('Workflow name must not exceed 255 characters');
  }
}
