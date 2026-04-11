<template>
  <div
    class="wf-canvas-node"
    :class="[
      `wf-canvas-node--${data.nodeType}`,
      {
        'is-selected': selected,
        'is-running': data.executionStatus === 'running',
        'is-completed': data.executionStatus === 'completed',
        'is-failed': data.executionStatus === 'failed',
        'is-skipped': data.executionStatus === 'skipped',
      },
    ]"
  >
    <Handle type="target" :position="Position.Top" />

    <!-- Header -->
    <div class="wf-canvas-node__header" :style="{ backgroundColor: nodeColor }">
      <Database v-if="data.nodeType === 'sql'" :size="12" />
      <Code v-else-if="data.nodeType === 'python'" :size="12" />
      <Sparkles v-else-if="data.nodeType === 'llm'" :size="12" />
      <Mail v-else-if="data.nodeType === 'email'" :size="12" />
      <GitBranch v-else-if="data.nodeType === 'branch'" :size="14" />
      <Search v-else-if="data.nodeType === 'web_search'" :size="14" />
      <span class="wf-canvas-node__type-label">{{ typeLabel }}</span>
    </div>

    <!-- Body -->
    <div class="wf-canvas-node__body">
      <span class="wf-canvas-node__name">{{ data.label }}</span>
      <span v-if="data.contentPreview" class="wf-canvas-node__preview">
        {{ data.contentPreview }}
      </span>
    </div>

    <!-- Footer -->
    <div v-if="data.outputVariable" class="wf-canvas-node__footer">
      <span class="wf-canvas-node__output-label">{{ data.outputVariable }}</span>
      <div class="wf-canvas-node__run-controls">
        <el-tooltip :content="t('workflow.config.cascade')" placement="top">
          <button
            class="wf-canvas-node__cascade-btn"
            :class="{ 'is-active': data.cascade }"
            @click.stop="handleToggleCascade"
          >
            <ArrowRightLeft :size="10" />
          </button>
        </el-tooltip>
        <el-tooltip :content="t('workflow.config.runNode')" placement="top">
          <button
            class="wf-canvas-node__run-btn"
            :disabled="data.executionStatus === 'running'"
            @click.stop="handleRunNode"
          >
            <Loader2
              v-if="data.executionStatus === 'running'"
              :size="10"
              class="wf-canvas-node__spin"
            />
            <Play v-else :size="10" fill="currentColor" />
          </button>
        </el-tooltip>
      </div>
    </div>

    <!-- Output handles -->
    <template v-if="data.nodeType === 'branch'">
      <Handle
        id="true"
        type="source"
        :position="Position.Bottom"
        :style="{ left: '30%', background: '#22C55E' }"
      />
      <Handle
        id="false"
        type="source"
        :position="Position.Bottom"
        :style="{ left: '70%', background: '#EF4444' }"
      />
      <div class="wf-canvas-node__branch-labels">
        <span class="branch-label branch-label--true">{{ t('workflow.branch.yes') }}</span>
        <span class="branch-label branch-label--false">{{ t('workflow.branch.no') }}</span>
      </div>
    </template>
    <Handle v-else type="source" :position="Position.Bottom" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { useI18n } from 'vue-i18n';
import {
  Database,
  Code,
  Sparkles,
  Mail,
  GitBranch,
  Search,
  Play,
  ArrowRightLeft,
  Loader2,
} from 'lucide-vue-next';
import type { WfCanvasNodeData } from './WfEditorCanvas.vue';
import { NODE_COLORS } from '@/constants/workflow';
import { useWorkflowStore } from '@/stores';

const props = defineProps<{
  id: string;
  data: WfCanvasNodeData;
  selected?: boolean;
}>();

const emit = defineEmits<{
  runNode: [nodeId: string];
}>();

const { t } = useI18n();
const store = useWorkflowStore();

const nodeColor = computed(() => NODE_COLORS[props.data.nodeType]);
const typeLabel = computed(() => t(`workflow.nodeTypes.${props.data.nodeType}`));

function handleRunNode(): void {
  emit('runNode', props.id);
}

function handleToggleCascade(): void {
  const current = store.getNodeCascade(props.id);
  store.setNodeCascade(props.id, !current);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-canvas-node {
  width: 160px;
  overflow: hidden;
  font-family: $font-family-sans;
  background-color: $bg-card;
  border: 1.5px solid $border-dark;
  border-radius: $radius-sm;
  transition: border-color $transition-fast;

  // Node type color RGB variables for animation
  &--sql {
    --node-color-rgb: 59, 130, 246;
  }

  &--python {
    --node-color-rgb: 34, 197, 94;
  }

  &--llm {
    --node-color-rgb: 168, 85, 247;
  }

  &--email {
    --node-color-rgb: 236, 72, 153;
  }

  &--branch {
    --node-color-rgb: 245, 158, 11;
  }

  &--web_search {
    --node-color-rgb: 6, 182, 212;
  }

  &.is-selected {
    border-color: $accent;
  }

  &.is-running {
    border-color: rgb(var(--node-color-rgb));
    animation: node-pulse 1.5s ease-in-out infinite;
  }

  &.is-completed {
    border-color: #52c41a;
    animation: flash-success 0.6s ease-out;
  }

  &.is-failed {
    border-color: #f5222d;
    box-shadow: 0 0 8px rgb(245 34 45 / 30%);
    animation: flash-error 0.4s ease-out;
  }

  &.is-skipped {
    border-color: #d9d9d9;
    opacity: 0.5;
  }

  &__header {
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 4px 8px;
    font-size: 11px;
    color: #fff;
  }

  &__type-label {
    font-weight: $font-weight-medium;
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 5px 8px;
  }

  &__name {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-xs;
    font-weight: $font-weight-medium;
    color: $text-primary-color;
    white-space: nowrap;
  }

  &__preview {
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: $font-family-mono;
    font-size: 11px;
    color: $text-muted;
    white-space: nowrap;
  }

  &__footer {
    display: flex;
    align-items: center;
    padding: 3px 8px 4px;
    border-top: 1px solid $border-dark;
  }

  &__output-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: $font-family-mono;
    font-size: 10px;
    color: $text-muted;
    white-space: nowrap;
  }

  &__run-controls {
    display: flex;
    flex-shrink: 0;
    gap: 2px;
    align-items: center;
    margin-left: auto;
  }

  &__cascade-btn,
  &__run-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
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

  &__branch-labels {
    display: flex;
    justify-content: space-between;
    padding: 0 8px;
    font-size: 10px;
    color: var(--el-text-color-secondary);
  }
}

@keyframes node-pulse {
  0%,
  100% {
    box-shadow: 0 0 4px rgb(var(--node-color-rgb), 0.3);
  }

  50% {
    box-shadow: 0 0 16px rgb(var(--node-color-rgb), 0.6);
  }
}

@keyframes flash-success {
  0% {
    box-shadow: 0 0 0 rgb(82 196 26 / 0%);
  }

  30% {
    box-shadow: 0 0 20px rgb(82 196 26 / 50%);
  }

  100% {
    box-shadow: 0 0 4px rgb(82 196 26 / 20%);
  }
}

@keyframes flash-error {
  0%,
  100% {
    transform: translateX(0);
  }

  20%,
  60% {
    transform: translateX(-3px);
  }

  40%,
  80% {
    transform: translateX(3px);
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
