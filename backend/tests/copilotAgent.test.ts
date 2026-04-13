// backend/tests/copilotAgent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before import
vi.mock('../src/infrastructure/llm/factory');
vi.mock('../src/copilot/copilotTools');
vi.mock('../src/copilot/copilotPrompt', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('system prompt'),
}));
vi.mock('../src/globalConfig/globalConfig.service', () => ({
  getConfigStatus: vi.fn().mockResolvedValue({ llm: true, webSearch: true, smtp: true }),
}));
vi.mock('../src/workflow/workflow.service', () => ({
  reflowWorkflowLayout: vi.fn(),
}));
vi.mock('../src/copilot/copilot.types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/copilot/copilot.types')>();
  return { ...actual, COPILOT_MAX_TOOL_CALLS_PER_TURN: 20 };
});

import { CopilotAgent } from '../src/copilot/copilotAgent';
import type { CopilotServerMessage } from '../src/copilot/copilot.types';
import { LLMProviderFactory } from '../src/infrastructure/llm/factory';
import { createCopilotToolRegistry } from '../src/copilot/copilotTools';
import type { ChatOptions, ChatResponse, ToolCallResult } from '../src/infrastructure/llm/types';
import type { Message } from '../src/infrastructure/llm/types';
import type { ToolResult } from '../src/infrastructure/tools/types';
import * as workflowService from '../src/workflow/workflow.service';

/**
 * Wrap a mock chat fn so it invokes callbacks when toolCalls are present.
 * The underlying mock returns the ChatResponse, then we simulate tool execution.
 */
function wrapWithCallbacks(
  baseMock: ReturnType<typeof vi.fn>,
  mockExecute: ReturnType<typeof vi.fn>
) {
  return vi.fn(async (messages: Message[], options?: ChatOptions): Promise<ChatResponse> => {
    const response = (await (baseMock as (...args: unknown[]) => unknown)(
      messages,
      options
    )) as ChatResponse;

    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolCallResults: ToolCallResult[] = [];
      for (const tc of response.toolCalls) {
        // Invoke onToolCallStart callback
        options?.onToolCallStart?.(tc);

        // Execute via mock registry
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          // ignore
        }
        const result = (await (mockExecute as (...args: unknown[]) => unknown)(
          tc.function.name,
          args
        )) as ToolResult;
        const content = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
        const toolCallResult: ToolCallResult = {
          toolCallId: tc.id,
          name: tc.function.name,
          role: 'tool',
          content,
          metadata: {
            status: result.success ? 'success' : 'error',
            error: result.error,
          },
        };
        toolCallResults.push(toolCallResult);

        // Invoke onToolCallComplete callback
        options?.onToolCallComplete?.(tc, toolCallResult);
      }
      return { ...response, toolCallResults };
    }

    return response;
  });
}

