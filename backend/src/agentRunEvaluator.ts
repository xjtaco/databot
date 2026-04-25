import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { config } from './base/config';
import logger from './utils/logger';

export type AgentType = 'core' | 'copilot' | 'debug';
export type AgentRunStatus = 'success' | 'failed' | 'aborted' | 'limit_reached' | 'config_missing';
export type AgentRunIssueSeverity = 'low' | 'medium' | 'high';

export interface AgentRunRecorderInput {
  agentType: AgentType;
  runId?: string;
  sessionId?: string;
  workflowId?: string;
  templateId?: string;
  userRequest?: string;
}

export interface AgentToolStartInput {
  toolCallId: string;
  toolName: string;
  arguments?: string;
}

export interface AgentToolCompleteInput {
  toolCallId: string;
  toolName: string;
  success: boolean;
  content?: string;
  error?: string;
}

export interface AgentTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AgentRunIssue {
  type:
    | 'failed_tool_call'
    | 'repeated_tool_call'
    | 'tool_limit_reached'
    | 'high_tool_count'
    | 'high_llm_call_count'
    | 'context_compressed'
    | 'empty_response';
  severity: AgentRunIssueSeverity;
  evidence: string;
  suggestion: string;
}

export interface AgentRunMetrics {
  llmCalls: number;
  toolCalls: number;
  failedToolCalls: number;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  assistantTextLength: number;
  contextCompressions: number;
}

export interface AgentRunSummary {
  schemaVersion: 1;
  runId: string;
  agentType: AgentType;
  sessionId?: string;
  workflowId?: string;
  templateId?: string;
  status: AgentRunStatus;
  startedAt: string;
  endedAt: string;
  metrics: AgentRunMetrics;
  request: {
    length: number;
    sha256: string | null;
  };
  tools: AgentToolSummary[];
  issues: AgentRunIssue[];
  improvements: string[];
  filePath: string;
}

interface AgentToolSummary {
  toolCallId: string;
  toolName: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  success?: boolean;
  argumentKeys: string[];
  argumentHash: string | null;
  contentLength?: number;
  errorType?: string;
  errorMessageLength?: number;
}

interface MutableToolSummary extends AgentToolSummary {
  startTimeMs: number;
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeUsage(
  usage: AgentTokenUsage | Record<string, unknown> | undefined
): AgentTokenUsage {
  if (!usage) {
    return {};
  }

  const usageRecord = usage as Record<string, unknown>;
  const promptTokens =
    typeof usage.promptTokens === 'number'
      ? usage.promptTokens
      : typeof usageRecord.prompt_tokens === 'number'
        ? usageRecord.prompt_tokens
        : undefined;
  const completionTokens =
    typeof usage.completionTokens === 'number'
      ? usage.completionTokens
      : typeof usageRecord.completion_tokens === 'number'
        ? usageRecord.completion_tokens
        : undefined;
  const totalTokens =
    typeof usage.totalTokens === 'number'
      ? usage.totalTokens
      : typeof usageRecord.total_tokens === 'number'
        ? usageRecord.total_tokens
        : undefined;

  return { promptTokens, completionTokens, totalTokens };
}

function parseArgumentKeys(rawArguments: string | undefined): string[] {
  if (!rawArguments) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawArguments) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [];
    }

    return Object.keys(parsed).sort();
  } catch {
    return [];
  }
}

function getErrorType(error: string | undefined): string | undefined {
  if (!error) {
    return undefined;
  }

  const trimmed = error.trim();
  if (!trimmed) {
    return undefined;
  }

  const colonIndex = trimmed.indexOf(':');
  if (colonIndex > 0 && colonIndex <= 80) {
    return trimmed.slice(0, colonIndex);
  }

  return trimmed.split(/\s+/)[0]?.slice(0, 80);
}

function buildLogFilePath(agentType: AgentType, runId: string, startedAt: Date): string {
  const day = startedAt.toISOString().slice(0, 10);
  const dir = join(config.log.dir, 'agent-runs', day);
  return join(dir, `${startedAt.toISOString().replace(/[:.]/g, '-')}-${agentType}-${runId}.json`);
}

export class AgentRunRecorder {
  private readonly input: Required<Pick<AgentRunRecorderInput, 'agentType'>> &
    Omit<AgentRunRecorderInput, 'agentType'>;
  private readonly startedAt: Date;
  private readonly startedTimeMs: number;
  private readonly tools: MutableToolSummary[];
  private readonly metrics: Omit<AgentRunMetrics, 'durationMs'>;
  private limitReached: boolean;
  private sawError: boolean;

  constructor(input: AgentRunRecorderInput) {
    this.input = {
      ...input,
      agentType: input.agentType,
      runId: input.runId ?? randomUUID(),
    };
    this.startedAt = new Date();
    this.startedTimeMs = Date.now();
    this.tools = [];
    this.limitReached = false;
    this.sawError = false;
    this.metrics = {
      llmCalls: 0,
      toolCalls: 0,
      failedToolCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      assistantTextLength: 0,
      contextCompressions: 0,
    };
  }

  recordLlmCall(usage?: AgentTokenUsage | Record<string, unknown>): void {
    const normalized = normalizeUsage(usage);
    this.metrics.llmCalls += 1;
    this.metrics.promptTokens += normalized.promptTokens ?? 0;
    this.metrics.completionTokens += normalized.completionTokens ?? 0;
    this.metrics.totalTokens += normalized.totalTokens ?? 0;
  }

  recordAssistantText(content: string | undefined): void {
    this.metrics.assistantTextLength += content?.length ?? 0;
  }

  recordToolStart(input: AgentToolStartInput): void {
    const now = new Date();
    this.metrics.toolCalls += 1;
    this.tools.push({
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      startedAt: now.toISOString(),
      startTimeMs: Date.now(),
      argumentKeys: parseArgumentKeys(input.arguments),
      argumentHash: input.arguments ? hashText(input.arguments) : null,
    });
  }

