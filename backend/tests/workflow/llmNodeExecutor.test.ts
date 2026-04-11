import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock LLMProviderFactory
const mockChat = vi.fn();
vi.mock('../../src/infrastructure/llm/factory', () => ({
  LLMProviderFactory: {
    getProvider: () => ({ chat: mockChat }),
  },
}));

import { LlmNodeExecutor, truncateParams } from '../../src/workflow/nodeExecutors/llmNodeExecutor';
import type { LlmNodeConfig, LlmNodeOutput } from '../../src/workflow/workflow.types';
import type { NodeExecutionContext } from '../../src/workflow/nodeExecutors/types';

function makeContext(config: LlmNodeConfig): NodeExecutionContext {
  return {
    workFolder: '/tmp/test',
    nodeId: 'node-1',
    nodeName: 'llm_1',
    resolvedConfig: config,
  };
}

describe('LlmNodeExecutor', () => {
  const executor = new LlmNodeExecutor();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have type "llm"', () => {
    expect(executor.type).toBe('llm');
  });

  // ── Params injection ──────────────────────────────────

  it('should send prompt without params context when params is empty', async () => {
    const config: LlmNodeConfig = {
      nodeType: 'llm',
      params: {},
      prompt: 'Generate a report',
      outputVariable: 'result',
    };
    mockChat.mockResolvedValue({ content: '{"report": "done"}' });

    await executor.execute(makeContext(config));

    const messages = mockChat.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[1].content).toBe('Generate a report');
    expect(messages[1].content).not.toContain('upstream');
  });

  it('should inject params context into prompt when params exist', async () => {
    const config: LlmNodeConfig = {
      nodeType: 'llm',
      params: { sql_1: 'query_abc.csv' },
      prompt: 'Analyze the data',
      outputVariable: 'result',
    };
    mockChat.mockResolvedValue({ content: '{"analysis": "ok"}' });

    await executor.execute(makeContext(config));

    const messages = mockChat.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[1].content).toContain('sql_1: query_abc.csv');
    expect(messages[1].content).toContain('Analyze the data');
    expect(messages[1].content).toContain('upstream');
  });

  it('should inject multiple params into prompt', async () => {
    const config: LlmNodeConfig = {
      nodeType: 'llm',
      params: { sql_1: 'data.csv', python_1: 'processed' },
      prompt: 'Summarize',
      outputVariable: 'result',
    };
    mockChat.mockResolvedValue({ content: '{"summary": "ok"}' });

    await executor.execute(makeContext(config));

    const messages = mockChat.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[1].content).toContain('sql_1: data.csv');
    expect(messages[1].content).toContain('python_1: processed');
    expect(messages[1].content).toContain('Summarize');
  });

  it('should always include system message', async () => {
    const config: LlmNodeConfig = {
      nodeType: 'llm',
      params: { x: 'y' },
      prompt: 'test',
      outputVariable: 'result',
    };
    mockChat.mockResolvedValue({ content: '{}' });

    await executor.execute(makeContext(config));

    const messages = mockChat.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('JSON');
  });

  // ── JSON parsing ──────────────────────────────────────

  it('should parse plain JSON response', async () => {
    const config: LlmNodeConfig = {
      nodeType: 'llm',
      params: {},
      prompt: 'test',
      outputVariable: 'result',
    };
    mockChat.mockResolvedValue({ content: '{"key": "value"}' });

    const output = (await executor.execute(makeContext(config))) as LlmNodeOutput;

    expect(output.result).toEqual({ key: 'value' });
    expect(output.rawResponse).toBe('{"key": "value"}');
  });

  it('should parse JSON from markdown code block', async () => {
    const config: LlmNodeConfig = {
      nodeType: 'llm',
      params: {},
      prompt: 'test',
      outputVariable: 'result',
    };
    mockChat.mockResolvedValue({
      content: '```json\n{"extracted": true}\n```',
    });

    const output = (await executor.execute(makeContext(config))) as LlmNodeOutput;

    expect(output.result).toEqual({ extracted: true });
  });

  it('should extract JSON object from mixed text', async () => {
    const config: LlmNodeConfig = {
      nodeType: 'llm',
      params: {},
      prompt: 'test',
      outputVariable: 'result',
    };
    mockChat.mockResolvedValue({
      content: 'Here is the result: {"found": 42} hope this helps',
    });

    const output = (await executor.execute(makeContext(config))) as LlmNodeOutput;

    expect(output.result).toEqual({ found: 42 });
  });

  it('should throw WorkflowExecutionError for non-JSON response', async () => {
    const config: LlmNodeConfig = {
      nodeType: 'llm',
      params: {},
      prompt: 'test',
      outputVariable: 'result',
    };
    mockChat.mockResolvedValue({ content: 'This is plain text with no JSON' });

    await expect(executor.execute(makeContext(config))).rejects.toThrow(
      'LLM response is not valid JSON'
    );
  });

  it('should wrap non-object JSON in value key', async () => {
    const config: LlmNodeConfig = {
      nodeType: 'llm',
      params: {},
      prompt: 'test',
      outputVariable: 'result',
    };
    mockChat.mockResolvedValue({ content: '42' });

    const output = (await executor.execute(makeContext(config))) as LlmNodeOutput;

    expect(output.result).toEqual({ value: 42 });
  });

  it('should parse JSON array response', async () => {
    const config: LlmNodeConfig = {
      nodeType: 'llm',
      params: {},
      prompt: 'test',
      outputVariable: 'result',
    };
    mockChat.mockResolvedValue({ content: '[{"a": 1}, {"a": 2}]' });

    const output = (await executor.execute(makeContext(config))) as LlmNodeOutput;

    expect(output.result).toEqual([{ a: 1 }, { a: 2 }]);
  });
});

describe('truncateParams', () => {
  it('returns params unchanged when within limits', () => {
    const params = { key1: 'short value', key2: 'another value' };
    const result = truncateParams(params, 'test-node');
    expect(result).toEqual(params);
  });

  it('truncates a single param exceeding MAX_SINGLE_PARAM_CHARS', () => {
    const longValue = 'x'.repeat(10000);
    const params = { data: longValue, short: 'ok' };
    const result = truncateParams(params, 'test-node');
    expect(result.data.length).toBeLessThan(longValue.length);
    expect(result.data).toContain('...[truncated, original length: 10000 chars]');
    expect(result.short).toBe('ok');
  });

  it('truncates proportionally when total exceeds MAX_TOTAL_PARAMS_CHARS', () => {
    const params: Record<string, string> = {};
    for (let i = 0; i < 10; i++) {
      params[`key${i}`] = 'y'.repeat(5000);
    }
    const result = truncateParams(params, 'test-node');
    const totalLength = Object.values(result).join('').length;
    expect(totalLength).toBeLessThanOrEqual(32000 + 1000); // allow for truncation markers
  });

  it('applies single param truncation before total truncation', () => {
    const params = {
      huge: 'z'.repeat(20000),
      medium: 'm'.repeat(5000),
    };
    const result = truncateParams(params, 'test-node');
    expect(result.huge).toContain('...[truncated');
    expect(result.huge.length).toBeLessThanOrEqual(8100); // 8000 + marker
  });
});
