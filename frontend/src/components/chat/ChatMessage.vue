<template>
  <div class="chat-message" :class="`chat-message--${message.role}`">
    <!-- User message: right-aligned bubble, no avatar -->
    <template v-if="message.role === 'user'">
      <div class="chat-message__user-bubble">
        <div
          v-if="message.content"
          class="chat-message__body markdown-content"
          v-html="renderedContent"
        ></div>
      </div>
    </template>

    <!-- Assistant message: avatar + card -->
    <template v-else>
      <div class="chat-message__avatar">
        <span class="chat-message__avatar-letter">D</span>
      </div>

      <div class="chat-message__card">
        <div
          v-if="message.status === 'streaming' && !message.content"
          class="chat-message__loading"
        >
          <span class="chat-message__typing">
            <span></span>
            <span></span>
            <span></span>
          </span>
          <span class="chat-message__loading-text">{{ t('chat.thinking') }}</span>
        </div>

        <div
          v-else-if="message.content"
          ref="messageBodyRef"
          class="chat-message__body markdown-content"
          v-html="renderedContent"
        ></div>

        <MessageToolCalls :tool-calls="associatedToolCalls" />

        <ActionCard
          v-for="card in message.actionCards"
          :key="card.id"
          :card="card"
          class="chat-message__action-card"
          @status-change="handleCardStatusChange"
        />

        <div v-if="message.status === 'error'" class="chat-message__error">
          <el-icon><Warning /></el-icon>
          <span>{{ message.error || t('chat.errorOccurred') }}</span>
        </div>

        <div v-if="message.content" class="chat-message__actions">
          <IconButton
            v-if="message.isOutputMd"
            :title="t('chat.exportPdf')"
            :disabled="isExporting"
            @click="handleExportPdf"
          >
            <el-icon><Download /></el-icon>
          </IconButton>
          <IconButton :title="t('chat.copy')" @click="copyContent">
            <el-icon><CopyDocument /></el-icon>
          </IconButton>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Warning, CopyDocument, Download } from '@element-plus/icons-vue';
import type { ChatMessage } from '@/types';
import { useToolCallStore, useChatStore } from '@/stores';
import { renderMarkdown } from '@/utils/markdown';
import { usePlotlyRenderer, usePdfExport } from '@/composables';
import IconButton from '@/components/common/IconButton.vue';
import MessageToolCalls from './MessageToolCalls.vue';
import ActionCard from './ActionCard.vue';
import type { CardStatus } from '@/types/actionCard';

const props = defineProps<{
  message: ChatMessage;
}>();

const { t } = useI18n();
const toolCallStore = useToolCallStore();
const chatStore = useChatStore();
const messageBodyRef = ref<HTMLElement | null>(null);

const renderedContent = computed(() => {
  if (!props.message.content) return '';
  return renderMarkdown(props.message.content);
});

usePlotlyRenderer(messageBodyRef, renderedContent);

const { exportToPdf, isExporting } = usePdfExport();

async function handleExportPdf() {
  if (!messageBodyRef.value) return;
  await exportToPdf(messageBodyRef.value, {
    filename: `report-${new Date().toISOString().slice(0, 10)}.pdf`,
  });
}

const associatedToolCalls = computed(() => {
  if (!props.message.toolCallIds || props.message.toolCallIds.length === 0) {
    return [];
  }
  return toolCallStore.calls.filter((call) => props.message.toolCallIds?.includes(call.id));
});

async function copyContent() {
  try {
    await navigator.clipboard.writeText(props.message.content);
    ElMessage.success(t('chat.copied'));
  } catch {
    ElMessage.error(t('chat.copyFailed'));
  }
}

function handleCardStatusChange(
  cardId: string,
  status: CardStatus,
  opts?: { resultSummary?: string; error?: string }
) {
  chatStore.updateActionCardStatus(cardId, status, opts);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.chat-message {
  display: flex;
  gap: $spacing-lg;
  width: min(920px, 100%);
  margin: 0 auto;
  animation: message-in 180ms ease-out;

  &:hover {
    .chat-message__actions {
      opacity: 1;
    }
  }

  // User message: right-aligned bubble
  &--user {
    justify-content: flex-end;
  }

  &__user-bubble {
    max-width: min(720px, 82%);
    padding: 12px 14px;
    background-color: var(--message-user-bg);
    border: 1px solid rgb(255 106 42 / 20%);
    border-radius: $radius-lg $radius-lg 2px $radius-lg;

    .chat-message__body {
      font-size: 13px;
      color: var(--text-primary);
    }
  }

  // Assistant message: avatar + card
  &__avatar {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    margin-top: 2px;
    background: var(--accent-gradient);
    border-radius: $radius-md;
    box-shadow: 0 0 0 1px rgb(255 255 255 / 8%) inset;
  }

  &__avatar-letter {
    font-family: $font-family-sans;
    font-size: 13px;
    font-weight: $font-weight-semibold;
    color: var(--text-on-accent);
  }

  &__card {
    flex: 1;
    min-width: 0;
    padding: 14px 16px;
    background-color: var(--message-assistant-bg);
    border: 1px solid var(--border-primary);
    border-radius: $radius-lg;
    box-shadow: 0 1px 0 rgb(255 255 255 / 3%) inset;
  }

  &__body {
    font-size: 13px;
    line-height: $line-height-relaxed;
    color: var(--text-secondary);
    overflow-wrap: break-word;
  }

  &__loading {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    color: var(--text-secondary);
  }

  &__typing {
    display: flex;
    gap: 4px;

    span {
      width: 6px;
      height: 6px;
      background-color: var(--accent);
      border-radius: 50%;
      animation: typing 1.4s infinite ease-in-out both;

      &:nth-child(1) {
        animation-delay: -0.32s;
      }

      &:nth-child(2) {
        animation-delay: -0.16s;
      }
    }
  }

  &__loading-text {
    font-size: 13px;
  }

  &__error {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-sm $spacing-md;
    margin-top: $spacing-sm;
    font-size: $font-size-sm;
    color: var(--error);
    background-color: var(--error-bg);
    border: 1px solid rgb(239 68 68 / 18%);
    border-radius: $radius-md;
  }

  &__action-card {
    margin-top: $spacing-sm;
  }

  &__actions {
    display: flex;
    gap: $spacing-xs;
    margin-top: $spacing-sm;
    opacity: 0;
    transition: opacity $transition-fast;

    @media (max-width: $breakpoint-md) {
      opacity: 1;
    }
  }
}

@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes typing {
  0%,
  80%,
  100% {
    opacity: 0.5;
    transform: scale(0.6);
  }

  40% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
