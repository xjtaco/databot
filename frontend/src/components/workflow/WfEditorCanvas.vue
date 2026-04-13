<template>
  <div class="wf-editor-canvas" @drop="handleDrop" @dragover.prevent>
    <VueFlow
      v-model:nodes="flowNodes"
      v-model:edges="flowEdges"
      :default-viewport="{ zoom: 1, x: 0, y: 0 }"
      :snap-to-grid="true"
      :snap-grid="[16, 16]"
      fit-view-on-init
      :fit-view-on-init-options="{ maxZoom: 1 }"
      @nodes-change="handleNodesChange"
      @edges-change="handleEdgesChange"
      @connect="handleConnect"
      @node-click="handleNodeClick"
      @edge-click="handleEdgeClick"
      @pane-click="handlePaneClick"
    >
      <Background />
      <Controls />

      <template #node-workflowNode="nodeProps">
        <WfCanvasNode
          :id="nodeProps.id"
          :data="nodeProps.data as WfCanvasNodeData"
          :selected="nodeProps.id === store.selectedNodeId"
          @run-node="handleRunNode"
        />
      </template>
    </VueFlow>

    <!-- Edge delete button overlay -->
    <div
      v-if="selectedEdgeId && edgeDeletePosition"
      class="wf-editor-canvas__edge-delete"
      :style="{
        left: `${edgeDeletePosition.x}px`,
        top: `${edgeDeletePosition.y}px`,
      }"
      @click.stop="handleEdgeDeleteClick(selectedEdgeId)"
    >
      <X :size="12" />
    </div>

    <ConfirmDialog
      v-model:visible="showEdgeDeleteConfirm"
      :title="t('common.warning')"
      :message="t('workflow.deleteEdgeConfirm')"
      type="danger"
      :confirm-text="t('common.delete')"
      @confirm="confirmEdgeDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  VueFlow,
  Position,
  MarkerType,
  useVueFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type NodePositionChange,
  type EdgeChange,
  type EdgeRemoveChange,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import { useWorkflowStore } from '@/stores';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { X } from 'lucide-vue-next';
import { ConfirmDialog } from '@/components/common';
import type {
  WorkflowNodeType,
  ExecutionStatus,
  NodeConfig,
  EmailNodeConfig,
  BranchNodeConfig,
  WebSearchNodeConfig,
} from '@/types/workflow';
import WfCanvasNode from './WfCanvasNode.vue';

export interface WfCanvasNodeData {
  label: string;
  nodeType: WorkflowNodeType;
  contentPreview: string;
  outputVariable: string;
  executionStatus?: ExecutionStatus;
  cascade: boolean;
}

const { t } = useI18n();
const store = useWorkflowStore();
const { screenToFlowCoordinate, findNode, viewport } = useVueFlow();

const flowNodes = ref<Node<WfCanvasNodeData>[]>([]);
const flowEdges = ref<Edge[]>([]);
const selectedEdgeId = ref<string | null>(null);
const showEdgeDeleteConfirm = ref(false);
const pendingDeleteEdgeId = ref<string | null>(null);

const edgeDeletePosition = computed(() => {
  if (!selectedEdgeId.value) return null;
  const edge = flowEdges.value.find((e) => e.id === selectedEdgeId.value);
  if (!edge) return null;
  const sourceNode = findNode(edge.source);
  const targetNode = findNode(edge.target);
  if (!sourceNode || !targetNode) return null;

  const { x: vx, y: vy, zoom } = viewport.value;
  const midX = (sourceNode.position.x + targetNode.position.x) / 2 + 80; // 80 = half node width
  const midY = (sourceNode.position.y + targetNode.position.y) / 2 + 40;
  return {
    x: midX * zoom + vx - 10,
    y: midY * zoom + vy - 10,
  };
});

// Sync store -> flow (workflow data + execution states in a single watch to avoid races)
watch(
  [() => store.editorWorkflow, store.nodeExecutionStates, store.nodeCascadeStates],
  ([wf]) => {
    if (!wf) {
      flowNodes.value = [];
      flowEdges.value = [];
      return;
    }
    flowNodes.value = wf.nodes.map((n) => ({
      id: n.id,
      type: 'workflowNode',
      position: { x: n.positionX, y: n.positionY },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      data: {
        label: n.name,
        nodeType: n.type,
        contentPreview: getContentPreview(n.config),
        outputVariable: n.config.outputVariable,
        executionStatus: store.nodeExecutionStates.get(n.id),
        cascade: store.getNodeCascade(n.id),
      },
    }));
    flowEdges.value = wf.edges.map((e) => {
      const targetStatus = store.nodeExecutionStates.get(e.targetNodeId);
      const edgeClass =
        targetStatus === 'running'
          ? 'edge-running'
          : targetStatus === 'completed'
            ? 'edge-completed'
            : targetStatus === 'failed'
              ? 'edge-failed'
              : '';
      return {
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        sourceHandle: e.sourceHandle ?? undefined,
        type: 'smoothstep',
        selectable: true,
        animated: targetStatus === 'running',
        class: edgeClass,
        style: {
          stroke:
            targetStatus === 'completed'
              ? '#52c41a'
              : targetStatus === 'failed'
                ? '#f5222d'
                : '#6b6b70',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color:
            targetStatus === 'completed'
              ? '#52c41a'
              : targetStatus === 'failed'
                ? '#f5222d'
                : '#6b6b70',
        },
      };
    });
  },
  { immediate: true, deep: true }
);

