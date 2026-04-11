import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMProvider } from '../../../src/infrastructure/llm/base';
import { ToolCall, LLMConfig } from '../../../src/infrastructure/llm/types';
import { ToolRegistry } from '../../../src/infrastructure/tools/tools';
import { MockTool } from '../tools/fixtures';

// Mock logger module
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import the mocked logger
import logger from '../../../src/utils/logger';
const mockedLogger = vi.mocked(logger);

/**
 * Concrete implementation of LLMProvider for testing
 */
class TestLLMProvider extends LLMProvider {
  async chat(): Promise<any> {
    return { content: 'test' };
  }

  async *streamChat(): AsyncGenerator<any> {
    yield { type: 'content', content: 'test' };
  }

  // Expose protected method for testing
  exposeExecuteToolCalls(toolCalls: ToolCall[]) {
    return this.executeToolCalls(toolCalls);
  }
}

describe('LLMProvider Base Class', () => {
  let provider: TestLLMProvider;
  let config: LLMConfig;

  beforeEach(() => {
    // Clear mocks
    vi.clearAllMocks();

    // Setup config
    config = {
      type: 'test',
      apiKey: 'test-key',
      model: 'test-model',
      baseUrl: 'https://api.test.com',
    };

    // Create provider
    provider = new TestLLMProvider(config);

    // Clear tool registry
    const toolNames = ToolRegistry.list();
    toolNames.forEach((name) => {
      (ToolRegistry as any).tools.delete(name);
    });
  });

  describe('Constructor', () => {
    it('should initialize with config', () => {
      // Assert
      expect(provider).toBeDefined();
      expect(provider['config']).toBe(config);
    });

    it('should initialize logger', () => {
      // Assert
      expect(provider['logger']).toBeDefined();
    });
  });

  describe('executeToolCalls()', () => {
    it('should execute single tool call successfully', async () => {
      // Arrange
      const mockTool = new MockTool();
      const mockResult = {
        success: true,
        data: { output: 'tool executed' },
      };
      mockTool.setExecuteResult(mockResult);
      ToolRegistry.register(mockTool);

      const toolCalls: ToolCall[] = [
        {
          id: 'call-123',
          type: 'function',
          function: {
            name: 'mock-tool',
            arguments: JSON.stringify({ input: 'test' }),
          },
        },
      ];

      // Act
      const results = await provider.exposeExecuteToolCalls(toolCalls);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        toolCallId: 'call-123',
        name: 'mock-tool',
        role: 'tool',
        content: JSON.stringify({ output: 'tool executed' }),
        metadata: {
          parameters: { input: 'test' },
          status: 'success',
          resultSummary: undefined,
        },
      });
      expect(mockedLogger.debug).toHaveBeenCalledWith('Executing tool: mock-tool', {
        args: { input: 'test' },
      });
    });

    it('should execute multiple tool calls in sequence', async () => {
      // Arrange
      const mockTool1 = new MockTool();
      mockTool1.name = 'tool-1';
      mockTool1.setExecuteResult({
        success: true,
        data: { result: 'tool 1 result' },
      });

      const mockTool2 = new MockTool();
      mockTool2.name = 'tool-2';
      mockTool2.setExecuteResult({
        success: true,
        data: { result: 'tool 2 result' },
      });

      ToolRegistry.register(mockTool1);
      ToolRegistry.register(mockTool2);

      const toolCalls: ToolCall[] = [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'tool-1',
            arguments: JSON.stringify({ input: 'test1' }),
          },
        },
        {
          id: 'call-2',
          type: 'function',
          function: {
            name: 'tool-2',
            arguments: JSON.stringify({ input: 'test2' }),
          },
        },
      ];

      // Act
      const results = await provider.exposeExecuteToolCalls(toolCalls);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0].toolCallId).toBe('call-1');
      expect(results[1].toolCallId).toBe('call-2');
    });

    it('should handle tool execution failure', async () => {
      // Arrange
      const mockTool = new MockTool();
      mockTool.shouldThrow = true;
      ToolRegistry.register(mockTool);

      const toolCalls: ToolCall[] = [
        {
          id: 'call-123',
          type: 'function',
          function: {
            name: 'mock-tool',
            arguments: JSON.stringify({ input: 'test' }),
          },
        },
      ];

      // Act
      const results = await provider.exposeExecuteToolCalls(toolCalls);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain('Error:');
      expect(mockedLogger.error).toHaveBeenCalledWith(
        "Tool 'mock-tool' execution failed:",
        'Mock tool error'
      );
    });

    it('should handle tool returning success=false', async () => {
      // Arrange
      const mockTool = new MockTool();
      mockTool.setExecuteResult({
        success: false,
        data: null,
        error: 'Tool execution failed',
      });
      ToolRegistry.register(mockTool);

      const toolCalls: ToolCall[] = [
        {
          id: 'call-123',
          type: 'function',
          function: {
            name: 'mock-tool',
            arguments: JSON.stringify({ input: 'test' }),
          },
        },
      ];

      // Act
      const results = await provider.exposeExecuteToolCalls(toolCalls);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Error: Tool execution failed');
      expect(mockedLogger.error).toHaveBeenCalledWith('Tool mock-tool execution failed', {
        error: 'Tool execution failed',
        args: { input: 'test' },
      });
    });

    it('should log "Unknown error" and include args when tool fails without error message', async () => {
      // Arrange
      const mockTool = new MockTool();
      mockTool.setExecuteResult({
        success: false,
        data: null,
        error: '',
      });
      ToolRegistry.register(mockTool);

      const toolCalls: ToolCall[] = [
        {
          id: 'call-456',
          type: 'function',
          function: {
            name: 'mock-tool',
            arguments: JSON.stringify({ query: 'SELECT 1' }),
          },
        },
      ];

      // Act
      const results = await provider.exposeExecuteToolCalls(toolCalls);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Error: Tool execution failed');
      expect(mockedLogger.error).toHaveBeenCalledWith('Tool mock-tool execution failed', {
        error: 'Unknown error',
        args: { query: 'SELECT 1' },
      });
    });

    it('should handle invalid tool name', async () => {
      // Arrange
      const toolCalls: ToolCall[] = [
        {
          id: 'call-123',
          type: 'function',
          function: {
            name: 'non-existent-tool',
            arguments: JSON.stringify({ input: 'test' }),
          },
        },
      ];

      // Act
      const results = await provider.exposeExecuteToolCalls(toolCalls);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].toolCallId).toBe('call-123');
      expect(results[0].role).toBe('tool');
      expect(results[0].content).toContain('Exception:');
    });

    it('should handle invalid JSON arguments gracefully', async () => {
      // Arrange
      const mockTool = new MockTool();
      mockTool.setExecuteResult({
        success: true,
        data: { output: 'executed with empty args' },
      });
      ToolRegistry.register(mockTool);

      const toolCalls: ToolCall[] = [
        {
          id: 'call-123',
          type: 'function',
          function: {
            name: 'mock-tool',
            arguments: 'invalid json{{{',
          },
        },
      ];

      // Act
      const results = await provider.exposeExecuteToolCalls(toolCalls);

      // Assert - args parsing fails silently, tool executes with empty args
      expect(results).toHaveLength(1);
      expect(results[0].metadata).toEqual(
        expect.objectContaining({
          parameters: {},
          status: 'success',
        })
      );
    });

    it('should handle tool returning string data', async () => {
      // Arrange
      const mockTool = new MockTool();
      mockTool.setExecuteResult({
        success: true,
        data: 'plain string result',
      });
      ToolRegistry.register(mockTool);

      const toolCalls: ToolCall[] = [
        {
          id: 'call-123',
          type: 'function',
          function: {
            name: 'mock-tool',
            arguments: JSON.stringify({ input: 'test' }),
          },
        },
      ];

      // Act
      const results = await provider.exposeExecuteToolCalls(toolCalls);

      // Assert
      expect(results[0].content).toBe('plain string result');
    });

    it('should handle tool returning object data', async () => {
      // Arrange
      const mockTool = new MockTool();
      const objectData = { key: 'value', number: 123 };
      mockTool.setExecuteResult({
        success: true,
        data: objectData,
      });
      ToolRegistry.register(mockTool);

      const toolCalls: ToolCall[] = [
        {
          id: 'call-123',
          type: 'function',
          function: {
            name: 'mock-tool',
            arguments: JSON.stringify({ input: 'test' }),
          },
        },
      ];

      // Act
      const results = await provider.exposeExecuteToolCalls(toolCalls);

      // Assert
      expect(results[0].content).toBe(JSON.stringify(objectData));
    });

    it('should log tool execution start', async () => {
      // Arrange
      const mockTool = new MockTool();
      mockTool.setExecuteResult({
        success: true,
        data: 'result',
      });
      ToolRegistry.register(mockTool);

      const toolCalls: ToolCall[] = [
        {
          id: 'call-123',
          type: 'function',
          function: {
            name: 'mock-tool',
            arguments: JSON.stringify({ input: 'test' }),
          },
        },
      ];

      // Act
      await provider.exposeExecuteToolCalls(toolCalls);

      // Assert
      expect(mockedLogger.debug).toHaveBeenCalledWith(`Executing ${toolCalls.length} tool calls`);
    });
  });
});
