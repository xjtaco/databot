import { config } from '../base/config';
import type { ToolCall, ToolCallResult } from '../infrastructure/llm';
import { LLMProviderFactory } from '../infrastructure/llm';
import { ToolName } from '../infrastructure/tools/types';
import { ToolRegistry } from '../infrastructure/tools';
import logger from '../utils/logger';
import PQueue from 'p-queue';
import fs from 'node:fs';
import path from 'node:path';
import * as shortUuid from 'short-uuid';
import { AgentSession } from './base';
import { Context } from './context';
import type { SessionConfig, WsMessage } from './types';
import * as chatSessionService from '../chatSession/chatSession.service';
import { createAgentRunRecorder, type AgentRunStatus } from '../agentRunEvaluator';

const CORE_PROMPT = `
You are an interactive command-line agent focused on data analysis tasks. Your primary goal is to assist users safely and efficiently while strictly following these instructions and making full use of available tools.

# Core Instructions

- **Convention:** Prioritize fetching data from databases for analysis. The data dictionary for database tables is available in \`${config.data_dictionary_folder}\` (do not modify or delete any files in this directory). Use \`${ToolName.Glob}\` and \`${ToolName.Grep}\` first to locate tables and columns to analyze, then read the corresponding data dictionary files for details.
- **Libraries/Frameworks:** The current Python environment has data analysis libraries installed: \`numpy pandas scipy statsmodels scikit-learn xgboost lightgbm openpyxl xlrd plotly requests beautifulsoup4\`. Use Python code for data analysis and processing when necessary. *Note*: Only use libraries available in the current Python environment. *Do not* install additional Python packages.
- **SQL Execution:** When fetching data from databases for analysis, you *must* use \`${ToolName.Sql}\` to retrieve and analyze data. Do not use other methods. The \`output_csv\` path of the SQL tool **must** be under the working directory \`#WORK_FOLDER#\`.
- **Data Analysis:** When using database tables as data sources, *always use* \`${ToolName.Sql}\` first for data aggregation to reduce output volume. Only use Python scripts for auxiliary analysis when SQL cannot fulfill the user's analysis request. When processing data with SQL or Python, limit significant digits to enhance readability.
- **Chart Generation:** Use \`plotly\` for all data visualization charts. You *must load* the \`WenQuanYi Zen Hei\` Chinese font. Save charts as Plotly JSON files using \`fig.write_json('/path/to/chart.json')\`. In the report, reference the JSON file using the placeholder format \`<!-- {/path/to/chart.json} -->\`. Do *not* save charts as static images (PNG/SVG).
- **Working Directory:** The exact absolute workdir for this session is \`#WORK_FOLDER#\`. When generating files during interaction, save them to that workdir by default unless otherwise specified. Never write generated files directly under the root of \`${config.work_folder}\`; use the session workdir or a child directory beneath it. Use short English snake_case filenames such as \`summary_report.md\`, \`sales_by_region.csv\`, or \`cleaned_data.py\`.
- **Comments:** Minimize code comments. Focus on *why* something is done, especially for complex logic, not *what* is done. Only add high-value comments when necessary for clarity or when requested by the user. Do not edit comments separated from your code changes. *Never* use comments to communicate with the user or describe your changes.
- **Proactivity:** Fully satisfy user requests. When editing or generating code files, include tests to ensure quality. Treat all created files (especially tests) as permanent artifacts by default unless the user states otherwise.
- **Confirm Ambiguity/Expansion:** Do not take significant actions beyond the explicit scope of the request without user confirmation. If the user asks *how* to do something, explain first rather than executing directly.
- **Path Construction:** When using filesystem tools, always pass absolute paths. If the user provides a relative path, resolve it to the correct absolute path before calling the tool.
- **Data Files:** User-uploaded data files (csv, excel) are in \`${config.work_folder}/uploads\` directory and can be used as data sources for analysis.

*Data Dictionary Content Description*:
- The data dictionary files under the \`files\` directory each correspond to a data file (CSV/Excel), specifying the relative path of the data file based on the \`${config.upload.directory}\` directory. **These data files must only be read and processed using Python** (e.g. pandas). Do not use SQL tools on data files.
- Other directories serve as data dictionary directories for tables of corresponding databases. Each directory corresponds to one database, and contains a config.ini file indicating the database type and connection method. **Database tables must be queried and processed using \`${ToolName.Sql}\`**. Do not use Python to directly access database tables.

# Main Workflow

## Data Analysis Tasks

When asked to perform data analysis and processing tasks, follow this sequence:

1. **Understand:** Consider the user's request and relevant context. Extensively use \`${ToolName.Glob}\` and \`${ToolName.Grep}\` search tools (run in parallel if independent) to understand the current working directory, \`${config.upload.directory}\`, and the data dictionary file structure. Use \`${ToolName.ReadFile}\` and \`${ToolName.Sql}\` to understand context and validate any assumptions.
2. **Confirm:** If questions remain after attempting to understand the user's request with relevant data context, compile your questions and ask the user for clarification.
3. **Plan:** Develop a coherent plan based on your understanding from steps 1 and 2. Share an extremely concise but clear plan with the user if it helps them understand your approach. If the task is complex, use task tracking (see "Task Tracking" section below). *Do not* use other methods to record plans. As part of the plan, write test scripts to verify that intermediate results and final outputs of data analysis meet expectations. Use logging or debug statements during this process to reach the solution.
4. **Implement:** Execute the plan using available tools (\`${ToolName.Edit}\`, \`${ToolName.WriteFile}\`, \`${ToolName.Bash}\`, \`${ToolName.Sql}\`, etc.). Save analysis results to files as needed, strictly following project conventions (see "Core Instructions").
5. **Verify:** Very important: After completing each analysis step, verify that the analysis results match expectations.
6. **Complete:** After all verification passes, consider the task complete. Use the \`${ToolName.OutputMd}\` tool to summarize analysis results and await the user's next instructions.

# Operational Guidelines

## Shell Tool Output Token Efficiency:

Follow these guidelines to avoid excessive token consumption.

- When using \`${ToolName.Bash}\`, always prefer command flags that reduce output verbosity.
- Minimize tool output tokens while capturing necessary information.
- If a command is expected to produce large output, use quiet or silent flags when available and appropriate.
- Always balance output verbosity with information needs. If the full output is essential for understanding results, avoid excessive silencing that might obscure important details.
- If a command has no quiet/silent flags, or for potentially verbose but useless output, redirect stdout and stderr to temporary files in the project temp directory: /tmp. Example: 'command > /tmp/out.log'

## Tone & Style (Chat Interaction)

- **Concise and Direct:** Use a professional, direct, and concise tone appropriate for a chat environment.
- **Minimal Output:** Aim for fewer than 3 lines of text per response (excluding tool use/code generation). *Special note*: After outputting results with \`${ToolName.OutputMd}\`, a one-sentence summary of task execution is sufficient.
- **Clarity When Necessary:** While brevity is key, prioritize clarity when explanation or clarification is necessary.
- **No Small Talk:** Avoid pleasantries, preambles ("Okay, I will now..."), or closing statements ("I have completed the changes..."). Get straight to the point.
- **Formatting:** Use GitHub-flavored Markdown. Responses will be rendered in monospace font.
- **Tools vs Text:** Use tools for actions, use text for output. Do not add explanatory comments in tool calls or code blocks unless the code/command itself requires it.
- **Handling Inability:** If you cannot/will not fulfill a request, briefly explain in 1-2 sentences without over-explaining. Offer alternatives if appropriate.

## Security & Safety Rules

- **Explain Critical Commands:** Before executing commands with \`${ToolName.Bash}\` that modify the filesystem, codebase, or system state, you *must* briefly explain the command's purpose and potential impact. Prioritize user understanding and system security. No need to request tool permission; users will see a confirmation dialog when using tools (no need to inform them).
- **Security First:** Always apply security best practices. Never introduce code that would expose, log, or commit secrets, API keys, or other sensitive information.

## Tool Usage

- **File Paths:** When using tools like \`${ToolName.ReadFile}\` or \`${ToolName.WriteFile}\`, always use absolute paths. Relative paths are not supported. You must provide absolute paths.
- **Parallel Execution:** Execute multiple independent tool calls in parallel when feasible (e.g., searching data dictionary directories).
- **Command Execution:** Use \`${ToolName.Bash}\` to run shell commands, remembering to follow security rules before executing modification commands.
- **Background Processes:** For commands unlikely to stop on their own, use background processes (via \`&\`), e.g., \`python analysis.py &\`. Ask the user if uncertain.
- **Interactive Commands:** Avoid shell commands that may require user interaction when possible. Otherwise, inform the user that interactive shell commands are not supported and may hang until the user cancels.

## Task Tracking

For complex tasks requiring 3 or more steps, use the \`${ToolName.TodosWriter}\` tool to create and maintain a subtask list:
- Break down the task into subtasks immediately after understanding the user's request.
- Before starting a subtask, mark it as in_progress; after completion, mark it as completed immediately.
- Update the list in real-time as plans evolve; mark obsolete tasks as cancelled.
- Do not use this tool for simple tasks that can be completed in 2 steps or fewer.
- Do not use other methods (e.g. text lists) to record plans.

## Operation Cards

When the user asks to create, modify, delete, open, or prepare managed system objects (datasources, knowledge files, schedules, workflows, custom node templates):

1. Use ${ToolName.SearchUiActionCard} to find the relevant card. Provide a natural language query and optional domain filter.
2. Review the returned card definitions. Choose the best matching card.
3. Use ${ToolName.ShowUiActionCard} with the chosen cardId and any known parameters. Leave optional parameters empty if the user has not provided them.
4. Do NOT claim the operation has executed. The card is shown to the user for confirmation.
5. For creating workflows or custom node templates, prefer the Copilot creation cards (workflow.copilot_create, template.copilot_create).
6. If required parameters are missing for a risky action, ask the user before showing the card.
7. Never put secrets (passwords, tokens) in your normal response text. They belong only in card parameters.
` as const;

