<template>
  <div class="copilot-header">
    <span class="copilot-header__title">{{ $t('copilot.title') }}</span>
    <TodosStatusBar scope="workflow-copilot" />
  </div>
</template>

<script setup lang="ts">
import TodosStatusBar from '@/components/chat/TodosStatusBar.vue';
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.copilot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  min-height: 48px;
  padding: 0 $spacing-md;
  border-bottom: 1px solid $border-dark;

  &__title {
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
  }
}
</style>
