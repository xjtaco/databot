// backend/src/copilot/debugAgent.ts

import { LLMProviderFactory } from '../infrastructure/llm/factory';
import { ToolCall, ToolCallResult } from '../infrastructure/llm/types';
import { Context } from '../agent/context';
import logger from '../utils/logger';
import { buildDebugSystemPrompt } from './debugPrompt';
import { createDebugToolRegistry } from './debugTools';
import { InMemoryWorkflowAccessor } from './workflowAccessor';
import * as templateService from '../workflow/customNodeTemplate.service';
import type { CopilotServerMessage } from './copilot.types';
import type { WorkflowNodeInfo, WorkflowDetail } from '../workflow/workflow.types';
import { buildToolStartSummary, buildToolDoneSummary } from './toolSummaries';
import { createAgentRunRecorder, type AgentRunStatus } from '../agentRunEvaluator';

const DEBUG_MAX_TOOL_CALLS_PER_TURN = 100;

function buildTempWorkdir(accessor: InMemoryWorkflowAccessor): string {
  return accessor.getTempWorkdir();
}

export class DebugAgent {
  private templateId: string;
  private locale: string;
  private accessor: InMemoryWorkflowAccessor;
  private node: WorkflowNodeInfo;
  private context: Context;
  private sendEvent: (event: CopilotServerMessage) => void;
  private aborted: boolean;
  private isProcessing: boolean;

  constructor(
    templateId: string,
    accessor: InMemoryWorkflowAccessor,
    node: WorkflowNodeInfo,
    sendEvent: (event: CopilotServerMessage) => void,
    locale = 'zh-CN'
  ) {
    this.templateId = templateId;
    this.locale = locale;
    this.accessor = accessor;
    this.node = node;
    this.context = new Context();
    this.sendEvent = sendEvent;
    this.aborted = false;
    this.isProcessing = false;
  }

  abort(): void {
    this.aborted = true;
  }

