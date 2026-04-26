import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Message } from '../../../src/infrastructure/llm';
import type { TokenCounter } from '../../../src/agent/tokenCounter';

// Mock logger module
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock config module
vi.mock('../../../src/base/config', () => ({
  config: {
    context_compress_ratio: 0.7,
  },
}));

// Mock LLMProviderFactory
const mockLLMProvider = {
  chat: vi.fn(),
  streamChat: vi.fn(),
};

vi.mock('../../../src/infrastructure/llm', () => ({
  LLMProviderFactory: {
    getProvider: vi.fn(() => mockLLMProvider),
  },
  Message: {},
  ToolCall: {},
  ChatResponse: {},
  ChatOptions: {},
  ToolCallResult: {},
  LLMConfig: {},
  StreamEvent: {},
}));

// Mock TiktokenCounter - use factory function to avoid hoisting issue
vi.mock('../../../src/agent/tokenCounter', () => {
  class MockTiktokenCounter {
    countMessageTokens(message: {
      content?: string | null;
      name?: string;
      toolCallId?: string;
      toolCalls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    }): number {
      let chars = 0;
      if (message.content) chars += message.content.length;
      if (message.name) chars += message.name.length;
      if (message.toolCallId) chars += message.toolCallId.length;
      if (message.toolCalls) {
        for (const tc of message.toolCalls) {
          chars += tc.id.length + tc.function.name.length + tc.function.arguments.length;
        }
      }
      return Math.ceil(chars / 4) + 4;
    }
  }
  return {
    TiktokenCounter: MockTiktokenCounter,
  };
});

import logger from '../../../src/utils/logger';
import { Context, MessageWithTokens } from '../../../src/agent/context';
import { LLMProviderFactory } from '../../../src/infrastructure/llm';
const mockedLogger = vi.mocked(logger);

// Create a mock token counter for test use
class TestMockTokenCounter implements TokenCounter {
  countMessageTokens(message: Message): number {
    let chars = 0;
    if (message.content) chars += message.content.length;
    if (message.name) chars += message.name.length;
    if (message.toolCallId) chars += message.toolCallId.length;
    if (message.toolCalls) {
      for (const tc of message.toolCalls) {
        chars += tc.id.length + tc.function.name.length + tc.function.arguments.length;
      }
    }
    return Math.ceil(chars / 4) + 4;
  }
}

