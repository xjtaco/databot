import { config } from '../base/config';
import { LLMProvider, LLMProviderFactory, Message } from '../infrastructure/llm';
import logger from '../utils/logger';
import { TokenCounter, TiktokenCounter } from './tokenCounter';

const COMPRESS_PROMPT = `
You are a component responsible for organizing internal chat records into a specified structure.
When the conversation history becomes too long, you will be called to distill the entire history into a concise, structured XML snapshot. This snapshot is critical because it will become the agent's only memory of the past. The agent will continue working based solely on this snapshot. All key details, plans, errors, and user instructions must be preserved.
First, after private reasoning, you will generate the final <state_snapshot> XML object. Information density must be extremely high, omitting any irrelevant conversational filler.
The structure must be as follows:
\`\`\`xml
<state_snapshot>
    <overall_goal>
        <!-- Describe the user's high-level goal in one concise sentence. -->
        <!-- Example: "Predict sales revenue for the first 3 months of 2026 by province based on 2025 e-commerce sales data showing monthly sales by province" -->
    </overall_goal>

    <key_knowledge>
        <!-- Key facts, conventions, and constraints that the agent must remember based on conversation history and user interactions. Use bullet points. -->
        <!-- Example:
         - Metadata info: \`e-commerce-sales\` table has \`revenue\`, \`province\`, \`transaction_date\`, \`sale_date\`
         - Prediction algorithm: Use \`SARIMA\` statistical model to predict sales data
        -->
    </key_knowledge>

    <file_system_state>
        <!-- List files that have been created, read, modified, or deleted. Note their status and key findings. -->
        <!-- Example:
         - Current directory: \`/data/code/agent/work_folder/2025_11_11/7125bcf3/\`
         - Read: \`e-commerce-sales.md\` - Confirmed \`revenue\`, \`province\`, \`transaction_date\`, \`sale_date\` are columns in the database table
         - Modified: \`sales_revenue_prediction.py\` - Replaced 'sale_date' with 'transaction_date'.
         - Created: \`sales_revenue_prediction.py\` - Created sales revenue prediction Python script.
        -->
    </file_system_state>

    <recent_actions>
        <!-- Summary of recent important agent actions and their results. Focus on facts. -->
        <!-- Example:
         - Ran \`grep 'revenue'\`, returned 3 results in 2 files.
         - Ran \`python sales_revenue_prediction.py\`, failed because the target file \`revenue_prediction.png\` already exists.
         - Ran \`ls -F .\`, discovered analysis data is stored in \`.csv\` format.
        -->
    </recent_actions>

    <current_plan>
        <!-- The agent's step-by-step plan. Mark completed steps. -->
        <!-- Example:
         1. [DONE] Read the e-commerce sales data dictionary file.
         2. [IN PROGRESS] Construct SQL query for monthly sales analysis by province.
         3. [TODO] Create sales revenue prediction Python script using existing sales analysis data
         4. [TODO] Organize data and generate prediction analysis report
        -->
    </current_plan>
</state_snapshot>
\`\`\`
`;

/**
 * Message with associated token count
 */
export interface MessageWithTokens {
  message: Message;
  tokens: number;
}

export class Context {
  private history: MessageWithTokens[] = [];
  private llm: LLMProvider;
  private tokenCounter: TokenCounter;

  constructor(tokenCounter?: TokenCounter) {
    this.llm = LLMProviderFactory.getProvider();
    this.tokenCounter = tokenCounter ?? new TiktokenCounter();
  }

  /**
   * compress message history to reduce token usage
   * Uses token-based compression instead of message count-based
   * @returns Promise<void>
   */
  async compressContext(): Promise<void> {
    // Step 1: Collect message history excluding the system prompt
    const messageHistory = this.history.slice(1);
    if (messageHistory.length === 0) {
      logger.warn('Context compression skipped due to insufficient message history length.');
      return;
    }

    // Step 2: Calculate cumulative token counts
    let cumulativeTokens = 0;
    const tokenSums = messageHistory.map((item) => {
      cumulativeTokens += item.tokens;
      return cumulativeTokens;
    });

    const totalTokens = cumulativeTokens;
    const targetCompressTokens = Math.trunc(totalTokens * config.context_compress_ratio);

    // Step 3: Find the index where cumulative tokens reach target compression amount
    let compressIndex = -1;
    for (let i = 0; i < tokenSums.length; i++) {
      if (tokenSums[i] >= targetCompressTokens) {
        compressIndex = i;
        break;
      }
    }

    if (compressIndex < 0) {
      logger.warn('Context compression skipped: no valid compression point found.');
      return;
    }

    // Step 4: Adjust boundary forward to maintain complete tool call sequences
    const targetIdx = this.adjustForToolCallBoundary(compressIndex, messageHistory);

    // Step 5: Perform compression if a valid target index is found
    if (targetIdx >= 0 && targetIdx < messageHistory.length) {
      // Split messages into compressible and remaining portions
      const messagesToCompress = messageHistory.slice(0, targetIdx + 1).map((item) => item.message);
      const leftMessages = messageHistory.slice(targetIdx + 1);

      // Convert messages to compress into a formatted string
      const messagesContent = this.formatMessagesForCompression(messagesToCompress);
      const messages: Message[] = [
        { role: 'system', content: COMPRESS_PROMPT },
        { role: 'user', content: `Below is the chat history to compress:\n\n${messagesContent}` },
      ];

      // Invoke LLM to compress the message history into a structured snapshot
      const response = await this.llm.chat(messages, { temperature: 0.9 });

      // Calculate tokens for the compressed message
      const compressedMessage: Message = { role: 'assistant', content: response.content };
      const compressedTokens = response.usage
        ? response.usage.completionTokens
        : this.tokenCounter.countMessageTokens(compressedMessage);

      // Step 6: Reconstruct history with compressed context replacing old messages
      this.history = [
        this.history[0], // Keep original system prompt
        { message: compressedMessage, tokens: compressedTokens }, // Insert compressed summary
        ...leftMessages, // Append remaining uncompressed messages
      ];

      logger.info('Context compressed successfully', {
        originalMessages: messageHistory.length,
        compressedMessages: messagesToCompress.length,
        remainingMessages: leftMessages.length,
        originalTokens: totalTokens,
        compressedTokens,
      });
      return;
    } else {
      logger.warn('No valid target index found for context compression.');
      return;
    }
  }

