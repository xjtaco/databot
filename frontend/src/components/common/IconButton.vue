<template>
  <button
    class="icon-button"
    :class="{ 'icon-button--disabled': disabled }"
    :disabled="disabled"
    :title="title"
    @click="$emit('click', $event)"
  >
    <slot></slot>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
  disabled?: boolean;
}>();

defineEmits<{
  click: [event: MouseEvent];
}>();
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: $radius-md;
  transition:
    background-color $transition-fast,
    color $transition-fast;

  &:hover:not(.icon-button--disabled) {
    color: var(--text-primary);
    background-color: var(--bg-hover);
  }

  &:active:not(.icon-button--disabled) {
    transform: scale(0.95);
  }

  @media (max-width: $breakpoint-md) {
    width: 44px;
    height: 44px;
  }

  &--disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  :deep(svg) {
    width: 20px;
    height: 20px;
  }
}
</style>
