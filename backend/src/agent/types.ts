/**
 * Type definitions for agent session management.
 */

/**
 * WebSocket message types.
 */
export type MessageType =
  | 'ping'
  | 'pong'
  | 'user_message'
  | 'agent_response'
  | 'tool_call'
  | 'error'
  | 'usage_report'
  | 'stop'
  | 'turn_complete'
  | 'session_info';

/**
 * Valid message types array.
 */
export const ValidMessageTypes: MessageType[] = [
  'ping',
  'pong',
  'user_message',
  'agent_response',
  'tool_call',
  'error',
  'usage_report',
  'stop',
  'turn_complete',
  'session_info',
] as const;

/**
 * WebSocket message structure.
 * All WebSocket messages must follow this interface.
 */
export interface WsMessage {
  type: MessageType;
  timestamp: number;
  data?: unknown;
}

/**
 * Session lifecycle states.
 */
export type SessionState = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Configuration for an agent session.
 */
export interface SessionConfig {
  sessionId: string;
  chatSessionId?: string;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
  maxMissedHeartbeats?: number;
}
