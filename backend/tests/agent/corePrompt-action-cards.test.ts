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
});
