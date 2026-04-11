/**
 * Type definitions for the LLM provider module
 */

import { JSONSchemaObject } from '../tools';

/**
 * Message role types for LLM conversations
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Represents a message in a conversation with the LLM
 */
export interface Message {
  role: MessageRole;
  content: string | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

/**
 * Represents a tool call requested by the LLM
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Represents the result of executing a tool call
 */
export interface ToolCallResult {
  toolCallId: string;
  name: string;
  role: 'tool';
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Response from a non-streaming chat completion
 */
export interface ChatResponse {
  content: string;
  finishReason: string;
  toolCalls?: ToolCall[];
  toolCallResults?: ToolCallResult[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Stream event types
 */
export type StreamEventType = 'content' | 'tool_call' | 'tool_call_result' | 'done' | 'error';

/**
 * Event yielded during streaming chat
 */
export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  toolCall?: ToolCall;
  toolCallResult?: ToolCallResult;
  finishReason?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Options for chat completions
 */
export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tools?: Array<{
    name: string;
    description: string;
    parameters: JSONSchemaObject;
  }>;
  /** Use a specific ToolRegistry instance instead of the global singleton */
  toolRegistry?: import('../tools/tools').ToolRegistryClass;
  /** Called before each tool execution */
  onToolCallStart?: (toolCall: ToolCall) => void;
  /** Called after each tool execution */
  onToolCallComplete?: (toolCall: ToolCall, result: ToolCallResult) => void;
}

/**
 * Configuration for LLM provider
 */
export interface LLMConfig {
  type: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  compressTokenLimit?: number;
}
