import { describe, expect, it, afterAll } from 'vitest';
import { join } from 'path';
import { config } from '../../src/base/config';
import {
  buildSharedTempWorkdirGuidelines,
  getSharedNodeTypeDescriptions,
  getSharedNodeTypeGuide,
} from '../../src/copilot/nodePromptShared';
import type { ConfigStatusResponse } from '../../src/globalConfig/globalConfig.types';

const ALL_CONFIGURED: ConfigStatusResponse = { llm: true, webSearch: true, smtp: true };
const NONE_CONFIGURED: ConfigStatusResponse = { llm: false, webSearch: false, smtp: false };

describe('nodePromptShared', () => {
  const ORIGINAL_WORK_FOLDER = config.work_folder;
  const TEMP_ROOT = '/tmp/databot-test-workfolder-shared';
  const TEMP_WORKDIR = join(TEMP_ROOT, 'wf_shared123');

  config.work_folder = TEMP_ROOT;

  afterAll(() => {
    config.work_folder = ORIGINAL_WORK_FOLDER;
  });

  it('includes temp path and WORKSPACE guidance in shared temp workdir wording', () => {
    const prompt = buildSharedTempWorkdirGuidelines(TEMP_WORKDIR);

    expect(prompt).toContain(TEMP_WORKDIR);
    expect(prompt).toContain('generated files must be written under this directory');
    expect(prompt).toContain(`Do not write directly under \`${TEMP_ROOT}\``);
    expect(prompt).toContain('WORKSPACE');
    expect(prompt).toContain('node execution temp directory at runtime');
    expect(prompt).toContain('os.path.join(WORKSPACE');
  });

  it('includes large-result file-output wording in the python guide', () => {
    const guide = getSharedNodeTypeGuide('python');

    expect(guide).toContain('small structured outputs may still return directly in `result`');
    expect(guide).toContain('large outputs should prefer files under `WORKSPACE`');
    expect(guide).toContain('when the result can be a file, prefer returning the file path instead of large text');
    expect(guide).toContain('markdownPath');
    expect(guide).toContain('txtPath');
    expect(guide).toContain('jsonPath');
    expect(guide).toContain('csvPath');
    expect(guide).toContain('the final user-facing answer should mention the file path instead of pasting full contents');
  });

  it('builds config-aware node type descriptions with expected sections', () => {
    const allPrompt = getSharedNodeTypeDescriptions(ALL_CONFIGURED);

    expect(allPrompt).toContain('## Node Type Reference');
    expect(allPrompt).toContain('### SQL Query (sql)');
    expect(allPrompt).toContain('### Python Script (python)');
    expect(allPrompt).toContain('### LLM Generation (llm)');
    expect(allPrompt).toContain('### Email Sending (email)');
    expect(allPrompt).toContain('### Branch (branch)');
    expect(allPrompt).toContain('### Web Search (web_search)');

    const nonePrompt = getSharedNodeTypeDescriptions(NONE_CONFIGURED);

    expect(nonePrompt).toContain('### SQL Query (sql)');
    expect(nonePrompt).toContain('### Python Script (python)');
    expect(nonePrompt).toContain('### Branch (branch)');
    expect(nonePrompt).not.toContain('### LLM Generation (llm)');
    expect(nonePrompt).not.toContain('### Email Sending (email)');
    expect(nonePrompt).not.toContain('### Web Search (web_search)');
  });
});
