import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from '../../../src/infrastructure/tools/tools';
import { ToolName } from '../../../src/infrastructure/tools/types';
import { SearchUiActionCardTool } from '../../../src/infrastructure/tools/searchUiActionCardTool';

// Mock logger module
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('SearchUiActionCardTool', () => {
  beforeEach(() => {
    // Clear all registered tools from ToolRegistry before each test
    const toolNames = ToolRegistry.list();
    toolNames.forEach((name: string) => {
      (ToolRegistry as unknown as { tools: Map<string, unknown> }).tools.delete(name);
    });

    // Re-register the tool under test
    ToolRegistry.register(new SearchUiActionCardTool());
  });

  it('is registered in ToolRegistry with correct name', () => {
    expect(ToolRegistry.has(ToolName.SearchUiActionCard)).toBe(true);
  });

  it('returns relevant cards for query "create datasource"', async () => {
    const tool = ToolRegistry.get(ToolName.SearchUiActionCard);
    const result = await tool.execute({ query: 'create datasource' });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    const cards = result.data as Array<{ cardId: string }>;
    expect(cards.some((c) => c.cardId === 'data.datasource_create')).toBe(true);
  });

  it('supports regex search for upload file intent', async () => {
    const tool = ToolRegistry.get(ToolName.SearchUiActionCard);
    const result = await tool.execute({
      query: 'upload|csv|excel|sqlite|file',
      queryMode: 'regex',
      domain: 'data',
    });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    const cards = result.data as Array<{ cardId: string }>;
    expect(cards[0]?.cardId).toBe('data.file_upload');
  });

  it('fails for invalid regex search query', async () => {
    const tool = ToolRegistry.get(ToolName.SearchUiActionCard);
    const result = await tool.execute({ query: '[', queryMode: 'regex' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid regex');
  });

  it('returns cards filtered by domain "knowledge" for query "folder"', async () => {
    const tool = ToolRegistry.get(ToolName.SearchUiActionCard);
    const result = await tool.execute({ query: 'folder', domain: 'knowledge' });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    const cards = result.data as Array<{ domain: string }>;
    expect(cards.every((c) => c.domain === 'knowledge')).toBe(true);
  });

  it('returns empty array for no-match query', async () => {
    const tool = ToolRegistry.get(ToolName.SearchUiActionCard);
    const result = await tool.execute({ query: 'xyz_nonexistent_query_abc' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('fails when query is missing', async () => {
    const tool = ToolRegistry.get(ToolName.SearchUiActionCard);
    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
