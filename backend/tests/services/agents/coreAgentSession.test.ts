import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { rmSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { SessionConfig, WsMessage } from '../../../src/agent';
import type { StreamEvent } from '../../../src/infrastructure/llm';

// Mock config module BEFORE importing CoreAgentSession
// Note: vi.mock is hoisted, so we must compute the path inline in the factory
vi.mock('../../../src/base/config', () => {
  const TEST_WORK_DIR = path.join(process.env.TMPDIR || '/tmp', 'databot-core-agent-session-test');
  return {
    config: {
      port: 3000,
      env: 'test',
      base_url: '/api',
      data_dictionary_folder: '',
      work_folder: TEST_WORK_DIR,
      context_compress_ratio: 0.7,
      log: {
        dir: 'logs',
        file: 'app.log',
        maxFiles: 5,
        maxSize: '20m',
      },
      llm: {
        type: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        baseUrl: 'https://api.openai.com/v1',
        compress_token_limit: 90000,
      },
      websocket: {
        enabled: true,
        path: '/ws',
        heartbeatInterval: 30000,
        heartbeatTimeout: 30000,
        maxMissedHeartbeats: 3,
      },
      webSearch: {
        type: 'ali_iqs',
        apiKey: '',
        baseUrl: '',
        timeout: 60000,
        sslVerify: true,
        numResults: 10,
      },
      sandbox: {
        containerName: 'test-container',
        defaultWorkDir: '/tmp',
        user: 'agent',
        timeout: 120000,
      },
      upload: {
        directory: path.join(TEST_WORK_DIR, 'uploads'),
        maxFileSize: 52428800,
      },
      bridge: {
        url: 'http://localhost:8080',
      },
    },
  };
});

// Now import after config is mocked
import { CoreAgentSession } from '../../../src/agent';

// Define TEST_WORK_DIR for beforeAll/afterAll hooks
const TEST_WORK_DIR = path.join(process.env.TMPDIR || '/tmp', 'databot-core-agent-session-test');

// Setup: Create temp directory before tests
beforeAll(() => {
  if (!existsSync(TEST_WORK_DIR)) {
    mkdirSync(TEST_WORK_DIR, { recursive: true });
  }
});

// Cleanup: Remove temp directory after all tests
afterAll(() => {
  if (existsSync(TEST_WORK_DIR)) {
    rmSync(TEST_WORK_DIR, { recursive: true, force: true });
  }
});

// Mock logger module
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock LLM provider - declare before mock to reference it
const mockLLMProvider = {
  streamChat: vi.fn(),
  chat: vi.fn(),
};

// Mock LLMProviderFactory
vi.mock('../../../src/infrastructure/llm', () => ({
  LLMProviderFactory: {
    getProvider: vi.fn(() => mockLLMProvider),
    getConfig: vi.fn(() => ({ apiKey: 'test-key', compressTokenLimit: 90000 })),
  },
  ToolName: {
    Glob: 'glob',
    Grep: 'grep',
    ReadFile: 'read_file',
    Edit: 'edit',
    WriteFile: 'write_file',
    Bash: 'bash',
    Sql: 'sql',
    TodosWriter: 'todos_writer',
    OUTPUT_MD_TOOL: 'output_md_tool',
  },
  ToolRegistry: {
    getAllToolSchemas: vi.fn(() => []),
  },
}));

import logger from '../../../src/utils/logger';
const mockedLogger = vi.mocked(logger);

// Mock WebSocket class
class MockWebSocket {
  readyState = 1; // OPEN state
  send = vi.fn();
  close = vi.fn();
  on = vi.fn();
  sentMessages: WsMessage[] = [];

  // Make OPEN accessible as instance instance
  get OPEN() {
    return 1;
  }

  // Override send to capture messages
  sendMessage(message: WsMessage) {
    this.send(JSON.stringify(message));
    this.sentMessages.push(message);
  }
}

// Create a mock async generator for streaming
async function* createMockStream(events: StreamEvent[]): AsyncGenerator<StreamEvent> {
  for (const event of events) {
    yield event;
  }
}

describe('CoreAgentSession', () => {
  let session: CoreAgentSession;
  let config: SessionConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      sessionId: 'test-session-1',
      heartbeatInterval: 10000,
      heartbeatTimeout: 5000,
      maxMissedHeartbeats: 3,
    };

    session = new CoreAgentSession(config);
  });

  afterEach(() => {
    // Cleanup: disconnect session to release memory
    if (session && session.getState() !== 'disconnected') {
      session.disconnect();
    }
  });

  describe('Constructor', () => {
    it('should create instance with config', () => {
      expect(session).toBeInstanceOf(CoreAgentSession);
      expect(session.getSessionId()).toBe('test-session-1');
    });

    it('should have initial state as connecting', () => {
      expect(session.getState()).toBe('connecting');
    });

    it('should initialize context with system prompt', () => {
      const context = (session as any).context;
      expect(context).toBeDefined();
      const history = context.validHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].role).toBe('system');
    });

    it('should create a wf_ work folder and include the exact path in the system prompt', () => {
      const workFolder = (session as any).workFolder as string;
      const context = (session as any).context;
      const systemPrompt = context.validHistory()[0].content as string;

      expect(path.basename(workFolder)).toMatch(/^wf_/);
      expect(systemPrompt).toContain(workFolder);
      expect(systemPrompt).toContain(
        `Never write generated files directly under the root of \`${TEST_WORK_DIR}\``
      );
      expect(systemPrompt).toContain('Use short English snake_case filenames such as');
      expect(systemPrompt).toContain(
        'When using tools like `read_file` or `write_file`, always use absolute paths.'
      );
      expect(systemPrompt).not.toContain('do not provide a summary unless the user requests it');
      expect(systemPrompt).not.toContain("Always concatenate the project root's absolute path");
    });

    it('should include action-card presentation rules in the system prompt', () => {
      const context = (
        session as unknown as {
          context: { validHistory: () => Array<{ content: unknown }> };
        }
      ).context;
      const systemPrompt = context.validHistory()[0].content as string;

      expect(systemPrompt).toContain('Inline form cards');
      expect(systemPrompt).toContain('data source, knowledge, and schedule create cards');
      expect(systemPrompt).toContain('do not ask for an extra pre-confirmation');
      expect(systemPrompt).toContain(
        'Workflow and node-template cards are deferred navigation actions'
      );
      expect(systemPrompt).toContain('jump/open button');
      expect(systemPrompt).toContain('modal confirmation before leaving CoreAgent chat');
      expect(systemPrompt).toContain('Never write hard-coded card button labels');
      expect(systemPrompt).toContain(
        'catalog metadata and i18n keys returned by show_ui_action_card'
      );
    });

    it('should remove the session work folder when disconnected', () => {
      const workFolder = (session as any).workFolder as string;

      expect(existsSync(workFolder)).toBe(true);

      session.disconnect();

      expect(existsSync(workFolder)).toBe(false);
    });

    it('should remove the session work folder when the websocket closes', () => {
      const mockWs = new MockWebSocket();
      const workFolder = (session as any).workFolder as string;

      session.connect(mockWs as any);

      const closeCalls = mockWs.on.mock.calls.filter(([event]) => event === 'close');
      const closeHandler = closeCalls[closeCalls.length - 1]?.[1] as (() => void) | undefined;

      expect(closeHandler).toBeDefined();
      expect(existsSync(workFolder)).toBe(true);

      closeHandler?.();

      expect(existsSync(workFolder)).toBe(false);
    });
  });

  describe('handleUserMessage', () => {
    let mockWs: MockWebSocket;

    beforeEach(() => {
      mockWs = new MockWebSocket();
      session.connect(mockWs as any);
    });

    it('should add user message to context and stream response', async () => {
      const streamEvents: StreamEvent[] = [
        { type: 'content', content: 'Hello' },
        { type: 'done', finishReason: 'stop' },
      ];
      mockLLMProvider.streamChat.mockReturnValue(createMockStream(streamEvents));

      await session.handleUserMessage({ content: 'Hello, agent!' });

      expect(mockWs.send).toHaveBeenCalled();
      const context = (session as any).context;
      const history = context.validHistory();
      const userMessages = history.filter((msg: any) => msg.role === 'user');
      expect(userMessages.length).toBeGreaterThan(0);
    });

    it('should handle tool calls in stream', async () => {
      const streamEvents: StreamEvent[] = [
        {
          type: 'tool_call',
          toolCall: {
            id: 'call-123',
            type: 'function',
            function: { name: 'test_tool', arguments: '{"arg": "value"}' },
          },
        },
        {
          type: 'tool_call_result',
          toolCallResult: {
            toolCallId: 'call-123',
            name: 'test_tool',
            role: 'tool',
            content: 'Tool result',
          },
        },
        { type: 'done', finishReason: 'stop' },
      ];
      mockLLMProvider.streamChat.mockReturnValue(createMockStream(streamEvents));

      await session.handleUserMessage({ content: 'Use a tool' });

      expect(mockedLogger.info).toHaveBeenCalledWith('Received tool call', {
        toolName: 'test_tool',
        toolCallId: 'call-123',
      });
    });

    it('should log tool call result with truncated content preview', async () => {
      const longContent = 'A'.repeat(500);
      const streamEvents: StreamEvent[] = [
        {
          type: 'tool_call',
          toolCall: {
            id: 'call-preview',
            type: 'function',
            function: { name: 'bash', arguments: '{}' },
          },
        },
        {
          type: 'tool_call_result',
          toolCallResult: {
            toolCallId: 'call-preview',
            name: 'bash',
            role: 'tool',
            content: longContent,
          },
        },
        { type: 'done', finishReason: 'stop' },
      ];
      mockLLMProvider.streamChat.mockReturnValue(createMockStream(streamEvents));

      await session.handleUserMessage({ content: 'Run command' });

      expect(mockedLogger.info).toHaveBeenCalledWith('Received tool call result', {
        toolName: 'bash',
        toolCallId: 'call-preview',
        contentLength: 500,
        contentPreview: 'A'.repeat(200),
      });
    });

    it('should include toolName and toolCallId in tool_call message', async () => {
      const streamEvents: StreamEvent[] = [
        {
          type: 'tool_call',
          toolCall: {
            id: 'call-456',
            type: 'function',
            function: { name: 'sql', arguments: '{"query": "SELECT 1"}' },
          },
        },
        {
          type: 'tool_call_result',
          toolCallResult: {
            toolCallId: 'call-456',
            name: 'sql',
            role: 'tool',
            content: 'Query result',
            metadata: { rowCount: 1 },
          },
        },
        { type: 'done', finishReason: 'stop' },
      ];
      mockLLMProvider.streamChat.mockReturnValue(createMockStream(streamEvents));

      await session.handleUserMessage({ content: 'Run a SQL query' });

      // Find the tool_call message sent via WebSocket
      const calls = mockWs.send.mock.calls;
      const toolCallMessages = calls.filter((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string);
        return msg.type === 'tool_call';
      });

      expect(toolCallMessages.length).toBe(1);
      const toolCallMsg = JSON.parse(toolCallMessages[0][0] as string);

      expect(toolCallMsg.data.result).toBeDefined();
      expect(toolCallMsg.data.result.toolName).toBe('sql');
      expect(toolCallMsg.data.result.toolCallId).toBe('call-456');
      expect(toolCallMsg.data.result.rowCount).toBe(1);
    });

    it('should continue loop when finish_reason is not stop', async () => {
      const firstStreamEvents: StreamEvent[] = [
        {
          type: 'tool_call',
          toolCall: {
            id: 'call-123',
            type: 'function',
            function: { name: 'test', arguments: '{}' },
          },
        },
        { type: 'done', finishReason: 'tool_calls' },
      ];
      const secondStreamEvents: StreamEvent[] = [{ type: 'done', finishReason: 'stop' }];

      mockLLMProvider.streamChat
        .mockReturnValueOnce(createMockStream(firstStreamEvents))
        .mockReturnValueOnce(createMockStream(secondStreamEvents));

      await session.handleUserMessage({ content: 'Use tool' });

      expect(mockLLMProvider.streamChat).toHaveBeenCalledTimes(2);
    });

    it('should send error message on exception', async () => {
      mockLLMProvider.streamChat.mockImplementation(() => {
        throw new Error('Stream failed');
      });

      await session.handleUserMessage({ content: 'Test' });

      const calls = mockWs.send.mock.calls;
      const errorCalls = calls.filter((call: any) => {
        const msg = JSON.parse(call[0]);
        return msg.type === 'error';
      });
      expect(errorCalls.length).toBe(1);
      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Failed to process user message',
        expect.any(Object)
      );
    });

    it('should send usage_report when provided', async () => {
      const streamEvents: StreamEvent[] = [
        {
          type: 'done',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        },
      ];
      mockLLMProvider.streamChat.mockReturnValue(createMockStream(streamEvents));

      await session.handleUserMessage({ content: 'Test' });

      const calls = mockWs.send.mock.calls;
      const usageReportCalls = calls.filter((call: any) => {
        const msg = JSON.parse(call[0]);
        return msg.type === 'usage_report';
      });
      expect(usageReportCalls.length).toBe(1);
    });

    it('should send turn_complete message after each LLM turn', async () => {
      const streamEvents: StreamEvent[] = [
        { type: 'content', content: 'Hello' },
        { type: 'done', finishReason: 'stop' },
      ];
      mockLLMProvider.streamChat.mockReturnValue(createMockStream(streamEvents));

      await session.handleUserMessage({ content: 'Test' });

      const calls = mockWs.send.mock.calls;
      const turnCompleteCalls = calls.filter((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string);
        return msg.type === 'turn_complete';
      });

      expect(turnCompleteCalls.length).toBe(1);
      const turnCompleteMsg = JSON.parse(turnCompleteCalls[0][0] as string);
      expect(turnCompleteMsg.data).toBeDefined();
      expect(turnCompleteMsg.data.toolCallIds).toEqual([]);
    });

    it('should include toolCallIds in turn_complete message when tools are used', async () => {
      const streamEvents: StreamEvent[] = [
        {
          type: 'tool_call',
          toolCall: {
            id: 'call-789',
            type: 'function',
            function: { name: 'test_tool', arguments: '{}' },
          },
        },
        {
          type: 'tool_call_result',
          toolCallResult: {
            toolCallId: 'call-789',
            name: 'test_tool',
            role: 'tool',
            content: 'Result',
          },
        },
        { type: 'done', finishReason: 'stop' },
      ];
      mockLLMProvider.streamChat.mockReturnValue(createMockStream(streamEvents));

      await session.handleUserMessage({ content: 'Use tool' });

      const calls = mockWs.send.mock.calls;
      const turnCompleteCalls = calls.filter((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string);
        return msg.type === 'turn_complete';
      });

      expect(turnCompleteCalls.length).toBe(1);
      const turnCompleteMsg = JSON.parse(turnCompleteCalls[0][0] as string);
      expect(turnCompleteMsg.data.toolCallIds).toEqual(['call-789']);
    });

    it('should send turn_complete for each turn in multi-turn interaction', async () => {
      const firstStreamEvents: StreamEvent[] = [
        {
          type: 'tool_call',
          toolCall: {
            id: 'call-1',
            type: 'function',
            function: { name: 'tool1', arguments: '{}' },
          },
        },
        { type: 'done', finishReason: 'tool_calls' },
      ];
      const secondStreamEvents: StreamEvent[] = [
        {
          type: 'tool_call',
          toolCall: {
            id: 'call-2',
            type: 'function',
            function: { name: 'tool2', arguments: '{}' },
          },
        },
        { type: 'done', finishReason: 'stop' },
      ];

      mockLLMProvider.streamChat
        .mockReturnValueOnce(createMockStream(firstStreamEvents))
        .mockReturnValueOnce(createMockStream(secondStreamEvents));

      await session.handleUserMessage({ content: 'Multi-turn' });

      const calls = mockWs.send.mock.calls;
      const turnCompleteCalls = calls.filter((call: unknown[]) => {
        const msg = JSON.parse(call[0] as string);
        return msg.type === 'turn_complete';
      });

      expect(turnCompleteCalls.length).toBe(2);
      const firstTurnComplete = JSON.parse(turnCompleteCalls[0][0] as string);
      const secondTurnComplete = JSON.parse(turnCompleteCalls[1][0] as string);

      expect(firstTurnComplete.data.toolCallIds).toEqual(['call-1']);
      expect(secondTurnComplete.data.toolCallIds).toEqual(['call-2']);
    });
  });

  describe('onMessage', () => {
    let mockWs: MockWebSocket;

    beforeEach(() => {
      mockWs = new MockWebSocket();
      session.connect(mockWs as any);
    });

    it('should not send response for pong messages', () => {
      const pongMessage: WsMessage = {
        type: 'pong',
        timestamp: Date.now(),
      };

      expect(() => {
        (session as any).onMessage(pongMessage);
      }).not.toThrow();
    });

    it('should route user_message to handleUserMessage', async () => {
      const streamEvents: StreamEvent[] = [
        { type: 'content', content: 'Response' },
        { type: 'done', finishReason: 'stop' },
      ];
      mockLLMProvider.streamChat.mockReturnValue(createMockStream(streamEvents));

      const userMessage: WsMessage = {
        type: 'user_message',
        timestamp: Date.now(),
        data: { content: 'Hello' },
      };

      (session as any).onMessage(userMessage);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLLMProvider.streamChat).toHaveBeenCalled();
    });
  });

  describe('Default Configuration', () => {
    it('should use default values when not provided', () => {
      const minimalConfig: SessionConfig = { sessionId: 'test-session-2' };
      const minimalSession = new CoreAgentSession(minimalConfig);

      expect(minimalSession.getSessionId()).toBe('test-session-2');
      expect(minimalSession).toBeInstanceOf(CoreAgentSession);
    });
  });
});
