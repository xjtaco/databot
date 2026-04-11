<template>
  <div class="wf-custom-node-editor" :class="{ 'wf-custom-node-editor--mobile': isMobile }">
    <!-- ═══ Desktop Layout (3-column like workflow editor) ═══ -->
    <template v-if="!isMobile">
      <!-- Left: Node Palette (always visible) -->
      <div class="wf-custom-node-editor__palette">
        <div class="wf-custom-node-editor__palette-header">
          <span class="wf-custom-node-editor__palette-title">
            {{ t('workflow.customNode.nodePalette') }}
          </span>
        </div>
        <div class="wf-custom-node-editor__palette-body">
          <button
            v-for="nt in availableNodeTypes"
            :key="nt.type"
            class="wf-custom-node-editor__palette-item"
            :class="{ 'is-active': localTemplate?.type === nt.type }"
            :disabled="nt.disabled || (hasNode && localTemplate?.type !== nt.type)"
            @click="handlePaletteClick(nt.type)"
          >
            <component :is="nt.icon" :size="16" :style="{ color: NODE_COLORS[nt.type] }" />
            <span>{{ t(`workflow.nodeTypes.${nt.type}`) }}</span>
          </button>
        </div>
      </div>

      <!-- Center + Right: Main area -->
      <div class="wf-custom-node-editor__main">
        <!-- Header -->
        <div class="wf-custom-node-editor__header">
          <div class="wf-custom-node-editor__header-left">
            <button class="wf-custom-node-editor__back-btn" @click="handleBack">
              <ArrowLeft :size="18" />
            </button>
            <span v-if="localTemplate" class="wf-custom-node-editor__title">
              {{ localTemplate.name }}
            </span>
            <span
              v-if="localTemplate"
              class="wf-custom-node-editor__type-badge"
              :style="{ backgroundColor: badgeBg, color: badgeColor }"
            >
              {{ t(`workflow.nodeTypes.${localTemplate.type}`) }}
            </span>
          </div>
          <div class="wf-custom-node-editor__header-right">
            <el-button :disabled="!hasNode" @click="handleRun">
              <Play :size="14" />
              {{ t('workflow.run') }}
            </el-button>
            <el-button :loading="isSaving" @click="handleSave">
              <Save :size="14" />
              {{ t('workflow.customNode.saveTemplate') }}
            </el-button>
          </div>
        </div>

        <!-- Body: Canvas + Copilot -->
        <div class="wf-custom-node-editor__body">
          <!-- Canvas -->
          <div class="wf-custom-node-editor__canvas-area">
            <VueFlow
              v-model:nodes="flowNodes"
              v-model:edges="flowEdges"
              :default-viewport="{ zoom: 1, x: 0, y: 0 }"
              fit-view-on-init
              :fit-view-on-init-options="{ maxZoom: 1 }"
              @node-click="handleNodeClick"
              @pane-click="handlePaneClick"
            >
              <Background />
              <Controls />

              <template #node-workflowNode="nodeProps">
                <WfCanvasNode
                  :id="nodeProps.id"
                  :data="nodeProps.data as WfCanvasNodeData"
                  :selected="nodeProps.id === selectedNodeId"
                  @run-node="handleCanvasRunNode"
                />
              </template>
            </VueFlow>
          </div>

          <!-- Copilot Panel -->
          <div
            class="wf-custom-node-editor__copilot-panel"
            :style="{ width: copilotPanelWidth + 'px' }"
          >
            <div
              class="wf-custom-node-editor__resize-handle"
              @pointerdown="onCopilotResizeStart"
            ></div>
            <div class="wf-custom-node-editor__copilot-header">
              <span class="wf-custom-node-editor__copilot-title">
                {{ t('workflow.customNode.debugCopilot') }}
              </span>
              <span
                class="wf-custom-node-editor__copilot-status"
                :class="{
                  'is-connected': debugStore.isConnected,
                  'is-disconnected': !debugStore.isConnected,
                }"
              >
                {{
                  debugStore.isConnected ? t('connection.connected') : t('connection.disconnected')
                }}
              </span>
            </div>

            <!-- Message list -->
            <div ref="messageListRef" class="wf-custom-node-editor__messages">
              <div
                v-for="(msg, idx) in debugStore.messages"
                :key="idx"
                class="wf-custom-node-editor__message-item"
              >
                <CopilotUserMsg v-if="msg.type === 'user'" :content="msg.content" />
                <CopilotAssistantMsg
                  v-else-if="msg.type === 'assistant'"
                  :content="msg.content"
                  :done="msg.done"
                />
                <CopilotToolStatus
                  v-else-if="msg.type === 'tool_status'"
                  :status="msg.status"
                  :summary="msg.summary"
                />
              </div>
            </div>

            <!-- Input -->
            <CopilotInput
              :is-thinking="debugStore.isAgentThinking"
              @send="debugStore.sendMessage"
              @abort="debugStore.abort"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- ═══ Mobile ═══ -->
    <template v-else>
      <!-- Mobile Header -->
      <div class="wf-custom-node-editor__header">
        <div class="wf-custom-node-editor__header-left">
          <button class="wf-custom-node-editor__back-btn" @click="handleBack">
            <ArrowLeft :size="18" />
          </button>
          <span v-if="localTemplate" class="wf-custom-node-editor__title">
            {{ localTemplate.name }}
          </span>
        </div>
        <div class="wf-custom-node-editor__header-right">
          <el-button size="small" :loading="isSaving" @click="handleSave">
            <Save :size="14" />
          </el-button>
          <el-button size="small" @click="showMobileCopilot = true">
            <MessageSquare :size="14" />
          </el-button>
        </div>
      </div>
      <!-- Mobile Body -->
      <div class="wf-custom-node-editor__mobile-body">
        <!-- Single node card -->
        <div
          v-if="localTemplate"
          class="wf-custom-node-editor__mobile-node-card"
          @click="handleMobileNodeClick"
        >
          <div
            class="wf-custom-node-editor__mobile-node-header"
            :style="{ backgroundColor: badgeColor }"
          >
            <Database v-if="localTemplate.type === 'sql'" :size="14" />
            <Code v-else-if="localTemplate.type === 'python'" :size="14" />
            <Sparkles v-else-if="localTemplate.type === 'llm'" :size="14" />
            <Mail v-else-if="localTemplate.type === 'email'" :size="14" />
            <GitBranch v-else-if="localTemplate.type === 'branch'" :size="14" />
            <Search v-else-if="localTemplate.type === 'web_search'" :size="14" />
            <span>{{ t(`workflow.nodeTypes.${localTemplate.type}`) }}</span>
          </div>
          <div class="wf-custom-node-editor__mobile-node-body">
            <span class="wf-custom-node-editor__mobile-node-name">{{ localTemplate.name }}</span>
            <span v-if="contentPreview" class="wf-custom-node-editor__mobile-node-preview">
              {{ contentPreview }}
            </span>
          </div>
        </div>

        <!-- Mobile node config sheet -->
        <el-drawer
          v-model="showMobileConfig"
          direction="btt"
          size="70%"
          :title="localTemplate ? t(`workflow.nodeTypes.${localTemplate.type}`) : ''"
        >
          <div v-if="localTemplate && localNode" class="wf-custom-node-editor__config-drawer">
            <WfConfigSqlQuery v-if="localNode.type === 'sql'" :node="localNode" />
            <WfConfigPythonScript v-else-if="localNode.type === 'python'" :node="localNode" />
            <WfConfigLlmGenerate v-else-if="localNode.type === 'llm'" :node="localNode" />
            <WfConfigEmail v-else-if="localNode.type === 'email'" :node="localNode" />
            <WfConfigBranch v-else-if="localNode.type === 'branch'" :node="localNode" />
            <WfConfigWebSearch v-else-if="localNode.type === 'web_search'" :node="localNode" />
          </div>
        </el-drawer>

        <!-- Mobile copilot (full screen overlay) -->
        <div v-if="showMobileCopilot" class="wf-custom-node-editor__mobile-copilot">
          <div class="wf-custom-node-editor__mobile-copilot-header">
            <button class="wf-custom-node-editor__back-btn" @click="showMobileCopilot = false">
              <ArrowLeft :size="18" />
            </button>
            <span class="wf-custom-node-editor__copilot-title">
              {{ t('workflow.customNode.debugCopilot') }}
            </span>
            <span
              class="wf-custom-node-editor__copilot-status"
              :class="{
                'is-connected': debugStore.isConnected,
                'is-disconnected': !debugStore.isConnected,
              }"
            >
              {{
                debugStore.isConnected ? t('connection.connected') : t('connection.disconnected')
              }}
            </span>
          </div>
          <div ref="mobileMessageListRef" class="wf-custom-node-editor__messages">
            <div
              v-for="(msg, idx) in debugStore.messages"
              :key="idx"
              class="wf-custom-node-editor__message-item"
            >
              <CopilotUserMsg v-if="msg.type === 'user'" :content="msg.content" />
              <CopilotAssistantMsg
                v-else-if="msg.type === 'assistant'"
                :content="msg.content"
                :done="msg.done"
              />
              <CopilotToolStatus
                v-else-if="msg.type === 'tool_status'"
                :status="msg.status"
                :summary="msg.summary"
              />
            </div>
          </div>
          <CopilotInput
            :is-thinking="debugStore.isAgentThinking"
            @send="debugStore.sendMessage"
            @abort="debugStore.abort"
          />
        </div>
      </div>
    </template>

    <!-- ═══ Desktop Config Drawer ═══ -->
    <el-drawer
      v-if="!isMobile"
      :model-value="!!selectedNodeId"
      direction="rtl"
      size="400px"
      :title="localTemplate ? t(`workflow.nodeTypes.${localTemplate.type}`) : ''"
      @close="selectedNodeId = null"
    >
      <div v-if="localTemplate && localNode" class="wf-custom-node-editor__config-drawer">
        <WfConfigSqlQuery v-if="localNode.type === 'sql'" :node="localNode" />
        <WfConfigPythonScript v-else-if="localNode.type === 'python'" :node="localNode" />
        <WfConfigLlmGenerate v-else-if="localNode.type === 'llm'" :node="localNode" />
        <WfConfigEmail v-else-if="localNode.type === 'email'" :node="localNode" />
        <WfConfigBranch v-else-if="localNode.type === 'branch'" :node="localNode" />
        <WfConfigWebSearch v-else-if="localNode.type === 'web_search'" :node="localNode" />
        <WfNodePreview v-if="debugNodeRun" :node-run="debugNodeRun" :node-type="localNode.type" />
        <div class="wf-custom-node-editor__config-drawer-actions">
          <el-button type="danger" @click="handleDeleteNode">
            <Trash2 :size="14" />
            {{ t('workflow.deleteNode') }}
          </el-button>
        </div>
      </div>
    </el-drawer>

    <!-- ═══ Save Dialog ═══ -->
    <el-dialog
      v-model="showSaveDialog"
      :title="t('workflow.customNode.saveDialogTitle')"
      width="420px"
    >
      <el-form label-position="top">
        <el-form-item :label="t('workflow.customNode.saveName')" required>
          <el-input v-model="saveDialogName" />
        </el-form-item>
        <el-form-item :label="t('workflow.customNode.saveDesc')">
          <el-input v-model="saveDialogDesc" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSaveDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          :disabled="!saveDialogName.trim()"
          :loading="isSaving"
          @click="confirmSave"
        >
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { VueFlow, Position, type Node, type Edge } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import {
  ArrowLeft,
  Save,
  Database,
  Code,
  Sparkles,
  Mail,
  GitBranch,
  Search,
  MessageSquare,
  Trash2,
  Play,
} from 'lucide-vue-next';
import { useWorkflowStore, useDebugCopilotStore, useGlobalConfigStore } from '@/stores';
import { useResponsive } from '@/composables/useResponsive';
import { NODE_COLORS } from '@/constants/workflow';
import type {
  CustomNodeTemplateInfo,
  WorkflowNodeInfo,
  WorkflowNodeType,
  NodeConfig,
  EmailNodeConfig,
  BranchNodeConfig,
  WebSearchNodeConfig,
  ExecutionStatus,
  WorkflowNodeRunInfo,
} from '@/types/workflow';
import type { WfCanvasNodeData } from './WfEditorCanvas.vue';
import WfCanvasNode from './WfCanvasNode.vue';
import CopilotUserMsg from './copilot/CopilotUserMsg.vue';
import CopilotAssistantMsg from './copilot/CopilotAssistantMsg.vue';
import CopilotToolStatus from './copilot/CopilotToolStatus.vue';
import CopilotInput from './copilot/CopilotInput.vue';
import WfConfigSqlQuery from './config/WfConfigSqlQuery.vue';
import WfConfigPythonScript from './config/WfConfigPythonScript.vue';
import WfConfigLlmGenerate from './config/WfConfigLlmGenerate.vue';
import WfConfigEmail from './config/WfConfigEmail.vue';
import WfConfigBranch from './config/WfConfigBranch.vue';
import WfConfigWebSearch from './config/WfConfigWebSearch.vue';
import WfNodePreview from './WfNodePreview.vue';

