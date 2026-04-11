<template>
  <el-drawer
    :model-value="visible"
    direction="btt"
    size="90%"
    :title="drawerTitle"
    @close="$emit('close')"
  >
    <div v-if="node" class="wf-mobile-config-sheet">
      <WfConfigSqlQuery v-if="node.type === 'sql'" :node="node" />
      <WfConfigPythonScript v-else-if="node.type === 'python'" :node="node" />
      <WfConfigLlmGenerate v-else-if="node.type === 'llm'" :node="node" />
      <WfConfigEmail v-else-if="node.type === 'email'" :node="node" />
      <WfConfigBranch v-else-if="node.type === 'branch'" :node="node" />
      <WfConfigWebSearch v-else-if="node.type === 'web_search'" :node="node" />

      <WfNodePreview v-if="nodeRun" :node-run="nodeRun" :node-type="node.type" />

      <div class="wf-mobile-config-sheet__actions">
        <el-button type="danger" @click="handleDelete">
          <Trash2 :size="14" />
          {{ t('workflow.deleteNode') }}
        </el-button>
        <WfSaveAsTemplateButton v-if="node.type !== 'branch'" :node-id="node.id" />
        <el-button type="primary" @click="handleSave">
          <Save :size="14" />
          {{ t('workflow.save') }}
        </el-button>
      </div>
    </div>

    <ConfirmDialog
      v-model:visible="showDeleteConfirm"
      :title="t('common.warning')"
      :message="t('workflow.deleteNodeConfirm')"
      type="danger"
      :confirm-text="t('common.delete')"
      @confirm="confirmDelete"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ConfirmDialog } from '@/components/common';
import { Trash2, Save } from 'lucide-vue-next';
import { useWorkflowStore } from '@/stores';
import type { WorkflowNodeInfo } from '@/types/workflow';
import WfConfigSqlQuery from '../config/WfConfigSqlQuery.vue';
import WfConfigPythonScript from '../config/WfConfigPythonScript.vue';
import WfConfigLlmGenerate from '../config/WfConfigLlmGenerate.vue';
import WfConfigEmail from '../config/WfConfigEmail.vue';
import WfConfigBranch from '../config/WfConfigBranch.vue';
import WfConfigWebSearch from '../config/WfConfigWebSearch.vue';
import WfNodePreview from '../WfNodePreview.vue';
import WfSaveAsTemplateButton from '../config/WfSaveAsTemplateButton.vue';

const props = defineProps<{
  node: WorkflowNodeInfo | null;
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const store = useWorkflowStore();

const drawerTitle = computed(() => {
  if (!props.node) return '';
  return t(`workflow.nodeTypes.${props.node.type}`);
});

const nodeRun = computed(() => {
  if (!props.node || !store.lastRunDetail) return null;
  return store.lastRunDetail.nodeRuns.find((nr) => nr.nodeId === props.node?.id) ?? null;
});

const showDeleteConfirm = ref(false);

function handleDelete(): void {
  if (!props.node) return;
  showDeleteConfirm.value = true;
}

function confirmDelete(): void {
  if (!props.node) return;
  store.removeNode(props.node.id);
  showDeleteConfirm.value = false;
  emit('close');
}

async function handleSave(): Promise<void> {
  await store.saveWorkflow();
  emit('close');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-mobile-config-sheet {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
  padding-bottom: $spacing-lg;

  :deep(.el-form-item) {
    flex-direction: column;
    align-items: stretch;
    margin-bottom: $spacing-md;

    .el-form-item__label {
      justify-content: flex-start;
      height: auto;
      padding-bottom: 4px;
      font-size: $font-size-xs;
      line-height: 1.4;
      color: $text-muted;
    }

    .el-form-item__content {
      flex: 1;
    }
  }

  &__actions {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    justify-content: flex-end;
    padding-top: $spacing-md;
    border-top: 1px solid $border-dark;
  }
}
</style>