describe('CopilotAgent', () => {
  let events: CopilotServerMessage[];
  let agent: CopilotAgent;
  let baseMockChat: ReturnType<typeof vi.fn>;
  let mockChat: ReturnType<typeof vi.fn>;
  let mockToolExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    events = [];
    baseMockChat = vi.fn();
    mockToolExecute = vi.fn();
    mockChat = wrapWithCallbacks(baseMockChat, mockToolExecute);
    vi.mocked(workflowService.reflowWorkflowLayout).mockReset();
    vi.mocked(workflowService.reflowWorkflowLayout).mockResolvedValue({} as never);

    // Mock LLM provider
    vi.mocked(LLMProviderFactory.getProvider).mockReturnValue({
      chat: mockChat,
      streamChat: vi.fn(),
      executeToolCalls: vi.fn(),
    } as unknown as ReturnType<typeof LLMProviderFactory.getProvider>);

    // Mock LLM config (for compression threshold)
    vi.mocked(LLMProviderFactory.getConfig).mockReturnValue({
      type: 'openai',
      apiKey: 'test',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      compressTokenLimit: 90000,
    });

    // Mock tool registry
    vi.mocked(createCopilotToolRegistry).mockReturnValue({
      execute: mockToolExecute as unknown as (
        name: string,
        params: import('../src/infrastructure/tools/types').ToolParams
      ) => Promise<import('../src/infrastructure/tools/types').ToolResult>,
      getAllToolSchemas: vi.fn().mockReturnValue([]),
      register: vi.fn(),
      get: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      has: vi.fn().mockReturnValue(false),
      getAllMetadata: vi.fn().mockReturnValue([]),
    } as unknown as ReturnType<typeof createCopilotToolRegistry>);

    agent = new CopilotAgent('test-workflow-id', (event) => {
      events.push(event);
    });
  });

  it('sends text_delta, text_done, turn_done for simple text response', async () => {
    baseMockChat.mockResolvedValue({
      content: 'Hello',
      finishReason: 'stop',
    } as ChatResponse);

    await agent.handleUserMessage('Hi');

    const types = events.map((e) => e.type);
    expect(types).toContain('text_delta');
    expect(types).toContain('text_done');
    expect(types[types.length - 1]).toBe('turn_done');
  });

  it('executes tool calls and sends tool events via callbacks', async () => {
    // First call returns tool call
    const toolResponse: ChatResponse = {
      content: '',
      finishReason: 'tool_calls',
      toolCalls: [
        {
          id: 'tc1',
          type: 'function',
          function: { name: 'wf_get_summary', arguments: '{}' },
        },
      ],
    };
    // Second call returns text
    const textResponse: ChatResponse = {
      content: 'Done',
      finishReason: 'stop',
    };
    baseMockChat.mockResolvedValueOnce(toolResponse).mockResolvedValueOnce(textResponse);
    mockToolExecute.mockResolvedValue({ success: true, data: { nodes: [], edges: [] } });

    await agent.handleUserMessage('Show me the workflow');

    const types = events.map((e) => e.type);
    expect(types).toContain('tool_start');
    expect(types).toContain('tool_done');
    expect(types).toContain('text_delta');
    expect(types[types.length - 1]).toBe('turn_done');
  });

  it('sends error event on LLM failure', async () => {
    baseMockChat.mockRejectedValue(new Error('LLM API error'));

    await agent.handleUserMessage('Test');

    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(events[events.length - 1].type).toBe('turn_done');
  });

  it('stops when aborted', async () => {
    baseMockChat.mockImplementation(async () => {
      agent.abort();
      return {
        content: '',
        finishReason: 'tool_calls',
        toolCalls: [
          { id: 'tc1', type: 'function', function: { name: 'wf_get_summary', arguments: '{}' } },
        ],
      } as ChatResponse;
    });
    mockToolExecute.mockResolvedValue({ success: true, data: {} });

    await agent.handleUserMessage('Test');

    expect(events[events.length - 1].type).toBe('turn_done');
  });

  it('stops at tool call limit', async () => {
    const toolResponse: ChatResponse = {
      content: '',
      finishReason: 'tool_calls',
      toolCalls: [
        { id: 'tc1', type: 'function', function: { name: 'wf_get_summary', arguments: '{}' } },
      ],
    };
    baseMockChat.mockResolvedValue(toolResponse);
    mockToolExecute.mockResolvedValue({ success: true, data: {} });

    await agent.handleUserMessage('Loop forever');

    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(events[events.length - 1].type).toBe('turn_done');
  });

  it('triggers context compression when token usage exceeds limit', async () => {
    // Set a low compress limit
    vi.mocked(LLMProviderFactory.getConfig).mockReturnValue({
      type: 'openai',
      apiKey: 'test',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      compressTokenLimit: 100,
    });

    // First call: tool call with high token usage
    const toolResponse: ChatResponse = {
      content: '',
      finishReason: 'tool_calls',
      toolCalls: [
        { id: 'tc1', type: 'function', function: { name: 'wf_get_summary', arguments: '{}' } },
      ],
      usage: { promptTokens: 150, completionTokens: 50, totalTokens: 200 },
    };
    // Second call: compression LLM call (from Context.compressContext)
    const compressionResponse: ChatResponse = {
      content: '<state_snapshot><overall_goal>Show workflow</overall_goal></state_snapshot>',
      finishReason: 'stop',
      usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
    };
    // Third call: final text response after compression
    const textResponse: ChatResponse = {
      content: 'Summary done',
      finishReason: 'stop',
      usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
    };
    baseMockChat
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(compressionResponse)
      .mockResolvedValueOnce(textResponse);
    mockToolExecute.mockResolvedValue({ success: true, data: { nodes: [] } });

    await agent.handleUserMessage('Show workflow');

    // Should complete without error — compression runs silently
    const types = events.map((e) => e.type);
    expect(types).toContain('tool_start');
    expect(types).toContain('text_delta');
    expect(types[types.length - 1]).toBe('turn_done');
    // No error events from compression
    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(0);
  });

  it('does not compress when token usage is below limit', async () => {
    baseMockChat.mockResolvedValue({
      content: 'Hello',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
    } as ChatResponse);

    await agent.handleUserMessage('Hi');

    // Should work normally with no errors
    const types = events.map((e) => e.type);
    expect(types).toContain('text_delta');
    expect(types[types.length - 1]).toBe('turn_done');
    // LLM chat called only once (no compression call)
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it('reflows workflow layout after a structurally mutating round', async () => {
    const toolResponse: ChatResponse = {
      content: '',
      finishReason: 'tool_calls',
      toolCalls: [
        {
          id: 'tc1',
          type: 'function',
          function: { name: 'wf_add_node', arguments: '{"type":"sql","name":"New Node"}' },
        },
      ],
    };
    const textResponse: ChatResponse = {
      content: 'Added a node',
      finishReason: 'stop',
    };
    baseMockChat.mockResolvedValueOnce(toolResponse).mockResolvedValueOnce(textResponse);
    mockToolExecute.mockResolvedValue({
      success: true,
      data: { id: 'node-1', name: 'New Node', type: 'sql', config: {} },
    });

    await agent.handleUserMessage('Add a node');

    expect(workflowService.reflowWorkflowLayout).toHaveBeenCalledWith('test-workflow-id');
    expect(events).toContainEqual({ type: 'workflow_changed', changeType: 'node_updated' });
  });

  it('does not reflow workflow layout after a config-only update round', async () => {
    const toolResponse: ChatResponse = {
      content: '',
      finishReason: 'tool_calls',
      toolCalls: [
        {
          id: 'tc1',
          type: 'function',
          function: {
            name: 'wf_patch_node',
            arguments: '{"nodeId":"node-1","find":"SELECT *","replace":"SELECT id"}',
          },
        },
      ],
    };
    const textResponse: ChatResponse = {
      content: 'Patched the node',
      finishReason: 'stop',
    };
    baseMockChat.mockResolvedValueOnce(toolResponse).mockResolvedValueOnce(textResponse);
    mockToolExecute.mockResolvedValue({
      success: true,
      data: { id: 'node-1', patched: true },
    });

    await agent.handleUserMessage('Patch the node');

    expect(workflowService.reflowWorkflowLayout).not.toHaveBeenCalled();
  });
});