const props = defineProps<{
  templateId?: string;
}>();

const emit = defineEmits<{
  back: [];
}>();

const { t } = useI18n();
const workflowStore = useWorkflowStore();
const debugStore = useDebugCopilotStore();
const globalConfigStore = useGlobalConfigStore();
const { isMobile } = useResponsive();

// ── Local State ─────────────────────────────────────────
const localTemplate = ref<CustomNodeTemplateInfo | null>(null);
const selectedNodeId = ref<string | null>(null);
const isSaving = ref(false);
const showMobileCopilot = ref(false);
const showMobileConfig = ref(false);
const messageListRef = ref<HTMLDivElement | null>(null);
const COPILOT_MIN_WIDTH = 380;
const COPILOT_MAX_WIDTH = 640;
const copilotPanelWidth = ref(COPILOT_MIN_WIDTH);
const mobileMessageListRef = ref<HTMLDivElement | null>(null);
const showSaveDialog = ref(false);
const saveDialogName = ref('');
const saveDialogDesc = ref('');

const debugNodeRun = ref<WorkflowNodeRunInfo | null>(null);

// ── Computed ────────────────────────────────────────────
const hasNode = computed(() => localTemplate.value !== null);

const availableNodeTypes = computed(() => [
  { type: 'sql' as WorkflowNodeType, icon: Database, disabled: false },
  { type: 'python' as WorkflowNodeType, icon: Code, disabled: false },
  {
    type: 'llm' as WorkflowNodeType,
    icon: Sparkles,
    disabled: !globalConfigStore.configStatus?.llm,
  },
  {
    type: 'email' as WorkflowNodeType,
    icon: Mail,
    disabled: !globalConfigStore.configStatus?.smtp,
  },
  {
    type: 'web_search' as WorkflowNodeType,
    icon: Search,
    disabled: !globalConfigStore.configStatus?.webSearch,
  },
]);

