// backend/src/copilot/copilotAgent.ts
import { join } from 'path';
import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'fs';
import { LLMProviderFactory } from '../infrastructure/llm/factory';
import { ToolCall, ToolCallResult } from '../infrastructure/llm/types';
import { ToolRegistryClass } from '../infrastructure/tools/tools';
import { Context } from '../agent/context';
import logger from '../utils/logger';
import { buildSystemPrompt } from './copilotPrompt';
import { createCopilotToolRegistry } from './copilotTools';
import { getConfigStatus } from '../globalConfig/globalConfig.service';
import { config } from '../base/config';
import * as workflowService from '../workflow/workflow.service';
import {
  CopilotLayoutOwnership,
  CopilotRoundMutationSummary,
  CopilotServerMessage,
  COPILOT_MAX_TOOL_CALLS_PER_TURN,
} from './copilot.types';
import { autoLayout } from '../workflow/layout/autoLayout';
import { NodeConfig, WorkflowDetail } from '../workflow/workflow.types';
import { buildToolStartSummary, buildToolDoneSummary } from './toolSummaries';
import { createAgentRunRecorder, type AgentRunStatus } from '../agentRunEvaluator';

function createTempWorkdir(): string {
  mkdirSync(config.work_folder, { recursive: true });
  return mkdtempSync(join(config.work_folder, 'wf_'));
}

export class CopilotAgent {
  private context: Context;
  private workflowId: string;
  private tempWorkdir: string;
  private locale: string;
  private sendEvent: (event: CopilotServerMessage) => void;
  private hasManualLayoutEdits: boolean;
  private aborted: boolean;
  private isProcessing: boolean;
  private toolRegistry: ToolRegistryClass | undefined;
  private tempWorkdirCleaned: boolean;
  private workflowSnapshotCache: WorkflowDetail | null | undefined = undefined;
  private nodeFailureCounts: Map<string, number> = new Map();

  constructor(
    workflowId: string,
    sendEvent: (event: CopilotServerMessage) => void,
    locale = 'zh-CN'
  ) {
    this.context = new Context();
    this.workflowId = workflowId;
    this.tempWorkdir = createTempWorkdir();
    this.locale = locale;
    this.sendEvent = sendEvent;
    this.hasManualLayoutEdits = false;
    this.aborted = false;
    this.isProcessing = false;
    this.tempWorkdirCleaned = false;
    this.toolRegistry = undefined;
  }

  abort(): void {
    this.aborted = true;
  }