describe('Context', () => {
  let context: Context;
  let mockTokenCounter: TestMockTokenCounter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTokenCounter = new TestMockTokenCounter();
    context = new Context(mockTokenCounter);
  });

  describe('Constructor', () => {
    it('should initialize with empty history', () => {
      const history = (context as unknown as { history: MessageWithTokens[] }).history;
      expect(history).toEqual([]);
    });

    it('should initialize LLM provider', () => {
      expect(LLMProviderFactory.getProvider).toHaveBeenCalled();
    });
  });

  describe('addMessageWithTokens', () => {
    it('should add a message with calculated tokens when tokens not provided', () => {
      const message: Message = {
        role: 'user',
        content: 'Hello',
      };

      context.addMessageWithTokens(message);

      const history = (context as unknown as { history: MessageWithTokens[] }).history;
      expect(history).toHaveLength(1);
      expect(history[0].message).toEqual(message);
      expect(history[0].tokens).toBeGreaterThan(0);
    });

    it('should add multiple messages to history', () => {
      const message1: Message = { role: 'user', content: 'Hello' };
      const message2: Message = { role: 'assistant', content: 'Hi there' };

      context.addMessageWithTokens(message1);
      context.addMessageWithTokens(message2);

      const history = (context as unknown as { history: MessageWithTokens[] }).history;
      expect(history).toHaveLength(2);
      expect(history[0].message).toEqual(message1);
      expect(history[1].message).toEqual(message2);
    });

    it('should add a message with specified token count when tokens provided', () => {
      const message: Message = { role: 'assistant', content: 'Response' };
      const tokens = 100;

      context.addMessageWithTokens(message, tokens);

      const history = (context as unknown as { history: MessageWithTokens[] }).history;
      expect(history).toHaveLength(1);
      expect(history[0].message).toEqual(message);
      expect(history[0].tokens).toBe(100);
    });
  });

  describe('addSystemMessage', () => {
    it('should add a system message with tokens to history', () => {
      context.addSystemMessage('You are a helpful assistant');

      const history = (context as unknown as { history: MessageWithTokens[] }).history;
      expect(history).toHaveLength(1);
      expect(history[0].message).toEqual({
        role: 'system',
        content: 'You are a helpful assistant',
      });
      expect(history[0].tokens).toBeGreaterThan(0);
    });
  });

  describe('addUserMessage', () => {
    it('should add a user message with tokens to history', () => {
      context.addUserMessage('What is the weather?');

      const history = (context as unknown as { history: MessageWithTokens[] }).history;
      expect(history).toHaveLength(1);
      expect(history[0].message).toEqual({
        role: 'user',
        content: 'What is the weather?',
      });
      expect(history[0].tokens).toBeGreaterThan(0);
    });
  });

  describe('getTotalTokens', () => {
    it('should return 0 for empty history', () => {
      expect(context.getTotalTokens()).toBe(0);
    });

    it('should return sum of all message tokens', () => {
      context.addMessageWithTokens({ role: 'system', content: 'System' }, 10);
      context.addMessageWithTokens({ role: 'user', content: 'Hello' }, 20);
      context.addMessageWithTokens({ role: 'assistant', content: 'Hi' }, 30);

      expect(context.getTotalTokens()).toBe(60);
    });
  });

  describe('validHistory', () => {
    it('should return messages with valid content', () => {
      (context as unknown as { history: MessageWithTokens[] }).history = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 10 },
        { message: { role: 'user', content: 'User message' }, tokens: 10 },
        { message: { role: 'assistant', content: 'Assistant response' }, tokens: 10 },
      ];

      const validHistory = context.validHistory();

      expect(validHistory).toHaveLength(3);
    });

    it('should filter out messages with empty content', () => {
      (context as unknown as { history: MessageWithTokens[] }).history = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 10 },
        { message: { role: 'user', content: '' }, tokens: 4 },
        { message: { role: 'assistant', content: '   ' }, tokens: 4 },
      ];

      const validHistory = context.validHistory();

      expect(validHistory).toHaveLength(1);
      expect(validHistory[0].role).toBe('system');
    });

    it('should filter out messages with null content but no tool calls or toolCallId', () => {
      (context as unknown as { history: MessageWithTokens[] }).history = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 10 },
        { message: { role: 'assistant', content: null }, tokens: 4 },
      ];

      const validHistory = context.validHistory();

      expect(validHistory).toHaveLength(1);
      expect(validHistory[0].role).toBe('system');
    });

    it('should keep messages with null content but with toolCalls', () => {
      (context as unknown as { history: MessageWithTokens[] }).history = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 10 },
        {
          message: {
            role: 'assistant',
            content: null,
            toolCalls: [
              {
                id: 'call-123',
                type: 'function',
                function: { name: 'test', arguments: '{}' },
              },
            ],
          },
          tokens: 20,
        },
      ];

      const validHistory = context.validHistory();

      expect(validHistory).toHaveLength(2);
    });

    it('should keep messages with toolCallId', () => {
      (context as unknown as { history: MessageWithTokens[] }).history = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 10 },
        {
          message: { role: 'tool', content: null, toolCallId: 'call-123', name: 'test' },
          tokens: 10,
        },
      ];

      const validHistory = context.validHistory();

      expect(validHistory).toHaveLength(2);
    });
  });

  describe('compressContext', () => {
    it('should skip compression when history has only system prompt', async () => {
      (context as unknown as { history: MessageWithTokens[] }).history = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 100 },
      ];

      await context.compressContext();

      const history = (context as unknown as { history: MessageWithTokens[] }).history;
      expect(history).toHaveLength(1);
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Context compression skipped due to insufficient message history length.'
      );
    });

    it('should compress based on token count reaching target', async () => {
      mockLLMProvider.chat.mockResolvedValue({
        content: '<state_snapshot>Compressed context</state_snapshot>',
      });

      // Create messages with specific token counts
      // Total tokens (excluding system): 100 + 200 + 100 + 200 + 100 + 200 + 100 = 1000
      // Target: 1000 * 0.7 = 700
      // Cumulative: 100, 300, 400, 600, 700, 900, 1000
      // First index where cumulative >= 700 is index 4 (700)
      const messages: MessageWithTokens[] = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 50 },
        { message: { role: 'user', content: 'Message 1' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 1' }, tokens: 200 },
        { message: { role: 'user', content: 'Message 2' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 2' }, tokens: 200 },
        { message: { role: 'user', content: 'Message 3' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 3' }, tokens: 200 },
        { message: { role: 'user', content: 'Message 4' }, tokens: 100 },
      ];

      (context as unknown as { history: MessageWithTokens[] }).history = messages;

      await context.compressContext();

      const history = (context as unknown as { history: MessageWithTokens[] }).history;

      // Should have system prompt + compressed assistant message + remaining messages
      expect(history.length).toBeGreaterThan(1);
      expect(history[0].message.role).toBe('system');
      expect(history[1].message.role).toBe('assistant');
      expect(history[1].message.content).toContain('Compressed context');
    });

    it('should adjust boundary forward when hitting assistant with tool calls', async () => {
      mockLLMProvider.chat.mockResolvedValue({
        content: '<state_snapshot>Compressed context</state_snapshot>',
      });

      // Create scenario where compression point lands on assistant with toolCalls
      // The algorithm should move forward to include all tool responses
      const messages: MessageWithTokens[] = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 50 },
        { message: { role: 'user', content: 'Message 1' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 1' }, tokens: 100 },
        { message: { role: 'user', content: 'Message 2' }, tokens: 100 },
        {
          message: {
            role: 'assistant',
            content: null,
            toolCalls: [
              {
                id: 'call-123',
                type: 'function',
                function: { name: 'test', arguments: '{}' },
              },
            ],
          },
          tokens: 300, // This will be at the 70% point (total: 100+100+100+300+100+100 = 800, 70% = 560)
        },
        {
          message: { role: 'tool', content: 'Tool result', toolCallId: 'call-123', name: 'test' },
          tokens: 100,
        },
        { message: { role: 'user', content: 'Message 3' }, tokens: 100 },
      ];

      (context as unknown as { history: MessageWithTokens[] }).history = messages;

      await context.compressContext();

      const history = (context as unknown as { history: MessageWithTokens[] }).history;

      // Compression should include the tool response (forward adjustment)
      expect(history[0].message.role).toBe('system');
      expect(history[1].message.role).toBe('assistant');
      expect(history[1].message.content).toContain('Compressed');
    });

    it('should handle tool role messages by finding end of sequence', async () => {
      mockLLMProvider.chat.mockResolvedValue({
        content: '<state_snapshot>Compressed context</state_snapshot>',
      });

      // Compression point lands in middle of tool responses
      const messages: MessageWithTokens[] = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 50 },
        { message: { role: 'user', content: 'Message 1' }, tokens: 100 },
        {
          message: {
            role: 'assistant',
            content: null,
            toolCalls: [
              { id: 'call-1', type: 'function', function: { name: 'test1', arguments: '{}' } },
              { id: 'call-2', type: 'function', function: { name: 'test2', arguments: '{}' } },
            ],
          },
          tokens: 100,
        },
        {
          message: { role: 'tool', content: 'Result 1', toolCallId: 'call-1', name: 'test1' },
          tokens: 400, // 70% target will land here
        },
        {
          message: { role: 'tool', content: 'Result 2', toolCallId: 'call-2', name: 'test2' },
          tokens: 100,
        },
        { message: { role: 'user', content: 'Follow up' }, tokens: 100 },
      ];

      (context as unknown as { history: MessageWithTokens[] }).history = messages;

      await context.compressContext();

      // Should compress including all tool responses (forward to end of sequence)
      const history = (context as unknown as { history: MessageWithTokens[] }).history;
      expect(history[0].message.role).toBe('system');
      expect(history[1].message.role).toBe('assistant');
    });

    it('should warn about unexpected message roles', async () => {
      mockLLMProvider.chat.mockResolvedValue({
        content: '<state_snapshot>Compressed context</state_snapshot>',
      });

      const messages: MessageWithTokens[] = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 50 },
        { message: { role: 'user', content: 'Message 1' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 1' }, tokens: 100 },
        { message: { role: 'user', content: 'Message 2' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 2' }, tokens: 100 },
        { message: { role: 'unknown' as 'user', content: 'Unknown' }, tokens: 300 },
        { message: { role: 'user', content: 'Message 3' }, tokens: 100 },
      ];

      (context as unknown as { history: MessageWithTokens[] }).history = messages;

      await context.compressContext();

      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Unexpected message role during context compression:',
        { role: 'unknown' }
      );
    });

    it('should use correct temperature when calling LLM', async () => {
      mockLLMProvider.chat.mockResolvedValue({
        content: '<state_snapshot>Compressed context</state_snapshot>',
      });

      const messages: MessageWithTokens[] = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 50 },
        { message: { role: 'user', content: 'Message 1' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 1' }, tokens: 200 },
        { message: { role: 'user', content: 'Message 2' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 2' }, tokens: 200 },
        { message: { role: 'user', content: 'Message 3' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 3' }, tokens: 200 },
      ];

      (context as unknown as { history: MessageWithTokens[] }).history = messages;

      await context.compressContext();

      expect(mockLLMProvider.chat).toHaveBeenCalledWith(expect.any(Array), { temperature: 0.2 });
    });

    it('should preserve system prompt in compressed history', async () => {
      mockLLMProvider.chat.mockResolvedValue({
        content: '<state_snapshot>Compressed</state_snapshot>',
      });

      const systemPrompt = 'Original system prompt';
      const messages: MessageWithTokens[] = [
        { message: { role: 'system', content: systemPrompt }, tokens: 50 },
        { message: { role: 'user', content: 'Message 1' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 1' }, tokens: 200 },
        { message: { role: 'user', content: 'Message 2' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 2' }, tokens: 200 },
        { message: { role: 'user', content: 'Message 3' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 3' }, tokens: 200 },
      ];

      (context as unknown as { history: MessageWithTokens[] }).history = messages;

      await context.compressContext();

      const history = (context as unknown as { history: MessageWithTokens[] }).history;
      expect(history[0].message.content).toBe(systemPrompt);
    });

    it('should log compression info on successful compression', async () => {
      mockLLMProvider.chat.mockResolvedValue({
        content: '<state_snapshot>Compressed</state_snapshot>',
      });

      const messages: MessageWithTokens[] = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 50 },
        { message: { role: 'user', content: 'Message 1' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 1' }, tokens: 200 },
        { message: { role: 'user', content: 'Message 2' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 2' }, tokens: 200 },
        { message: { role: 'user', content: 'Message 3' }, tokens: 100 },
      ];

      (context as unknown as { history: MessageWithTokens[] }).history = messages;

      await context.compressContext();

      expect(mockedLogger.info).toHaveBeenCalledWith(
        'Context compressed successfully',
        expect.objectContaining({
          originalMessages: expect.any(Number),
          compressedMessages: expect.any(Number),
          remainingMessages: expect.any(Number),
          originalTokens: expect.any(Number),
          compressedTokens: expect.any(Number),
        })
      );
    });
  });

  describe('compressContext edge cases', () => {
    it('should handle empty message history gracefully', async () => {
      (context as unknown as { history: MessageWithTokens[] }).history = [];

      await context.compressContext();

      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Context compression skipped due to insufficient message history length.'
      );
    });

    it('should handle case where all messages are in tool sequence at end', async () => {
      mockLLMProvider.chat.mockResolvedValue({
        content: '<state_snapshot>Compressed</state_snapshot>',
      });

      const messages: MessageWithTokens[] = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 50 },
        { message: { role: 'user', content: 'Message 1' }, tokens: 100 },
        {
          message: {
            role: 'assistant',
            content: null,
            toolCalls: [
              { id: 'call-1', type: 'function', function: { name: 'test', arguments: '{}' } },
            ],
          },
          tokens: 500,
        },
        {
          message: { role: 'tool', content: 'Result', toolCallId: 'call-1', name: 'test' },
          tokens: 100,
        },
      ];

      (context as unknown as { history: MessageWithTokens[] }).history = messages;

      await context.compressContext();

      // Should handle gracefully without error
      const history = (context as unknown as { history: MessageWithTokens[] }).history;
      expect(history[0].message.role).toBe('system');
    });

    it('should skip compression when no valid compression point found', async () => {
      // Mock LLM in case compression happens - though it shouldn't in this edge case
      mockLLMProvider.chat.mockResolvedValue({
        content: '<state_snapshot>Compressed</state_snapshot>',
      });

      // Create scenario where targetIdx becomes invalid after boundary adjustment
      // Single message with small token count - compression point at 0 means compress nothing
      const messages: MessageWithTokens[] = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 50 },
        { message: { role: 'user', content: 'Single message' }, tokens: 10 },
      ];

      (context as unknown as { history: MessageWithTokens[] }).history = messages;

      await context.compressContext();

      // Verify no crash and history preserved
      const history = (context as unknown as { history: MessageWithTokens[] }).history;
      expect(history).toBeDefined();
    });

    it('should handle user message at compression boundary correctly', async () => {
      mockLLMProvider.chat.mockResolvedValue({
        content: '<state_snapshot>Compressed</state_snapshot>',
      });

      // User message lands at 70% boundary
      const messages: MessageWithTokens[] = [
        { message: { role: 'system', content: 'System prompt' }, tokens: 50 },
        { message: { role: 'user', content: 'Message 1' }, tokens: 100 },
        { message: { role: 'assistant', content: 'Response 1' }, tokens: 100 },
        { message: { role: 'user', content: 'Message 2' }, tokens: 500 }, // 70% lands here
        { message: { role: 'assistant', content: 'Response 2' }, tokens: 100 },
      ];

      (context as unknown as { history: MessageWithTokens[] }).history = messages;

      await context.compressContext();

      // User messages can be boundaries directly
      const history = (context as unknown as { history: MessageWithTokens[] }).history;
      expect(history[0].message.role).toBe('system');
      expect(history[1].message.role).toBe('assistant');
    });
  });
});
