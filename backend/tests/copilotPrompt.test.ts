import { describe, it, expect, afterAll } from 'vitest';
import { join } from 'path';
import { buildSystemPrompt } from '../src/copilot/copilotPrompt';
import { config } from '../src/base/config';
import type { ConfigStatusResponse } from '../src/globalConfig/globalConfig.types';

const ALL_CONFIGURED: ConfigStatusResponse = { llm: true, webSearch: true, smtp: true };
const NONE_CONFIGURED: ConfigStatusResponse = { llm: false, webSearch: false, smtp: false };

describe('buildSystemPrompt', () => {
  const ORIGINAL_WORK_FOLDER = config.work_folder;
  const TEMP_ROOT = '/tmp/databot-test-workfolder-prompt';
  const TEMP_WORKDIR = join(TEMP_ROOT, 'wf_test123');

  config.work_folder = TEMP_ROOT;

  afterAll(() => {
    config.work_folder = ORIGINAL_WORK_FOLDER;
  });

  // New config-filtering tests:
  it('should include all node types when all configured', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);
    expect(prompt).toContain('### LLM Generation (llm)');
    expect(prompt).toContain('### Email Sending (email)');
    expect(prompt).toContain('### Web Search (web_search)');
    expect(prompt).toContain('### SQL Query (sql)');
    expect(prompt).toContain('### Python Script (python)');
    expect(prompt).toContain('### Branch (branch)');
  });

  it('should exclude LLM section when llm is not configured', () => {
    const prompt = buildSystemPrompt({ ...ALL_CONFIGURED, llm: false }, TEMP_WORKDIR);
    expect(prompt).not.toContain('### LLM Generation (llm)');
    expect(prompt).toContain('### SQL Query (sql)');
    expect(prompt).toContain('### Python Script (python)');
  });

  it('should exclude Email section when smtp is not configured', () => {
    const prompt = buildSystemPrompt({ ...ALL_CONFIGURED, smtp: false }, TEMP_WORKDIR);
    expect(prompt).not.toContain('### Email Sending (email)');
    expect(prompt).toContain('### SQL Query (sql)');
  });

  it('should exclude Web Search section when webSearch is not configured', () => {
    const prompt = buildSystemPrompt({ ...ALL_CONFIGURED, webSearch: false }, TEMP_WORKDIR);
    expect(prompt).not.toContain('### Web Search (web_search)');
    expect(prompt).toContain('### SQL Query (sql)');
  });

  it('should exclude web_search from information gathering tools when webSearch not configured', () => {
    const prompt = buildSystemPrompt({ ...ALL_CONFIGURED, webSearch: false }, TEMP_WORKDIR);
    expect(prompt).not.toContain('- web_search: Search external resources');
  });

  it('should include web_search in information gathering tools when webSearch is configured', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);
    expect(prompt).toContain('- web_search: Search external resources');
  });

  it('should exclude all optional sections when none configured', () => {
    const prompt = buildSystemPrompt(NONE_CONFIGURED, TEMP_WORKDIR);
    expect(prompt).not.toContain('### LLM Generation (llm)');
    expect(prompt).not.toContain('### Email Sending (email)');
    expect(prompt).not.toContain('### Web Search (web_search)');
    expect(prompt).toContain('### SQL Query (sql)');
    expect(prompt).toContain('### Python Script (python)');
    expect(prompt).toContain('### Branch (branch)');
  });

  it('should always include Role section', () => {
    const prompt = buildSystemPrompt(NONE_CONFIGURED, TEMP_WORKDIR);
    expect(prompt).toContain('## Role');
  });

  it('should always include auto-fix instructions', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);
    expect(prompt).toContain('## Auto-Fix Mode');
  });

  // Preserved existing tests (updated for 2-arg signature):
  it('includes role description', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);
    expect(prompt).toContain('data workflow builder assistant');
  });

  it('includes output_schema for each node type', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);
    expect(prompt).toContain('csvPath');
    expect(prompt).toContain('stderr');
    expect(prompt).toContain('rawResponse');
  });

  it('includes template syntax documentation with examples', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);
    expect(prompt).toContain('{{');
    expect(prompt).toContain('Template Syntax Reference');
    expect(prompt).toContain('{{analysis.summary}}');
    expect(prompt).toContain('Nested paths supported');
  });

  it('instructs Copilot to inspect templateFields after workflow tool results', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);

    expect(prompt).toContain('templateFields.fields');
    expect(prompt).toContain('nodeTemplateFields[].fields');
    expect(prompt).toContain('do not reference fields that are absent from templateFields.fields');
  });

  it('instructs Copilot to fix upstream nodes when workflow results need it', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);

    expect(prompt).toContain('needsUpstreamFix: true');
    expect(prompt).toContain('fix and re-run the upstream node before creating/modifying downstream templates');
  });

  it('documents flattened Python and LLM result field references without result prefix', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);

    expect(prompt).toContain('Prefer outputVariable references');
    expect(prompt).toContain('{{analysis.summary}}');
    expect(prompt).toContain('{{summary.answer}}');
    expect(prompt).toContain('do not write `.result` for Python or LLM result fields');
    expect(prompt).not.toContain('{{python_result.result.status}}');
  });

  it('does not include conditional error handling instructions', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);
    expect(prompt).not.toContain('wait for user confirmation');
  });

  it('includes WORKSPACE variable guidance for Python nodes', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);
    expect(prompt).toContain('WORKSPACE');
    expect(prompt).toContain('os.path.join(WORKSPACE');
    expect(prompt).toContain(TEMP_WORKDIR);
    expect(prompt).toContain('generated files must be written under this directory');
    expect(prompt).toContain(`Do not write directly under \`${TEMP_ROOT}\``);
    expect(prompt).toContain('short English snake_case filenames');
    expect(prompt).toContain('query_result.csv');
    expect(prompt).toContain('node execution temp directory at runtime');
    expect(prompt).toContain('Small structured outputs can still be returned directly in `result`');
    expect(prompt).toContain('prefer writing files under `WORKSPACE`');
    expect(prompt).toContain('prefer returning a file path');
    expect(prompt).not.toContain('agent temp directory');
    expect(prompt).not.toContain('do not assume it is the same');
  });

  it('includes large-result file guidance for Python nodes', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);
    expect(prompt).toContain('Small structured outputs can still be returned directly in `result`');
    expect(prompt).toContain('prefer writing files under `WORKSPACE`');
    expect(prompt).toContain('prefer returning a file path');
    expect(prompt).toContain('final user-facing answer');
  });

  it('contains branch node description', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);
    expect(prompt).toContain('branch');
  });

  it('does not inject separators inside shared node guide bodies', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);
    expect(prompt).toContain('## Node Type Reference\n\n### SQL Query (sql)');
    expect(prompt).not.toContain('### SQL Query (sql)\n\n---\n\n- **Description**');
    expect(prompt).not.toContain('### Branch (branch)\n\n---\n\nConditional branch node');
  });

  it('mentions sourceHandle for branch connections', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED, TEMP_WORKDIR);
    expect(prompt).toContain('sourceHandle');
  });
});
