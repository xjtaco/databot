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
  gap: $spacing-lg;
  align-items: flex-end;
  padding: $spacing-md $content-padding-x;
  border-top: 1px solid var(--border-primary);

  @media (max-width: $breakpoint-md) {
    gap: 10px;
    padding: $spacing-lg $spacing-md;
    padding-bottom: max($spacing-lg, env(safe-area-inset-bottom, 0px));
  }

  &__input-box {
    flex: 1;
    padding: $spacing-lg $spacing-md;
    background-color: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: $radius-lg;
    transition: border-color $transition-fast;

    &:focus-within {
      border-color: var(--accent);
    }

    @media (max-width: $breakpoint-md) {
      padding: 10px 14px;
    }
  }

  :deep(.el-textarea__inner) {
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
    width: 40px;
    height: 40px;
    cursor: pointer;
    border: none;
    border-radius: 20px;
    transition: opacity $transition-fast;

    :deep(.el-icon) {
      font-size: 18px;
      color: var(--text-on-accent);
    }

    &--send {
      background: var(--accent-gradient);

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
