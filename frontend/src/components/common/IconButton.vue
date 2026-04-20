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
@use '@/styles/console' as console;

.icon-button {
  @include console.console-icon-button;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
    transform: none;
  }
}
</style>
