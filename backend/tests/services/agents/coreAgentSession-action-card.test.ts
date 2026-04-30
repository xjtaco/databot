import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { rmSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { SessionConfig, WsMessage } from '../../../src/agent';
import type { StreamEvent } from '../../../src/infrastructure/llm';

// Mock config module BEFORE importing CoreAgentSession
// Note: vi.mock is hoisted, so we must compute the path inline in the factory
vi.mock('../../../src/base/config', () => {
  const TEST_WORK_DIR = path.join(
    process.env.TMPDIR || '/tmp',
    'databot-core-agent-session-action-card-test'
  );
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

// Mock chatSessionService
vi.mock('../../../src/chatSession/chatSession.service', () => ({
  createSession: vi.fn().mockResolvedValue({ id: 'session-1', title: null }),
  updateSession: vi.fn().mockResolvedValue({}),
  getSession: vi.fn().mockResolvedValue({ id: 'session-1', title: null }),
  addMessage: vi
    .fn()
    .mockResolvedValue({ id: 'msg-1', sessionId: 'session-1', role: 'tool', content: '{}' }),
  autoGenerateTitle: vi.fn().mockResolvedValue({}),
}));

// Mock logger module
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock LLM provider
const mockLLMProvider = {
  streamChat: vi.fn(),
  chat: vi.fn(),
};

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
    SearchUiActionCard: 'search_ui_action_card',
    ShowUiActionCard: 'show_ui_action_card',
  },
  ToolRegistry: {
    getAllToolSchemas: vi.fn(() => []),
  },
}));

// Now import after mocks are set up
import { CoreAgentSession } from '../../../src/agent';
import * as chatSessionService from '../../../src/chatSession/chatSession.service';

// Define TEST_WORK_DIR for beforeAll/afterAll hooks
const TEST_WORK_DIR = path.join(
  process.env.TMPDIR || '/tmp',
  'databot-core-agent-session-action-card-test'
);

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

// Mock WebSocket class
class MockWebSocket {
  readyState = 1; // OPEN state
  send = vi.fn();
  close = vi.fn();
  on = vi.fn();

  get OPEN() {
    return 1;
  }
}

// Create a mock async generator for streaming
async function* createMockStream(events: StreamEvent[]): AsyncGenerator<StreamEvent> {
  for (const event of events) {
    yield event;
  }
}

// Helper to extract sent WS messages by type
function getSentMessagesOfType(mockWs: MockWebSocket, type: string): Array<WsMessage> {
  return mockWs.send.mock.calls
    .map((call: Array<unknown>) => {
      const msg = JSON.parse(call[0] as string);
      return msg as WsMessage;
    })
    .filter((msg) => msg.type === type);
}