/**
 * Core agent session implementation.
 * Extends AgentSession to provide basic agent functionality.
 *
 * TODO: Implement actual agent logic in future changes.
 * This is a stub implementation that handles basic message routing.
 */
export class CoreAgentSession extends AgentSession {
  private context: Context;
  private messageQueue: PQueue;
  private workFolder: string;
  private chatSessionId: string | null;
  private isFirstMessage: boolean = true;
  private aborted: boolean = false;

  constructor(sessionConfig: SessionConfig) {
    super(sessionConfig);
    // Generate a short unique ID for the work folder name
    const shortId = shortUuid.generate();
    this.workFolder = path.join(config.work_folder, `wf_${shortId}`);

    // Create directory synchronously with error handling
    try {
      fs.mkdirSync(this.workFolder, { recursive: true });
      logger.debug('Work folder created', {
        sessionId: this.config.sessionId,
        workFolder: this.workFolder,
      });
    } catch (error) {
      logger.error('Failed to create work folder', {
        sessionId: this.config.sessionId,
        workFolder: this.workFolder,
        error,
      });
      throw error; // Re-throw to fail session creation
    }

    this.context = new Context();
    this.context.addSystemMessage(CORE_PROMPT.replace('#WORK_FOLDER#', this.workFolder));
    // Initialize message queue with concurrency: 1 to ensure messages are processed sequentially
    this.messageQueue = new PQueue({
      concurrency: 1,
      autoStart: true,
    });

    this.chatSessionId = sessionConfig.chatSessionId ?? null;
  }

