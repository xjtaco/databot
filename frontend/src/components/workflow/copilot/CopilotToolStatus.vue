<template>
  <div class="copilot-tool-status" :class="`copilot-tool-status--${status}`">
    <span class="copilot-tool-status__icon">{{ statusIcon }}</span>
    <span class="copilot-tool-status__summary">{{ summary }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status: 'running' | 'success' | 'error';
  summary: string;
}>();

const statusIcon = computed(() => {
  if (props.status === 'running') return '▶';
  if (props.status === 'success') return '✓';
  return '✗';
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.copilot-tool-status {
  display: flex;
  gap: $spacing-xs;
  align-items: center;
  padding: 4px $spacing-md;
  font-family: $font-family-mono;
  font-size: 13px;
  color: $text-secondary-color;

  &--running {
    color: $text-secondary-color;
  }

  &--success {
    color: #52c41a;
  }

  &--error {
    color: #f5222d;
  }

  &__icon {
    flex-shrink: 0;
  }

  &__summary {
    overflow-wrap: break-word;
  }
}
</style>