  dispose(): void {
    this.abort();
    if (this.tempWorkdirCleaned) {
      return;
    }

    try {
      if (existsSync(this.tempWorkdir)) {
        rmSync(this.tempWorkdir, { recursive: true, force: true });
      }
      this.tempWorkdirCleaned = true;
    } catch (error) {
      logger.warn('Failed to clean up copilot temp workdir', {
        workflowId: this.workflowId,
        tempWorkdir: this.tempWorkdir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  setHasManualLayoutEdits(hasManualLayoutEdits: boolean): void {
    this.hasManualLayoutEdits = hasManualLayoutEdits;
  }

  async handleUserMessage(content: string): Promise<void> {
    if (this.isProcessing) {
      this.sendEvent({ type: 'error', message: 'Agent is busy processing a previous message' });
      return;
    }
    this.isProcessing = true;
    const runRecorder = createAgentRunRecorder({
      agentType: 'copilot',
      workflowId: this.workflowId,
      userRequest: content,
    });
    let runStatus: AgentRunStatus = 'success';

    // Check if LLM is configured before processing
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
    this.nodeFailureCounts = new Map();

    // Initialize system prompt on first message
    if (this.context.getTotalTokens() === 0) {
      const configStatus = await getConfigStatus();
      const systemPrompt = buildSystemPrompt(configStatus, this.tempWorkdir);
      this.context.addSystemMessage(systemPrompt);

      // Rebuild tool registry with config-aware filtering
      this.toolRegistry = createCopilotToolRegistry(
        this.workflowId,
        (event) => {
          this.sendEvent({ type: 'execution_event', event });
        },
        configStatus,
        this.tempWorkdir
      );
    }

    this.context.addUserMessage(content);

    const provider = LLMProviderFactory.getProvider();
    let toolCallCount = 0;

    try {
      while (true) {
        if (this.aborted) break;
        if (toolCallCount >= COPILOT_MAX_TOOL_CALLS_PER_TURN) {
          runStatus = 'limit_reached';
          runRecorder.markLimitReached();
          logger.warn('Copilot tool call limit reached', {
            workflowId: this.workflowId,
            limit: COPILOT_MAX_TOOL_CALLS_PER_TURN,
          });
          this.sendEvent({
            type: 'error',
            message: `Tool call limit reached (${COPILOT_MAX_TOOL_CALLS_PER_TURN}). Please continue the conversation to proceed.`,
          });
          break;
        }

        const allMessages = this.context.validHistory();
        const roundMutations = this.createRoundMutationSummary();
        const preRoundWorkflow = await this.getWorkflowSnapshot();

        // Call LLM with copilot tool registry + UI callbacks
        const registry = this.toolRegistry!;
        const response = await provider.chat(allMessages, {
          tools: registry.getAllToolSchemas(),
          toolRegistry: registry,
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
            // Track node execution failures and inject hint for repeated failures
            if (tc.function.name === 'wf_execute_node' && !isSuccess) {
              try {
                const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
                const nodeId = args.nodeId as string | undefined;
                if (nodeId) {
                  const count = (this.nodeFailureCounts.get(nodeId) ?? 0) + 1;
                  this.nodeFailureCounts.set(nodeId, count);
                  if (count >= 2) {
                    result.content += `\n\n[Hint: This node has failed ${String(count)} time(s). Consider reviewing the root cause, checking upstream data, or asking the user for guidance before retrying.]`;
                  }
                }
              } catch {
                // ignore parse errors
              }
            }
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
                summary: buildToolDoneSummary(this.locale, tc.function.name, {
                  success: true,
                  data: this.parseToolData(result.content),
                }),
              });
            } else {
              this.sendEvent({
                type: 'tool_error',
                toolCallId: tc.id,
                error: (result.metadata?.error as string) || result.content,
              });
            }
            // Emit workflow_changed and node_config_card for mutating tools
            const toolData = this.parseToolData(result.content);
            this.emitWorkflowChanged(tc.function.name, { success: isSuccess, data: toolData });
            this.emitNodeConfigCard(tc.function.name, { success: isSuccess, data: toolData });
            if (isSuccess) {
              this.recordRoundMutation(roundMutations, tc.function.name, toolData);
            }

            // Forward todos_writer metadata to frontend
            if (tc.function.name === 'todos_writer' && result.metadata?.todos) {
              this.sendEvent({
                type: 'todos_update',
                todos: result.metadata.todos as Array<{
                  content: string;
                  activeForm: string;
                  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
                }>,
                stats: {
                  count: result.metadata.count as number,
                  completed: result.metadata.completed as number,
                  inProgress: result.metadata.inProgress as number,
                  pending: result.metadata.pending as number,
                  cancelled: result.metadata.cancelled as number,
                },
              });
            }
          },
        });
        runRecorder.recordLlmCall(response.usage);

        // Check if LLM called tools (provider already executed them)
        if (response.toolCalls && response.toolCalls.length > 0) {
          // Push assistant message with tool calls to history
          this.context.addMessageWithTokens(
            {
              role: 'assistant',
              content: response.content || null,
              toolCalls: response.toolCalls,
            },
            response.usage?.promptTokens
          );

          // If there was text content before tools, stream it
          if (response.content) {
            runRecorder.recordAssistantText(response.content);
            this.streamText(response.content);
            this.sendEvent({ type: 'text_done' });
          }

          // Push tool results to message history (provider already executed them)
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
          await this.maybeReflowRound(roundMutations, preRoundWorkflow);

          // Check abort after completing this round
          if (this.aborted) break;

          // Continue loop — LLM will process tool results
          continue;
        }

        // No tool calls — this is the final text response
        if (response.content) {
          this.context.addMessageWithTokens({ role: 'assistant', content: response.content });
          runRecorder.recordAssistantText(response.content);
          this.streamText(response.content);
          this.sendEvent({ type: 'text_done' });
        }

        // Compress context if token usage exceeds limit
        if (await this.maybeCompressContext(response.usage?.totalTokens)) {
          runRecorder.recordContextCompression();
        }
        break;
      }
    } catch (err) {
      runStatus = 'failed';
      runRecorder.recordError();
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Copilot agent error', { workflowId: this.workflowId, error: errorMessage });
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
    const compressLimit = LLMProviderFactory.getConfig().compressTokenLimit ?? 60000;
    if (totalTokens > compressLimit) {
      logger.info('Copilot context compression triggered', {
        workflowId: this.workflowId,
        totalTokens,
        compressLimit,
      });
      await this.context.compressContext();
      return true;
    }
    return false;
  }

  /** Try to parse JSON from tool result content string */
  private parseToolData(content: string): unknown {
    try {
      return JSON.parse(content) as unknown;
    } catch {
      return content;
    }
  }

  /** Simulate streaming by sending text in chunks */
  private streamText(text: string): void {
    // Send in reasonable chunks (not char by char — that would be too many events)
    const CHUNK_SIZE = 20;
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      this.sendEvent({
        type: 'text_delta',
        content: text.slice(i, i + CHUNK_SIZE),
      });
    }
  }

