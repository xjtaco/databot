<template>
  <div class="wf-config-panel">
    <div v-if="node" class="wf-config-panel__content">
      <!-- Header -->
      <div class="wf-config-panel__header">
        <div class="wf-config-panel__header-info">
          <span class="wf-config-panel__icon" :style="{ color: nodeColor }">
            <Database v-if="node.type === 'sql'" :size="18" />
            <Code v-else-if="node.type === 'python'" :size="18" />
            <Sparkles v-else-if="node.type === 'llm'" :size="18" />
            <Mail v-else-if="node.type === 'email'" :size="18" />
          </span>
          <span class="wf-config-panel__title">{{ t(`workflow.nodeTypes.${node.type}`) }}</span>
        </div>
        <button class="wf-config-panel__delete-btn" @click="handleDelete">
          <Trash2 :size="16" />
        </button>
      </div>

      <!-- Config body -->
      <div class="wf-config-panel__body">
        <WfConfigSqlQuery v-if="node.type === 'sql'" :node="node" />
        <WfConfigPythonScript v-else-if="node.type === 'python'" :node="node" />
        <WfConfigLlmGenerate v-else-if="node.type === 'llm'" :node="node" />
        <WfConfigEmail v-else-if="node.type === 'email'" :node="node" />
      </div>

      <!-- Preview -->
      <WfNodePreview v-if="nodeRun" :node-run="nodeRun" :node-type="node.type" />
    </div>

    <ConfirmDialog
      v-model:visible="showDeleteConfirm"
      :title="t('common.warning')"
      :message="t('workflow.deleteNodeConfirm')"
      type="danger"
      :confirm-text="t('common.delete')"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ConfirmDialog } from '@/components/common';
import { Database, Code, Sparkles, Mail, Trash2 } from 'lucide-vue-next';
import { useWorkflowStore } from '@/stores';
import { NODE_COLORS } from '@/constants/workflow';
import WfConfigSqlQuery from './config/WfConfigSqlQuery.vue';
import WfConfigPythonScript from './config/WfConfigPythonScript.vue';
import WfConfigLlmGenerate from './config/WfConfigLlmGenerate.vue';
import WfConfigEmail from './config/WfConfigEmail.vue';
import WfNodePreview from './WfNodePreview.vue';

const { t } = useI18n();
const store = useWorkflowStore();

const node = computed(() => store.selectedNode);

const nodeColor = computed(() => {
  if (!node.value) return '#6b6b70';
  return NODE_COLORS[node.value.type];
});

const nodeRun = computed(() => {
  if (!node.value || !store.lastRunDetail) return null;
  return store.lastRunDetail.nodeRuns.find((nr) => nr.nodeId === node.value?.id) ?? null;
});

const showDeleteConfirm = ref(false);

function handleDelete(): void {
  if (!node.value) return;
  showDeleteConfirm.value = true;
}

function confirmDelete(): void {
  if (!node.value) return;
  store.removeNode(node.value.id);
  showDeleteConfirm.value = false;
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

$panel-width: 320px;

.wf-config-panel {
  width: $panel-width;
  min-width: $panel-width;
  height: 100%;
  overflow-y: auto;
  background-color: $bg-sidebar;
  border-left: 1px solid $border-dark;

  &__content {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  &__header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-md;
    border-bottom: 1px solid $border-dark;
  }

  &__header-info {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
  }

  &__icon {
    display: flex;
    align-items: center;
  }

  &__title {
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
  }

  &__delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: $text-muted;
    cursor: pointer;
    background: none;
    border: none;
    border-radius: $radius-sm;
    transition: all $transition-fast;

    &:hover {
      color: $error;
      background-color: $error-tint;
    }
  }

  &__body {
    flex: 1;
    padding: $spacing-md;
    overflow-y: auto;

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
  }
}
</style>
