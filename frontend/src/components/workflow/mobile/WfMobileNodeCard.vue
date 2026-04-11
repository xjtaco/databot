<template>
  <div
    class="wf-mobile-node-card"
    :class="{
      'is-running': status === 'running',
      'is-completed': status === 'completed',
      'is-failed': status === 'failed',
    }"
    @click="$emit('click')"
  >
    <div class="wf-mobile-node-card__icon" :style="{ backgroundColor: iconBg }">
      <Database v-if="node.type === 'sql'" :size="18" :style="{ color: nodeColor }" />
      <Code v-else-if="node.type === 'python'" :size="18" :style="{ color: nodeColor }" />
      <Sparkles v-else :size="18" :style="{ color: nodeColor }" />
    </div>
    <div class="wf-mobile-node-card__info">
      <span class="wf-mobile-node-card__name">{{ node.name }}</span>
      <span class="wf-mobile-node-card__type">{{ t(`workflow.nodeTypes.${node.type}`) }}</span>
    </div>
    <div class="wf-mobile-node-card__run-controls">
      <button
        class="wf-mobile-node-card__cascade-btn"
        :class="{ 'is-active': cascade }"
        :aria-label="t('workflow.config.cascade')"
        @click.stop="handleToggleCascade"
      >
        <ArrowRightLeft :size="14" />
      </button>
      <button
        class="wf-mobile-node-card__run-btn"
        :disabled="status === 'running'"
        :aria-label="t('workflow.config.runNode')"
        @click.stop="handleRunNode"
      >
        <Loader2 v-if="status === 'running'" :size="14" class="wf-mobile-node-card__spin" />
        <Play v-else :size="14" fill="currentColor" />
      </button>
    </div>
    <ChevronRight :size="18" class="wf-mobile-node-card__chevron" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import {
  Database,
  Code,
  Sparkles,
  ChevronRight,
  Play,
  ArrowRightLeft,
  Loader2,
} from 'lucide-vue-next';
import type { WorkflowNodeInfo, ExecutionStatus } from '@/types/workflow';
import { NODE_COLORS } from '@/constants/workflow';
import { useWorkflowStore } from '@/stores';

const props = defineProps<{
  node: WorkflowNodeInfo;
  status?: ExecutionStatus;
  cascade: boolean;
}>();

defineEmits<{
  click: [];
}>();

const { t } = useI18n();
const store = useWorkflowStore();

const nodeColor = computed(() => NODE_COLORS[props.node.type]);
const iconBg = computed(() => `${nodeColor.value}1a`);

async function handleRunNode(): Promise<void> {
  if (store.isExecuting) return;
  const cascadeVal = store.getNodeCascade(props.node.id);
  try {
    if (store.isDirty) {
      await store.saveWorkflow();
    }
    store.executeNode(props.node.id, undefined, cascadeVal);
  } catch {
    ElMessage.error(t('workflow.saveFailed'));
  }
}

function handleToggleCascade(): void {
  const current = store.getNodeCascade(props.node.id);
  store.setNodeCascade(props.node.id, !current);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-mobile-node-card {
  display: flex;
  gap: $spacing-sm;
  align-items: center;
  width: 100%;
  max-width: 360px;
  padding: $spacing-md;
  cursor: pointer;
  background-color: $bg-card;
  border: 2px solid $border-dark;
  border-radius: $radius-md;
  transition: all $transition-fast;

  &:active {
    background-color: $bg-elevated;
  }

  &.is-running {
    border-color: $warning;
  }

  &.is-completed {
    border-color: $success;
  }

  &.is-failed {
    border-color: $error;
  }

  &__icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: $radius-md;
  }

  &__info {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__name {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $text-primary-color;
    white-space: nowrap;
  }

  &__type {
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__run-controls {
    display: flex;
    flex-shrink: 0;
    gap: $spacing-xs;
    align-items: center;
  }

  &__cascade-btn,
  &__run-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    color: $text-muted;
    cursor: pointer;
    background: transparent;
    border: none;
    border-radius: $radius-sm;
    transition: all $transition-fast;

    &:hover {
      color: $text-primary-color;
      background: $bg-elevated;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  &__cascade-btn.is-active {
    color: $accent;
  }

  &__run-btn:hover:not(:disabled) {
    color: #52c41a;
  }

  &__spin {
    animation: spin 1s linear infinite;
  }

  &__chevron {
    flex-shrink: 0;
    color: $text-muted;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
