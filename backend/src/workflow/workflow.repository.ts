import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../infrastructure/database';
import {
  WorkflowListItem,
  WorkflowDetail,
  WorkflowNodeInfo,
  WorkflowEdgeInfo,
  WorkflowRunInfo,
  WorkflowRunDetail,
  WorkflowNodeRunInfo,
  NodeConfig,
  SaveWorkflowInput,
  RunStatusValue,
  WorkflowNodeTypeValue,
  ExportedWorkflow,
  ExportedWorkflowNode,
  ExportedWorkflowEdge,
  ListRunsFilter,
  ListRunsPage,
} from './workflow.types';

// ── Prisma payload types ──────────────────────────────────
type PrismaWorkflowWithRelations = Prisma.WorkflowGetPayload<{
  include: { nodes: true; edges: true };
}>;
type PrismaWorkflowNode = Prisma.WorkflowNodeGetPayload<object>;
type PrismaWorkflowEdge = Prisma.WorkflowEdgeGetPayload<object>;
type PrismaWorkflowRun = Prisma.WorkflowRunGetPayload<object>;
type PrismaWorkflowNodeRun = Prisma.WorkflowNodeRunGetPayload<object>;
type PrismaWorkflowForList = Prisma.WorkflowGetPayload<{
  include: {
    nodes: { select: { id: true } };
    runs: { select: { startedAt: true; status: true } };
    creator: { select: { username: true } };
  };
}>;
type PrismaNodeRunWithNode = Prisma.WorkflowNodeRunGetPayload<{
  include: { node: { select: { name: true; type: true } } };
}>;

// ── Mappers ───────────────────────────────────────────────
function parseNodeConfig(config: string): NodeConfig {
  try {
    return JSON.parse(config) as NodeConfig;
  } catch {
    // Return a safe default if stored config is malformed
    return { nodeType: 'sql', datasourceId: '', params: {}, sql: '', outputVariable: 'result' };
  }
}

function mapNodeInfo(node: PrismaWorkflowNode): WorkflowNodeInfo {
  return {
    id: node.id,
    workflowId: node.workflowId,
    name: node.name,
    description: node.description,
    type: node.type as WorkflowNodeTypeValue,
    config: parseNodeConfig(node.config),
    positionX: node.positionX,
    positionY: node.positionY,
  };
}

function mapEdgeInfo(edge: PrismaWorkflowEdge): WorkflowEdgeInfo {
  return {
    id: edge.id,
    workflowId: edge.workflowId,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    sourceHandle: edge.sourceHandle ?? undefined,
  };
}

function mapWorkflowDetail(wf: PrismaWorkflowWithRelations): WorkflowDetail {
  return {
    id: wf.id,
    name: wf.name,
    description: wf.description,
    nodes: wf.nodes.map(mapNodeInfo),
    edges: wf.edges.map(mapEdgeInfo),
    createdAt: wf.createdAt,
    updatedAt: wf.updatedAt,
  };
}

function mapWorkflowListItem(wf: PrismaWorkflowForList): WorkflowListItem {
  const lastRun = wf.runs.length > 0 ? wf.runs[0] : null;
  return {
    id: wf.id,
    name: wf.name,
    description: wf.description,
    nodeCount: wf.nodes.length,
    lastRunAt: lastRun?.startedAt ?? null,
    lastRunStatus: (lastRun?.status as RunStatusValue) ?? null,
    createdAt: wf.createdAt,
    updatedAt: wf.updatedAt,
    creatorName: wf.creator?.username ?? null,
  };
}

function mapRunInfo(run: PrismaWorkflowRun): WorkflowRunInfo {
  return {
    id: run.id,
    workflowId: run.workflowId,
    status: run.status as RunStatusValue,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    errorMessage: run.errorMessage,
  };
}

