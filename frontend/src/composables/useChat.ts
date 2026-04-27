import { computed, type ComputedRef } from 'vue';
import {
  useChatStore,
  useConnectionStore,
  useToolCallStore,
  useTodosStore,
  useChatSessionStore,
} from '@/stores';
import { clearPlotlyChartRegistry } from '@/utils/markdown';
import type { UseWebSocketReturn } from './useWebSocket';
import type {
  WsMessage,
  AgentResponseData,
  UsageReportData,
  ErrorData,
  ToolCallResultData,
  TurnCompleteData,
  SessionInfoData,
} from '@/types';
import type { UiActionCardPayload } from '@/types/actionCard';

export interface UseChatOptions {
  websocket: UseWebSocketReturn;
}

export interface UseChatReturn {
  sendMessage: (content: string) => void;
  stopGeneration: () => void;
  clearChat: () => void;
  canSend: ComputedRef<boolean>;
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const { websocket } = options;

  const chatStore = useChatStore();
  const connectionStore = useConnectionStore();
  const toolCallStore = useToolCallStore();
  const todosStore = useTodosStore();

  // Track tool call IDs for the current turn
  let pendingToolCallIds: string[] = [];

  // Register message handler
  websocket.onMessage(handleWebSocketMessage);

  function handleWebSocketMessage(message: WsMessage) {
    switch (message.type) {
      case 'agent_response':
        handleAgentResponse(message.data as AgentResponseData);
        break;
      case 'usage_report':
        handleUsageReport(message.data as UsageReportData);
        break;
      case 'stop':
        handleStop();
        break;
      case 'error':
        handleError(message.data as ErrorData);
        break;
      case 'tool_call':
        handleToolCall(message.data as ToolCallResultData);
        break;
      case 'turn_complete':
        handleTurnComplete(message.data as TurnCompleteData);
        break;
      case 'session_info': {
        const sessionData = message.data as SessionInfoData;
        const chatSessionStore = useChatSessionStore();
        chatSessionStore.setActiveSessionId(sessionData.sessionId);
        chatSessionStore.fetchSessions();
        break;
      }
      case 'action_card':
        handleActionCard(message.data as UiActionCardPayload);
        break;
    }
  }

  function handleAgentResponse(data: AgentResponseData) {
    if (!chatStore.currentMessageId) {
      // Start a new assistant message if none exists
      chatStore.startAssistantMessage();
    }
    chatStore.appendToCurrentMessage(data.content);
  }

  function handleUsageReport(data: UsageReportData) {
    chatStore.setTokenUsage({
      promptTokens: data.promptTokens,
      completionTokens: data.completionTokens,
      totalTokens: data.totalTokens,
    });
  }

  function handleStop() {
    // Complete any remaining message that wasn't completed by turn_complete
    chatStore.completeCurrentMessage();
    toolCallStore.setAgentRunning(false);
    // Reset pending tool calls
    pendingToolCallIds = [];
  }

  function handleToolCall(data: ToolCallResultData) {
    const result = data.result;
    if (!result) return;

    const toolCallId = result.toolCallId || `tc-${Date.now()}`;
    const toolStatus = result.status === 'error' ? 'error' : 'completed';

    toolCallStore.addToolCall({
      id: toolCallId,
      name: result.toolName || 'unknown',
      timestamp: Date.now(),
      status: toolStatus,
      resultSummary: result.resultSummary,
      error: result.error,
      parameters: result.parameters,
      metadata: result,
    });

    // Track tool call ID for the current turn
    pendingToolCallIds.push(toolCallId);

    if (result.toolName === 'todos_writer' && result.todos) {
      todosStore.updateTodos(result.todos, {
        count: result.count,
        completed: result.completed,
        inProgress: result.inProgress,
        pending: result.pending,
        cancelled: result.cancelled,
      });
    }

    // Handle output_md tool - add as separate assistant message
    if (result.toolName === 'output_md' && result.mdContent) {
      chatStore.addAssistantMessage(result.mdContent as string, { isOutputMd: true });
    }
  }

  function handleTurnComplete(_data: TurnCompleteData) {
    // Complete the current message with tool call IDs from this turn
    // Using locally tracked pendingToolCallIds for consistency with handleToolCall
    chatStore.completeCurrentMessageWithToolCalls(pendingToolCallIds);
    // Reset pending tool calls for the next turn
    pendingToolCallIds = [];
  }

  function handleError(data: ErrorData) {
    const errorMessage = data.error || 'Unknown error';

    if (chatStore.currentMessageId) {
      chatStore.setMessageError(chatStore.currentMessageId, errorMessage);
    }

    if (data.errorType === 'config_missing') {
      // Config not set — stop loading state
      chatStore.completeCurrentMessage();
      toolCallStore.setAgentRunning(false);
    }
  }

  function handleActionCard(payload: UiActionCardPayload) {
    chatStore.addActionCard(payload);
  }

  function sendMessage(content: string) {
    if (!content.trim() || !connectionStore.isConnected || chatStore.isLoading) {
      return;
    }

    // Mark agent as running
    toolCallStore.setAgentRunning(true);

    // Add user message to chat
    chatStore.addUserMessage(content.trim());

    // Start assistant message placeholder
    chatStore.startAssistantMessage();

    // Send message via WebSocket
    websocket.send('user_message', { content: content.trim() });
  }

  function stopGeneration() {
    if (chatStore.isLoading) {
      websocket.send('stop');
      chatStore.completeCurrentMessage();
    }
  }

  function clearChat() {
    chatStore.clearMessages();
    toolCallStore.clearHistory();
    todosStore.clear();
    clearPlotlyChartRegistry();
  }

  const canSend = computed(() => connectionStore.isConnected && !chatStore.isLoading);

  return {
    sendMessage,
    stopGeneration,
    clearChat,
    canSend,
  };
}
