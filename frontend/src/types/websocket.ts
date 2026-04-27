/**
 * WebSocket message types - mirrors backend types
 */
export type MessageType =
  | 'ping'
  | 'pong'
  | 'user_message'
  | 'agent_response'
  | 'tool_call'
  | 'action_card'
  | 'error'
  | 'usage_report'
  | 'stop'
  | 'turn_complete'
  | 'session_info';

/**
 * WebSocket message structure
 */
export interface WsMessage {
  type: MessageType;
  timestamp: number;
  data?: unknown;
}

/**
 * User message data
 */
export interface UserMessageData {
  content: string;
}

/**
 * Agent response data
 */
export interface AgentResponseData {
  content: string;
}

/**
 * Tool call data (legacy, for sending tool calls)
 */
export interface ToolCallData {
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

/**
 * Todo item from todos_writer tool
 */
export interface TodoItem {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

/**
 * Tool call result data (from backend tool_call message)
 */
export interface ToolCallResultData {
  result: {
    toolName: string;
    toolCallId: string;
    // Tool call metadata fields
    status?: 'success' | 'error';
    error?: string;
    resultSummary?: string;
    parameters?: Record<string, unknown>;
    // todos_writer specific fields
    todos?: TodoItem[];
    count?: number;
    completed?: number;
    inProgress?: number;
    pending?: number;
    cancelled?: number;
    // output_md specific fields
    mdContent?: string;
    hasFileReplacements?: boolean;
    replaceFiles?: string[];
    [key: string]: unknown;
  };
}

/**
 * Error data
 */
export interface ErrorData {
  error: string;
  errorType?: 'config_missing';
  configType?: 'llm' | 'web_search';
}

/**
 * Usage report data
 */
export interface UsageReportData {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Turn complete data - sent after each LLM response turn
 */
export interface TurnCompleteData {
  toolCallIds: string[];
}

/**
 * Session info data
 */
export interface SessionInfoData {
  sessionId: string;
  title: string | null;
}

/**
 * Connection states
 */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';
