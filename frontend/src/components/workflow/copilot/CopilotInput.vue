<template>
  <div class="copilot-input">
    <el-input
      v-model="inputText"
      type="textarea"
      :autosize="{ minRows: 1, maxRows: 4 }"
      :placeholder="t('copilot.placeholder')"
      class="copilot-input__textarea"
      @keydown="handleKeydown"
    />
    <el-button
      v-if="isThinking && inputText.trim().length === 0"
      class="copilot-input__abort-btn"
      type="danger"
      :title="t('copilot.stop')"
      @click="emit('abort')"
    >
      {{ t('copilot.stop') }}
    </el-button>
    <el-button
      v-else
      class="copilot-input__send-btn"
      type="primary"
      :disabled="inputText.trim().length === 0"
      :title="t('copilot.send')"
      @click="handleSend"
    >
      {{ t('copilot.send') }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

defineProps<{
  isThinking: boolean;
}>();

const emit = defineEmits<{
  send: [content: string];
  abort: [];
}>();

const { t } = useI18n();
const inputText = ref('');

function handleSend(): void {
  const text = inputText.value.trim();
  if (!text) return;
  emit('send', text);
  inputText.value = '';
}

function handleKeydown(event: Event): void {
  if (!(event instanceof KeyboardEvent)) return;
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.copilot-input {
  display: flex;
  gap: $spacing-sm;
  align-items: flex-end;
  padding: $spacing-sm 12px;
  border-top: 1px solid $border-dark;

  &__textarea {
    flex: 1;
    min-width: 0;
  }

  &__send-btn,
  &__abort-btn {
    flex-shrink: 0;
  }
}
</style>