  recordToolComplete(input: AgentToolCompleteInput): void {
    const tool = this.tools.find((item) => item.toolCallId === input.toolCallId);
    const now = new Date();
    if (!input.success) {
      this.metrics.failedToolCalls += 1;
      this.sawError = true;
    }

    if (!tool) {
      return;
    }

    tool.endedAt = now.toISOString();
    tool.durationMs = Date.now() - tool.startTimeMs;
    tool.success = input.success;
    tool.contentLength = input.content?.length ?? 0;
    tool.errorType = getErrorType(input.error);
    tool.errorMessageLength = input.error?.length;
  }

  recordError(): void {
    this.sawError = true;
  }

  recordContextCompression(): void {
    this.metrics.contextCompressions += 1;
  }

  markLimitReached(): void {
    this.limitReached = true;
  }

  async finish(status?: AgentRunStatus): Promise<AgentRunSummary> {
    const endedAt = new Date();
    const resolvedStatus = status ?? this.resolveStatus();
    const filePath = buildLogFilePath(
      this.input.agentType,
      this.input.runId ?? randomUUID(),
      this.startedAt
    );
    const metrics: AgentRunMetrics = {
      ...this.metrics,
      durationMs: Date.now() - this.startedTimeMs,
    };
    const issues = this.evaluateIssues(resolvedStatus, metrics);
    const summary: AgentRunSummary = {
      schemaVersion: 1,
      runId: this.input.runId ?? randomUUID(),
      agentType: this.input.agentType,
      sessionId: this.input.sessionId,
      workflowId: this.input.workflowId,
      templateId: this.input.templateId,
      status: resolvedStatus,
      startedAt: this.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      metrics,
      request: {
        length: this.input.userRequest?.length ?? 0,
        sha256: this.input.userRequest ? hashText(this.input.userRequest) : null,
      },
      tools: this.tools.map((tool) => ({
        toolCallId: tool.toolCallId,
        toolName: tool.toolName,
        startedAt: tool.startedAt,
        endedAt: tool.endedAt,
        durationMs: tool.durationMs,
        success: tool.success,
        argumentKeys: tool.argumentKeys,
        argumentHash: tool.argumentHash,
        contentLength: tool.contentLength,
        errorType: tool.errorType,
        errorMessageLength: tool.errorMessageLength,
      })),
      issues,
      improvements: issues.map((issue) => issue.suggestion),
      filePath,
    };

    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
    } catch (error) {
      logger.warn('Failed to write agent run summary', {
        agentType: this.input.agentType,
        runId: this.input.runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return summary;
  }

  private resolveStatus(): AgentRunStatus {
    if (this.limitReached) {
      return 'limit_reached';
    }

    if (this.sawError) {
      return 'failed';
    }

    return 'success';
  }

  private evaluateIssues(status: AgentRunStatus, metrics: AgentRunMetrics): AgentRunIssue[] {
    const issues: AgentRunIssue[] = [];

    if (status === 'limit_reached') {
      issues.push({
        type: 'tool_limit_reached',
        severity: 'high',
        evidence: 'The agent reached the configured tool call limit before finishing the turn.',
        suggestion:
          'Break large tasks into smaller turns or add stronger planning before tool use.',
      });
    }

    if (metrics.failedToolCalls > 0) {
      issues.push({
        type: 'failed_tool_call',
        severity: 'medium',
        evidence: `${String(metrics.failedToolCalls)} tool call(s) failed in this run.`,
        suggestion:
          'Inspect failed tool types and add pre-validation or clearer tool descriptions.',
      });
    }

    const repeated = this.findRepeatedToolCalls();
    if (repeated.length > 0) {
      issues.push({
        type: 'repeated_tool_call',
        severity: 'medium',
        evidence: `Repeated tool calls detected: ${repeated.join(', ')}.`,
        suggestion:
          'Cache stable observations within a turn and avoid re-reading unchanged context.',
      });
    }

    if (metrics.toolCalls > 30) {
      issues.push({
        type: 'high_tool_count',
        severity: 'medium',
        evidence: `The run used ${String(metrics.toolCalls)} tool calls.`,
        suggestion:
          'Prefer broader discovery calls and summarize intermediate observations before continuing.',
      });
    }

    if (metrics.llmCalls > 8) {
      issues.push({
        type: 'high_llm_call_count',
        severity: 'low',
        evidence: `The run used ${String(metrics.llmCalls)} LLM calls.`,
        suggestion:
          'Review whether tool results can be batched or whether the prompt should constrain loops.',
      });
    }

    if (metrics.contextCompressions > 0) {
      issues.push({
        type: 'context_compressed',
        severity: 'low',
        evidence: `Context compression ran ${String(metrics.contextCompressions)} time(s).`,
        suggestion: 'Reduce verbose tool outputs and keep only durable observations in context.',
      });
    }

    if (metrics.assistantTextLength === 0 && metrics.toolCalls === 0 && status === 'success') {
      issues.push({
        type: 'empty_response',
        severity: 'medium',
        evidence: 'The run finished successfully without assistant text or tool calls.',
        suggestion: 'Ensure the provider finish reason and empty responses are handled explicitly.',
      });
    }

    return issues;
  }

  private findRepeatedToolCalls(): string[] {
    const counts = new Map<string, number>();
    for (const tool of this.tools) {
      const key = `${tool.toolName}:${tool.argumentHash ?? 'no-args'}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([key, count]) => `${key} x${String(count)}`);
  }
}

export function createAgentRunRecorder(input: AgentRunRecorderInput): AgentRunRecorder {
  return new AgentRunRecorder(input);
}
