import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChat } from '@/composables/useChat';
import { useChatStore, useConnectionStore, useToolCallStore } from '@/stores';
import type { UseWebSocketReturn } from '@/composables/useWebSocket';
import type { WsMessage } from '@/types';
import { withSetup } from '../setup';

describe('useChat', () => {
  let mockWebSocket: UseWebSocketReturn;
  let messageHandlers: Array<(message: WsMessage) => void>;

  beforeEach(() => {
    setActivePinia(createPinia());

    messageHandlers = [];

    mockWebSocket = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      send: vi.fn(),
      onMessage: vi.fn((handler) => {
        messageHandlers.push(handler);
      }),
      offMessage: vi.fn((handler) => {
        const index = messageHandlers.indexOf(handler);
        if (index > -1) {
          messageHandlers.splice(index, 1);
        }
      }),
      setToken: vi.fn(),
      reconnectWithUrl: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function simulateMessage(message: WsMessage) {
    messageHandlers.forEach((handler) => handler(message));
  }

  describe('handleTurnComplete', () => {
    it('should complete current message with pending tool call IDs', () => {
      const chatStore = useChatStore();
      const connectionStore = useConnectionStore();

      connectionStore.setConnected();

      const { unmount } = withSetup(() => useChat({ websocket: mockWebSocket }));

      // Start an assistant message
      chatStore.startAssistantMessage();
      chatStore.appendToCurrentMessage('Response with tools');

      // Simulate tool call message
      simulateMessage({
        type: 'tool_call',
        timestamp: Date.now(),
        data: {
          result: {
            toolCallId: 'tc-123',
            toolName: 'sql',
          },
        },
      });

      // Simulate turn_complete
      simulateMessage({
        type: 'turn_complete',
        timestamp: Date.now(),
        data: { toolCallIds: ['tc-123'] },
      });

      expect(chatStore.messages[0].status).toBe('complete');
      expect(chatStore.messages[0].toolCallIds).toEqual(['tc-123']);
      // isLoading should remain true until stop message
      expect(chatStore.isLoading).toBe(true);

      unmount();
    });

    it('should complete message with empty tool call IDs when no tools used', () => {
      const chatStore = useChatStore();

      const { unmount } = withSetup(() => useChat({ websocket: mockWebSocket }));

      chatStore.startAssistantMessage();
      chatStore.appendToCurrentMessage('Simple response');

      // Simulate turn_complete with no tools
      simulateMessage({
        type: 'turn_complete',
        timestamp: Date.now(),
        data: { toolCallIds: [] },
      });

      expect(chatStore.messages[0].status).toBe('complete');
      expect(chatStore.messages[0].toolCallIds).toEqual([]);

      unmount();
    });

    it('should reset pending tool calls after turn_complete', () => {
      const chatStore = useChatStore();

      const { unmount } = withSetup(() => useChat({ websocket: mockWebSocket }));

      // First turn with tool
      chatStore.startAssistantMessage();
      simulateMessage({
        type: 'tool_call',
        timestamp: Date.now(),
        data: {
          result: {
            toolCallId: 'tc-1',
            toolName: 'sql',
          },
        },
      });
      simulateMessage({
        type: 'turn_complete',
        timestamp: Date.now(),
        data: { toolCallIds: ['tc-1'] },
      });

      expect(chatStore.messages[0].toolCallIds).toEqual(['tc-1']);

      // Second turn with different tool
      chatStore.startAssistantMessage();
      simulateMessage({
        type: 'tool_call',
        timestamp: Date.now(),
        data: {
          result: {
            toolCallId: 'tc-2',
            toolName: 'bash',
          },
        },
      });
      simulateMessage({
        type: 'turn_complete',
        timestamp: Date.now(),
        data: { toolCallIds: ['tc-2'] },
      });

      // Second message should only have tc-2, not tc-1
      expect(chatStore.messages[1].toolCallIds).toEqual(['tc-2']);

      unmount();
    });

    it('should handle multiple tool calls in single turn', () => {
      const chatStore = useChatStore();

      const { unmount } = withSetup(() => useChat({ websocket: mockWebSocket }));

      chatStore.startAssistantMessage();

      // Multiple tool calls
      simulateMessage({
        type: 'tool_call',
        timestamp: Date.now(),
        data: {
          result: {
            toolCallId: 'tc-a',
            toolName: 'sql',
          },
        },
      });
      simulateMessage({
        type: 'tool_call',
        timestamp: Date.now(),
        data: {
          result: {
            toolCallId: 'tc-b',
            toolName: 'bash',
          },
        },
      });

      simulateMessage({
        type: 'turn_complete',
        timestamp: Date.now(),
        data: { toolCallIds: ['tc-a', 'tc-b'] },
      });

      expect(chatStore.messages[0].toolCallIds).toEqual(['tc-a', 'tc-b']);

      unmount();
    });
  });

  describe('handleStop', () => {
    it('should clear loading when stopping after turn_complete has cleared current message', () => {
      const chatStore = useChatStore();
      const toolCallStore = useToolCallStore();

      const { stopGeneration } = useChat({ websocket: mockWebSocket });

      chatStore.startAssistantMessage();
      toolCallStore.setAgentRunning(true);

      simulateMessage({
        type: 'turn_complete',
        timestamp: Date.now(),
        data: { toolCallIds: [] },
      });

      expect(chatStore.currentMessageId).toBeNull();
      expect(chatStore.isLoading).toBe(true);

      stopGeneration();

      expect(mockWebSocket.send).toHaveBeenCalledWith('stop');
      expect(chatStore.isLoading).toBe(false);
      expect(toolCallStore.isAgentRunning).toBe(false);
    });

    it('should set isLoading to false and reset pending tool calls', () => {
      const chatStore = useChatStore();
      const toolCallStore = useToolCallStore();

      const { unmount } = withSetup(() => useChat({ websocket: mockWebSocket }));

      chatStore.startAssistantMessage();
      toolCallStore.setAgentRunning(true);

      // Add a tool call (not followed by turn_complete)
      simulateMessage({
        type: 'tool_call',
        timestamp: Date.now(),
        data: {
          result: {
            toolCallId: 'tc-orphan',
            toolName: 'sql',
          },
        },
      });

      // Stop directly without turn_complete
      simulateMessage({
        type: 'stop',
        timestamp: Date.now(),
      });

      expect(chatStore.isLoading).toBe(false);
      expect(toolCallStore.isAgentRunning).toBe(false);

      unmount();
    });
  });

  describe('handleToolCall', () => {
    it('should add tool call to store and track pending ID', () => {
      const toolCallStore = useToolCallStore();

      const { unmount } = withSetup(() => useChat({ websocket: mockWebSocket }));

      simulateMessage({
        type: 'tool_call',
        timestamp: Date.now(),
        data: {
          result: {
            toolCallId: 'tc-test',
            toolName: 'grep',
          },
        },
      });

      expect(toolCallStore.calls.length).toBe(1);
      expect(toolCallStore.calls[0].id).toBe('tc-test');
      expect(toolCallStore.calls[0].name).toBe('grep');

      unmount();
    });
  });
});