function getContentPreview(config: NodeConfig): string {
  switch (config.nodeType) {
    case 'sql':
      return (config.sql || '').split('\n')[0].substring(0, 50);
    case 'python':
      return (config.script || '').split('\n')[0].substring(0, 50);
    case 'llm':
      return (config.prompt || '').split('\n')[0].substring(0, 50);
    case 'email':
      return ((config as EmailNodeConfig).to || '').substring(0, 50);
    case 'branch': {
      const bc = config as BranchNodeConfig;
      return (bc.field || '').substring(0, 50);
    }
    case 'web_search':
      return ((config as WebSearchNodeConfig).keywords || '').substring(0, 50);
    default:
      return '';
  }
}

function handleNodesChange(changes: NodeChange[]): void {
  for (const change of changes) {
    if (change.type === 'position' && (change as NodePositionChange).position) {
      const posChange = change as NodePositionChange;
      if (posChange.position) {
        store.updateNodePosition(posChange.id, posChange.position.x, posChange.position.y, {
          source: 'user-drag',
        });
      }
    }
  }
}

function handleEdgesChange(changes: EdgeChange[]): void {
  for (const change of changes) {
    if (change.type === 'remove') {
      // Block direct keyboard deletion — require confirmation via X button
      const edgeId = (change as EdgeRemoveChange).id;
      pendingDeleteEdgeId.value = edgeId;
      showEdgeDeleteConfirm.value = true;
      return;
    }
    if (change.type === 'select') {
      selectedEdgeId.value = change.selected ? change.id : null;
    }
  }
}

function wouldCreateCycle(source: string, target: string): boolean {
  if (!store.editorWorkflow) return false;
  // BFS from target following existing edges — if we can reach source, adding source→target creates a cycle
  const edges = store.editorWorkflow.edges;
  const visited = new Set<string>();
  const queue = [target];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === source) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const e of edges) {
      if (e.sourceNodeId === current) {
        queue.push(e.targetNodeId);
      }
    }
  }
  return false;
}

function handleConnect(connection: Connection): void {
  if (connection.source && connection.target) {
    if (connection.source === connection.target) return;
    if (wouldCreateCycle(connection.source, connection.target)) {
      ElMessage.warning(t('workflow.validation.cyclicEdge'));
      return;
    }
    store.addEdge(connection.source, connection.target, connection.sourceHandle);
  }
}

async function handleRunNode(nodeId: string): Promise<void> {
  if (store.isExecuting) return;
  const cascade = store.getNodeCascade(nodeId);
  try {
    if (store.isDirty) {
      await store.saveWorkflow();
    }
    store.executeNode(nodeId, undefined, cascade);
  } catch {
    ElMessage.error(t('workflow.saveFailed'));
  }
}

function handleNodeClick(event: { node: Node<WfCanvasNodeData> }): void {
  store.selectNode(event.node.id);
}

function handleEdgeClick(event: { edge: Edge }): void {
  selectedEdgeId.value = event.edge.id;
}

function handleEdgeDeleteClick(edgeId: string): void {
  pendingDeleteEdgeId.value = edgeId;
  showEdgeDeleteConfirm.value = true;
}

function confirmEdgeDelete(): void {
  if (pendingDeleteEdgeId.value) {
    store.removeEdge(pendingDeleteEdgeId.value);
    selectedEdgeId.value = null;
    pendingDeleteEdgeId.value = null;
  }
  showEdgeDeleteConfirm.value = false;
}

function handlePaneClick(): void {
  store.selectNode(null);
  selectedEdgeId.value = null;
}

function handleDrop(event: DragEvent): void {
  if (!event.dataTransfer) return;
  const nodeType = event.dataTransfer.getData('workflow/node-type') as WorkflowNodeType;
  if (!nodeType) return;

  const position = screenToFlowCoordinate({
    x: event.clientX,
    y: event.clientY,
  });

  const templateId = event.dataTransfer.getData('workflow/template-id');
  if (templateId) {
    store.addNodeFromTemplate(nodeType, position, templateId);
  } else {
    store.addNode(nodeType, position);
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-editor-canvas {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  background-color: $bg-page;

  :deep(.vue-flow) {
    width: 100%;
    height: 100%;
  }

  :deep(.vue-flow__background) {
    background-color: $bg-page;
  }

  :deep(.vue-flow__controls) {
    background-color: $bg-card;
    border: 1px solid $border-dark;
    border-radius: $radius-md;
    box-shadow: $shadow-md;

    .vue-flow__controls-button {
      color: $text-secondary-color;
      background-color: $bg-card;
      border-color: $border-dark;

      &:hover {
        background-color: $bg-elevated;
      }

      svg {
        fill: $text-secondary-color;
      }
    }
  }

  :deep(.vue-flow__edge-path) {
    stroke: $text-muted;
    stroke-width: 2;
  }

  :deep(.vue-flow__edge.selected .vue-flow__edge-path) {
    stroke: $accent;
    stroke-width: 3;
  }

  :deep(.edge-running .vue-flow__edge-path) {
    stroke-dasharray: 5;
    animation: edge-flow 1s linear infinite;
  }

  :deep(.edge-failed .vue-flow__edge-path) {
    stroke-dasharray: 4 2;
  }

  &__edge-delete {
    position: absolute;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: #fff;
    pointer-events: all;
    cursor: pointer;
    background-color: var(--el-color-danger);
    border-radius: 50%;
    transition: transform 0.15s;

    &:hover {
      transform: scale(1.2);
    }
  }

  :deep(.vue-flow__handle) {
    width: 8px;
    height: 8px;
    background-color: $text-muted;
    border: 2px solid $bg-page;

    &:hover {
      background-color: $accent;
    }
  }
}

@keyframes edge-flow {
  to {
    stroke-dashoffset: -10;
  }
}
</style>
