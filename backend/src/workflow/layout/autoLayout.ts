import type { WorkflowLayoutPosition, WorkflowLayoutResult } from '../workflow.types';

export const START_X = 0;
export const START_Y = 0;
export const NODE_GAP = 220;
export const LAYER_GAP = 220;

interface LayoutNode {
  id: string;
}

interface LayoutEdge {
  sourceNodeId: string;
  targetNodeId: string;
}

export function autoLayout(nodes: LayoutNode[], edges: LayoutEdge[]): WorkflowLayoutResult {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const parentsByNode = new Map<string, string[]>();

  for (const node of nodes) {
    parentsByNode.set(node.id, []);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      continue;
    }
    parentsByNode.get(edge.targetNodeId)!.push(edge.sourceNodeId);
  }

  const depthByNode = new Map<string, number>();
  const visiting = new Set<string>();

  const getDepth = (nodeId: string): number => {
    const cached = depthByNode.get(nodeId);
    if (cached !== undefined) {
      return cached;
    }

    if (visiting.has(nodeId)) {
      throw new Error('autoLayout requires an acyclic graph');
    }

    visiting.add(nodeId);
    const parents = parentsByNode.get(nodeId) ?? [];
    let depth = 0;

    if (parents.length > 0) {
      depth = Math.max(...parents.map((parentId) => getDepth(parentId))) + 1;
    }

    visiting.delete(nodeId);
    depthByNode.set(nodeId, depth);
    return depth;
  };

  for (const node of nodes) {
    getDepth(node.id);
  }

  const layers = new Map<number, string[]>();
  for (const node of nodes) {
    const depth = depthByNode.get(node.id) ?? 0;
    const layer = layers.get(depth) ?? [];
    layer.push(node.id);
    layers.set(depth, layer);
  }

  const positions = new Map<string, WorkflowLayoutPosition>();
  const sortedDepths = [...layers.keys()].sort((a, b) => a - b);

  for (const depth of sortedDepths) {
    const layer = (layers.get(depth) ?? []).slice().sort((a, b) => a.localeCompare(b));
    const y = START_Y + depth * LAYER_GAP;
    const centerOffset = (layer.length - 1) / 2;

    for (let index = 0; index < layer.length; index += 1) {
      const id = layer[index];
      const x = START_X + (index - centerOffset) * NODE_GAP;
      positions.set(id, { x, y });
    }
  }

  return { positions };
}
