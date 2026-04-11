<template>
  <div class="wf-mobile-node-connector">
    <ChevronDown :size="18" />
  </div>
</template>

<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next';
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-mobile-node-connector {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px 0;
  color: $text-muted;
}
</style>
