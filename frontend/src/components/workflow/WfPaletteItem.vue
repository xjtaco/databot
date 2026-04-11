<template>
  <el-tooltip :content="disabledReason" :disabled="!disabled" placement="right" effect="dark">
    <div
      class="wf-palette-item"
      :class="{ 'is-disabled': disabled }"
      :draggable="!disabled"
      @dragstart="handleDragStart"
    >
      <span class="wf-palette-item__icon" :style="{ color }">
        <slot></slot>
      </span>
      <span class="wf-palette-item__label">{{ label }}</span>
    </div>
  </el-tooltip>
</template>

<script setup lang="ts">
import { ElTooltip } from 'element-plus';
import type { WorkflowNodeType } from '@/types/workflow';

const props = withDefaults(
  defineProps<{
    type: WorkflowNodeType;
    label: string;
    color: string;
    templateId?: string;
    disabled?: boolean;
    disabledReason?: string;
  }>(),
  {
    templateId: undefined,
    disabled: false,
    disabledReason: '',
  }
);

function handleDragStart(event: DragEvent): void {
  if (props.disabled || !event.dataTransfer) return;
  event.dataTransfer.setData('workflow/node-type', props.type);
  if (props.templateId) {
    event.dataTransfer.setData('workflow/template-id', props.templateId);
  }
  event.dataTransfer.effectAllowed = 'move';
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-palette-item {
  display: flex;
  gap: $spacing-sm;
  align-items: center;
  padding: $spacing-sm $spacing-md;
  cursor: grab;
  user-select: none;
  border-radius: $radius-sm;
  transition: all $transition-fast;

  &:hover {
    background-color: $bg-elevated;
  }

  &:active {
    cursor: grabbing;
    opacity: 0.7;
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.4;

    &:hover {
      background-color: transparent;
    }

    &:active {
      cursor: not-allowed;
      opacity: 0.4;
    }
  }

  &__icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
  }

  &__label {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-sm;
    color: $text-secondary-color;
    white-space: nowrap;
  }
}
</style>
