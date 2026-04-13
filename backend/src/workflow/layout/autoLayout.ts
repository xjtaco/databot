import type { WorkflowLayoutPosition, WorkflowLayoutResult } from '../workflow.types';

export const START_X = 0;
export const START_Y = 0;
export const NODE_GAP = 220;
export const LAYER_GAP = 220;

interface LayoutNode {
  id: string;
  positionX?: number;
  positionY?: number;
}

interface LayoutEdge {
  sourceNodeId: string;
  targetNodeId: string;
}

export function validateAutoLayout(
  result: WorkflowLayoutResult,
  nodes: LayoutNode[]
): boolean {
  for (const node of nodes) {
    const position = result.positions.get(node.id);
    if (!position) {
      return false;
    }
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return false;
    }
  }

  return true;
}

export function autoLayout(nodes: LayoutNode[], edges: LayoutEdge[]): WorkflowLayoutResult {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const parentsByNode = new Map<string, string[]>();
  const childrenByNode = new Map<string, string[]>();

  for (const node of nodes) {
    parentsByNode.set(node.id, []);
    childrenByNode.set(node.id, []);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      throw new Error(
        `autoLayout received edge referencing unknown node: ${edge.sourceNodeId} -> ${edge.targetNodeId}`
      );
    }
    parentsByNode.get(edge.targetNodeId)!.push(edge.sourceNodeId);
    childrenByNode.get(edge.sourceNodeId)!.push(edge.targetNodeId);
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
    const layer = (layers.get(depth) ?? []).slice();
    const orderedLayer = layer.sort((leftId, rightId) => {
      const leftNode = nodesById.get(leftId);
      const rightNode = nodesById.get(rightId);
      const leftKey = getHorizontalKey(leftId);
      const rightKey = getHorizontalKey(rightId);

      if (leftKey !== rightKey) {
        return leftKey - rightKey;
      }

      const leftStructuralKey = getStructuralKey(leftId);
      const rightStructuralKey = getStructuralKey(rightId);
      if (leftStructuralKey !== rightStructuralKey) {
        return leftStructuralKey - rightStructuralKey;
      }

      const leftPositionY = leftNode?.positionY ?? 0;
      const rightPositionY = rightNode?.positionY ?? 0;
      if (leftPositionY !== rightPositionY) {
        return leftPositionY - rightPositionY;
      }

      return leftId.localeCompare(rightId);
    });
    const y = START_Y + depth * LAYER_GAP;
    const centerOffset = (orderedLayer.length - 1) / 2;

    for (let index = 0; index < orderedLayer.length; index += 1) {
      const id = orderedLayer[index];
      const x = START_X + (index - centerOffset) * NODE_GAP;
      positions.set(id, { x, y });
    }
  }

  return { positions };

  function getHorizontalKey(nodeId: string): number {
    const node = nodesById.get(nodeId);
    if (node?.positionX !== undefined) {
      return node.positionX;
    }

    const parents = parentsByNode.get(nodeId) ?? [];
    if (parents.length > 0) {
      const parentPositions = parents
        .map((parentId) => positions.get(parentId)?.x)
        .filter((value): value is number => value !== undefined);

      if (parentPositions.length > 0) {
        return parentPositions.reduce((sum, value) => sum + value, 0) / parentPositions.length;
      }
    }

    return 0;
  }

  function getStructuralKey(nodeId: string): number {
    const parents = parentsByNode.get(nodeId) ?? [];
    if (parents.length === 0) {
      return 0;
    }

    const parentKeys = parents
      .map((parentId) => positions.get(parentId)?.x)
      .filter((value): value is number => value !== undefined);

    if (parentKeys.length > 0) {
      return parentKeys.reduce((sum, value) => sum + value, 0) / parentKeys.length;
    }

    const childCount = (childrenByNode.get(nodeId) ?? []).length;
    return childCount;
  }
}
