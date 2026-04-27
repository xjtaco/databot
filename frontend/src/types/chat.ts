import type { ChatActionCard } from './actionCard';

/**
 * Chat message role
 */
export type MessageRole = 'user' | 'assistant';

/**
 * Chat message status
 */
export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'error';

/**
 * Chat message structure
 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  status: MessageStatus;
  error?: string;
  toolCallIds?: string[];
  isOutputMd?: boolean;
  actionCards?: ChatActionCard[];
}

/**
 * Token usage information
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Chat state
 */
export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  currentMessageId: string | null;
  tokenUsage: TokenUsage | null;
}