describe('CoreAgentSession action_card WebSocket event', () => {
  let session: CoreAgentSession;
  let config: SessionConfig;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chatSessionService.addMessage).mockResolvedValue({
      id: 'msg-1',
      sessionId: 'session-1',
      role: 'tool',
      content: '{}',
      metadata: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    config = {
      sessionId: 'test-session-action-card',
      chatSessionId: 'session-1',
      heartbeatInterval: 10000,
      heartbeatTimeout: 5000,
      maxMissedHeartbeats: 3,
    };

    session = new CoreAgentSession(config);
    mockWs = new MockWebSocket();
    session.connect(mockWs as any);
  });

  afterEach(() => {
    if (session && session.getState() !== 'disconnected') {
      session.disconnect();
    }
  });

  it('should send action_card WS message when show_ui_action_card tool returns cardPayload in metadata', async () => {
    const cardPayload = {
      id: 'card-1',
      cardId: 'data.open',
      title: 'Open Data',
      description: 'Open the data panel',
    };

    const streamEvents: StreamEvent[] = [
      {
        type: 'tool_call_result',
        toolCallResult: {
          toolCallId: 'tc-1',
          name: 'show_ui_action_card',
          role: 'tool',
          content: '{}',
          metadata: {
            status: 'success',
            resultSummary: 'Card displayed',
            cardPayload,
          },
        },
      },
      { type: 'done', finishReason: 'stop' },
    ];
    mockLLMProvider.streamChat.mockReturnValue(createMockStream(streamEvents));

    await session.handleUserMessage({ content: 'Show me the data card' });

    const actionCardMessages = getSentMessagesOfType(mockWs, 'action_card');

    expect(actionCardMessages.length).toBe(1);
    expect(actionCardMessages[0].data).toEqual({
      ...cardPayload,
      metadataMessageId: 'msg-1',
      metadataSessionId: 'session-1',
    });
    expect(actionCardMessages[0].timestamp).toBeTypeOf('number');
  });

  it('should persist action_card metadata once and expose the persisted message id', async () => {
    const cardPayload = {
      id: 'card-persist',
      cardId: 'workflow.open',
      title: 'Open workflow',
    };
    const streamEvents: StreamEvent[] = [
      {
        type: 'tool_call_result',
        toolCallResult: {
          toolCallId: 'tc-persist',
          name: 'show_ui_action_card',
          role: 'tool',
          content: '{}',
          metadata: {
            status: 'success',
            resultSummary: 'Workflow card',
            cardPayload,
          },
        },
      },
      { type: 'done', finishReason: 'stop' },
    ];
    mockLLMProvider.streamChat.mockReturnValue(createMockStream(streamEvents));

    await session.handleUserMessage({ content: 'Show workflow card' });

    expect(chatSessionService.addMessage).toHaveBeenCalledWith(
      'session-1',
      'tool',
      JSON.stringify({
        toolName: 'show_ui_action_card',
        toolCallId: 'tc-persist',
        status: 'success',
        cardPayload,
      }),
      {
        type: 'action_card',
        payload: cardPayload,
        status: 'proposed',
      }
    );
    const persistedToolMessages = vi
      .mocked(chatSessionService.addMessage)
      .mock.calls.filter((call) => {
        if (call[1] !== 'tool' || typeof call[2] !== 'string') return false;
        const parsed = JSON.parse(call[2]) as { toolCallId?: string };
        return parsed.toolCallId === 'tc-persist';
      });
    expect(persistedToolMessages).toHaveLength(1);

    const actionCardMessages = getSentMessagesOfType(mockWs, 'action_card');
    expect(actionCardMessages[0].data).toEqual({
      ...cardPayload,
      metadataMessageId: 'msg-1',
      metadataSessionId: 'session-1',
    });
  });

  it('should NOT send action_card for non-show_ui_action_card tools (e.g. bash)', async () => {
    const streamEvents: StreamEvent[] = [
      {
        type: 'tool_call_result',
        toolCallResult: {
          toolCallId: 'tc-2',
          name: 'bash',
          role: 'tool',
          content: 'command output',
          metadata: {
            status: 'success',
            resultSummary: 'Ran successfully',
          },
        },
      },
      { type: 'done', finishReason: 'stop' },
    ];
    mockLLMProvider.streamChat.mockReturnValue(createMockStream(streamEvents));

    await session.handleUserMessage({ content: 'Run a command' });

    const actionCardMessages = getSentMessagesOfType(mockWs, 'action_card');

    expect(actionCardMessages.length).toBe(0);
  });

  it('should NOT send action_card when cardPayload is missing from metadata', async () => {
    const streamEvents: StreamEvent[] = [
      {
        type: 'tool_call_result',
        toolCallResult: {
          toolCallId: 'tc-3',
          name: 'show_ui_action_card',
          role: 'tool',
          content: '{}',
          metadata: {
            status: 'success',
            resultSummary: 'No card payload',
          },
        },
      },
      { type: 'done', finishReason: 'stop' },
    ];
    mockLLMProvider.streamChat.mockReturnValue(createMockStream(streamEvents));

    await session.handleUserMessage({ content: 'Show card without payload' });

    const actionCardMessages = getSentMessagesOfType(mockWs, 'action_card');

    expect(actionCardMessages.length).toBe(0);
  });

  it('should still send tool_call message alongside action_card', async () => {
    const cardPayload = {
      id: 'card-2',
      cardId: 'report.view',
      title: 'View Report',
    };

    const streamEvents: StreamEvent[] = [
      {
        type: 'tool_call_result',
        toolCallResult: {
          toolCallId: 'tc-4',
          name: 'show_ui_action_card',
          role: 'tool',
          content: '{}',
          metadata: {
            status: 'success',
            resultSummary: 'Report card',
            cardPayload,
          },
        },
      },
      { type: 'done', finishReason: 'stop' },
    ];
    mockLLMProvider.streamChat.mockReturnValue(createMockStream(streamEvents));

    await session.handleUserMessage({ content: 'View report' });

    const toolCallMessages = getSentMessagesOfType(mockWs, 'tool_call');
    const actionCardMessages = getSentMessagesOfType(mockWs, 'action_card');

    // tool_call should still be sent
    expect(toolCallMessages.length).toBe(1);
    expect((toolCallMessages[0].data as Record<string, unknown>).result).toBeDefined();

    // action_card should also be sent
    expect(actionCardMessages.length).toBe(1);
    expect(actionCardMessages[0].data).toEqual({
      ...cardPayload,
      metadataMessageId: 'msg-1',
      metadataSessionId: 'session-1',
    });
  });

  it('should NOT send action_card when metadata is undefined', async () => {
    const streamEvents: StreamEvent[] = [
      {
        type: 'tool_call_result',
        toolCallResult: {
          toolCallId: 'tc-5',
          name: 'show_ui_action_card',
          role: 'tool',
          content: '{}',
        },
      },
      { type: 'done', finishReason: 'stop' },
    ];
    mockLLMProvider.streamChat.mockReturnValue(createMockStream(streamEvents));

    await session.handleUserMessage({ content: 'Show card without metadata' });

    const actionCardMessages = getSentMessagesOfType(mockWs, 'action_card');

    expect(actionCardMessages.length).toBe(0);
  });
});
