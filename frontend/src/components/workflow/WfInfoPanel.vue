<template>
  <div class="wf-info-panel">
    <!-- Description -->
    <div class="wf-info-panel__section">
      <h3 class="wf-info-panel__section-title">{{ t('workflow.description') }}</h3>
      <p class="wf-info-panel__description">
        {{ detail?.description || '—' }}
      </p>
    </div>

    <!-- Nodes list -->
    <div class="wf-info-panel__section">
      <h3 class="wf-info-panel__section-title">{{ t('workflow.nodes') }}</h3>
      <div v-if="detail" class="wf-info-panel__nodes">
        <div v-for="node in detail.nodes" :key="node.id" class="wf-info-panel__node-item">
          <span
            class="wf-info-panel__node-dot"
            :style="{ backgroundColor: getNodeColor(node.type) }"
          ></span>
          <span class="wf-info-panel__node-name">{{ node.name }}</span>
          <span class="wf-info-panel__node-type">{{ t(`workflow.nodeTypes.${node.type}`) }}</span>
        </div>
      </div>
      <div v-else class="wf-info-panel__empty-hint">{{ t('common.loading') }}</div>
    </div>

    <!-- Run History -->
    <div class="wf-info-panel__section">
      <h3 class="wf-info-panel__section-title">{{ t('workflow.runHistory') }}</h3>
      <div v-if="store.runs.length === 0" class="wf-info-panel__empty-hint">
        {{ t('workflow.execution.noRuns') }}
      </div>
      <div v-else class="wf-info-panel__runs">
        <div v-for="run in store.runs.slice(0, 10)" :key="run.id" class="wf-info-panel__run-item">
          <span class="wf-info-panel__run-status" :class="`is-${run.status}`">
            {{ t(`workflow.execution.${run.status}`) }}
          </span>
          <span class="wf-info-panel__run-time">
            {{ formatRunTime(run.startedAt) }}
          </span>
          <span v-if="run.completedAt" class="wf-info-panel__run-duration">
            {{ formatDuration(run.startedAt, run.completedAt) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorkflowStore } from '@/stores';
import * as workflowApi from '@/api/workflow';
import type { WorkflowDetail, WorkflowNodeType } from '@/types/workflow';
import { NODE_COLORS } from '@/constants/workflow';
import { formatDuration } from '@/utils/time';

const props = defineProps<{
  workflowId: string;
}>();

const { t } = useI18n();
const store = useWorkflowStore();
const detail = ref<WorkflowDetail | null>(null);

watch(
  () => props.workflowId,
  async (id) => {
    if (id) {
      try {
        detail.value = await workflowApi.getWorkflow(id);
        await store.fetchRuns(id);
      } catch {
        detail.value = null;
      }
    } else {
      detail.value = null;
    }
  },
  { immediate: true }
);

function getNodeColor(type: WorkflowNodeType): string {
  return NODE_COLORS[type];
}

function formatRunTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

$panel-width: 300px;

.wf-info-panel {
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
  width: $panel-width;
  min-width: $panel-width;
  height: 100%;
  padding: $spacing-md;
  overflow-y: auto;
  background-color: $bg-sidebar;
  border-left: 1px solid $border-dark;

  &__section-title {
    margin: 0 0 $spacing-sm;
    font-size: $font-size-xs;
    font-weight: $font-weight-semibold;
    color: $text-muted;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__description {
    margin: 0;
    font-size: $font-size-sm;
    line-height: $line-height-relaxed;
    color: $text-secondary-color;
  }

  &__nodes {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
  }

  &__node-item {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-xs $spacing-sm;
    border-radius: $radius-sm;
  }

  &__node-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: $radius-full;
  }

  &__node-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-sm;
    color: $text-primary-color;
    white-space: nowrap;
  }

  &__node-type {
    flex-shrink: 0;
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__runs {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
  }

  &__run-item {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-xs $spacing-sm;
    font-size: $font-size-xs;
    border-radius: $radius-sm;
  }

  &__run-status {
    flex-shrink: 0;
    font-weight: $font-weight-medium;

    &.is-completed {
      color: $success;
    }

    &.is-failed {
      color: $error;
    }

    &.is-running {
      color: $warning;
    }

    &.is-pending {
      color: $text-muted;
    }

    &.is-skipped,
    &.is-cancelled {
      color: $text-muted;
    }
  }

  &__run-time {
    flex: 1;
    color: $text-muted;
  }

  &__run-duration {
    flex-shrink: 0;
    color: $text-secondary-color;
  }

  &__empty-hint {
    padding: $spacing-sm;
    font-size: $font-size-xs;
    color: $text-muted;
  }
}
</style>
