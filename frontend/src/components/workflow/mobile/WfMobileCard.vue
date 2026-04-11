<template>
  <div class="wf-mobile-card" @click="$emit('click')">
    <div class="wf-mobile-card__icon">
      <GitBranch :size="20" />
    </div>
    <div class="wf-mobile-card__info">
      <span class="wf-mobile-card__title">{{ workflow.name }}</span>
      <span v-if="workflow.description" class="wf-mobile-card__description">
        {{ workflow.description }}
      </span>
      <span class="wf-mobile-card__meta">
        <template v-if="workflow.lastRunAt">
          {{ t('workflow.mobile.lastRun', { time: formatTime(workflow.lastRunAt) }) }}
        </template>
        <template v-else>
          {{ t('workflow.mobile.neverRun') }}
        </template>
      </span>
    </div>
    <el-tag size="small" type="info" class="wf-mobile-card__badge">
      {{ t('workflow.mobile.nodeCount', { n: workflow.nodeCount }) }}
    </el-tag>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { GitBranch } from 'lucide-vue-next';
import type { WorkflowListItem } from '@/types/workflow';
import { formatRelativeTime } from '@/utils/time';

defineProps<{
  workflow: WorkflowListItem;
}>();

defineEmits<{
  click: [];
}>();

const { t, locale } = useI18n();

function formatTime(iso: string): string {
  return formatRelativeTime(iso, locale.value);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-mobile-card {
  display: flex;
  gap: $spacing-sm;
  align-items: flex-start;
  padding: $spacing-md;
  cursor: pointer;
  background-color: $bg-card;
  border: 1px solid $border-dark;
  border-radius: $radius-md;
  transition: all $transition-fast;

  &:active {
    background-color: $bg-elevated;
  }

  &__icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    color: $accent;
    background-color: $accent-tint10;
    border-radius: $radius-md;
  }

  &__info {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__title {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
    white-space: nowrap;
  }

  &__description {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-xs;
    color: $text-secondary-color;
    white-space: nowrap;
  }

  &__meta {
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__badge {
    flex-shrink: 0;
    margin-top: 2px;
  }
}
</style>