  /**
   * Adjust compression boundary forward to maintain complete tool call sequences.
   * The goal is to compress MORE tokens by including complete tool call sequences.
   */
  private adjustForToolCallBoundary(compressIndex: number, history: MessageWithTokens[]): number {
    const currentMsg = history[compressIndex].message;

    if (currentMsg.role === 'assistant') {
      if (!currentMsg.toolCalls) {
        // Assistant message without tool calls: safe to compress up to this point
        return compressIndex;
      }
      // Has toolCalls, find the end of the tool call sequence (forward)
      return this.findEndOfToolCallSequence(compressIndex, history);
    }

    if (currentMsg.role === 'tool') {
      // In the middle of tool responses, find the end of the tool call sequence (forward)
      return this.findEndOfToolCallSequence(compressIndex, history);
    }

    if (currentMsg.role === 'user') {
      // User message can be used as boundary directly
      return compressIndex;
    }

    // For unexpected roles, log warning and compress up to previous message
    logger.warn('Unexpected message role during context compression:', {
      role: currentMsg.role,
    });
    return compressIndex > 0 ? compressIndex - 1 : -1;
  }

  /**
   * Find the end of a tool call sequence (forward direction).
   * Returns the index of the last message in the tool call sequence.
   */
  private findEndOfToolCallSequence(startIdx: number, history: MessageWithTokens[]): number {
    for (let i = startIdx; i < history.length; i++) {
      const msg = history[i].message;
      // Continue if this is a tool response or assistant with tool calls
      if (msg.role === 'tool' || (msg.role === 'assistant' && msg.toolCalls)) {
        continue;
      }
      // Found a non-tool message, the previous one is the end of the sequence
      return i - 1;
    }
    // If we reach the end and all remaining messages are part of tool sequence,
    // return the last valid index (one before the last to leave something uncompressed)
    return history.length > 1 ? history.length - 2 : -1;
  }

  /**
   * Format messages array into a readable string for compression
   * @param messages - Array of messages to format
   * @returns Formatted string representation of messages
   */
  private formatMessagesForCompression(messages: Message[]): string {
    return messages
      .map((msg) => {
        const roleLabel = msg.role.toUpperCase();
        let content = '';

        if (msg.content) {
          content = msg.content;
        }

        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const toolCallsStr = msg.toolCalls
            .map((tc) => `[Tool Call: ${tc.function.name}(${tc.function.arguments})]`)
            .join('\n');
          content = content ? `${content}\n${toolCallsStr}` : toolCallsStr;
        }

        if (msg.toolCallId) {
          return `[${roleLabel}] (toolCallId: ${msg.toolCallId})\n${content}`;
        }

        return `[${roleLabel}]\n${content}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * Get valid message history for LLM context
   * @returns Array of valid messages
   */
  validHistory(): Message[] {
    return this.history
      .map((item) => item.message)
      .filter(
        (msg) =>
          (msg.content && msg.content.trim() !== '') ||
          (msg.toolCallId && msg.toolCallId.trim() !== '') ||
          (msg.toolCalls && msg.toolCalls.length > 0)
      );
  }

  /**
   * Add a message with optional token count
   * If tokens is provided, use it directly; otherwise calculate using tokenCounter
   */
  addMessageWithTokens(message: Message, tokens?: number): void {
    const actualTokens = tokens ?? this.tokenCounter.countMessageTokens(message);
    this.history.push({ message, tokens: actualTokens });
  }

  /**
   * Add a system message and calculate its token count
   */
  addSystemMessage(content: string): void {
    const message: Message = { role: 'system', content };
    const tokens = this.tokenCounter.countMessageTokens(message);
    this.history.push({ message, tokens });
  }

  /**
   * Add a user message and calculate its token count
   */
  addUserMessage(content: string): void {
    const message: Message = { role: 'user', content };
    const tokens = this.tokenCounter.countMessageTokens(message);
    this.history.push({ message, tokens });
  }

  /**
   * Get the total token count of all messages in history
   */
  getTotalTokens(): number {
    return this.history.reduce((sum, item) => sum + item.tokens, 0);
  }
}