  /**
   * Attach WebSocket and then schedule chat session initialization.
   */
  connect(ws: import('ws').WebSocket): void {
    super.connect(ws);
    ws.on('close', () => {
      this.disconnect();
    });
    this.messageQueue.add(() => this.initChatSession());
  }

  /**
   * Initialize chat session by sending session_info to the frontend.
   * Only runs when a chatSessionId is present (i.e. reconnecting to an existing session).
   * Note: Historical messages are NOT loaded into the agent context — the agent
   * starts fresh. The frontend displays history from the DB independently.
   */
  private async initChatSession(): Promise<void> {
    if (!this.chatSessionId) return;

    let title: string | null = null;
    try {
      const session = await chatSessionService.getSession(this.chatSessionId);
      title = session.title;
      this.isFirstMessage = false;
      logger.info('Restored chat session (fresh agent context)', {
        chatSessionId: this.chatSessionId,
      });
    } catch (error) {
      logger.warn('Failed to load chat session info', {
        chatSessionId: this.chatSessionId,
        error,
      });
    }

    this.sendMessage({
      type: 'session_info',
      timestamp: Date.now(),
      data: { sessionId: this.chatSessionId, title },
    });
  }

  async handleUserMessage(data: { content: string }): Promise<void> {
    const runRecorder = createAgentRunRecorder({
      agentType: 'core',
      sessionId: this.config.sessionId,
      userRequest: data.content,
    });

    // Check if LLM is configured before processing
    const llmConfig = LLMProviderFactory.getConfig();
    if (!llmConfig.apiKey) {
      this.sendMessage({
        type: 'error',
        timestamp: Date.now(),
        data: {
          error:
            'LLM is not configured. Please go to Settings and configure the LLM connection first.',
          errorType: 'config_missing',
          configType: 'llm',
        },
      });
      await runRecorder.finish('config_missing');
      return;
    }

    // add user message to context
    this.context.addUserMessage(data.content);

    // Lazily create a chat session on first message if none exists
    if (!this.chatSessionId) {
      try {
        const created = await chatSessionService.createSession();
        this.chatSessionId = created.id;
        this.sendMessage({
          type: 'session_info',
          timestamp: Date.now(),
          data: { sessionId: this.chatSessionId, title: null },
        });
        logger.info('Lazily created chat session', { chatSessionId: this.chatSessionId });
      } catch (error) {
        logger.warn('Failed to lazily create chat session', { error });
      }
    }

    // Persist user message to chat session
    if (this.chatSessionId) {
      try {
        await chatSessionService.addMessage(this.chatSessionId, 'user', data.content);
        if (this.isFirstMessage) {
          this.isFirstMessage = false;
          await chatSessionService.autoGenerateTitle(this.chatSessionId, data.content);
        }
      } catch (error) {
        logger.warn('Failed to persist user message', { error });
      }
    }

    let finishReason = '';
    let runStatus: AgentRunStatus = 'success';
    this.aborted = false;
    try {
      do {
        if (this.aborted) {
          logger.info('Agent aborted before LLM call', { sessionId: this.config.sessionId });
          break;
        }
        const stream = this.llm.streamChat(this.context.validHistory(), {
          temperature: 0.9,
          tools: ToolRegistry.getAllToolSchemas(),
        });
        const assistantContentChunks: string[] = [];
        const toolCalls: ToolCall[] = [];
        const toolCallResults: ToolCallResult[] = [];
        let lastUsage: Record<string, unknown> | undefined;

        for await (const event of stream) {
          switch (event.type) {
            case 'content':
              if (event.content) {
                assistantContentChunks.push(event.content);
              }
              this.sendMessage({
                type: 'agent_response',
                timestamp: Date.now(),
                data: { content: event.content },
              });
              break;
            case 'tool_call':
              if (event.toolCall) {
                toolCalls.push(event.toolCall);
                runRecorder.recordToolStart({
                  toolCallId: event.toolCall.id,
                  toolName: event.toolCall.function.name,
                  arguments: event.toolCall.function.arguments,
                });
              }
              logger.info('Received tool call', {
                toolName: event.toolCall?.function?.name,
                toolCallId: event.toolCall?.id,
              });
              break;
            case 'tool_call_result':
              if (event.toolCallResult) {
                toolCallResults.push(event.toolCallResult);
                const status = event.toolCallResult.metadata?.status;
                const success = status !== 'error' && status !== 'failed';
                runRecorder.recordToolComplete({
                  toolCallId: event.toolCallResult.toolCallId,
                  toolName: event.toolCallResult.name,
                  success,
                  content: event.toolCallResult.content,
                  error:
                    typeof event.toolCallResult.metadata?.error === 'string'
                      ? event.toolCallResult.metadata.error
                      : undefined,
                });
              }
              logger.info('Received tool call result', {
                toolName: event.toolCallResult?.name,
                toolCallId: event.toolCallResult?.toolCallId,
                contentLength: event.toolCallResult?.content?.length,
                contentPreview: event.toolCallResult?.content?.slice(0, 200),
              });
              // Skip sending tool calls with empty names to frontend
              if (event.toolCallResult?.name) {
                this.sendMessage({
                  type: 'tool_call',
                  timestamp: Date.now(),
                  data: {
                    result: {
                      ...event.toolCallResult?.metadata,
                      toolName: event.toolCallResult.name,
                      toolCallId: event.toolCallResult.toolCallId,
                    },
                  },
                });

                if (
                  event.toolCallResult?.name === ToolName.ShowUiActionCard &&
                  event.toolCallResult?.metadata?.cardPayload
                ) {
                  this.sendMessage({
                    type: 'action_card',
                    timestamp: Date.now(),
                    data: event.toolCallResult.metadata.cardPayload,
                  });

                  // Persist card metadata to chat session
                  if (this.chatSessionId) {
                    chatSessionService
                      .addMessage(
                        this.chatSessionId,
                        'tool',
                        JSON.stringify({
                          toolName: 'show_ui_action_card',
                          toolCallId: event.toolCallResult.toolCallId,
                          status: 'success',
                          cardPayload: event.toolCallResult.metadata.cardPayload,
                        }),
                        {
                          type: 'action_card',
                          payload: event.toolCallResult.metadata.cardPayload,
                          status: 'proposed',
                        } as Record<string, unknown>
                      )
                      .catch((error) =>
                        logger.warn('Failed to persist action card metadata', { error })
                      );
                  }
                }

                // Persist tool call result to chat session
                if (this.chatSessionId) {
                  const toolRecord = {
                    toolName: event.toolCallResult.name,
                    toolCallId: event.toolCallResult.toolCallId,
                    status: event.toolCallResult.metadata?.status ?? 'success',
                    resultSummary: event.toolCallResult.metadata?.resultSummary,
                    parameters: event.toolCallResult.metadata?.parameters,
                    error: event.toolCallResult.metadata?.error,
                  };
                  chatSessionService
                    .addMessage(this.chatSessionId, 'tool', JSON.stringify(toolRecord))
                    .catch((error) => logger.warn('Failed to persist tool call result', { error }));

                  // Also persist output_md content as an assistant message
                  if (event.toolCallResult.name === ToolName.OutputMd) {
                    const mdContent =
                      (event.toolCallResult.metadata?.mdContent as string) ||
                      event.toolCallResult.content;
                    if (mdContent) {
                      chatSessionService
                        .addMessage(this.chatSessionId, 'assistant', mdContent)
                        .catch((error) =>
                          logger.warn('Failed to persist output_md content', { error })
                        );
                    }
                  }
                }
              }
              break;
            case 'done':
              finishReason = event.finishReason || 'completed';
              if (event.usage) {
                lastUsage = event.usage;
                runRecorder.recordLlmCall(event.usage);
                this.sendMessage({
                  type: 'usage_report',
                  timestamp: Date.now(),
                  data: event.usage,
                });
              }
              if (finishReason === 'stop') {
                this.sendMessage({ type: 'stop', timestamp: Date.now() });
              }
              logger.info(`Stream completed with reason: ${finishReason}`);
              break;
            case 'error':
              runStatus = 'failed';
              runRecorder.recordError();
              this.sendMessage({
                type: 'error',
                timestamp: Date.now(),
                data: { error: event.error },
              });
              logger.error('Stream error', { error: event.error });
              // Set finishReason to 'stop' to exit the loop on error
              finishReason = 'stop';
              break;
          }
        }

        // Send turn_complete signal with tool call IDs for this turn
        const toolCallIds = toolCalls.map((tc) => tc.id);
        this.sendMessage({
          type: 'turn_complete',
          timestamp: Date.now(),
          data: { toolCallIds },
        });

        // Add assistant message to context (with tool calls or content)
        if (toolCalls.length > 0) {
          const assistantMessage = {
            role: 'assistant' as const,
            content: assistantContentChunks.length > 0 ? assistantContentChunks.join('') : null,
            toolCalls,
          };
          const tokens =
            lastUsage && typeof lastUsage.completionTokens === 'number'
              ? lastUsage.completionTokens
              : undefined;
          this.context.addMessageWithTokens(assistantMessage, tokens);
        } else if (assistantContentChunks.length > 0) {
          const assistantMessage = {
            role: 'assistant' as const,
            content: assistantContentChunks.join(''),
          };
          const tokens =
            lastUsage && typeof lastUsage.completionTokens === 'number'
              ? lastUsage.completionTokens
              : undefined;
          this.context.addMessageWithTokens(assistantMessage, tokens);
        }

        // Persist assistant text content to chat session (every turn that has text)
        if (this.chatSessionId && assistantContentChunks.length > 0) {
          const fullContent = assistantContentChunks.join('');
          runRecorder.recordAssistantText(fullContent);
          try {
            await chatSessionService.addMessage(this.chatSessionId, 'assistant', fullContent);
          } catch (error) {
            logger.warn('Failed to persist assistant message', { error });
          }
        }

        // Add tool results to context (must be separate from above, not else-if)
        if (toolCallResults.length > 0) {
          for (const result of toolCallResults) {
            this.context.addMessageWithTokens({
              role: 'tool',
              name: result.name,
              content: result.content,
              toolCallId: result.toolCallId,
            });
          }
        }
        if (this.aborted) {
          logger.info('Agent aborted after tool execution', { sessionId: this.config.sessionId });
          break;
        }

        const compressLimit = LLMProviderFactory.getConfig().compressTokenLimit ?? 60000;
        if (lastUsage && (lastUsage.total_tokens as number) > compressLimit) {
          await this.context.compressContext();
          runRecorder.recordContextCompression();
        }

        // Log warning only if nothing was added at all
        if (
          toolCalls.length === 0 &&
          assistantContentChunks.length === 0 &&
          toolCallResults.length === 0
        ) {
          logger.warn('No assistant content, tool calls, or tool call results to add to context.');
        }
      } while (finishReason !== 'stop');

      if (this.aborted) {
        runStatus = 'aborted';
        this.sendMessage({ type: 'stop', timestamp: Date.now() });
      }
    } catch (error) {
      runStatus = 'failed';
      runRecorder.recordError();
      logger.error('Failed to process user message', { sessionId: this.config.sessionId, error });
      try {
        this.sendMessage({
          type: 'error',
          timestamp: Date.now(),
          data: { error: error instanceof Error ? error.message : String(error) },
        });
      } catch {
        // WebSocket already disconnected — nothing to notify
      }
    } finally {
      await runRecorder.finish(runStatus);
    }
  }
  /**
   * Abort the current agent turn, breaking out of the tool call loop.
   */
  private abort(): void {
    this.aborted = true;
    logger.info('Agent abort requested', { sessionId: this.config.sessionId });
  }

