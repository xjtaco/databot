import { WorkflowCycleDetectedError } from '../errors/types';

interface DagNode {
  id: string;
}

interface DagEdge {
  sourceNodeId: string;
  targetNodeId: string;
}

/**
 * Validates that the given nodes and edges form a valid DAG (no cycles).
 * Throws WorkflowCycleDetectedError if a cycle is detected.
 */
export function validateDag(nodes: DagNode[], edges: DagEdge[]): void {
  topologicalSort(nodes, edges);
}

/**
 * Returns node IDs in topological order using Kahn's algorithm.
 * Throws WorkflowCycleDetectedError if a cycle is detected.
 */
export function topologicalSort(nodes: DagNode[], edges: DagEdge[]): string[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      continue;
    }
    adjacency.get(edge.sourceNodeId)!.push(edge.targetNodeId);
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== nodeIds.size) {
    throw new WorkflowCycleDetectedError(
      'Workflow contains a cycle. Nodes must form a directed acyclic graph.'
    );
  }

  return sorted;
}

/**
 * Returns the given node and all its downstream dependents in topological order.
 */
export function getDownstreamNodes(nodeId: string, nodes: DagNode[], edges: DagEdge[]): string[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  if (!nodeIds.has(nodeId)) {
    return [];
  }

  // Build forward adjacency: source -> targets
  const forwardAdj = new Map<string, string[]>();
  for (const id of nodeIds) {
    forwardAdj.set(id, []);
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      continue;
    }
    forwardAdj.get(edge.sourceNodeId)!.push(edge.targetNodeId);
  }

  // BFS from nodeId following forward edges
  const visited = new Set<string>();
  const queue: string[] = [nodeId];
  visited.add(nodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of forwardAdj.get(current) ?? []) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push(child);
      }
    }
  }

  // Build subgraph and topological sort it
  const subNodes = nodes.filter((n) => visited.has(n.id));
  const subEdges = edges.filter((e) => visited.has(e.sourceNodeId) && visited.has(e.targetNodeId));

  return topologicalSort(subNodes, subEdges);
}

/**
 * Returns all upstream node IDs for the given node (including itself) in topological order.
 * The target node is always last in the returned array.
 */
export function getUpstreamNodes(nodeId: string, nodes: DagNode[], edges: DagEdge[]): string[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  if (!nodeIds.has(nodeId)) {
    return [];
  }

  // Build reverse adjacency: target -> sources
  const reverseAdj = new Map<string, string[]>();
  for (const id of nodeIds) {
    reverseAdj.set(id, []);
  }
  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      continue;
    }
    reverseAdj.get(edge.targetNodeId)!.push(edge.sourceNodeId);
  }

  // BFS from nodeId following reverse edges
  const visited = new Set<string>();
  const queue: string[] = [nodeId];
  visited.add(nodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const parent of reverseAdj.get(current) ?? []) {
      if (!visited.has(parent)) {
        visited.add(parent);
        queue.push(parent);
      }
    }
  }

  // Build subgraph and topological sort it
  const subNodes = nodes.filter((n) => visited.has(n.id));
  const subEdges = edges.filter((e) => visited.has(e.sourceNodeId) && visited.has(e.targetNodeId));

  return topologicalSort(subNodes, subEdges);
}
