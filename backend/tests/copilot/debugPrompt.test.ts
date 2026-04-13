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
    expect(prompt).toContain('large outputs should prefer files under `WORKSPACE`');
    expect(prompt).toContain('when the result can be a file, prefer returning the file path instead of large text');
    expect(prompt).not.toContain('debug workspace');
    expect(prompt).not.toContain('do not assume it is the same');
  });
});
