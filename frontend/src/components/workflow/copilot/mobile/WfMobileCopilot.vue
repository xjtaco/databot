<template>
  <div class="wf-mobile-copilot">
    <div class="wf-mobile-copilot__header">
      <button class="wf-mobile-copilot__back-btn" @click="$emit('back')">
        <ArrowLeft :size="18" />
      </button>
      <span class="wf-mobile-copilot__title">{{ t('copilot.title') }}</span>
    </div>
    <CopilotMessageList :messages="copilotStore.messages" />
    <CopilotInput
      :is-thinking="copilotStore.isAgentThinking"
      @send="copilotStore.sendMessage"
      @abort="copilotStore.abort"
    />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ArrowLeft } from 'lucide-vue-next';
import { useCopilotStore } from '@/stores';
import CopilotMessageList from '../CopilotMessageList.vue';
import CopilotInput from '../CopilotInput.vue';

defineEmits<{
  back: [];
}>();

const { t } = useI18n();
const copilotStore = useCopilotStore();
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-mobile-copilot {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background-color: $bg-page;

  &__header {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    height: 48px;
    min-height: 48px;
    padding: 0 $spacing-sm;
    border-bottom: 1px solid $border-dark;
  }

  &__back-btn {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    color: $text-muted;
    cursor: pointer;
    background: none;
    border: none;
    border-radius: $radius-md;
    transition: all $transition-fast;

    &:hover {
      color: $text-secondary-color;
      background-color: $bg-elevated;
    }
  }

  &__title {
    flex: 1;
    font-size: $font-size-md;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
  }
}
</style>
