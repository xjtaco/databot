import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatStore } from '@/stores/chatStore';

describe('chatStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should start with empty state', () => {
    const store = useChatStore();

    expect(store.messages).toHaveLength(0);
    expect(store.isLoading).toBe(false);
    expect(store.currentMessageId).toBeNull();
    expect(store.tokenUsage).toBeNull();
    expect(store.hasMessages).toBe(false);
    expect(store.lastMessage).toBeNull();
  });

  it('should add user message', () => {
    const store = useChatStore();

    const messageId = store.addUserMessage('Hello, DataBot!');

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({
      id: messageId,
      role: 'user',
      content: 'Hello, DataBot!',
      status: 'complete',
    });
    expect(store.hasMessages).toBe(true);
    expect(store.lastMessage?.content).toBe('Hello, DataBot!');
  });

  it('should add complete assistant message', () => {
    const store = useChatStore();

    const messageId = store.addAssistantMessage('Here is the analysis report.');

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({
      id: messageId,
      role: 'assistant',
      content: 'Here is the analysis report.',
      status: 'complete',
    });
    expect(store.hasMessages).toBe(true);
    expect(store.lastMessage?.content).toBe('Here is the analysis report.');
    expect(store.isLoading).toBe(false);
    expect(store.currentMessageId).toBeNull();
  });

  it('should start assistant message', () => {
    const store = useChatStore();

    const messageId = store.startAssistantMessage();

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({
      id: messageId,
      role: 'assistant',
      content: '',
      status: 'streaming',
    });
    expect(store.currentMessageId).toBe(messageId);
    expect(store.isLoading).toBe(true);
    expect(store.isStreaming).toBe(true);
  });

  it('should append content to current message', () => {
    const store = useChatStore();

    store.startAssistantMessage();
    store.appendToCurrentMessage('Hello');
    store.appendToCurrentMessage(' World');

    expect(store.messages[0].content).toBe('Hello World');
  });

  it('should not append if no current message', () => {
    const store = useChatStore();

    store.appendToCurrentMessage('Hello');

    expect(store.messages).toHaveLength(0);
  });

  it('should complete current message', () => {
    const store = useChatStore();

    store.startAssistantMessage();
    store.appendToCurrentMessage('Response content');
    store.completeCurrentMessage();

    expect(store.messages[0].status).toBe('complete');
    expect(store.currentMessageId).toBeNull();
    expect(store.isLoading).toBe(false);
    expect(store.isStreaming).toBe(false);
  });

  it('should complete current message with tool call IDs', () => {
    const store = useChatStore();

    store.startAssistantMessage();
    store.appendToCurrentMessage('Response with tools');
    store.completeCurrentMessageWithToolCalls(['tc-1', 'tc-2']);

    expect(store.messages[0].status).toBe('complete');
    expect(store.messages[0].toolCallIds).toEqual(['tc-1', 'tc-2']);
    expect(store.currentMessageId).toBeNull();
    // isLoading should remain true - controlled by stop message
    expect(store.isLoading).toBe(true);
    expect(store.isStreaming).toBe(false);
  });

  it('should complete current message with empty tool call IDs', () => {
    const store = useChatStore();

    store.startAssistantMessage();
    store.appendToCurrentMessage('Response without tools');
    store.completeCurrentMessageWithToolCalls([]);

    expect(store.messages[0].status).toBe('complete');
    expect(store.messages[0].toolCallIds).toEqual([]);
    expect(store.currentMessageId).toBeNull();
    expect(store.isLoading).toBe(true);
  });

  it('should not fail if completing message with tool calls when no current message', () => {
    const store = useChatStore();

    expect(() => {
      store.completeCurrentMessageWithToolCalls(['tc-1']);
    }).not.toThrow();

    expect(store.messages).toHaveLength(0);
  });

  it('should set message error', () => {
    const store = useChatStore();

    const messageId = store.startAssistantMessage();
    store.setMessageError(messageId, 'Something went wrong');

    expect(store.messages[0].status).toBe('error');
    expect(store.messages[0].error).toBe('Something went wrong');
    expect(store.currentMessageId).toBeNull();
    expect(store.isLoading).toBe(false);
  });

  it('should set token usage', () => {
    const store = useChatStore();

    const usage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    };

    store.setTokenUsage(usage);

    expect(store.tokenUsage).toEqual(usage);
  });

  it('should clear all messages', () => {
    const store = useChatStore();

    store.addUserMessage('Message 1');
    store.startAssistantMessage();
    store.appendToCurrentMessage('Response');
    store.completeCurrentMessage();
    store.setTokenUsage({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });

    store.clearMessages();

    expect(store.messages).toHaveLength(0);
    expect(store.currentMessageId).toBeNull();
    expect(store.isLoading).toBe(false);
    expect(store.tokenUsage).toBeNull();
  });

  it('should remove specific message', () => {
    const store = useChatStore();

    const id1 = store.addUserMessage('Message 1');
    const id2 = store.addUserMessage('Message 2');

    store.removeMessage(id1);

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0].id).toBe(id2);
  });

  it('should add assistant message with isOutputMd flag', () => {
    const store = useChatStore();

    const messageId = store.addAssistantMessage('# Report', { isOutputMd: true });

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({
      id: messageId,
      role: 'assistant',
      content: '# Report',
      status: 'complete',
      isOutputMd: true,
    });
  });

  it('should add assistant message without isOutputMd by default', () => {
    const store = useChatStore();

    store.addAssistantMessage('Normal response');

    expect(store.messages[0].isOutputMd).toBeUndefined();
  });

  describe('loadHistoricalMessages', () => {
    it('should mark assistant message after output_md tool as isOutputMd', () => {
      const store = useChatStore();

      store.loadHistoricalMessages([
        { role: 'assistant', content: 'Let me analyze...', createdAt: '2026-01-01T00:00:00Z' },
        {
          role: 'tool',
          content: JSON.stringify({ toolName: 'output_md', toolCallId: 'tc-1' }),
          createdAt: '2026-01-01T00:00:01Z',
        },
        { role: 'assistant', content: '# Final Report', createdAt: '2026-01-01T00:00:02Z' },
      ]);

      expect(store.messages).toHaveLength(2);
      expect(store.messages[0].isOutputMd).toBeUndefined();
      expect(store.messages[1].isOutputMd).toBe(true);
      expect(store.messages[1].content).toBe('# Final Report');
    });

    it('should not mark assistant message after non-output_md tool', () => {
      const store = useChatStore();

      store.loadHistoricalMessages([
        { role: 'assistant', content: 'Running query...', createdAt: '2026-01-01T00:00:00Z' },
        {
          role: 'tool',
          content: JSON.stringify({ toolName: 'sql', toolCallId: 'tc-1' }),
          createdAt: '2026-01-01T00:00:01Z',
        },
        { role: 'assistant', content: 'Query result', createdAt: '2026-01-01T00:00:02Z' },
      ]);

      expect(store.messages).toHaveLength(2);
      expect(store.messages[1].isOutputMd).toBeUndefined();
    });
  });

  it('should generate unique message IDs', () => {
    const store = useChatStore();

    const id1 = store.generateMessageId();
    const id2 = store.generateMessageId();

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^msg-\d+-[a-z0-9]+$/);
  });

  it('should handle full conversation flow', () => {
    const store = useChatStore();

    // User sends a message
    store.addUserMessage('What is 2 + 2?');
    expect(store.messages).toHaveLength(1);

    // Assistant starts responding
    store.startAssistantMessage();
    expect(store.messages).toHaveLength(2);
    expect(store.isLoading).toBe(true);

    // Streaming response
    store.appendToCurrentMessage('The answer');
    store.appendToCurrentMessage(' is 4.');

    expect(store.messages[1].content).toBe('The answer is 4.');
    expect(store.messages[1].status).toBe('streaming');

    // Complete the response
    store.completeCurrentMessage();
    expect(store.messages[1].status).toBe('complete');
    expect(store.isLoading).toBe(false);

    // Set token usage
    store.setTokenUsage({ promptTokens: 20, completionTokens: 10, totalTokens: 30 });
    expect(store.tokenUsage?.totalTokens).toBe(30);
  });
});
