import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Extract the CORE_PROMPT template literal from the source file.
 * The prompt is defined as: const CORE_PROMPT = `...` as const;
 * We look for the string between the first backtick after `CORE_PROMPT =`
 * and the closing backtick before ` as const;`.
 */
function extractCorePrompt(source: string): string {
  const marker = 'const CORE_PROMPT = `';
  const startIdx = source.indexOf(marker);
  if (startIdx === -1) throw new Error('CORE_PROMPT not found');
  const contentStart = startIdx + marker.length;

  // Find the closing backtick followed by ` as const;`
  const endMarker = '` as const;';
  const endIdx = source.indexOf(endMarker, contentStart);
  if (endIdx === -1) throw new Error('CORE_PROMPT closing not found');

  return source.slice(contentStart, endIdx);
}

describe('CORE_PROMPT action card rules', () => {
  const sourcePath = path.resolve(__dirname, '../../src/agent/coreAgentSession.ts');
  const source = fs.readFileSync(sourcePath, 'utf-8');
  const corePrompt = extractCorePrompt(source);

  it('contains search_ui_action_card tool reference in CORE_PROMPT', () => {
    // The prompt uses template expression ${ToolName.SearchUiActionCard}
    expect(corePrompt).toContain('SearchUiActionCard');
  });

  it('contains show_ui_action_card tool reference in CORE_PROMPT', () => {
    // The prompt uses template expression ${ToolName.ShowUiActionCard}
    expect(corePrompt).toContain('ShowUiActionCard');
  });

  it('mentions confirmation rules in CORE_PROMPT', () => {
    expect(corePrompt).toContain('confirm');
  });

  it('explicitly requires action cards for uploading data files', () => {
    expect(corePrompt).toContain('upload');
    expect(corePrompt).toContain('CSV');
    expect(corePrompt).toContain('regex');
  });

  it('references workflow (Copilot card preference) in CORE_PROMPT', () => {
    expect(corePrompt).toContain('workflow');
  });

  it('contains the Operation Cards section heading', () => {
    expect(corePrompt).toContain('## Operation Cards');
  });

  it('mentions copilot_create for workflows', () => {
    expect(corePrompt).toContain('copilot_create');
  });

  it('defines request routing between analysis, system operations, and help', () => {
    expect(corePrompt).toContain('## Request Routing');
    expect(corePrompt).toContain('Data analysis route');
    expect(corePrompt).toContain('System operation route');
    expect(corePrompt).toContain('Help route');
  });

  it('asks for data location before showing cards for unclear analysis requests', () => {
    expect(corePrompt).toContain('If the user asks for analysis but the data source is unclear');
    expect(corePrompt).toContain('ask where the data is located');
    expect(corePrompt).toContain('do not immediately show upload or datasource cards');
  });

  it('requires operation cards for concrete system operation intents', () => {
    expect(corePrompt).toContain('upload or import data files');
    expect(corePrompt).toContain('create or test datasources');
    expect(corePrompt).toContain('open, browse, list, or manage');
    expect(corePrompt).toContain('create workflows, templates, or schedules');
  });

  it('states action cards are proposals and not completed operations', () => {
    expect(corePrompt).toContain('Action cards propose frontend actions');
    expect(corePrompt).toContain('Do not claim that the operation has executed');
  });

  it('requires clear targets before destructive action cards', () => {
    expect(corePrompt).toContain('For destructive or high-risk actions');
    expect(corePrompt).toContain('ask for the target before showing the card');
  });

  it('requires clear user keywords to prefill every resource list card search box', () => {
    expect(corePrompt).toContain('resource_list');
    expect(corePrompt).toContain('clear filter keyword');
    expect(corePrompt).toContain('params.query');
    expect(corePrompt).toContain('search box is prefilled');
  });
});
