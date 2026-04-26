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

    // First call: succeeds with content
    recorder.recordToolStart({
      toolCallId: 'tool-001',
      toolName: 'grep',
      arguments: '{"pattern":"orders"}',
    });
    recorder.recordToolComplete({
      toolCallId: 'tool-001',
      toolName: 'grep',
      success: true,
      content: 'orders.csv\norders_summary.csv',
    });

    // Second call: same args, same result → truly repeated
    recorder.recordToolStart({
      toolCallId: 'tool-002',
      toolName: 'grep',
      arguments: '{"pattern":"orders"}',
    });
    recorder.recordToolComplete({
      toolCallId: 'tool-002',
      toolName: 'grep',
      success: false,
      content: 'orders.csv\norders_summary.csv',
      error: 'grep failed',
    });

    const summary = await recorder.finish('failed');

    expect(summary.metrics.toolCalls).toBe(2);
    expect(summary.metrics.failedToolCalls).toBe(1);
    expect(summary.issues.map((issue) => issue.type)).toContain('failed_tool_call');
    expect(summary.issues.map((issue) => issue.type)).toContain('repeated_tool_call');
    // Verify resultHash is recorded
    expect(summary.tools[0].resultHash).toBe(summary.tools[1].resultHash);
  });

  it('does not flag repeated tool calls when result changes between calls', async () => {
    const recorder = createAgentRunRecorder({
      agentType: 'copilot',
      runId: 'run-003',
      workflowId: 'wf-001',
      userRequest: '构建工作流',
    });

    // First call returns 2 nodes
    recorder.recordToolStart({ toolCallId: 't1', toolName: 'wf_get_summary', arguments: '{}' });
    recorder.recordToolComplete({
      toolCallId: 't1',
      toolName: 'wf_get_summary',
      success: true,
      content: '{"nodes":[{"id":"n1"},{"id":"n2"}]}',
    });

    // Mutation between calls
    recorder.recordToolStart({
      toolCallId: 't2',
      toolName: 'wf_add_node',
      arguments: '{"name":"new_node","type":"sql"}',
    });
    recorder.recordToolComplete({
      toolCallId: 't2',
      toolName: 'wf_add_node',
      success: true,
      content: '{"id":"n3","name":"new_node"}',
    });

    // Second call returns 3 nodes (different result after mutation)
    recorder.recordToolStart({ toolCallId: 't3', toolName: 'wf_get_summary', arguments: '{}' });
    recorder.recordToolComplete({
      toolCallId: 't3',
      toolName: 'wf_get_summary',
      success: true,
      content: '{"nodes":[{"id":"n1"},{"id":"n2"},{"id":"n3"}]}',
    });

    const summary = await recorder.finish('success');

    // No repeated_tool_call issue: same args but different result after a mutation
    expect(summary.issues.map((issue) => issue.type)).not.toContain('repeated_tool_call');
  });
});