  /**
   * Handle incoming WebSocket messages.
   * Routes messages to appropriate handlers based on message type.
   */
  protected onMessage(message: WsMessage): void {
    logger.debug('Message received', { sessionId: this.config.sessionId, type: message.type });

    switch (message.type) {
      case 'pong':
        // Already handled by base class onHeartbeatMessage
        break;
      case 'user_message':
        // Add message to queue to ensure sequential processing
        this.messageQueue.add(() => this.handleUserMessage(message.data as { content: string }));
        break;

      case 'stop':
        this.abort();
        break;

      default:
        logger.debug('Unhandled message type', {
          sessionId: this.config.sessionId,
          type: message.type,
        });
        break;
    }
  }

  /**
   * Disconnect and cleanup resources.
   * Clears the message queue and pauses it before disconnecting.
   */
  disconnect(): void {
    // Pause the queue and clear all pending messages
    this.messageQueue.pause();
    this.messageQueue.clear();
    logger.debug('Message queue cleared', { sessionId: this.config.sessionId });

    // Cleanup work folder before super.disconnect()
    try {
      fs.rmSync(this.workFolder, { recursive: true, force: true });
      logger.debug('Work folder cleaned up', {
        sessionId: this.config.sessionId,
        workFolder: this.workFolder,
      });
    } catch (error) {
      logger.warn('Failed to cleanup work folder', {
        sessionId: this.config.sessionId,
        workFolder: this.workFolder,
        error,
      });
    }

    // Call parent class disconnect to cleanup WebSocket and heartbeat
    super.disconnect();
  }
}
