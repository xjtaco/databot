<template>
  <div class="wf-copilot-panel" :style="{ width: panelWidth + 'px' }">
    <div class="wf-copilot-panel__resize-handle" @pointerdown="onResizeStart"></div>
    <CopilotHeader />
    <CopilotMessageList
      :messages="copilotStore.messages"
      @remove-message="copilotStore.removeMessage"
    />
    <CopilotInput
      :is-thinking="copilotStore.isAgentThinking"
      @send="copilotStore.sendMessage"
      @abort="copilotStore.abort"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useCopilotStore } from '@/stores';
import CopilotHeader from './CopilotHeader.vue';
import CopilotMessageList from './CopilotMessageList.vue';
import CopilotInput from './CopilotInput.vue';

const MIN_WIDTH = 380;
const MAX_WIDTH = 640;

const copilotStore = useCopilotStore();
const panelWidth = ref(MIN_WIDTH);

function onResizeStart(e: PointerEvent): void {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = panelWidth.value;

  function onMove(ev: PointerEvent): void {
    const delta = startX - ev.clientX;
    panelWidth.value = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
  }

  function onUp(): void {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-copilot-panel {
  position: relative;
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  height: 100%;
  background-color: $bg-sidebar;
  border-left: 1px solid $border-dark;

  &__resize-handle {
    position: absolute;
    top: 0;
    left: -3px;
    z-index: 10;
    width: 6px;
    height: 100%;
    cursor: col-resize;

    &:hover,
    &:active {
      background-color: $accent;
    }
  }
}
</style>