  cleanup(): void {
    // Fire-and-forget cleanup of temp directories
    this.accessor.cleanup().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('DebugAgent cleanup error', { templateId: this.templateId, error: msg });
    });
  }

  async executeNodeDirectly(nodeId: string): Promise<void> {
    if (this.isProcessing) {
      this.sendEvent({ type: 'error', message: 'Debug agent is busy processing' });
      return;
    }
    this.isProcessing = true;
    const runRecorder = createAgentRunRecorder({
      agentType: 'debug',
      workflowId: this.node.workflowId,
      templateId: this.templateId,
      userRequest: `execute_node:${nodeId}`,
    });
    runRecorder.recordToolStart({
      toolCallId: `execute-node-${nodeId}`,
      toolName: 'execute_node',
      arguments: JSON.stringify({ nodeId }),
    });
    let runStatus: AgentRunStatus = 'success';

    try {
      await this.accessor.executeNode(nodeId, {
        onProgress: (event) => {
          this.sendEvent({ type: 'execution_event', event });
        },
      });

      // Send workflow_changed so the UI updates node state
      const node = await this.accessor.getNode(nodeId);
      runRecorder.recordToolComplete({
        toolCallId: `execute-node-${nodeId}`,
        toolName: 'execute_node',
        success: true,
      });
      this.sendEvent({ type: 'workflow_changed', changeType: 'node_updated', nodeData: node });
    } catch (err) {
      runStatus = 'failed';
      runRecorder.recordError();
      const errorMessage = err instanceof Error ? err.message : String(err);
      runRecorder.recordToolComplete({
        toolCallId: `execute-node-${nodeId}`,
        toolName: 'execute_node',
        success: false,
        error: errorMessage,
      });
      logger.error('Direct node execution failed', {
        templateId: this.templateId,
        error: errorMessage,
      });
      this.sendEvent({ type: 'error', message: errorMessage });
    } finally {
      this.isProcessing = false;
      this.sendEvent({ type: 'turn_done' });
      await runRecorder.finish(runStatus);
    }
  }

  async handleUserMessage(content: string): Promise<void> {
    if (this.isProcessing) {
      this.sendEvent({
        type: 'error',
        message: 'Debug agent is busy processing a previous message',
      });
      return;
    }
    this.isProcessing = true;
    const runRecorder = createAgentRunRecorder({
      agentType: 'debug',
      workflowId: this.node.workflowId,
      templateId: this.templateId,
      userRequest: content,
    });
    let runStatus: AgentRunStatus = 'success';

    // Check if LLM is configured
    const llmConfig = LLMProviderFactory.getConfig();
    if (!llmConfig.apiKey) {
      runStatus = 'config_missing';
      this.sendEvent({
        type: 'error',
        message:
          'LLM is not configured. Please go to Settings and configure the LLM connection first.',
        errorType: 'config_missing',
        configType: 'llm',
      });
      this.isProcessing = false;
      this.sendEvent({ type: 'turn_done' });
      await runRecorder.finish(runStatus);
      return;
    }

    this.aborted = false;

    // Initialize system prompt on first message
    if (this.context.getTotalTokens() === 0) {
      const systemPrompt = buildDebugSystemPrompt(this.node, buildTempWorkdir(this.accessor));
      this.context.addSystemMessage(systemPrompt);
    }

    this.context.addUserMessage(content);

    const provider = LLMProviderFactory.getProvider();
    const toolRegistry = createDebugToolRegistry(this.accessor);
    let toolCallCount = 0;

    try {
      while (true) {
        if (this.aborted) break;
        if (toolCallCount >= DEBUG_MAX_TOOL_CALLS_PER_TURN) {
          runStatus = 'limit_reached';
          runRecorder.markLimitReached();
          logger.warn('Debug agent tool call limit reached', {
            templateId: this.templateId,
            limit: DEBUG_MAX_TOOL_CALLS_PER_TURN,
          });
          this.sendEvent({
            type: 'error',
            message: `Tool call limit reached (${String(DEBUG_MAX_TOOL_CALLS_PER_TURN)}). Please continue the conversation to proceed.`,
          });
          break;
        }

        const allMessages = this.context.validHistory();

        const response = await provider.chat(allMessages, {
          tools: toolRegistry.getAllToolSchemas(),
          toolRegistry,
          onToolCallStart: (tc: ToolCall) => {
            toolCallCount++;
            runRecorder.recordToolStart({
              toolCallId: tc.id,
              toolName: tc.function.name,
              arguments: tc.function.arguments,
            });
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
            } catch {
              // ignore parse errors
            }
            this.sendEvent({
              type: 'tool_start',
              toolName: tc.function.name,
              toolCallId: tc.id,
              summary: buildToolStartSummary(this.locale, tc.function.name, args),
            });
          },
          onToolCallComplete: (tc: ToolCall, result: ToolCallResult) => {
            const status = result.metadata?.status as string | undefined;
            const isSuccess = status === 'success';
            runRecorder.recordToolComplete({
              toolCallId: tc.id,
              toolName: tc.function.name,
              success: isSuccess,
              content: result.content,
              error: typeof result.metadata?.error === 'string' ? result.metadata.error : undefined,
            });
            if (isSuccess) {
              this.sendEvent({
                type: 'tool_done',
                toolCallId: tc.id,
                success: true,
                summary: buildToolDoneSummary(this.locale, tc.function.name),
              });
            } else {
              this.sendEvent({
                type: 'tool_error',
                toolCallId: tc.id,
                error: (result.metadata?.error as string) || result.content,
              });
            }
            // Emit workflow_changed for mutating tools
            if (isSuccess) {
              void this.emitWorkflowChanged(tc.function.name, tc.function.arguments);
            }
          },
        });
        runRecorder.recordLlmCall(response.usage);

        // Check if LLM called tools (provider already executed them)
        if (response.toolCalls && response.toolCalls.length > 0) {
          this.context.addMessageWithTokens(
            {
              role: 'assistant',
              content: response.content || null,
              toolCalls: response.toolCalls,
            },
            response.usage?.promptTokens
          );

          if (response.content) {
            runRecorder.recordAssistantText(response.content);
            this.streamText(response.content);
            this.sendEvent({ type: 'text_done' });
          }

          if (response.toolCallResults) {
            for (const result of response.toolCallResults) {
              this.context.addMessageWithTokens({
                role: 'tool',
                content: result.content,
                toolCallId: result.toolCallId,
              });
            }
          }

          // Compress context if token usage exceeds limit
          if (await this.maybeCompressContext(response.usage?.totalTokens)) {
            runRecorder.recordContextCompression();
          }

          if (this.aborted) break;
          continue;
        }

        // No tool calls — final text response
        if (response.content) {
          this.context.addMessageWithTokens({ role: 'assistant', content: response.content });
          runRecorder.recordAssistantText(response.content);
          this.streamText(response.content);
          this.sendEvent({ type: 'text_done' });
        }

        if (await this.maybeCompressContext(response.usage?.totalTokens)) {
          runRecorder.recordContextCompression();
        }
        break;
      }
    } catch (err) {
      runStatus = 'failed';
      runRecorder.recordError();
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Debug agent error', { templateId: this.templateId, error: errorMessage });
      this.sendEvent({ type: 'error', message: errorMessage });
    } finally {
      if (this.aborted) {
        runStatus = 'aborted';
      }
      this.isProcessing = false;
      this.sendEvent({ type: 'turn_done' });
      await runRecorder.finish(runStatus);
    }
  }

  private async maybeCompressContext(totalTokens: number | undefined): Promise<boolean> {
    if (!totalTokens) return false;
    const compressLimit = LLMProviderFactory.getConfig().compressTokenLimit ?? 90000;
    if (totalTokens > compressLimit) {
      logger.info('Debug agent context compression triggered', {
        templateId: this.templateId,
        totalTokens,
        compressLimit,
      });
      await this.context.compressContext();
      return true;
    }
    return false;
  }

  private streamText(text: string): void {
    const CHUNK_SIZE = 20;
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      this.sendEvent({
        type: 'text_delta',
        content: text.slice(i, i + CHUNK_SIZE),
      });
    }
  }

  private async emitWorkflowChanged(toolName: string, rawArgs: string): Promise<void> {
    if (
      toolName === 'wf_update_node' ||
      toolName === 'wf_patch_node' ||
      toolName === 'wf_replace_node'
    ) {
      let nodeId: string | undefined;
      try {
        const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
        if (typeof parsed.nodeId === 'string') {
          nodeId = parsed.nodeId;
        }
      } catch {
        // ignore parse errors
      }

      let nodeData: WorkflowNodeInfo | undefined;
      if (nodeId) {
        try {
          nodeData = await this.accessor.getNode(nodeId);
        } catch {
          // node not found — send event without data
        }
      }

      this.sendEvent({ type: 'workflow_changed', changeType: 'node_updated', nodeData });

      // Auto-save template to DB so changes persist without manual save
      if (nodeData) {
        await this.autoSaveTemplate(nodeData);
      }
    }
  }

  private async autoSaveTemplate(nodeData: WorkflowNodeInfo): Promise<void> {
    try {
      await templateService.updateTemplate(this.templateId, {
        name: nodeData.name,
        type: nodeData.type,
        config: nodeData.config,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('Auto-save template failed', { templateId: this.templateId, error: msg });
    }
  }
}

/**
 * Factory: loads a custom node template from the DB, builds an in-memory
 * single-node workflow, and returns a DebugAgent ready for conversation.
 */
export async function createDebugAgent(
  templateId: string,
  sendEvent: (event: CopilotServerMessage) => void,
  locale = 'zh-CN'
): Promise<DebugAgent> {
  const template = await templateService.getTemplate(templateId);

  const nodeId = `debug-node-${templateId}`;
  const workflowId = `debug-wf-${templateId}`;

  const node: WorkflowNodeInfo = {
    id: nodeId,
    workflowId,
    name: template.name,
    description: template.description,
    type: template.type,
    config: template.config,
    positionX: 0,
    positionY: 0,
  };

  const workflow: WorkflowDetail = {
    id: workflowId,
    name: `Debug: ${template.name}`,
    description: `Debug workspace for template "${template.name}"`,
    nodes: [node],
    edges: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const accessor = new InMemoryWorkflowAccessor(workflow);

  return new DebugAgent(templateId, accessor, node, sendEvent, locale);
}
