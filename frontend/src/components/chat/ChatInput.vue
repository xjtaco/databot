<template>
  <div class="chat-input">
    <div class="chat-input__input-box">
      <el-input
        v-model="inputValue"
        type="textarea"
        :placeholder="t('chat.inputPlaceholder')"
        :autosize="{ minRows: 1, maxRows: 6 }"
        :disabled="!canSend"
        resize="none"
        @keydown="handleKeydown"
      />
    </div>

    <button v-if="isLoading" class="chat-input__btn chat-input__btn--stop" @click="$emit('stop')">
      <el-icon><VideoPause /></el-icon>
    </button>
    <button
      v-else
      class="chat-input__btn chat-input__btn--send"
      :disabled="!canSubmit"
      @click="handleSubmit"
    >
      <el-icon><Top /></el-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Top, VideoPause } from '@element-plus/icons-vue';
import { useChatStore } from '@/stores';
import { storeToRefs } from 'pinia';

const props = defineProps<{
  canSend: boolean;
}>();

const emit = defineEmits<{
  send: [content: string];
  stop: [];
}>();

const { t } = useI18n();
const chatStore = useChatStore();
const { isLoading } = storeToRefs(chatStore);

const inputValue = ref('');

const canSubmit = computed(() => props.canSend && inputValue.value.trim().length > 0);

function handleSubmit() {
  if (!canSubmit.value) return;

  emit('send', inputValue.value);
  inputValue.value = '';
}

function handleKeydown(event: Event | KeyboardEvent) {
  if (event instanceof KeyboardEvent && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSubmit();
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.chat-input {
  display: flex;
  gap: $spacing-sm;
  align-items: flex-end;
  padding: 14px clamp(20px, 5vw, 72px) 18px;
  background: rgb(8 10 13 / 88%);
  border-top: 1px solid var(--border-primary);
  backdrop-filter: blur(18px);

  @media (max-width: $breakpoint-md) {
    padding: 10px $spacing-sm max(10px, env(safe-area-inset-bottom, 0px));
  }

  &__input-box {
    flex: 1;
    max-width: 920px;
    padding: 12px 14px;
    margin-left: auto;
    background-color: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: $radius-lg;
    box-shadow: 0 1px 0 rgb(255 255 255 / 3%) inset;
    transition:
      border-color $transition-fast,
      box-shadow $transition-fast;

    &:focus-within {
      border-color: var(--input-focus-border);
      box-shadow:
        0 0 0 3px var(--focus-ring),
        0 1px 0 rgb(255 255 255 / 3%) inset;
    }
  }

  :deep(.el-textarea__inner) {
    min-height: 22px !important;
    padding: 0;
    font-size: 13px;
    line-height: $line-height-normal;
    color: var(--text-primary);
    resize: none;
    background: transparent;
    border: none;
    box-shadow: none !important;

    &::placeholder {
      color: var(--text-tertiary);
    }
  }

  &__btn {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    padding: 0;
    cursor: pointer;
    border: 1px solid transparent;
    border-radius: $radius-lg;
    transition:
      opacity $transition-fast,
      transform $transition-fast,
      border-color $transition-fast;

    :deep(.el-icon) {
      font-size: 18px;
      color: var(--text-on-accent);
    }

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }

    &:active:not(:disabled) {
      transform: translateY(1px);
    }

    &--send {
      background: var(--accent-gradient);
      border-color: rgb(255 106 42 / 34%);

      &:disabled {
        cursor: not-allowed;
        opacity: 0.4;
      }
    }

    &--stop {
      background: var(--error);

      &:hover {
        opacity: 0.9;
      }
    }
  }
}
</style>
