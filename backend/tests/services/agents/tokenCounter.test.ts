import { describe, it, expect } from 'vitest';
import { TiktokenCounter, TokenCounter } from '../../../src/agent/tokenCounter';
import type { Message } from '../../../src/infrastructure/llm';

describe('TiktokenCounter', () => {
  let counter: TokenCounter;

  beforeEach(() => {
    counter = new TiktokenCounter();
  });

  describe('countMessageTokens', () => {
    it('should count tokens for a simple user message', () => {
      const message: Message = {
        role: 'user',
        content: 'Hello, world!',
      };

      const tokens = counter.countMessageTokens(message);

      // Should be content tokens + overhead (4)
      expect(tokens).toBeGreaterThan(4);
      expect(tokens).toBeLessThan(20);
    });

    it('should count tokens for a message with null content', () => {
      const message: Message = {
        role: 'assistant',
        content: null,
      };

      const tokens = counter.countMessageTokens(message);

      // Should only have overhead tokens
      expect(tokens).toBe(4);
    });

    it('should count tokens for a message with name', () => {
      const message: Message = {
        role: 'tool',
        content: 'Result data',
        name: 'search_function',
      };

      const tokens = counter.countMessageTokens(message);

      // Should include content + name + overhead (content ~2-3 tokens, name ~2 tokens, overhead 4)
      expect(tokens).toBeGreaterThanOrEqual(8);
    });

    it('should count tokens for a message with toolCallId', () => {
      const message: Message = {
        role: 'tool',
        content: 'Tool result',
        toolCallId: 'call_abc123xyz',
      };

      const tokens = counter.countMessageTokens(message);

      // Should include content + toolCallId + overhead
      expect(tokens).toBeGreaterThan(8);
    });

    it('should count tokens for a message with toolCalls', () => {
      const message: Message = {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query": "test"}',
            },
          },
        ],
      };

      const tokens = counter.countMessageTokens(message);

      // Should include toolCall id + function name + arguments + overhead
      expect(tokens).toBeGreaterThan(10);
    });

    it('should count tokens for a message with multiple toolCalls', () => {
      const message: Message = {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query": "test1"}',
            },
          },
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: '{"path": "/tmp/file.txt"}',
            },
          },
        ],
      };

      const tokens = counter.countMessageTokens(message);

      // Should include both toolCalls + overhead
      expect(tokens).toBeGreaterThan(20);
    });

    it('should count tokens for a complex message with all fields', () => {
      const message: Message = {
        role: 'assistant',
        content: 'I will search for the information.',
        name: 'assistant_agent',
        toolCalls: [
          {
            id: 'call_abc',
            type: 'function',
            function: {
              name: 'web_search',
              arguments: '{"query": "latest news"}',
            },
          },
        ],
      };

      const tokens = counter.countMessageTokens(message);

      // Should include content + name + toolCalls + overhead
      expect(tokens).toBeGreaterThan(20);
    });

    it('should handle empty string content', () => {
      const message: Message = {
        role: 'user',
        content: '',
      };

      const tokens = counter.countMessageTokens(message);

      // Empty content should only have overhead
      expect(tokens).toBe(4);
    });

    it('should handle long content correctly', () => {
      const longContent = 'This is a test message. '.repeat(100);
      const message: Message = {
        role: 'user',
        content: longContent,
      };

      const tokens = counter.countMessageTokens(message);

      // Long content should have many tokens
      expect(tokens).toBeGreaterThan(400);
    });

    it('should handle messages with empty toolCalls array', () => {
      const message: Message = {
        role: 'assistant',
        content: 'No tools needed.',
        toolCalls: [],
      };

      const tokens = counter.countMessageTokens(message);

      // Should just count content + overhead, empty array doesn't add tokens
      expect(tokens).toBeGreaterThan(4);
      expect(tokens).toBeLessThan(15);
    });

    it('should be consistent for the same message', () => {
      const message: Message = {
        role: 'user',
        content: 'Consistent test message',
      };

      const tokens1 = counter.countMessageTokens(message);
      const tokens2 = counter.countMessageTokens(message);

      expect(tokens1).toBe(tokens2);
    });
  });

  describe('token counting accuracy', () => {
    it('should count approximately correct tokens for known text', () => {
      // "Hello" typically encodes to 1 token in cl100k_base
      const message: Message = {
        role: 'user',
        content: 'Hello',
      };

      const tokens = counter.countMessageTokens(message);

      // 1 token for "Hello" + 4 overhead = 5
      expect(tokens).toBe(5);
    });

    it('should handle unicode characters', () => {
      const message: Message = {
        role: 'user',
        content: '你好世界', // "Hello World" in Chinese
      };

      const tokens = counter.countMessageTokens(message);

      // Chinese characters typically use more tokens
      expect(tokens).toBeGreaterThan(4);
    });

    it('should handle code content', () => {
      const message: Message = {
        role: 'assistant',
        content: 'function test() { return 42; }',
      };

      const tokens = counter.countMessageTokens(message);

      // Code content should be tokenized
      expect(tokens).toBeGreaterThan(10);
    });
  });
});
