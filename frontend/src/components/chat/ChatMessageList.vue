<template>
  <div ref="containerRef" class="chat-message-list">
    <div v-if="!hasMessages" class="chat-message-list__empty">
      <div class="chat-message-list__empty-icon">
        <el-icon><ChatDotSquare /></el-icon>
      </div>
      <h3>{{ t('chat.emptyState.title') }}</h3>
      <p>{{ t('chat.emptyState.description') }}</p>
    </div>

    <template v-else>
      <ChatMessage v-for="message in messages" :key="message.id" :message="message" />
    </template>

    <div ref="scrollAnchorRef" class="chat-message-list__anchor"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChatDotSquare } from '@element-plus/icons-vue';
import { useChatStore } from '@/stores';
import { storeToRefs } from 'pinia';
import ChatMessage from './ChatMessage.vue';

const { t } = useI18n();
const chatStore = useChatStore();
const { messages, hasMessages } = storeToRefs(chatStore);

const containerRef = ref<HTMLElement | null>(null);
const scrollAnchorRef = ref<HTMLElement | null>(null);

function scrollToBottom() {
  nextTick(() => {
    scrollAnchorRef.value?.scrollIntoView({ behavior: 'smooth' });
  });
}

// Auto-scroll when new messages arrive or content updates
watch(
  () => messages.value.length,
  () => {
    scrollToBottom();
  }
);

watch(
  () => messages.value[messages.value.length - 1]?.content,
  () => {
    // Only auto-scroll if user is near bottom
    if (containerRef.value) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.value;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      if (isNearBottom) {
        scrollToBottom();
      }
    }
  }
);
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.chat-message-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: $spacing-lg;
  padding: $spacing-lg $content-padding-x;
  overflow-y: auto;

  @media (max-width: $breakpoint-md) {
    gap: $spacing-md;
    padding: $spacing-md;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
  }

  &__empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    background-color: var(--accent-tint10);
    border-radius: 40px;

    :deep(.el-icon) {
      font-size: 36px;
      color: var(--accent);
    }
  }

  h3 {
    font-family: $font-family-serif;
    font-size: $font-size-3xl;
    font-weight: $font-weight-normal;
    color: var(--text-primary);
    letter-spacing: -1px;
  }

  p {
    max-width: 400px;
    font-size: $font-size-sm;
    color: var(--text-tertiary);
    white-space: pre-line;
  }

  &__anchor {
    flex-shrink: 0;
    height: 1px;
  }
}
</style>
