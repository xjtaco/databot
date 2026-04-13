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

export function validateAutoLayout(result: WorkflowLayoutResult, nodes: LayoutNode[]): boolean {
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
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const parentsByNode = new Map<string, string[]>();
  const childrenByNode = new Map<string, string[]>();
  const neighborsByNode = new Map<string, Set<string>>();

  for (const node of nodes) {
    parentsByNode.set(node.id, []);
    childrenByNode.set(node.id, []);
    neighborsByNode.set(node.id, new Set());
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      throw new Error(
        `autoLayout received edge referencing unknown node: ${edge.sourceNodeId} -> ${edge.targetNodeId}`
      );
    }
    parentsByNode.get(edge.targetNodeId)!.push(edge.sourceNodeId);
    childrenByNode.get(edge.sourceNodeId)!.push(edge.targetNodeId);
    neighborsByNode.get(edge.sourceNodeId)!.add(edge.targetNodeId);
    neighborsByNode.get(edge.targetNodeId)!.add(edge.sourceNodeId);
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

  const positions = new Map<string, WorkflowLayoutPosition>();
  const components = collectComponents();
  const [mainComponent, secondaryComponents] = splitComponents(components);
  const mainLayout = layoutComponent(mainComponent, START_X, START_Y, positions);
  const secondaryStartY = mainLayout.maxY + LAYER_GAP * 2;
  const orderedSecondary = secondaryComponents
    .slice()
    .sort((left, right) => compareComponents(left, right));

  let currentSecondaryCenterX = START_X;
  let previousWidthSpan = 0;

  orderedSecondary.forEach((component, index) => {
    const { widthSpan } = measureComponent(component);
    if (index > 0) {
      currentSecondaryCenterX += previousWidthSpan / 2 + widthSpan / 2 + NODE_GAP * 2;
    }

    layoutComponent(component, currentSecondaryCenterX, secondaryStartY, positions);
    previousWidthSpan = widthSpan;
  });

  return { positions };

  function getHorizontalKey(
    nodeId: string,
    targetPositions: Map<string, WorkflowLayoutPosition>
  ): number {
    const node = nodesById.get(nodeId);
    if (node?.positionX !== undefined) {
      return node.positionX;
    }

    const parents = parentsByNode.get(nodeId) ?? [];
    if (parents.length > 0) {
      const parentPositions = parents
        .map((parentId) => targetPositions.get(parentId)?.x)
        .filter((value): value is number => value !== undefined);

      if (parentPositions.length > 0) {
        return parentPositions.reduce((sum, value) => sum + value, 0) / parentPositions.length;
      }
    }

    return 0;
  }

  function getStructuralKey(
    nodeId: string,
    targetPositions: Map<string, WorkflowLayoutPosition>
  ): number {
    const parents = parentsByNode.get(nodeId) ?? [];
    if (parents.length === 0) {
      return 0;
    }

    const parentKeys = parents
      .map((parentId) => targetPositions.get(parentId)?.x)
      .filter((value): value is number => value !== undefined);

    if (parentKeys.length > 0) {
      return parentKeys.reduce((sum, value) => sum + value, 0) / parentKeys.length;
    }

    const childCount = (childrenByNode.get(nodeId) ?? []).length;
    return childCount;
  }

  function collectComponents(): string[][] {
    const components: string[][] = [];
    const visited = new Set<string>();

    for (const node of nodes) {
      if (visited.has(node.id)) {
        continue;
      }

      const component: string[] = [];
      const queue = [node.id];
      visited.add(node.id);

      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);

        for (const neighbor of neighborsByNode.get(current) ?? []) {
          if (visited.has(neighbor)) {
            continue;
          }
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }

      components.push(component);
    }

    return components;
  }

  function splitComponents(components: string[][]): [string[], string[][]] {
    if (components.length === 0) {
      return [[], []];
    }

    if (edges.length === 0) {
      return [nodes.map((node) => node.id), []];
    }

    const mainComponent = components.reduce((best, current) => {
      if (best.length === 0) {
        return current;
      }

      const currentEdgeCount = countComponentEdges(current);
      const bestEdgeCount = countComponentEdges(best);
      if (currentEdgeCount !== bestEdgeCount) {
        return currentEdgeCount > bestEdgeCount ? current : best;
      }

      if (current.length !== best.length) {
        return current.length > best.length ? current : best;
      }

      return compareComponents(current, best) < 0 ? current : best;
    }, [] as string[]);

    return [mainComponent, components.filter((component) => component !== mainComponent)];
  }

  function layoutComponent(
    component: string[],
    centerX: number,
    startY: number,
    targetPositions: Map<string, WorkflowLayoutPosition>
  ): { maxY: number; widthSpan: number } {
    const layers = new Map<number, string[]>();
    for (const nodeId of component) {
      const depth = depthByNode.get(nodeId) ?? 0;
      const layer = layers.get(depth) ?? [];
      layer.push(nodeId);
      layers.set(depth, layer);
    }

    const sortedDepths = [...layers.keys()].sort((a, b) => a - b);
    let maxLayerWidth = 1;

    for (const depth of sortedDepths) {
      const layer = (layers.get(depth) ?? []).slice();
      const orderedLayer = layer.sort((leftId, rightId) =>
        compareNodes(leftId, rightId, targetPositions)
      );
      const y = startY + depth * LAYER_GAP;
      const centerOffset = (orderedLayer.length - 1) / 2;

      maxLayerWidth = Math.max(maxLayerWidth, orderedLayer.length);

      for (let index = 0; index < orderedLayer.length; index += 1) {
        const id = orderedLayer[index];
        const x = centerX + (index - centerOffset) * NODE_GAP;
        targetPositions.set(id, { x, y });
      }
    }

    const maxDepth = sortedDepths[sortedDepths.length - 1] ?? 0;
    return {
      maxY: startY + maxDepth * LAYER_GAP,
      widthSpan: Math.max(0, (maxLayerWidth - 1) * NODE_GAP),
    };
  }

  function measureComponent(component: string[]): { widthSpan: number } {
    const layerSizes = new Map<number, number>();
    for (const nodeId of component) {
      const depth = depthByNode.get(nodeId) ?? 0;
      layerSizes.set(depth, (layerSizes.get(depth) ?? 0) + 1);
    }

    const maxLayerWidth = Math.max(1, ...layerSizes.values());
    return { widthSpan: Math.max(0, (maxLayerWidth - 1) * NODE_GAP) };
  }

  function compareNodes(
    leftId: string,
    rightId: string,
    targetPositions: Map<string, WorkflowLayoutPosition>
  ): number {
    const leftNode = nodesById.get(leftId);
    const rightNode = nodesById.get(rightId);
    const leftKey = getHorizontalKey(leftId, targetPositions);
    const rightKey = getHorizontalKey(rightId, targetPositions);

    if (leftKey !== rightKey) {
      return leftKey - rightKey;
    }

    const leftStructuralKey = getStructuralKey(leftId, targetPositions);
    const rightStructuralKey = getStructuralKey(rightId, targetPositions);
    if (leftStructuralKey !== rightStructuralKey) {
      return leftStructuralKey - rightStructuralKey;
    }

    const leftPositionY = leftNode?.positionY ?? 0;
    const rightPositionY = rightNode?.positionY ?? 0;
    if (leftPositionY !== rightPositionY) {
      return leftPositionY - rightPositionY;
    }

    return leftId.localeCompare(rightId);
  }

  function getComponentHorizontalKey(component: string[]): number {
    const values = component
      .map((nodeId) => nodesById.get(nodeId)?.positionX)
      .filter((value): value is number => value !== undefined);

    if (values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function getComponentOrderKey(component: string[]): number {
    return Math.min(...component.map((nodeId) => nodeOrder.get(nodeId) ?? Number.MAX_SAFE_INTEGER));
  }

  function compareComponents(left: string[], right: string[]): number {
    const horizontalDelta = getComponentHorizontalKey(left) - getComponentHorizontalKey(right);
    if (horizontalDelta !== 0) {
      return horizontalDelta;
    }

    const orderDelta = getComponentOrderKey(left) - getComponentOrderKey(right);
    if (orderDelta !== 0) {
      return orderDelta;
    }

    return left.join(',').localeCompare(right.join(','));
  }

  function countComponentEdges(component: string[]): number {
    const componentNodeIds = new Set(component);
    let count = 0;

    for (const edge of edges) {
      if (componentNodeIds.has(edge.sourceNodeId) && componentNodeIds.has(edge.targetNodeId)) {
        count += 1;
      }
    }

    return count;
  }
}