function parseJsonField(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mapNodeRunInfo(nr: PrismaWorkflowNodeRun): WorkflowNodeRunInfo {
  return {
    id: nr.id,
    runId: nr.runId,
    nodeId: nr.nodeId,
    status: nr.status as RunStatusValue,
    inputs: parseJsonField(nr.inputs),
    outputs: parseJsonField(nr.outputs),
    errorMessage: nr.errorMessage,
    startedAt: nr.startedAt,
    completedAt: nr.completedAt,
  };
}

function mapNodeRunInfoWithNode(nr: PrismaNodeRunWithNode): WorkflowNodeRunInfo {
  return {
    ...mapNodeRunInfo(nr),
    nodeName: nr.node.name,
    nodeType: nr.node.type,
  };
}

// ── Workflow CRUD ─────────────────────────────────────────
export async function createWorkflow(
  name: string,
  description?: string,
  createdBy?: string
): Promise<WorkflowDetail> {
  const prisma = getPrismaClient();
  const wf = await prisma.workflow.create({
    data: { name, description: description ?? null, createdBy: createdBy ?? null },
    include: { nodes: true, edges: true },
  });
  return mapWorkflowDetail(wf);
}

export async function findWorkflowById(id: string): Promise<WorkflowDetail | null> {
  const prisma = getPrismaClient();
  const wf = await prisma.workflow.findUnique({
    where: { id },
    include: { nodes: true, edges: true },
  });
  return wf ? mapWorkflowDetail(wf) : null;
}

export async function findAllWorkflows(): Promise<WorkflowListItem[]> {
  const prisma = getPrismaClient();
  const workflows = await prisma.workflow.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      nodes: { select: { id: true } },
      runs: { select: { startedAt: true, status: true }, orderBy: { startedAt: 'desc' }, take: 1 },
      creator: { select: { username: true } },
    },
  });
  return workflows.map(mapWorkflowListItem);
}

export async function findAllWorkflowNames(): Promise<string[]> {
  const prisma = getPrismaClient();
  const workflows = await prisma.workflow.findMany({
    select: { name: true },
  });
  return workflows.map((w) => w.name);
}

export async function deleteWorkflow(id: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.workflow.delete({ where: { id } });
}

