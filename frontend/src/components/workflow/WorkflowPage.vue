<template>
  <div class="workflow-page" :class="{ 'workflow-page--mobile': isMobile }">
    <!-- ═══ Desktop ═══ -->
    <template v-if="!isMobile">
      <!-- List view -->
      <template v-if="activeView === 'list'">
        <WfListView
          :is-mobile="false"
          @edit="handleEdit"
          @created="handleCreated"
          @history="handleHistory"
          @edit-template="handleEditTemplate"
          @create-template="handleCreateTemplate"
        />
      </template>

      <!-- Editor view -->
      <template v-else-if="activeView === 'editor'">
        <WfNodePalette />
        <div class="workflow-page__editor-main">
          <WfEditorHeader
            :is-saving="isSaving"
            @back="handleEditorBack"
            @save="handleSave"
            @run="handleEditorRun"
          />
          <div class="workflow-page__editor-body">
            <WfEditorCanvas class="workflow-page__canvas" />
            <WfCopilotPanel />
          </div>
        </div>

        <!-- Desktop node config drawer -->
        <el-drawer
          :model-value="!!store.selectedNodeId"
          direction="rtl"
          size="400px"
          :title="selectedNodeTitle"
          @close="store.selectNode(null)"
        >
          <div v-if="store.selectedNode" class="workflow-page__config-drawer">
            <WfConfigSqlQuery v-if="store.selectedNode.type === 'sql'" :node="store.selectedNode" />
            <WfConfigPythonScript
              v-else-if="store.selectedNode.type === 'python'"
              :node="store.selectedNode"
            />
            <WfConfigLlmGenerate
              v-else-if="store.selectedNode.type === 'llm'"
              :node="store.selectedNode"
            />
            <WfConfigEmail
              v-else-if="store.selectedNode.type === 'email'"
              :node="store.selectedNode"
            />
            <WfConfigBranch
              v-else-if="store.selectedNode.type === 'branch'"
              :node="store.selectedNode"
            />
            <WfConfigWebSearch
              v-else-if="store.selectedNode.type === 'web_search'"
              :node="store.selectedNode"
            />
            <WfNodePreview
              v-if="selectedNodeRun"
              :node-run="selectedNodeRun"
              :node-type="store.selectedNode.type"
            />
            <div class="workflow-page__config-drawer-actions">
              <el-button type="danger" @click="handleDeleteSelectedNode">
                <Trash2 :size="14" />
                {{ t('workflow.deleteNode') }}
              </el-button>
              <WfSaveAsTemplateButton
                v-if="store.selectedNode && store.selectedNode.type !== 'branch'"
                :node-id="store.selectedNode.id"
              />
              <el-button type="primary" @click="handleSaveFromDrawer">
                <Save :size="14" />
                {{ t('workflow.save') }}
              </el-button>
            </div>
          </div>
        </el-drawer>
      </template>

      <!-- History view -->
      <template v-else-if="activeView === 'history'">
        <WfRunHistoryView
          :workflow-id="historyWorkflowId"
          :workflow-name="historyWorkflowName"
          @back="handleHistoryBack"
        />
      </template>

      <!-- Custom node editor view -->
      <WfCustomNodeEditor
        v-else-if="activeView === 'customNodeEditor'"
        :template-id="store.editingTemplateId || undefined"
        @back="handleExitCustomNodeEditor"
      />
    </template>

    <!-- ═══ Mobile ═══ -->
    <template v-else>
      <!-- Mobile list view -->
      <template v-if="activeView === 'list'">
        <div class="workflow-page__mobile-list-header">
          <button class="workflow-page__back-btn" @click="$emit('back')">
            <ArrowLeft :size="18" />
          </button>
          <span class="workflow-page__mobile-title">{{ t('workflow.title') }}</span>
        </div>
        <WfListView
          :is-mobile="true"
          @edit="handleEdit"
          @created="handleCreated"
          @history="handleHistory"
          @edit-template="handleEditTemplate"
          @create-template="handleCreateTemplate"
        />
      </template>

      <!-- Mobile editor view -->
      <template v-else-if="activeView === 'editor'">
        <div class="workflow-page__mobile-editor-header">
          <button class="workflow-page__back-btn" @click="handleEditorBack">
            <ArrowLeft :size="18" />
          </button>
          <span class="workflow-page__mobile-title">
            {{ store.editorWorkflow?.name ?? '' }}
          </span>
          <div class="workflow-page__mobile-actions">
            <el-button size="small" @click="handleSave">
              <Save :size="14" />
            </el-button>
            <el-button size="small" type="primary" @click="handleEditorRun">
              <Play :size="14" />
            </el-button>
            <el-button size="small" @click="showMobileCopilot = true">
              <MessageSquare :size="14" />
            </el-button>
          </div>
        </div>
        <div class="workflow-page__mobile-nodes">
          <template v-for="(node, idx) in store.editorWorkflow?.nodes ?? []" :key="node.id">
            <WfMobileNodeConnector v-if="idx > 0" />
            <WfMobileNodeCard
              :node="node"
              :status="store.nodeExecutionStates.get(node.id)"
              :cascade="store.getNodeCascade(node.id)"
              @click="handleMobileNodeSelect(node.id)"
            />
          </template>
        </div>
        <el-button
          v-show="!showMobileCopilot"
          class="workflow-page__mobile-add-btn"
          :icon="Plus"
          circle
          type="primary"
          @click="showMobileAddMenu = true"
        />

        <!-- Mobile add node menu -->
        <el-drawer
          v-model="showMobileAddMenu"
          direction="btt"
          size="40%"
          :title="t('workflow.addNode')"
        >
          <div class="workflow-page__mobile-node-menu">
            <button class="workflow-page__mobile-node-option" @click="addMobileNode('sql')">
              <Database :size="20" :style="{ color: NODE_COLORS.sql }" />
              <span>{{ t('workflow.nodeTypes.sql') }}</span>
            </button>
            <button class="workflow-page__mobile-node-option" @click="addMobileNode('python')">
              <Code :size="20" :style="{ color: NODE_COLORS.python }" />
              <span>{{ t('workflow.nodeTypes.python') }}</span>
            </button>
            <button class="workflow-page__mobile-node-option" @click="addMobileNode('llm')">
              <Sparkles :size="20" :style="{ color: NODE_COLORS.llm }" />
              <span>{{ t('workflow.nodeTypes.llm') }}</span>
            </button>
            <button class="workflow-page__mobile-node-option" @click="addMobileNode('branch')">
              <GitBranch :size="20" :style="{ color: NODE_COLORS.branch }" />
              <span>{{ t('workflow.nodeTypes.branch') }}</span>
            </button>
            <button class="workflow-page__mobile-node-option" @click="addMobileNode('web_search')">
              <Search :size="20" :style="{ color: NODE_COLORS.web_search }" />
              <span>{{ t('workflow.nodeTypes.web_search') }}</span>
            </button>
          </div>
        </el-drawer>

        <!-- Mobile node config sheet -->
        <WfMobileNodeConfigSheet
          :node="mobileConfigNode"
          :visible="showMobileConfig"
          @close="showMobileConfig = false"
        />

        <!-- Mobile Copilot (full screen) -->
        <WfMobileCopilot v-if="showMobileCopilot" @back="showMobileCopilot = false" />
      </template>

      <!-- Mobile history view -->
      <template v-else-if="activeView === 'history'">
        <WfRunHistoryView
          :workflow-id="historyWorkflowId"
          :workflow-name="historyWorkflowName"
          :is-mobile="true"
          @back="handleHistoryBack"
        />
      </template>

      <!-- Mobile custom node editor view -->
      <WfCustomNodeEditor
        v-else-if="activeView === 'customNodeEditor'"
        :template-id="store.editingTemplateId || undefined"
        @back="handleExitCustomNodeEditor"
      />
    </template>

    <!-- Run params dialog (shared) -->
    <WfRunParamsDialog
      v-model:visible="showRunParams"
      :params="detectedParams"
      @confirm="handleRunConfirm"
    />

    <ConfirmDialog
      v-model:visible="showDeleteNodeConfirm"
      :title="t('common.warning')"
      :message="t('workflow.deleteNodeConfirm')"
      type="danger"
      :confirm-text="t('common.delete')"
      @confirm="confirmDeleteNode"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { ConfirmDialog } from '@/components/common';
