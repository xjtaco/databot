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
  gap: 18px;
  padding: 28px clamp(20px, 5vw, 72px);
  overflow-y: auto;
  scroll-behavior: smooth;

  @media (max-width: $breakpoint-md) {
    gap: $spacing-md;
    padding: $spacing-md $spacing-sm;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
    align-items: center;
    justify-content: center;
    width: min(360px, 100%);
    height: 100%;
    margin: 0 auto;
    text-align: center;
  }

  &__empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    color: var(--accent);
    background-color: var(--accent-tint10);
    border: 1px solid rgb(255 106 42 / 20%);
    border-radius: $radius-lg;

    :deep(.el-icon) {
      font-size: 24px;
    }
  }

  h3 {
    margin: $spacing-sm 0 0;
    font-family: $font-family-sans;
    font-size: $font-size-2xl;
    font-weight: $font-weight-semibold;
    line-height: $line-height-tight;
    color: var(--text-primary);
  }

  p {
    max-width: 320px;
    margin: 0;
    font-size: $font-size-sm;
    line-height: $line-height-normal;
    color: var(--text-tertiary);
    white-space: pre-line;
  }

  &__anchor {
    flex-shrink: 0;
    height: 1px;
  }
}
</style>