  private createRoundMutationSummary(): CopilotRoundMutationSummary {
    return {
      addedNodes: 0,
      deletedNodes: 0,
      addedEdges: 0,
      deletedEdges: 0,
      replacedNodes: 0,
      updatedNodes: 0,
    };
  }

  private recordRoundMutation(
    summary: CopilotRoundMutationSummary,
    toolName: string,
    toolData: unknown
  ): void {
    if (!this.didMutateWorkflow(toolName, toolData)) {
      return;
    }

    if (toolName === 'wf_add_node') {
      summary.addedNodes += 1;
    } else if (toolName === 'wf_delete_node') {
      summary.deletedNodes += 1;
    } else if (toolName === 'wf_connect_nodes') {
      summary.addedEdges += 1;
    } else if (toolName === 'wf_disconnect_nodes') {
      summary.deletedEdges += 1;
    } else if (toolName === 'wf_replace_node') {
      summary.replacedNodes += 1;
    } else if (toolName === 'wf_update_node' || toolName === 'wf_patch_node') {
      summary.updatedNodes += 1;
    }
  }

  private didMutateWorkflow(toolName: string, toolData: unknown): boolean {
    if (toolName === 'wf_connect_nodes') {
      return this.hasTruthyFlag(toolData, 'connected');
    }

    if (toolName === 'wf_disconnect_nodes') {
      return this.hasTruthyFlag(toolData, 'disconnected');
    }

    return (
      toolName === 'wf_add_node' ||
      toolName === 'wf_delete_node' ||
      toolName === 'wf_replace_node' ||
      toolName === 'wf_update_node' ||
      toolName === 'wf_patch_node'
    );
  }

  private hasTruthyFlag(toolData: unknown, key: string): boolean {
    if (!toolData || typeof toolData !== 'object') {
      return false;
    }

    const data = toolData as Record<string, unknown>;
    return data[key] === true;
  }

  private getStructuralChangeCount(summary: CopilotRoundMutationSummary): number {
    return (
      summary.addedNodes +
      summary.deletedNodes +
      summary.addedEdges +
      summary.deletedEdges +
      summary.replacedNodes
    );
  }