import {
  ArrowLeft,
  Plus,
  Save,
  Play,
  Database,
  Code,
  Sparkles,
  GitBranch,
  Search,
  MessageSquare,
  Trash2,
} from 'lucide-vue-next';
import {
  useWorkflowStore,
  useDatafileStore,
  useCopilotStore,
  useDebugCopilotStore,
} from '@/stores';
import { useNavigationStore } from '@/stores/navigationStore';
import type { WorkflowNodeType } from '@/types/workflow';
import { NODE_COLORS } from '@/constants/workflow';
import WfListView from './WfListView.vue';
import WfNodePalette from './WfNodePalette.vue';
import WfEditorHeader from './WfEditorHeader.vue';
import WfEditorCanvas from './WfEditorCanvas.vue';
import WfCopilotPanel from './copilot/WfCopilotPanel.vue';
import WfRunParamsDialog from './WfRunParamsDialog.vue';
import WfMobileNodeCard from './mobile/WfMobileNodeCard.vue';
import WfMobileNodeConnector from './mobile/WfMobileNodeConnector.vue';
import WfMobileNodeConfigSheet from './mobile/WfMobileNodeConfigSheet.vue';
import WfMobileCopilot from './copilot/mobile/WfMobileCopilot.vue';
import WfConfigSqlQuery from './config/WfConfigSqlQuery.vue';
import WfConfigPythonScript from './config/WfConfigPythonScript.vue';
import WfConfigLlmGenerate from './config/WfConfigLlmGenerate.vue';
import WfConfigEmail from './config/WfConfigEmail.vue';
import WfConfigBranch from './config/WfConfigBranch.vue';
import WfConfigWebSearch from './config/WfConfigWebSearch.vue';
import WfSaveAsTemplateButton from './config/WfSaveAsTemplateButton.vue';
import WfNodePreview from './WfNodePreview.vue';
import WfRunHistoryView from './WfRunHistoryView.vue';
import WfCustomNodeEditor from './WfCustomNodeEditor.vue';

