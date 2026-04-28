import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ChatMessage, MessageRole, TokenUsage } from '@/types';
import type { UiActionCardPayload, ChatActionCard, CardStatus } from '@/types/actionCard';

export const useChatStore = defineStore('chat', () => {
  // State
  const messages = ref<ChatMessage[]>([]);
  const isLoading = ref(false);
  const currentMessageId = ref<string | null>(null);
  const tokenUsage = ref<TokenUsage | null>(null);

  // Getters
  const hasMessages = computed(() => messages.value.length > 0);
  const lastMessage = computed(() =>
    messages.value.length > 0 ? messages.value[messages.value.length - 1] : null
  );
  const isStreaming = computed(() => {
    const current = messages.value.find((m) => m.id === currentMessageId.value);
    return current?.status === 'streaming';
  });

  // Actions
  function generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function addUserMessage(content: string): string {
    const id = generateMessageId();
    const message: ChatMessage = {
      id,
      role: 'user',
      content,
      timestamp: Date.now(),
      status: 'complete',
    };
    messages.value.push(message);
    return id;
  }

  function addAssistantMessage(content: string, options?: { isOutputMd?: boolean }): string {
    const id = generateMessageId();
    const message: ChatMessage = {
      id,
      role: 'assistant',
      content,
      timestamp: Date.now(),
      status: 'complete',
      ...(options?.isOutputMd ? { isOutputMd: true } : {}),
    };
    messages.value.push(message);
    return id;
  }

  function startAssistantMessage(): string {
    const id = generateMessageId();
    const message: ChatMessage = {
      id,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
    };
    messages.value.push(message);
    currentMessageId.value = id;
    isLoading.value = true;
    return id;
  }

  function appendToCurrentMessage(content: string) {
    if (!currentMessageId.value) return;

    const message = messages.value.find((m) => m.id === currentMessageId.value);
    if (message) {
      message.content += content;
    }
  }

  function completeCurrentMessage() {
    if (!currentMessageId.value) return;

    const message = messages.value.find((m) => m.id === currentMessageId.value);
    if (message) {
      message.status = 'complete';
    }
    currentMessageId.value = null;
    isLoading.value = false;
  }

  function completeCurrentMessageWithToolCalls(toolCallIds: string[]) {
    if (!currentMessageId.value) return;

    const message = messages.value.find((m) => m.id === currentMessageId.value);
    if (message) {
      message.status = 'complete';
      message.toolCallIds = toolCallIds;
    }
    currentMessageId.value = null;
    // Note: isLoading stays true - will be set to false by stop message
  }

  function setMessageError(messageId: string, error: string) {
    const message = messages.value.find((m) => m.id === messageId);
    if (message) {
      message.status = 'error';
      message.error = error;
    }
    if (messageId === currentMessageId.value) {
      currentMessageId.value = null;
      isLoading.value = false;
    }
  }

  function setTokenUsage(usage: TokenUsage) {
    tokenUsage.value = usage;
  }

  function getInitialActionCardStatus(payload: UiActionCardPayload): CardStatus {
    return payload.presentationMode === 'inline_form' ? 'editing' : 'proposed';
  }

  function getRestoredActionCardStatus(
    payload: UiActionCardPayload,
    persistedStatus: CardStatus
  ): CardStatus {
    return persistedStatus === 'proposed' ? getInitialActionCardStatus(payload) : persistedStatus;
  }

  function loadHistoricalMessages(
    records: {
      role: string;
      content: string | null;
      createdAt: string;
      metadata?: Record<string, unknown> | null;
    }[],
    onToolCall?: (toolCall: {
      id: string;
      name: string;
      timestamp: number;
      status: string;
      resultSummary?: string;
      error?: string;
      parameters?: Record<string, unknown>;
    }) => void
  ) {
    messages.value = [];
    currentMessageId.value = null;
    isLoading.value = false;
    tokenUsage.value = null;

    // Track the last assistant message to attach tool call IDs
    let lastAssistantMsg: ChatMessage | null = null;
    // Track whether the next assistant message is from output_md tool.
    // Assumes the assistant message immediately following an output_md tool record
    // is the rendered report content (matches the flow in useChat.ts).
    let nextAssistantIsOutputMd = false;

    for (const record of records) {
      if (!record.content) continue;

      if (record.role === 'tool') {
        // Parse tool call record and link to preceding assistant message
        try {
          const toolData = JSON.parse(record.content) as {
            toolName?: string;
            toolCallId?: string;
            status?: string;
            resultSummary?: string;
            parameters?: Record<string, unknown>;
            error?: string;
          };
          const toolCallId = toolData.toolCallId || generateMessageId();
          if (onToolCall && toolData.toolName) {
            onToolCall({
              id: toolCallId,
              name: toolData.toolName,
              timestamp: new Date(record.createdAt).getTime(),
              status: toolData.status === 'error' ? 'error' : 'completed',
              resultSummary: toolData.resultSummary,
              error: toolData.error,
              parameters: toolData.parameters,
            });
          }
          // Attach to the last assistant message
          if (lastAssistantMsg) {
            if (!lastAssistantMsg.toolCallIds) {
              lastAssistantMsg.toolCallIds = [];
            }
            lastAssistantMsg.toolCallIds.push(toolCallId);
          }
          // Mark next assistant message as output_md
          if (toolData.toolName === 'output_md') {
            nextAssistantIsOutputMd = true;
          }
          // Restore action cards from metadata
          if (
            record.metadata &&
            typeof record.metadata === 'object' &&
            (record.metadata as Record<string, unknown>).type === 'action_card'
          ) {
            const meta = record.metadata as {
              payload: UiActionCardPayload;
              status: CardStatus;
              resultSummary?: string;
              error?: string;
            };
            if (lastAssistantMsg) {
              const card: ChatActionCard = {
                id: meta.payload.id,
                payload: meta.payload,
                status: getRestoredActionCardStatus(meta.payload, meta.status),
                resultSummary: meta.resultSummary,
                error: meta.error,
              };
              if (!lastAssistantMsg.actionCards) {
                lastAssistantMsg.actionCards = [];
              }
              lastAssistantMsg.actionCards.push(card);
            }
          }
        } catch {
          // Skip malformed tool records
        }
        continue;
      }

      const role = record.role as MessageRole;
      if (role !== 'user' && role !== 'assistant') continue;

      const msg: ChatMessage = {
        id: generateMessageId(),
        role,
        content: record.content,
        timestamp: new Date(record.createdAt).getTime(),
        status: 'complete',
      };

      if (role === 'assistant' && nextAssistantIsOutputMd) {
        msg.isOutputMd = true;
        nextAssistantIsOutputMd = false;
      }

      messages.value.push(msg);

      if (role === 'assistant') {
        lastAssistantMsg = msg;
      } else {
        lastAssistantMsg = null;
      }
    }
  }

  function addActionCard(payload: UiActionCardPayload): void {
    const card: ChatActionCard = {
      id: payload.id,
      payload,
      status: getInitialActionCardStatus(payload),
    };
    const targetMsg =
      messages.value.find((m) => m.id === currentMessageId.value) ??
      [...messages.value].reverse().find((m) => m.role === 'assistant');
    if (targetMsg) {
      if (!targetMsg.actionCards) {
        targetMsg.actionCards = [];
      }
      targetMsg.actionCards.push(card);
    }
  }

  function updateActionCardStatus(
    cardId: string,
    status: CardStatus,
    opts?: { resultSummary?: string; error?: string }
  ): void {
    for (const msg of messages.value) {
      const card = msg.actionCards?.find((c) => c.id === cardId);
      if (card) {
        card.status = status;
        card.resultSummary = opts?.resultSummary;
        card.error = opts?.error;
        card.executedAt = status === 'succeeded' || status === 'failed' ? Date.now() : undefined;
        return;
      }
    }
  }

  function clearMessages() {
    messages.value = [];
    currentMessageId.value = null;
    isLoading.value = false;
    tokenUsage.value = null;
  }

  function removeMessage(messageId: string) {
    const index = messages.value.findIndex((m) => m.id === messageId);
    if (index !== -1) {
      messages.value.splice(index, 1);
    }
  }

  return {
    // State
    messages,
    isLoading,
    currentMessageId,
    tokenUsage,

    // Getters
    hasMessages,
    lastMessage,
    isStreaming,

    // Actions
    generateMessageId,
    addUserMessage,
    addAssistantMessage,
    startAssistantMessage,
    appendToCurrentMessage,
    completeCurrentMessage,
    completeCurrentMessageWithToolCalls,
    setMessageError,
    setTokenUsage,
    loadHistoricalMessages,
    addActionCard,
    updateActionCardStatus,
    clearMessages,
    removeMessage,
  };
});
