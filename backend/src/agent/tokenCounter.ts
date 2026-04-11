import { encodingForModel } from 'js-tiktoken';
import type { Message } from '../infrastructure/llm';

/**
 * Interface for counting tokens in messages
 */
export interface TokenCounter {
  countMessageTokens(message: Message): number;
}

/**
 * Token counter implementation using tiktoken with cl100k_base encoding (GPT-4 compatible)
 */
export class TiktokenCounter implements TokenCounter {
  private encoding: ReturnType<typeof encodingForModel>;

  constructor() {
    this.encoding = encodingForModel('gpt-4o');
  }

  /**
   * Count tokens in a message including content, toolCalls, toolCallId, and name
   */
  countMessageTokens(message: Message): number {
    let totalTokens = 0;

    // Count content tokens
    if (message.content) {
      totalTokens += this.encoding.encode(message.content).length;
    }

    // Count name tokens
    if (message.name) {
      totalTokens += this.encoding.encode(message.name).length;
    }

    // Count toolCallId tokens
    if (message.toolCallId) {
      totalTokens += this.encoding.encode(message.toolCallId).length;
    }

    // Count toolCalls tokens
    if (message.toolCalls && message.toolCalls.length > 0) {
      for (const toolCall of message.toolCalls) {
        totalTokens += this.encoding.encode(toolCall.id).length;
        totalTokens += this.encoding.encode(toolCall.function.name).length;
        totalTokens += this.encoding.encode(toolCall.function.arguments).length;
      }
    }

    // Add overhead for message structure (role, separators, etc.)
    // This is an approximation based on OpenAI's token counting guidelines
    totalTokens += 4; // Every message has overhead tokens for role and formatting

    return totalTokens;
  }
}