defineProps<{
  isMobile?: boolean;
}>();

defineEmits<{
  back: [];
}>();

const { t } = useI18n();
const store = useWorkflowStore();
const datafileStore = useDatafileStore();
const copilotStore = useCopilotStore();
const navigationStore = useNavigationStore();
const debugCopilotStore = useDebugCopilotStore();

const activeView = ref<'list' | 'editor' | 'history' | 'customNodeEditor'>('list');
const historyWorkflowId = ref('');
const historyWorkflowName = ref('');
const isSaving = ref(false);
const showRunParams = ref(false);
const showMobileAddMenu = ref(false);
const showMobileConfig = ref(false);
const showMobileCopilot = ref(false);
const mobileSelectedNodeId = ref<string | null>(null);

const detectedParams = computed<string[]>(() => {
  if (!store.editorWorkflow) return [];
  const paramSet = new Set<string>();
  for (const node of store.editorWorkflow.nodes) {
    const cfg = node.config;
    if (cfg.nodeType === 'sql') {
      extractParams(cfg.sql, paramSet);
    } else if (cfg.nodeType === 'python') {
      extractParams(cfg.script, paramSet);
    } else if (cfg.nodeType === 'llm') {
      extractParams(cfg.prompt, paramSet);
    }
  }
  return [...paramSet];
});

const selectedNodeTitle = computed(() => {
  if (!store.selectedNode) return '';
  return t(`workflow.nodeTypes.${store.selectedNode.type}`);
});

