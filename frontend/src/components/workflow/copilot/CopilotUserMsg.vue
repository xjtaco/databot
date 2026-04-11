<template>
  <div class="copilot-user-msg">
    <div class="copilot-user-msg__bubble">{{ content }}</div>
    <div class="copilot-user-msg__avatar">
      <User :size="14" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { User } from 'lucide-vue-next';

defineProps<{
  content: string;
}>();
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.copilot-user-msg {
  display: flex;
  gap: $spacing-xs;
  align-items: flex-start;
  justify-content: flex-end;
  margin: $spacing-sm 0;

  &__bubble {
    max-width: 80%;
    padding: $spacing-sm 12px;
    font-size: $font-size-sm;
    line-height: $line-height-normal;
    color: #1a1a2e;
    overflow-wrap: break-word;
    background-color: #e8f0fe;
    border-radius: $radius-lg;
  }

  &__avatar {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border-radius: $radius-sm;
  }
}
</style>
