/**
 * OpenAI provider implementation
 */

import OpenAI from 'openai';
import { LLMProvider } from './base';
import {
  Message,
  ChatResponse,
  ChatOptions,
  ToolCall,
  ToolCallResult,
  LLMConfig,
  StreamEvent,
} from './types';
import logger from '../../utils/logger';
import { config as appConfig } from '../../base/config';

/**
 * OpenAI-specific LLM provider
 * Implements chat and streaming chat using OpenAI API
 */
export class OpenAIProvider extends LLMProvider {
  private client: OpenAI;

  constructor(config: LLMConfig) {
    super(config);

    // Initialize OpenAI client
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: appConfig.llm.requestTimeout,
    });

    this.logger.info('OpenAI provider initialized', {
      model: config.model,
      baseUrl: config.baseUrl,
    });
  }

  /**
   * Chat completion with optional tool calling
   * @param messages - Conversation messages
   * @param options - Chat options
   * @returns Promise resolving to ChatResponse
   */
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    try {
      this.logger.debug('Sending chat request', {
        messageCount: messages.length,
        model: this.config.model,
      });

      // Format messages for OpenAI API
      const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = this.formatMessages(messages);

      // Prepare request parameters
      const requestParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
        model: this.config.model,
        messages: apiMessages,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
      };

      // Add tools if provided
      if (options?.tools && options.tools.length > 0) {
        requestParams.tools = this.formatTools(options.tools);
      }

      // Call OpenAI API
      const response = await this.client.chat.completions.create(requestParams);

      // Extract response content and tool calls
      const choice = response.choices[0];
      const content = choice.message.content || '';

      const toolCalls: ToolCall[] = [];
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        for (const toolCall of choice.message.tool_calls) {
          if (toolCall.type === 'function') {
            toolCalls.push({
              id: toolCall.id,
              type: 'function',
              function: {
                name: toolCall.function.name,
                arguments: toolCall.function.arguments,
              },
            });
          }
        }
      }

      // Execute tool calls if present
      let toolCallResults: ToolCallResult[] | undefined;
      if (toolCalls.length > 0) {
        toolCallResults = await this.executeToolCalls(toolCalls, {
          registry: options?.toolRegistry,
          onStart: options?.onToolCallStart,
          onComplete: options?.onToolCallComplete,
        });
      }

      this.logger.debug('Chat request completed', {
        contentLength: content.length,
        toolCallsCount: toolCalls.length,
        usage: response.usage,
      });

      return {
        content,
        finishReason: choice.finish_reason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        toolCallResults,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('OpenAI chat request failed', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Streaming chat completion with tool calling support
   * @param messages - Conversation messages
   * @param options - Chat options
   * @returns AsyncGenerator yielding StreamEvent objects
   */
  async *streamChat(messages: Message[], options?: ChatOptions): AsyncGenerator<StreamEvent> {
    try {
      this.logger.debug('Starting streaming chat request', {
        messageCount: messages.length,
        model: this.config.model,
      });

      // Format messages for OpenAI API
      const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = this.formatMessages(messages);

      // Prepare request parameters
      const requestParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
        model: this.config.model,
        messages: apiMessages,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        stream: true,
        stream_options: { include_usage: true },
      };

      // Add tools if provided
      if (options?.tools && options.tools.length > 0) {
        requestParams.tools = this.formatTools(options.tools);
      }

      // Create streaming completion
      const stream = await this.client.chat.completions.create(requestParams);

      let currentToolCalls: Map<string, ToolCall> = new Map();

      // Iterate over stream chunks
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (!delta) continue;

        // Yield content chunks
        if (delta.content) {
          yield {
            type: 'content',
            content: delta.content,
          };
        }

        // Handle tool call streaming
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index;
            const id = toolCall.id;
            const functionName = toolCall.function?.name;
            const functionArgs = toolCall.function?.arguments;

            if (id) {
              currentToolCalls.set(String(index), {
                id,
                type: 'function',
                function: {
                  name: functionName || '',
                  arguments: functionArgs || '',
                },
              });
            } else if (currentToolCalls.has(String(index))) {
              const existing = currentToolCalls.get(String(index))!;
              if (functionName) {
                existing.function.name += functionName;
              }
              if (functionArgs) {
                existing.function.arguments += functionArgs;
              }
              currentToolCalls.set(String(index), existing);
            }
          }
        }

        // Check if this is the final chunk
        if (chunk.choices[0]?.finish_reason) {
          // Yield any accumulated tool calls
          if (currentToolCalls.size > 0) {
            const toolCallsArray = Array.from(currentToolCalls.values());
            for (const toolCall of toolCallsArray) {
              yield {
                type: 'tool_call',
                toolCall,
              };
            }

            // Execute tool calls and yield results
            const toolResults = await this.executeToolCalls(toolCallsArray, {
              registry: options?.toolRegistry,
              onStart: options?.onToolCallStart,
              onComplete: options?.onToolCallComplete,
            });
            for (const result of toolResults) {
              yield {
                type: 'tool_call_result',
                toolCallResult: result,
              };
            }

            this.logger.debug('Tool calls executed', {
              count: toolCallsArray.length,
            });
          }

          yield {
            type: 'done',
            finishReason: chunk.choices[0].finish_reason,
            usage: chunk.usage
              ? {
                  promptTokens: chunk.usage.prompt_tokens,
                  completionTokens: chunk.usage.completion_tokens,
                  totalTokens: chunk.usage.total_tokens,
                }
              : undefined,
          };

          this.logger.debug('Streaming chat request completed', {
            usage: chunk.usage,
          });
          return;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('OpenAI streaming chat request failed', {
        error: errorMessage,
      });

      yield {
        type: 'error',
        error: errorMessage,
      };
    }
  }

  /**
   * Format messages for OpenAI API
   * @param messages - Messages to format
   * @returns Formatted messages for OpenAI API
   */
  private formatMessages(messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((message) => {
      const baseMessage = {
        role: message.role,
        content: message.content,
      };

      // Add tool calls if present
      if (message.toolCalls && message.toolCalls.length > 0) {
        return {
          ...baseMessage,
          role: 'assistant',
          tool_calls: message.toolCalls.map((tc) => {
            // Ensure arguments is valid JSON — some models return empty or malformed strings
            let args = tc.function.arguments;
            if (!args) {
              logger.warn('Tool call has empty arguments, defaulting to {}', {
                toolCallId: tc.id,
                toolName: tc.function.name,
              });
              args = '{}';
            } else {
              try {
                JSON.parse(args);
              } catch {
                logger.warn('Tool call has malformed JSON arguments, defaulting to {}', {
                  toolCallId: tc.id,
                  toolName: tc.function.name,
                  originalArgs: args,
                });
                args = '{}';
              }
            }
            return {
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.function.name,
                arguments: args,
              },
            };
          }),
        };
      }

      // Add tool call ID for tool response messages
      if (message.toolCallId) {
        return {
          ...baseMessage,
          role: 'tool',
          name: message.name,
          tool_call_id: message.toolCallId,
        };
      }

      return baseMessage;
    }) as OpenAI.Chat.ChatCompletionMessageParam[];
  }

  /**
   * Format tools for OpenAI API
   * @param tools - Tools to format
   * @returns Formatted tools for OpenAI API
   */
  private formatTools(tools: ChatOptions['tools']): OpenAI.Chat.ChatCompletionTool[] {
    return (tools || []).map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        // JSONSchemaObject is a valid JSON Schema, compatible with OpenAI's FunctionParameters
        // Use double assertion via unknown for type-safe conversion
        parameters: tool.parameters as unknown as Record<string, unknown>,
      },
    }));
  }
}