const selectedNodeRun = computed(() => {
  if (!store.selectedNode || !store.lastRunDetail) return null;
  return store.lastRunDetail.nodeRuns.find((nr) => nr.nodeId === store.selectedNode?.id) ?? null;
});

const mobileConfigNode = computed(() => {
  if (!mobileSelectedNodeId.value || !store.editorWorkflow) return null;
  return store.editorWorkflow.nodes.find((n) => n.id === mobileSelectedNodeId.value) ?? null;
});

function extractParams(text: string, paramSet: Set<string>): void {
  const regex = /\{\{params\.(\w+)\}\}/g;
  let match = regex.exec(text);
  while (match !== null) {
    paramSet.add(match[1]);
    match = regex.exec(text);
  }
}

onMounted(async () => {
  await Promise.all([
    store.fetchWorkflows(),
    store.fetchTemplates(),
    datafileStore.fetchDatasources(),
  ]);

  // Consume pending intent from action card navigation
  const intent = navigationStore.pendingIntent;
  if (!intent) return;

  if (intent.type === 'open_workflow_editor') {
    navigationStore.clearPendingIntent();
    try {
      await store.loadForEditing(intent.workflowId);
      copilotStore.connect(intent.workflowId);
      activeView.value = 'editor';
      if (intent.copilotPrompt) {
        await new Promise<void>((resolve, reject) => {
          let attempts = 0;
          const interval = setInterval(() => {
            if (copilotStore.isConnected && copilotStore.workflowId === intent.workflowId) {
              clearInterval(interval);
              resolve();
            } else if (++attempts >= 50) {
              clearInterval(interval);
              reject(new Error('Copilot connection timeout'));
            }
          }, 200);
        });
        copilotStore.sendMessage(intent.copilotPrompt);
      }
    } catch {
      ElMessage.error(t('common.failed'));
    }
  } else if (intent.type === 'open_template_editor') {
    navigationStore.clearPendingIntent();
    try {
      store.enterCustomNodeEditor(intent.templateId);
      activeView.value = 'customNodeEditor';
      if (intent.copilotPrompt) {
        await new Promise<void>((resolve, reject) => {
          let attempts = 0;
          const interval = setInterval(() => {
            if (debugCopilotStore.isConnected) {
              clearInterval(interval);
              resolve();
            } else if (++attempts >= 50) {
              clearInterval(interval);
              reject(new Error('Debug Copilot connection timeout'));
            }
          }, 200);
        });
        debugCopilotStore.sendMessage(intent.copilotPrompt);
      }
    } catch {
      ElMessage.error(t('common.failed'));
    }
  } else {
    navigationStore.clearPendingIntent();
  }
});

async function handleEdit(id: string): Promise<void> {
  try {
    await store.loadForEditing(id);
    copilotStore.connect(id);
    activeView.value = 'editor';
  } catch {
    ElMessage.error(t('common.failed'));
  }
}

async function handleCreated(id: string): Promise<void> {
  try {
    await store.loadForEditing(id);
    copilotStore.connect(id);
    activeView.value = 'editor';
  } catch {
    ElMessage.error(t('common.failed'));
  }
}

function handleEditorBack(): void {
  store.closeEditor();
  copilotStore.disconnect();
  activeView.value = 'list';
  store.fetchWorkflows();
}

function handleHistory(id: string): void {
  const wf = store.workflows.find((w) => w.id === id);
  historyWorkflowId.value = id;
  historyWorkflowName.value = wf?.name ?? '';
  activeView.value = 'history';
}

function handleHistoryBack(): void {
  store.resetHistoryState();
  activeView.value = 'list';
}

function handleEditTemplate(templateId: string): void {
  store.enterCustomNodeEditor(templateId);
  activeView.value = 'customNodeEditor';
}

function handleCreateTemplate(): void {
  store.enterCustomNodeEditor('');
  activeView.value = 'customNodeEditor';
}