const badgeColor = computed(() => {
  if (!localTemplate.value) return '';
  return NODE_COLORS[localTemplate.value.type];
});

const badgeBg = computed(() => {
  return badgeColor.value + '1A'; // ~10% opacity hex suffix
});

const contentPreview = computed(() => {
  if (!localTemplate.value) return '';
  return getContentPreview(localTemplate.value.config);
});

/** Build a WorkflowNodeInfo-shaped object for config components */
const localNode = computed<WorkflowNodeInfo | null>(() => {
  if (!localTemplate.value) return null;
  return {
    id: 'custom-node-1',
    workflowId: '',
    name: localTemplate.value.name,
    description: localTemplate.value.description,
    type: localTemplate.value.type,
    config: localTemplate.value.config,
    positionX: 300,
    positionY: 200,
  };
});

// ── Vue Flow Nodes/Edges ─────────────────────────────────
const flowNodes = ref<Node<WfCanvasNodeData>[]>([]);
const flowEdges = ref<Edge[]>([]);

function buildFlowGraph(): void {
  if (!localTemplate.value) {
    flowNodes.value = [];
    flowEdges.value = [];
    return;
  }
  const tpl = localTemplate.value;
  flowNodes.value = [
    {
      id: 'custom-node-1',
      type: 'workflowNode',
      position: { x: 300, y: 200 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      data: {
        label: tpl.name,
        nodeType: tpl.type,
        contentPreview: getContentPreview(tpl.config),
        outputVariable: tpl.config.outputVariable,
        cascade: false,
      },
    },
  ];
  flowEdges.value = [];
}

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

// ── Lifecycle ───────────────────────────────────────────
onMounted(() => {
  if (!props.templateId) return;
  const tpl = workflowStore.customTemplates.find((ct) => ct.id === props.templateId);
  if (tpl) {
    localTemplate.value = JSON.parse(JSON.stringify(tpl));
  }
  buildFlowGraph();
  debugStore.connect(props.templateId);
  debugStore.setOnNodeChanged(handleNodeChanged);
  debugStore.setOnExecutionEvent(handleExecutionEvent);
});

onUnmounted(() => {
  debugStore.disconnect();
  debugStore.setOnNodeChanged(null);
  debugStore.setOnExecutionEvent(null);
});

// ── Auto-scroll messages ─────────────────────────────────
watch(
  () => debugStore.messages.length,
  async () => {
    await nextTick();
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    }
    if (mobileMessageListRef.value) {
      mobileMessageListRef.value.scrollTop = mobileMessageListRef.value.scrollHeight;
    }
  }
);

