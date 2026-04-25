import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { config } from '../src/base/config';
import { createAgentRunRecorder } from '../src/agentRunEvaluator';

describe('AgentRunEvaluator', () => {
  const originalLogDir = config.log.dir;
  const logDir = join(tmpdir(), 'databot-agent-run-evaluator-test');

  beforeEach(() => {
    config.log.dir = logDir;
    if (existsSync(logDir)) {
      rmSync(logDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    config.log.dir = originalLogDir;
    if (existsSync(logDir)) {
      rmSync(logDir, { recursive: true, force: true });
    }
  });

  it('writes a sanitized run summary without raw tool arguments or content', async () => {
    const recorder = createAgentRunRecorder({
      agentType: 'copilot',
      runId: 'run-001',
      sessionId: 'session-001',
      workflowId: 'workflow-001',
      userRequest: '分析销售数据',
    });

    recorder.recordLlmCall({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    recorder.recordAssistantText('完成');
    recorder.recordToolStart({
      toolCallId: 'tool-001',
      toolName: 'sql',
      arguments: '{"password":"secret","sql":"select * from users"}',
    });
    recorder.recordToolComplete({
      toolCallId: 'tool-001',
      toolName: 'sql',
      success: true,
      content: 'sensitive row data',
    });

    const summary = await recorder.finish('success');

    expect(summary.metrics.llmCalls).toBe(1);
    expect(summary.metrics.toolCalls).toBe(1);
    expect(summary.metrics.failedToolCalls).toBe(0);
    expect(summary.filePath).toContain('agent-runs');

    const saved = readFileSync(summary.filePath, 'utf-8');
    expect(saved).toContain('"agentType": "copilot"');
    expect(saved).toContain('"argumentKeys"');
    expect(saved).not.toContain('secret');
    expect(saved).not.toContain('select * from users');
    expect(saved).not.toContain('sensitive row data');
  });

  it('flags repeated tool calls and failed tool calls', async () => {
    const recorder = createAgentRunRecorder({
      agentType: 'core',
      runId: 'run-002',
      sessionId: 'session-002',
      userRequest: '查一下订单',
    });

    for (const toolCallId of ['tool-001', 'tool-002']) {
      recorder.recordToolStart({
        toolCallId,
        toolName: 'grep',
        arguments: '{"pattern":"orders"}',
      });
      recorder.recordToolComplete({
        toolCallId,
        toolName: 'grep',
        success: toolCallId === 'tool-001',
        error: toolCallId === 'tool-002' ? 'grep failed' : undefined,
      });
    }

    const summary = await recorder.finish('failed');

    expect(summary.metrics.toolCalls).toBe(2);
    expect(summary.metrics.failedToolCalls).toBe(1);
    expect(summary.issues.map((issue) => issue.type)).toContain('failed_tool_call');
    expect(summary.issues.map((issue) => issue.type)).toContain('repeated_tool_call');
  });
});
