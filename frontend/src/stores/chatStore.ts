import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ChatMessage, MessageRole, TokenUsage } from '@/types';

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

  function loadHistoricalMessages(
    records: { role: string; content: string | null; createdAt: string }[],
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
    clearMessages,
    removeMessage,
  };
});