// ── Event Handlers ──────────────────────────────────────
function handleNodeChanged(
  _changeType: string,
  _nodeId?: string,
  nodeData?: WorkflowNodeInfo
): void {
  if (nodeData && localTemplate.value) {
    // Apply the in-memory node data sent from the debug agent
    localTemplate.value.name = nodeData.name;
    localTemplate.value.description = nodeData.description;
    localTemplate.value.type = nodeData.type;
    localTemplate.value.config = nodeData.config;
    buildFlowGraph();
  }
}

function updateNodeExecutionStatus(status: ExecutionStatus | undefined): void {
  const node = flowNodes.value[0];
  if (!node?.data) return;
  node.data.executionStatus = status;
}

function handleExecutionEvent(event: {
  type: string;
  runId: string;
  nodeId?: string;
  nodeName?: string;
  error?: string;
  status?: string;
  preview?: Record<string, unknown> | null;
}): void {
  switch (event.type) {
    case 'node_start':
      updateNodeExecutionStatus('running');
      debugNodeRun.value = {
        id: event.runId,
        runId: event.runId,
        nodeId: event.nodeId ?? '',
        status: 'running',
        inputs: null,
        outputs: null,
        errorMessage: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
      };
      break;
    case 'node_complete':
      updateNodeExecutionStatus('completed');
      if (debugNodeRun.value) {
        debugNodeRun.value.status = 'completed';
        debugNodeRun.value.outputs = event.preview ?? null;
        debugNodeRun.value.completedAt = new Date().toISOString();
      }
      break;
    case 'node_error':
      updateNodeExecutionStatus('failed');
      if (debugNodeRun.value) {
        debugNodeRun.value.status = 'failed';
        debugNodeRun.value.errorMessage = event.error ?? 'Unknown error';
        debugNodeRun.value.completedAt = new Date().toISOString();
      }
      break;
    case 'run_complete':
      setTimeout(() => updateNodeExecutionStatus(undefined), 2000);
      break;
  }
}

