/**
 * Abstract base class for LLM providers
 */

import logger from '../../utils/logger';
import { ToolRegistry, ToolRegistryClass } from '../tools/tools';
import type { ToolResult } from '../tools/types';
import {
  Message,
  ChatResponse,
  ChatOptions,
  ToolCall,
  ToolCallResult,
  LLMConfig,
  StreamEvent,
} from './types';

/**
 * Abstract base class for LLM providers
 * Defines the interface that all LLM provider implementations must follow
 */
export abstract class LLMProvider {
  protected config: LLMConfig;
  protected logger: typeof logger;

  constructor(config: LLMConfig) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Synchronous chat completion with optional tool calling
   * @param messages - Array of conversation messages
   * @param options - Optional chat parameters (temperature, tools, etc.)
   * @returns Promise resolving to ChatResponse
   */
  abstract chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;

  /**
   * Streaming chat completion with tool calling support
   * @param messages - Array of conversation messages
   * @param options - Optional chat parameters (temperature, tools, etc.)
   * @returns AsyncGenerator yielding StreamEvent objects
   */
  abstract streamChat(messages: Message[], options?: ChatOptions): AsyncGenerator<StreamEvent>;

  /**
   * Execute tool calls using the ToolRegistry
   * This is a shared implementation used by all providers
   * @param toolCalls - Array of tool calls to execute
   * @returns Promise resolving to array of tool call results
   */
  protected async executeToolCalls(
    toolCalls: ToolCall[],
    options?: {
      registry?: ToolRegistryClass;
      onStart?: (toolCall: ToolCall) => void;
      onComplete?: (toolCall: ToolCall, result: ToolCallResult) => void;
    }
  ): Promise<ToolCallResult[]> {
    const registry = options?.registry ?? ToolRegistry;
    const results: ToolCallResult[] = [];

    this.logger.debug(`Executing ${toolCalls.length} tool calls`);

    for (const toolCall of toolCalls) {
      const { id, function: func } = toolCall;

      // Skip tool calls with empty name (model streaming artifact)
      if (!func.name) {
        this.logger.warn('Skipping tool call with empty name', {
          toolCallId: id,
          arguments: func.arguments,
        });
        results.push({
          toolCallId: id,
          name: '',
          role: 'tool',
          content: 'Error: Tool call received with empty name',
          metadata: {
            parameters: {},
            status: 'error',
            error: 'Tool call received with empty name',
          },
        });
        continue;
      }

      // Parse function arguments outside try-catch so they're available in catch block
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(func.arguments) as Record<string, unknown>;
      } catch {
        // If parsing fails, args remains empty
      }

      options?.onStart?.(toolCall);

      try {
        this.logger.debug(`Executing tool: ${func.name}`, { args });

        // Execute tool via the provided registry (or global fallback)
        const result = await registry.execute(func.name, args);

        if (result.success) {
          // Format result as string for LLM
          const content =
            typeof result.data === 'string' ? result.data : JSON.stringify(result.data);

          const toolCallResult: ToolCallResult = {
            toolCallId: id,
            name: func.name,
            role: 'tool',
            content,
            metadata: {
              ...result.metadata,
              parameters: args,
              status: 'success',
              resultSummary: this.generateResultSummary(func.name, result),
            },
          };
          results.push(toolCallResult);
          options?.onComplete?.(toolCall, toolCallResult);

          this.logger.debug(`Tool ${func.name} executed successfully`);
        } else {
          // Tool execution failed - return error to LLM
          const toolCallResult: ToolCallResult = {
            toolCallId: id,
            name: func.name,
            role: 'tool',
            content: `Error: ${result.error || 'Tool execution failed'}`,
            metadata: {
              ...result.metadata,
              parameters: args,
              status: 'error',
              error: result.error || 'Tool execution failed',
            },
          };
          results.push(toolCallResult);
          options?.onComplete?.(toolCall, toolCallResult);

          this.logger.error(`Tool ${func.name} execution failed`, {
            error: result.error || 'Unknown error',
            args,
          });
        }
      } catch (error) {
        // Exception during tool execution
        const errorMessage = error instanceof Error ? error.message : String(error);

        const toolCallResult: ToolCallResult = {
          toolCallId: id,
          name: func.name,
          role: 'tool',
          content: `Exception: ${errorMessage}`,
          metadata: {
            parameters: args,
            status: 'error',
            error: errorMessage,
          },
        };
        results.push(toolCallResult);
        options?.onComplete?.(toolCall, toolCallResult);

        this.logger.error(`Exception during tool execution: ${func.name}`, {
          error: errorMessage,
        });
      }
    }

    return results;
  }

  /**
   * Generate a brief result summary for a tool call based on tool type
   */
  private generateResultSummary(toolName: string, result: ToolResult): string | undefined {
    const data = result.data as Record<string, unknown>;

    switch (toolName) {
      case 'bash': {
        if (data && typeof data === 'object' && 'exitCode' in data) {
          return `exit ${String(data.exitCode)}`;
        }
        return undefined;
      }
      case 'sql': {
        const meta = result.metadata as Record<string, unknown> | undefined;
        if (meta && 'total_rows' in meta) {
          return `${String(meta.total_rows)} rows`;
        }
        return undefined;
      }
      case 'glob': {
        if (Array.isArray(data)) {
          return `${data.length} files`;
        }
        return undefined;
      }
      case 'grep': {
        if (typeof result.data === 'string') {
          const lines = result.data.split('\n').filter((l) => l.length > 0);
          return `${lines.length} matches`;
        }
        return undefined;
      }
      case 'read_file': {
        const meta = result.metadata as Record<string, unknown> | undefined;
        if (meta && 'linesRead' in meta && 'totalLines' in meta) {
          return `${String(meta.linesRead)}/${String(meta.totalLines)} lines`;
        }
        return undefined;
      }
      case 'write_file':
      case 'edit': {
        if (typeof result.data === 'string') {
          return result.data.length > 80 ? result.data.slice(0, 80) + '...' : result.data;
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }
}