  private async getWorkflowSnapshot(): Promise<WorkflowDetail | null> {
    if (this.workflowSnapshotCache !== undefined) {
      return this.workflowSnapshotCache;
    }
    try {
      const workflow = await workflowService.getWorkflow(this.workflowId);
      this.workflowSnapshotCache = workflow;
      return workflow;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Copilot layout ownership detection failed', {
        workflowId: this.workflowId,
        error: message,
      });
      return null;
    }
  }

  private invalidateWorkflowSnapshot(): void {
    this.workflowSnapshotCache = undefined;
  }

  private classifyLayoutOwnership(workflow: WorkflowDetail): CopilotLayoutOwnership {
    if (workflow.nodes.length === 0) {
      return 'copilot';
    }

    let matchedNodes = 0;

    try {
      const layout = autoLayout(workflow.nodes, workflow.edges);
      for (const node of workflow.nodes) {
        const position = layout.positions.get(node.id);
        if (!position) {
          continue;
        }

        if (position.x === node.positionX && position.y === node.positionY) {
          matchedNodes += 1;
        }
      }
    } catch {
      return 'mixed';
    }

    if (matchedNodes === workflow.nodes.length) {
      return 'copilot';
    }

    if (matchedNodes === 0) {
      return 'user';
    }

    return 'mixed';
  }

  private shouldReflowRound(
    summary: CopilotRoundMutationSummary,
    ownership: CopilotLayoutOwnership
  ): boolean {
    const structuralChanges = this.getStructuralChangeCount(summary);

    if (structuralChanges === 0) {
      return false;
    }

    if (ownership === 'copilot') {
      return structuralChanges > 0;
    }

    if (ownership === 'mixed') {
      return structuralChanges >= 2 || summary.replacedNodes > 0;
    }

    return structuralChanges >= 4;
  }

  private resolveLayoutOwnership(workflowSnapshot: WorkflowDetail | null): CopilotLayoutOwnership {
    const ownership = workflowSnapshot ? this.classifyLayoutOwnership(workflowSnapshot) : 'mixed';

    if (!this.hasManualLayoutEdits) {
      return ownership;
    }

    return ownership === 'copilot' ? 'mixed' : 'user';
  }

  private async maybeReflowRound(
    summary: CopilotRoundMutationSummary,
    workflowSnapshot: WorkflowDetail | null
  ): Promise<void> {
    if (this.getStructuralChangeCount(summary) === 0) {
      return;
    }

    const ownership = this.resolveLayoutOwnership(workflowSnapshot);
    if (!this.shouldReflowRound(summary, ownership)) {
      return;
    }

    try {
      await workflowService.reflowWorkflowLayout(this.workflowId);
      this.invalidateWorkflowSnapshot();
      this.sendEvent({ type: 'workflow_changed', changeType: 'node_updated' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Copilot workflow reflow failed', {
        workflowId: this.workflowId,
        ownership,
        summary,
        error: message,
      });
    }
  }

  /** Emit workflow_changed for mutating tools */
  private emitWorkflowChanged(toolName: string, result: { success: boolean; data: unknown }): void {
    if (!result.success) return;
    this.invalidateWorkflowSnapshot();
    if (toolName === 'wf_add_node') {
      const data = result.data as Record<string, unknown> | null;
      this.sendEvent({
        type: 'workflow_changed',
        changeType: 'node_added',
        nodeId: data && typeof data === 'object' && 'id' in data ? String(data.id) : undefined,
      });
    } else if (
      toolName === 'wf_update_node' ||
      toolName === 'wf_patch_node' ||
      toolName === 'wf_replace_node'
    ) {
      this.sendEvent({ type: 'workflow_changed', changeType: 'node_updated' });
    } else if (toolName === 'wf_delete_node') {
      this.sendEvent({ type: 'workflow_changed', changeType: 'node_deleted' });
    } else if (toolName === 'wf_connect_nodes') {
      this.sendEvent({ type: 'workflow_changed', changeType: 'edge_added' });
    } else if (toolName === 'wf_disconnect_nodes') {
      this.sendEvent({ type: 'workflow_changed', changeType: 'edge_deleted' });
    }
  }

  /** Emit node_config_card for node creation/update */
  private emitNodeConfigCard(toolName: string, result: { success: boolean; data: unknown }): void {
    if (!result.success) return;
    if (
      toolName !== 'wf_add_node' &&
      toolName !== 'wf_update_node' &&
      toolName !== 'wf_patch_node' &&
      toolName !== 'wf_replace_node'
    ) {
      return;
    }
    const data = result.data as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') return;
    if ('id' in data && 'name' in data && 'type' in data && 'config' in data) {
      this.sendEvent({
        type: 'node_config_card',
        nodeId: String(data.id),
        nodeName: String(data.name),
        nodeType: String(data.type),
        config: data.config as NodeConfig,
      });
    }
  }
}