function handleNodeClick(): void {
  selectedNodeId.value = 'custom-node-1';
}

function handlePaneClick(): void {
  selectedNodeId.value = null;
}

function handleMobileNodeClick(): void {
  showMobileConfig.value = true;
}

function handleSave(): void {
  if (!localTemplate.value) return;
  saveDialogName.value = localTemplate.value.name;
  saveDialogDesc.value = localTemplate.value.description ?? '';
  showSaveDialog.value = true;
}

async function confirmSave(): Promise<void> {
  if (!localTemplate.value || !saveDialogName.value.trim() || !props.templateId) return;
  isSaving.value = true;
  try {
    await workflowStore.updateTemplate(props.templateId, {
      name: saveDialogName.value.trim(),
      description: saveDialogDesc.value.trim() || undefined,
      type: localTemplate.value.type,
      config: localTemplate.value.config,
    });
    localTemplate.value.name = saveDialogName.value.trim();
    localTemplate.value.description = saveDialogDesc.value.trim() || null;
    buildFlowGraph();
    ElMessage.success(t('workflow.saveSuccess'));
    showSaveDialog.value = false;
  } catch {
    ElMessage.error(t('workflow.saveFailed'));
  } finally {
    isSaving.value = false;
  }
}

function onCopilotResizeStart(e: PointerEvent): void {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = copilotPanelWidth.value;

  function onMove(ev: PointerEvent): void {
    const delta = startX - ev.clientX;
    copilotPanelWidth.value = Math.min(
      COPILOT_MAX_WIDTH,
      Math.max(COPILOT_MIN_WIDTH, startWidth + delta)
    );
  }

  function onUp(): void {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function executeDebugNode(): void {
  if (!props.templateId) return;
  if (!debugStore.isConnected) {
    ElMessage.warning(t('connection.disconnected'));
    return;
  }
  debugStore.executeNode(`debug-node-${props.templateId}`);
}

function handleRun(): void {
  executeDebugNode();
}

function handleCanvasRunNode(): void {
  executeDebugNode();
}

function handlePaletteClick(type: WorkflowNodeType): void {
  if (hasNode.value) return;
  // Restore template with selected type using existing saved info
  const tpl = workflowStore.customTemplates.find((ct) => ct.id === props.templateId);
  const defaultConfigs: Record<string, NodeConfig> = {
    sql: {
      nodeType: 'sql',
      datasourceId: '',
      params: {},
      sql: 'SELECT * FROM ',
      outputVariable: 'result',
    },
    python: {
      nodeType: 'python',
      params: {},
      script: '# params dict contains upstream node outputs\n\nresult = {"status": "ok"}',
      outputVariable: 'result',
    },
    llm: { nodeType: 'llm', params: {}, prompt: '', outputVariable: 'result' },
    email: {
      nodeType: 'email',
      to: '',
      subject: '',
      contentSource: 'inline',
      body: '',
      isHtml: true,
      outputVariable: 'email_result',
    },
    web_search: {
      nodeType: 'web_search',
      params: {},
      keywords: '',
      outputVariable: 'search_result',
    },
  };
  localTemplate.value = {
    id: tpl?.id ?? '',
    name: tpl?.name ?? `new_${type}`,
    description: tpl?.description ?? null,
    type,
    config: defaultConfigs[type],
    createdAt: tpl?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    creatorName: tpl?.creatorName ?? null,
  };
  buildFlowGraph();
}

function handleDeleteNode(): void {
  localTemplate.value = null;
  selectedNodeId.value = null;
  flowNodes.value = [];
  flowEdges.value = [];
}

function handleBack(): void {
  debugStore.disconnect();
  emit('back');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-custom-node-editor {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  background-color: $bg-page;

  &--mobile {
    flex-direction: column;
  }

  // ── Left Palette (desktop, matches WfNodePalette) ───
  &__palette {
    display: flex;
    flex-direction: column;
    width: 200px;
    min-width: 200px;
    height: 100%;
    background-color: $bg-sidebar;
    border-right: 1px solid $border-dark;
  }

  &__palette-header {
    display: flex;
    align-items: center;
    height: 48px;
    min-height: 48px;
    padding: 0 $spacing-md;
    border-bottom: 1px solid $border-dark;
  }

  &__palette-title {
    margin: 0;
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
  }

  &__palette-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $spacing-xs;
    padding: $spacing-sm;
    overflow-y: auto;
  }

  &__palette-item {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-sm $spacing-sm;
    font-size: $font-size-sm;
    color: $text-primary-color;
    cursor: pointer;
    background: none;
    border: none;
    border-radius: $radius-sm;
    transition: all $transition-fast;

    &:hover:not(:disabled) {
      background-color: $bg-elevated;
    }

    &.is-active {
      background-color: $bg-elevated;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.35;
    }
  }

  // ── Main Area (header + body) ────────────────────
  &__main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  // ── Header ───────────────────────────────────────
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    min-height: 48px;
    padding: 0 $spacing-md;
    background-color: $bg-sidebar;
    border-bottom: 1px solid $border-dark;
  }

  &__header-left {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    min-width: 0;
  }

  &__header-right {
    display: flex;
    flex-shrink: 0;
    gap: $spacing-sm;
    align-items: center;
  }

  &__back-btn {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
    align-items: center;
    justify-content: center;
    height: 32px;
    padding: 0 $spacing-sm;
    font-size: $font-size-sm;
    color: $text-muted;
    cursor: pointer;
    background: none;
    border: none;
    border-radius: $radius-sm;
    transition: all $transition-fast;

    &:hover {
      color: $text-secondary-color;
      background-color: $bg-elevated;
    }
  }

  &__title {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-md;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
    white-space: nowrap;
  }

  &__type-badge {
    display: inline-block;
    flex-shrink: 0;
    padding: 2px 8px;
    font-size: $font-size-xs;
    font-weight: $font-weight-medium;
    border-radius: 10px;
  }

  // ── Desktop Body (canvas + copilot) ──────────────
  &__body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  &__canvas-area {
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

  // ── Copilot Panel ────────────────────────────────
  &__copilot-panel {
    position: relative;
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    background-color: $bg-sidebar;
    border-left: 1px solid $border-dark;
  }

  &__resize-handle {
    position: absolute;
    top: 0;
    left: -3px;
    z-index: 10;
    width: 6px;
    height: 100%;
    cursor: col-resize;

    &:hover,
    &:active {
      background-color: $accent;
    }
  }

  &__copilot-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-sm 12px;
    border-bottom: 1px solid $border-dark;
  }

  &__copilot-title {
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
  }

  &__copilot-status {
    padding: 2px 8px;
    font-size: $font-size-xs;
    border-radius: $radius-pill;

    &.is-connected {
      color: $success;
      background-color: $success-tint;
    }

    &.is-disconnected {
      color: $error;
      background-color: $error-tint;
    }
  }

  // ── Message List (shared) ────────────────────────
  &__messages {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    overflow-y: auto;
  }

  &__message-item {
    // Spacer — messages have their own internal margins
  }

  // ── Config Drawer ────────────────────────────────
  &__config-drawer {
    display: flex;
    flex-direction: column;
    height: 100%;

    :deep(.el-form-item) {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      margin-bottom: $spacing-md;
    }

    :deep(.el-form-item__label) {
      justify-content: flex-start;
      margin-bottom: $spacing-xs;
      font-size: $font-size-sm;
      color: $text-secondary-color;
    }

    :deep(.el-form-item__content) {
      margin-left: 0 !important;
    }

    :deep(.cm-editor) {
      height: 360px !important;
    }

    :deep(.wf-param-editor__param-row) {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: $spacing-xs;
    }

    :deep(.wf-param-editor__key-input) {
      width: auto;
    }

    :deep(.wf-param-editor__value-input) {
      grid-column: 1 / -1;
    }

    :deep(.wf-param-editor__options-input) {
      grid-column: 1 / -1;
    }

    :deep(.el-select) {
      width: 100%;
    }
  }

  &__config-drawer-actions {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding-top: $spacing-md;
    margin-top: auto;
    border-top: 1px solid $border-dark;
  }

  // ── Mobile Styles ────────────────────────────────
  &--mobile {
    .wf-custom-node-editor__header {
      gap: $spacing-sm;
      height: 48px;
      min-height: 48px;
      padding: 0 $spacing-sm;
    }

    .wf-custom-node-editor__title {
      flex: 1;
    }

    .wf-custom-node-editor__header-right {
      display: flex;
      gap: $spacing-xs;
    }

    .wf-custom-node-editor__body {
      flex-direction: column;
    }
  }

  &__mobile-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $spacing-md;
    align-items: center;
    padding: $spacing-md;
    overflow-y: auto;
  }

  // ── Mobile Palette ──────────────────────────────
  &__mobile-palette {
    width: 100%;
    max-width: 320px;

    h4 {
      margin: 0 0 $spacing-sm;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
      color: $text-primary-color;
    }
  }

  &__mobile-palette-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: $spacing-xs;
  }

  &__mobile-palette-item {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-sm;
    font-size: $font-size-sm;
    color: $text-primary-color;
    cursor: pointer;
    background-color: $bg-card;
    border: 1px solid $border-dark;
    border-radius: $radius-sm;
    transition: all $transition-fast;

    &:hover:not(:disabled) {
      background-color: $bg-elevated;
      border-color: $accent;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }
  }

  &__mobile-node-card {
    width: 100%;
    max-width: 320px;
    overflow: hidden;
    cursor: pointer;
    background-color: $bg-card;
    border: 1.5px solid $border-dark;
    border-radius: $radius-md;
    transition: border-color $transition-fast;

    &:hover {
      border-color: $accent;
    }
  }

  &__mobile-node-header {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 6px 12px;
    font-size: $font-size-xs;
    font-weight: $font-weight-medium;
    color: #fff;
  }

  &__mobile-node-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: $spacing-sm 12px;
  }

  &__mobile-node-name {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $text-primary-color;
  }

  &__mobile-node-preview {
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: $font-family-mono;
    font-size: $font-size-xs;
    color: $text-muted;
    white-space: nowrap;
  }

  &__mobile-actions {
    display: flex;
    gap: $spacing-sm;
  }

  // ── Mobile Copilot Overlay ───────────────────────
  &__mobile-copilot {
    position: fixed;
    inset: 0;
    z-index: $z-index-modal;
    display: flex;
    flex-direction: column;
    background-color: $bg-sidebar;
  }

  &__mobile-copilot-header {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    height: 48px;
    min-height: 48px;
    padding: 0 $spacing-sm;
    border-bottom: 1px solid $border-dark;
  }
}
</style>
