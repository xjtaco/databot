import { describe, it, expect, afterAll } from 'vitest';
import { join } from 'path';
import { buildDebugSystemPrompt } from '../../src/copilot/debugPrompt';
import { config } from '../../src/base/config';
import type { WorkflowNodeInfo } from '../../src/workflow/workflow.types';

describe('buildDebugSystemPrompt', () => {
  const ORIGINAL_WORK_FOLDER = config.work_folder;
  const TEMP_ROOT = '/tmp/databot-test-workfolder-debug';
  const TEMP_WORKDIR = join(TEMP_ROOT, 'wf_debug123');

  config.work_folder = TEMP_ROOT;

  afterAll(() => {
    config.work_folder = ORIGINAL_WORK_FOLDER;
  });

  it('includes the temp workdir and file naming rules', () => {
    const node: WorkflowNodeInfo = {
      id: 'node-1',
      workflowId: 'wf-1',
      name: 'debug_python',
      description: null,
      type: 'python',
      config: {
        nodeType: 'python',
        params: {},
        script: 'result = {}',
        outputVariable: 'result',
      },
      positionX: 0,
      positionY: 0,
    };

    const prompt = buildDebugSystemPrompt(node, TEMP_WORKDIR);

    expect(prompt).toContain(TEMP_WORKDIR);
    expect(prompt).toContain('generated files must be written under this directory');
    expect(prompt).toContain(`Do not write directly under \`${TEMP_ROOT}\``);
    expect(prompt).toContain('short English snake_case filenames');
    expect(prompt).toContain('query_result.csv');
    expect(prompt).toContain('WORKSPACE');
    expect(prompt).toContain('node execution temp directory at runtime');
    expect(prompt).toContain('Small structured outputs can still be returned directly in `result`');
    expect(prompt).toContain('prefer writing files under `WORKSPACE`');
    expect(prompt).toContain('prefer returning a file path');
    expect(prompt).not.toContain('debug workspace');
    expect(prompt).not.toContain('do not assume it is the same');
  });

  it('includes shared Python large-result guidance', () => {
    const node: WorkflowNodeInfo = {
      id: 'node-1',
      workflowId: 'wf-1',
      name: 'debug_python',
      description: null,
      type: 'python',
      config: {
        nodeType: 'python',
        params: {},
        script: 'result = {}',
        outputVariable: 'result',
      },
      positionX: 0,
      positionY: 0,
    };

    const prompt = buildDebugSystemPrompt(node, TEMP_WORKDIR);

    expect(prompt).toContain('Small structured outputs can still be returned directly in `result`');
    expect(prompt).toContain('prefer writing files under `WORKSPACE`');
    expect(prompt).toContain('prefer returning a file path');
    expect(prompt).toContain('final user-facing answer');
  });

  it('retains debug-only Python troubleshooting guidance', () => {
    const node: WorkflowNodeInfo = {
      id: 'node-1',
      workflowId: 'wf-1',
      name: 'debug_python',
      description: null,
      type: 'python',
      config: {
        nodeType: 'python',
        params: {},
        script: 'result = {}',
        outputVariable: 'result',
      },
      positionX: 0,
      positionY: 0,
    };

    const prompt = buildDebugSystemPrompt(node, TEMP_WORKDIR);

    expect(prompt).toContain('**Common issues**');
    expect(prompt).toContain('Missing params');
    expect(prompt).toContain('non-serializable result');
    expect(prompt).toContain('hardcoded absolute paths');
  });

  it('includes shared web search params guidance', () => {
    const node: WorkflowNodeInfo = {
      id: 'node-1',
      workflowId: 'wf-1',
      name: 'debug_search',
      description: null,
      type: 'web_search',
      config: {
        nodeType: 'web_search',
        params: {},
        keywords: '{{query.result.keyword}}',
        outputVariable: 'search_result',
      },
      positionX: 0,
      positionY: 0,
    };

    const prompt = buildDebugSystemPrompt(node, TEMP_WORKDIR);

    expect(prompt).toContain('`params`');
    expect(prompt).toContain('custom text inputs');
    expect(prompt).toContain('supports `{{}}` templates');
  });

  it('retains debug-only web search troubleshooting guidance', () => {
    const node: WorkflowNodeInfo = {
      id: 'node-1',
      workflowId: 'wf-1',
      name: 'debug_search',
      description: null,
      type: 'web_search',
      config: {
        nodeType: 'web_search',
        params: {},
        keywords: '{{query.result.keyword}}',
        outputVariable: 'search_result',
      },
      positionX: 0,
      positionY: 0,
    };

    const prompt = buildDebugSystemPrompt(node, TEMP_WORKDIR);

    expect(prompt).toContain('**Common issues**');
    expect(prompt).toContain('Search engine not configured');
    expect(prompt).toContain('empty keywords');
  });
});