function handleExitCustomNodeEditor(): void {
  store.exitCustomNodeEditor();
  activeView.value = 'list';
}

const showDeleteNodeConfirm = ref(false);

function handleDeleteSelectedNode(): void {
  if (!store.selectedNodeId) return;
  showDeleteNodeConfirm.value = true;
}

function confirmDeleteNode(): void {
  if (!store.selectedNodeId) return;
  store.removeNode(store.selectedNodeId);
  store.selectNode(null);
  showDeleteNodeConfirm.value = false;
}

async function handleSaveFromDrawer(): Promise<void> {
  await store.saveWorkflow();
}

async function handleSave(): Promise<void> {
  isSaving.value = true;
  try {
    await store.saveWorkflow();
    ElMessage.success(t('workflow.saveSuccess'));
  } catch {
    ElMessage.error(t('workflow.saveFailed'));
  } finally {
    isSaving.value = false;
  }
}

function handleEditorRun(): void {
  if (detectedParams.value.length > 0) {
    showRunParams.value = true;
  } else {
    doExecute();
  }
}

async function handleRunConfirm(params: Record<string, string>): Promise<void> {
  showRunParams.value = false;
  await doExecute(params);
}

async function doExecute(params?: Record<string, string>): Promise<void> {
  try {
    if (store.isDirty) {
      await store.saveWorkflow();
    }
    if (store.selectedNodeId) {
      await store.executeNode(store.selectedNodeId, params);
    } else {
      await store.executeWorkflow(params);
    }
  } catch {
    ElMessage.error(t('common.failed'));
  }
}

function handleMobileNodeSelect(nodeId: string): void {
  mobileSelectedNodeId.value = nodeId;
  store.selectNode(nodeId);
  showMobileConfig.value = true;
}

function addMobileNode(type: WorkflowNodeType): void {
  const nodeCount = store.editorWorkflow?.nodes.length ?? 0;
  store.addNode(type, { x: 100, y: nodeCount * 180 + 100 });
  showMobileAddMenu.value = false;
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/console' as console;

.workflow-page {
  @include console.console-page;

  flex-direction: row;

  &--mobile {
    flex-direction: column;
  }

  &__editor-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    background:
      var(--bg-console-grid) 0 0 / 28px 28px,
      var(--bg-console);
  }

  &__editor-body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  &__canvas {
    flex: 1;
    min-width: 0;
  }

  &__config-drawer {
    display: flex;
    flex-direction: column;
    height: 100%;

    // Vertical form layout — label on top, input below
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

    // Larger code editor
    :deep(.cm-editor) {
      height: 360px !important;
    }

    // Param row: key + type + delete on first line, value on second line
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

  // Mobile styles
  &__mobile-list-header,
  &__mobile-editor-header {
    @include console.console-mobile-header;
  }

  &__mobile-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-md;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
    white-space: nowrap;
  }

  &__mobile-actions {
    display: flex;
    gap: $spacing-xs;
  }

  &__back-btn {
    @include console.console-icon-button;
  }

  &__mobile-nodes {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $spacing-xs;
    align-items: center;
    padding: $spacing-md;
    overflow-y: auto;
  }

  &__mobile-add-btn {
    position: fixed;
    right: 18px;
    bottom: max(18px, env(safe-area-inset-bottom, 0px));
    z-index: $z-index-fixed;
    width: 48px;
    height: 48px;
    box-shadow: var(--shadow-lg);
  }

  &__mobile-node-menu {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }

  &__mobile-node-option {
    display: flex;
    gap: $spacing-md;
    align-items: center;
    padding: $spacing-md;
    font-size: $font-size-sm;
    color: var(--text-primary);
    cursor: pointer;
    background: var(--bg-panel);
    border: 1px solid var(--border-primary);
    border-radius: $radius-lg;
    transition:
      background-color $transition-fast,
      border-color $transition-fast;

    &:hover {
      background-color: var(--bg-elevated);
      border-color: var(--border-secondary);
    }
  }
}
</style>
