import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIProvider } from '../../../src/infrastructure/llm/openai';
import { LLMConfig, Message } from '../../../src/infrastructure/llm/types';

// Mock logger module
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock OpenAI module
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}));

// Import the mocked logger
import logger from '../../../src/utils/logger';
const mockedLogger = vi.mocked(logger);

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let config: LLMConfig;

  beforeEach(() => {
    // Clear mocks
    vi.clearAllMocks();

    // Setup config
    config = {
      type: 'openai',
      apiKey: 'test-api-key',
      model: 'gpt-4.5-mini',
      baseUrl: 'https://api.openai.com/v1',
    };

    // Create provider
    provider = new OpenAIProvider(config);
  });

  describe('Constructor', () => {
    it('should initialize with config', () => {
      // Assert
      expect(provider).toBeDefined();
      expect(mockedLogger.info).toHaveBeenCalledWith(
        'OpenAI provider initialized',
        expect.objectContaining({
          model: config.model,
          baseUrl: config.baseUrl,
        })
      );
    });

    it('should not log API key', () => {
      // Assert
      const logCalls = mockedLogger.info.mock.calls;
      const initCall = logCalls.find((call) => String(call[0]) === 'OpenAI provider initialized');
      expect(initCall).toBeDefined();
      expect(JSON.stringify(initCall || '')).not.toContain(config.apiKey);
    });
  });

  describe('chat() and streamChat()', () => {
    // NOTE: Full integration testing of chat() and streamChat() methods requires
    // sophisticated mocking of the OpenAI client or real API testing.
    // These are marked as integration tests and should be tested separately
    // with actual API mocking frameworks or real API credentials.

    it.skip('should send chat request without tools', async () => {
      // Skipped: Requires complex mock setup for OpenAI client
      // This should be tested as an integration test
    });

    it.skip('should handle tool calls', async () => {
      // Skipped: Requires complex mock setup for OpenAI client
      // This should be tested as an integration test
    });

    it.skip('should stream chat responses', async () => {
      // Skipped: Requires complex mock setup for OpenAI client streaming
      // This should be tested as an integration test
    });
  });

  describe('formatMessages - tool call arguments JSON validation', () => {
    // Access private method for testing
    function callFormatMessages(provider: OpenAIProvider, messages: Message[]) {
      return (provider as any).formatMessages(messages);
    }

    it('should pass through valid JSON arguments unchanged', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'tc-1',
              type: 'function',
              function: {
                name: 'test_tool',
                arguments: '{"key":"value"}',
              },
            },
          ],
        },
      ];

      const result = callFormatMessages(provider, messages);
      expect(result[0].tool_calls[0].function.arguments).toBe('{"key":"value"}');
    });

    it('should replace empty string arguments with "{}" and log warning', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'tc-1',
              type: 'function',
              function: {
                name: 'test_tool',
                arguments: '',
              },
            },
          ],
        },
      ];

      const result = callFormatMessages(provider, messages);
      expect(result[0].tool_calls[0].function.arguments).toBe('{}');
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Tool call has empty arguments, defaulting to {}',
        expect.objectContaining({ toolCallId: 'tc-1', toolName: 'test_tool' })
      );
    });

    it('should replace malformed JSON arguments with "{}" and log warning', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'tc-1',
              type: 'function',
              function: {
                name: 'test_tool',
                arguments: '{invalid json',
              },
            },
          ],
        },
      ];

      const result = callFormatMessages(provider, messages);
      expect(result[0].tool_calls[0].function.arguments).toBe('{}');
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Tool call has malformed JSON arguments, defaulting to {}',
        expect.objectContaining({
          toolCallId: 'tc-1',
          toolName: 'test_tool',
          originalArgs: '{invalid json',
        })
      );
    });

    it('should replace partial/truncated JSON arguments with "{}"', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'tc-1',
              type: 'function',
              function: {
                name: 'test_tool',
                arguments: '{"key": "val',
              },
            },
          ],
        },
      ];

      const result = callFormatMessages(provider, messages);
      expect(result[0].tool_calls[0].function.arguments).toBe('{}');
    });

    it('should handle multiple tool calls with mixed valid/invalid arguments', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'tc-1',
              type: 'function',
              function: {
                name: 'tool_a',
                arguments: '{"valid": true}',
              },
            },
            {
              id: 'tc-2',
              type: 'function',
              function: {
                name: 'tool_b',
                arguments: '',
              },
            },
            {
              id: 'tc-3',
              type: 'function',
              function: {
                name: 'tool_c',
                arguments: 'not json',
              },
            },
          ],
        },
      ];

      const result = callFormatMessages(provider, messages);
      expect(result[0].tool_calls[0].function.arguments).toBe('{"valid": true}');
      expect(result[0].tool_calls[1].function.arguments).toBe('{}');
      expect(result[0].tool_calls[2].function.arguments).toBe('{}');
    });

    it('should preserve valid empty object arguments', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'tc-1',
              type: 'function',
              function: {
                name: 'test_tool',
                arguments: '{}',
              },
            },
          ],
        },
      ];

      const result = callFormatMessages(provider, messages);
      expect(result[0].tool_calls[0].function.arguments).toBe('{}');
    });
  });
});
