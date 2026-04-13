import { describe, expect, it } from 'vitest';
import type { ConfigStatusResponse } from '../../src/globalConfig/globalConfig.types';
import {
  buildSharedTempWorkdirGuidelines,
  getSharedNodeTypeDescriptions,
  getSharedNodeTypeGuide,
} from '../../src/copilot/nodePromptShared';

const ALL_CONFIGURED: ConfigStatusResponse = { llm: true, webSearch: true, smtp: true };

describe('nodePromptShared', () => {
  it('builds shared temp workdir guidance', () => {
    const text = buildSharedTempWorkdirGuidelines('/tmp/work/wf_123');

    expect(text).toContain('/tmp/work/wf_123');
    expect(text).toContain('generated files must be written under this directory');
    expect(text).toContain('WORKSPACE');
    expect(text).toContain('Do not write directly under `/tmp/work`');
    expect(text).toContain('query_result.csv');
  });

  it('includes large-result file output guidance in the python node guide', () => {
    const text = getSharedNodeTypeGuide('python');

    expect(text).toContain('Small structured outputs can still be returned directly in `result`');
    expect(text).toContain('prefer writing files under `WORKSPACE`');
    expect(text).toContain('prefer returning a file path');
    expect(text).toContain('final user-facing answer');
  });

  it('documents params in the web search node guide', () => {
    const text = getSharedNodeTypeGuide('web_search');

    expect(text).toContain('`params`');
    expect(text).toContain('custom text inputs');
    expect(text).toContain('supports `{{}}` templates');
  });

  it('builds config-aware multi-node descriptions', () => {
    const text = getSharedNodeTypeDescriptions(ALL_CONFIGURED);

    expect(text).toContain('### SQL Query (sql)');
    expect(text).toContain('### Python Script (python)');
    expect(text).toContain('### LLM Generation (llm)');
    expect(text).toContain('### Email Sending (email)');
    expect(text).toContain('### Branch (branch)');
    expect(text).toContain('### Web Search (web_search)');
  });

  it('omits optional node types when config is unavailable', () => {
    const text = getSharedNodeTypeDescriptions({ llm: false, webSearch: false, smtp: false });

    expect(text).toContain('### SQL Query (sql)');
    expect(text).toContain('### Python Script (python)');
    expect(text).toContain('### Branch (branch)');
    expect(text).not.toContain('### LLM Generation (llm)');
    expect(text).not.toContain('### Email Sending (email)');
    expect(text).not.toContain('### Web Search (web_search)');
  });

  it('returns a fallback guide for unknown node types', () => {
    const text = getSharedNodeTypeGuide('unknown_type');

    expect(text).toContain('No specific guide available for node type "unknown_type".');
  });
});