export async function cloneWorkflow(sourceId: string, newName: string): Promise<WorkflowListItem> {
  const prisma = getPrismaClient();

  const source = await prisma.workflow.findUnique({
    where: { id: sourceId },
    include: { nodes: true, edges: true },
  });
  if (!source) {
    throw new Error('Source workflow not found');
  }

  // Build node ID mapping: oldId → newId (generated by Prisma)
  const nodeIdMap = new Map<string, string>();

  const result = await prisma.$transaction(async (tx) => {
    // Create new workflow
    const newWf = await tx.workflow.create({
      data: { name: newName, description: source.description },
    });

    // Clone nodes
    for (const node of source.nodes) {
      const newNode = await tx.workflowNode.create({
        data: {
          workflowId: newWf.id,
          name: node.name,
          description: node.description,
          type: node.type,
          config: node.config,
          positionX: node.positionX,
          positionY: node.positionY,
        },
      });
      nodeIdMap.set(node.id, newNode.id);
    }

    // Clone edges with mapped IDs
    for (const edge of source.edges) {
      const newSourceId = nodeIdMap.get(edge.sourceNodeId);
      const newTargetId = nodeIdMap.get(edge.targetNodeId);
      if (newSourceId && newTargetId) {
        await tx.workflowEdge.create({
          data: {
            workflowId: newWf.id,
            sourceNodeId: newSourceId,
            targetNodeId: newTargetId,
            sourceHandle: edge.sourceHandle ?? null,
          },
        });
      }
    }

    // Fetch the new workflow for list item mapping
    return tx.workflow.findUniqueOrThrow({
      where: { id: newWf.id },
      include: {
        nodes: { select: { id: true } },
        runs: {
          select: { startedAt: true, status: true },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
        creator: { select: { username: true } },
      },
    });
  });

  return mapWorkflowListItem(result);
}

export async function exportWorkflow(id: string): Promise<ExportedWorkflow | null> {
  const prisma = getPrismaClient();
  const wf = await prisma.workflow.findUnique({
    where: { id },
    include: { nodes: true, edges: true },
  });
  if (!wf) return null;

  const nodeNameMap = new Map<string, string>();
  for (const node of wf.nodes) {
    nodeNameMap.set(node.id, node.name);
  }

  const nodes: ExportedWorkflowNode[] = wf.nodes.map((n) => ({
    name: n.name,
    description: n.description,
    type: n.type as WorkflowNodeTypeValue,
    config: parseNodeConfig(n.config),
    positionX: n.positionX,
    positionY: n.positionY,
  }));

  const edges: ExportedWorkflowEdge[] = wf.edges
    .map((e): ExportedWorkflowEdge | null => {
      const sourceName = nodeNameMap.get(e.sourceNodeId);
      const targetName = nodeNameMap.get(e.targetNodeId);
      if (!sourceName || !targetName) return null;
      return {
        sourceNodeName: sourceName,
        targetNodeName: targetName,
        sourceHandle: e.sourceHandle ?? undefined,
      };
    })
    .filter((e): e is ExportedWorkflowEdge => e !== null);

  return {
    name: wf.name,
    description: wf.description,
    nodes,
    edges,
  };
}

/**
 * Batch save: update workflow metadata + replace all nodes and edges in a transaction.
 */
export async function saveWorkflow(id: string, input: SaveWorkflowInput): Promise<WorkflowDetail> {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    // Update workflow metadata
    await tx.workflow.update({
      where: { id },
      data: { name: input.name, description: input.description ?? null },
    });

    // Get existing nodes to determine creates/updates/deletes
    const existingNodes = await tx.workflowNode.findMany({ where: { workflowId: id } });
    const existingNodeIds = new Set(existingNodes.map((n) => n.id));

    // Track tempId -> real ID mapping for new nodes
    const tempIdMap = new Map<string, string>();
    const inputNodeIds = new Set<string>();

    // Process nodes: create new, update existing
    for (const node of input.nodes) {
      if (node.id && existingNodeIds.has(node.id)) {
        // Update existing node
        await tx.workflowNode.update({
          where: { id: node.id },
          data: {
            name: node.name,
            description: node.description ?? null,
            type: node.type,
            config: JSON.stringify(node.config),
            positionX: node.positionX,
            positionY: node.positionY,
          },
        });
        inputNodeIds.add(node.id);
      } else {
        // Create new node
        const created = await tx.workflowNode.create({
          data: {
            workflowId: id,
            name: node.name,
            description: node.description ?? null,
            type: node.type,
            config: JSON.stringify(node.config),
            positionX: node.positionX,
            positionY: node.positionY,
          },
        });
        inputNodeIds.add(created.id);
        if (node.tempId) {
          tempIdMap.set(node.tempId, created.id);
        }
        if (node.id) {
          tempIdMap.set(node.id, created.id);
        }
      }
    }

    // Replace all edges: delete existing, then create new
    await tx.workflowEdge.deleteMany({ where: { workflowId: id } });

    // Delete nodes that were removed (edges already cleared above)
    const nodesToDelete = existingNodes.filter((n) => !inputNodeIds.has(n.id));
    if (nodesToDelete.length > 0) {
      await tx.workflowNode.deleteMany({
        where: { id: { in: nodesToDelete.map((n) => n.id) } },
      });
    }

    for (const edge of input.edges) {
      const sourceId = resolveNodeId(edge.sourceNodeId, tempIdMap);
      const targetId = resolveNodeId(edge.targetNodeId, tempIdMap);
      await tx.workflowEdge.create({
        data: {
          workflowId: id,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          sourceHandle: edge.sourceHandle ?? null,
        },
      });
    }

    // Return updated workflow
    const updated = await tx.workflow.findUniqueOrThrow({
      where: { id },
      include: { nodes: true, edges: true },
    });
    return mapWorkflowDetail(updated);
  });
}

function resolveNodeId(nodeId: string, tempIdMap: Map<string, string>): string {
  return tempIdMap.get(nodeId) ?? nodeId;
}

// ── Run CRUD ──────────────────────────────────────────────
export async function createRun(
  workflowId: string,
  status: RunStatusValue,
  workFolder: string
): Promise<WorkflowRunInfo> {
  const prisma = getPrismaClient();
  const run = await prisma.workflowRun.create({
    data: { workflowId, status, workFolder },
  });
  return mapRunInfo(run);
}

export async function updateRunStatus(
  runId: string,
  status: RunStatusValue,
  errorMessage?: string
): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status,
      errorMessage: errorMessage ?? null,
      completedAt: ['completed', 'failed', 'cancelled'].includes(status) ? new Date() : undefined,
    },
  });
}

