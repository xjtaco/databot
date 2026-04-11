import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../src/copilot/copilotPrompt';
import type { ConfigStatusResponse } from '../src/globalConfig/globalConfig.types';

const ALL_CONFIGURED: ConfigStatusResponse = { llm: true, webSearch: true, smtp: true };
const NONE_CONFIGURED: ConfigStatusResponse = { llm: false, webSearch: false, smtp: false };

describe('buildSystemPrompt', () => {
  // New config-filtering tests:
  it('should include all node types when all configured', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED);
    expect(prompt).toContain('### LLM Generation (llm)');
    expect(prompt).toContain('### Email Sending (email)');
    expect(prompt).toContain('### Web Search (web_search)');
    expect(prompt).toContain('### SQL Query (sql)');
    expect(prompt).toContain('### Python Script (python)');
    expect(prompt).toContain('### Branch (branch)');
  });

  it('should exclude LLM section when llm is not configured', () => {
    const prompt = buildSystemPrompt({ ...ALL_CONFIGURED, llm: false });
    expect(prompt).not.toContain('### LLM Generation (llm)');
    expect(prompt).toContain('### SQL Query (sql)');
    expect(prompt).toContain('### Python Script (python)');
  });

  it('should exclude Email section when smtp is not configured', () => {
    const prompt = buildSystemPrompt({ ...ALL_CONFIGURED, smtp: false });
    expect(prompt).not.toContain('### Email Sending (email)');
    expect(prompt).toContain('### SQL Query (sql)');
  });

  it('should exclude Web Search section when webSearch is not configured', () => {
    const prompt = buildSystemPrompt({ ...ALL_CONFIGURED, webSearch: false });
    expect(prompt).not.toContain('### Web Search (web_search)');
    expect(prompt).toContain('### SQL Query (sql)');
  });

  it('should exclude web_search from information gathering tools when webSearch not configured', () => {
    const prompt = buildSystemPrompt({ ...ALL_CONFIGURED, webSearch: false });
    expect(prompt).not.toContain('- web_search: Search external resources');
  });

  it('should include web_search in information gathering tools when webSearch is configured', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED);
    expect(prompt).toContain('- web_search: Search external resources');
  });

  it('should exclude all optional sections when none configured', () => {
    const prompt = buildSystemPrompt(NONE_CONFIGURED);
    expect(prompt).not.toContain('### LLM Generation (llm)');
    expect(prompt).not.toContain('### Email Sending (email)');
    expect(prompt).not.toContain('### Web Search (web_search)');
    expect(prompt).toContain('### SQL Query (sql)');
    expect(prompt).toContain('### Python Script (python)');
    expect(prompt).toContain('### Branch (branch)');
  });

  it('should always include Role section', () => {
    const prompt = buildSystemPrompt(NONE_CONFIGURED);
    expect(prompt).toContain('## Role');
  });

  it('should always include auto-fix instructions', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED);
    expect(prompt).toContain('## Auto-Fix Mode');
  });

  // Preserved existing tests (updated for 2-arg signature):
  it('includes role description', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED);
    expect(prompt).toContain('data workflow builder assistant');
  });

  it('includes output_schema for each node type', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED);
    expect(prompt).toContain('csvPath');
    expect(prompt).toContain('stderr');
    expect(prompt).toContain('rawResponse');
  });

  it('includes template syntax documentation with examples', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED);
    expect(prompt).toContain('{{');
    expect(prompt).toContain('Template Syntax Reference');
    expect(prompt).toContain('{{analysis.result}}');
    expect(prompt).toContain('Nested paths supported');
  });

  it('does not include conditional error handling instructions', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED);
    expect(prompt).not.toContain('wait for user confirmation');
  });

  it('includes WORKSPACE variable guidance for Python nodes', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED);
    expect(prompt).toContain('WORKSPACE');
    expect(prompt).toContain('os.path.join(WORKSPACE');
  });

  it('contains branch node description', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED);
    expect(prompt).toContain('branch');
  });

  it('mentions sourceHandle for branch connections', () => {
    const prompt = buildSystemPrompt(ALL_CONFIGURED);
    expect(prompt).toContain('sourceHandle');
  });
});