export async function findRunsByWorkflowId(
  workflowId: string,
  filter: ListRunsFilter
): Promise<ListRunsPage> {
  const prisma = getPrismaClient();

  const where: Prisma.WorkflowRunWhereInput = { workflowId };
  if (filter.status) {
    where.status = filter.status;
  }
  if (filter.startFrom || filter.startTo) {
    where.startedAt = {};
    if (filter.startFrom) {
      where.startedAt.gte = filter.startFrom;
    }
    if (filter.startTo) {
      where.startedAt.lte = filter.startTo;
    }
  }

  const [runs, total] = await Promise.all([
    prisma.workflowRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    }),
    prisma.workflowRun.count({ where }),
  ]);

  return {
    runs: runs.map(mapRunInfo),
    total,
    page: filter.page,
    pageSize: filter.pageSize,
  };
}

export async function findRunById(runId: string): Promise<WorkflowRunDetail | null> {
  const prisma = getPrismaClient();
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: { nodeRuns: { include: { node: { select: { name: true, type: true } } } } },
  });
  if (!run) return null;
  return {
    ...mapRunInfo(run),
    nodeRuns: run.nodeRuns.map(mapNodeRunInfoWithNode),
  };
}

export async function createNodeRun(
  runId: string,
  nodeId: string,
  status: RunStatusValue
): Promise<WorkflowNodeRunInfo> {
  const prisma = getPrismaClient();
  const nr = await prisma.workflowNodeRun.create({
    data: { runId, nodeId, status },
  });
  return mapNodeRunInfo(nr);
}

export async function createNodeRunsBatch(
  runId: string,
  nodeIds: string[],
  status: RunStatusValue
): Promise<WorkflowNodeRunInfo[]> {
  const prisma = getPrismaClient();
  await prisma.workflowNodeRun.createMany({
    data: nodeIds.map((nodeId) => ({ runId, nodeId, status })),
  });
  // Fetch back the created records to get their IDs
  const created = await prisma.workflowNodeRun.findMany({
    where: { runId, nodeId: { in: nodeIds } },
  });
  return created.map(mapNodeRunInfo);
}

export async function updateNodeRun(
  nodeRunId: string,
  data: {
    status: RunStatusValue;
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    errorMessage?: string;
    startedAt?: Date;
    completedAt?: Date;
  }
): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.workflowNodeRun.update({
    where: { id: nodeRunId },
    data: {
      status: data.status,
      inputs: data.inputs ? JSON.stringify(data.inputs) : undefined,
      outputs: data.outputs ? JSON.stringify(data.outputs) : undefined,
      errorMessage: data.errorMessage ?? undefined,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
    },
  });
}

export async function findNodeRunsByRunId(runId: string): Promise<WorkflowNodeRunInfo[]> {
  const prisma = getPrismaClient();
  const nodeRuns = await prisma.workflowNodeRun.findMany({
    where: { runId },
  });
  return nodeRuns.map(mapNodeRunInfo);
}

export async function bulkUpdateNodeRunStatus(
  nodeRunIds: string[],
  status: RunStatusValue
): Promise<void> {
  if (nodeRunIds.length === 0) return;
  const prisma = getPrismaClient();
  await prisma.workflowNodeRun.updateMany({
    where: { id: { in: nodeRunIds } },
    data: { status },
  });
}

// ── Cleanup Helpers ───────────────────────────────────────
export async function getRunWorkFolder(runId: string): Promise<string | null> {
  const prisma = getPrismaClient();
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    select: { workFolder: true },
  });
  return run?.workFolder ?? null;
}

export async function findLatestSuccessfulNodeRunOutput(
  nodeId: string
): Promise<Record<string, unknown> | null> {
  const prisma = getPrismaClient();
  const nodeRun = await prisma.workflowNodeRun.findFirst({
    where: { nodeId, status: 'completed' },
    orderBy: { completedAt: 'desc' },
  });
  if (!nodeRun?.outputs) return null;
  return parseJsonField(nodeRun.outputs);
}

export async function findOldCompletedRuns(cutoffDate: Date): Promise<WorkflowRunInfo[]> {
  const prisma = getPrismaClient();
  const runs = await prisma.workflowRun.findMany({
    where: {
      status: { in: ['completed', 'failed', 'cancelled'] },
      startedAt: { lt: cutoffDate },
    },
  });
  return runs.map(mapRunInfo);
}
