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

  it('describes navigation, resource management, and guided setup intents', () => {
    const tool = ToolRegistry.get(ToolName.SearchUiActionCard);

    expect(tool.description).toContain('navigation');
    expect(tool.description).toContain('browse');
    expect(tool.description).toContain('resource management');
    expect(tool.description).toContain('guided setup');
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

  it('returns presentation and i18n metadata for every catalog result', async () => {
    const tool = ToolRegistry.get(ToolName.SearchUiActionCard);
    const result = await tool.execute({
      query: '.*',
      queryMode: 'regex',
      maxResults: 100,
    });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);

    const cards = result.data as Array<{
      presentationMode?: string;
      confirmationMode?: string;
      titleKey?: string;
      summaryKey?: string;
    }>;
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.presentationMode).toBeTruthy();
      expect(card.confirmationMode).toBeTruthy();
      expect(card.titleKey).toBeTruthy();
      expect(card.summaryKey).toBeTruthy();
    }
  });

  it('returns resource-list metadata for list and delete cards', async () => {
    const tool = ToolRegistry.get(ToolName.SearchUiActionCard);
    const result = await tool.execute({
      query: 'workflow.delete|data.open',
      queryMode: 'regex',
      maxResults: 10,
    });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);

    const cards = result.data as Array<{
      cardId: string;
      presentationMode?: string;
      resourceType?: string;
      resourceSections?: unknown[];
      allowedActions?: unknown[];
      confirmationMode?: string;
    }>;
    const workflowDelete = cards.find((card) => card.cardId === 'workflow.delete');
    const dataOpen = cards.find((card) => card.cardId === 'data.open');

    expect(workflowDelete).toMatchObject({
      presentationMode: 'resource_list',
      confirmationMode: 'modal',
      resourceType: 'workflow',
      allowedActions: [{ key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
    });
    expect(dataOpen).toMatchObject({
      presentationMode: 'resource_list',
      resourceSections: expect.any(Array),
    });
  });

  it('returns template.open for node template list intent', async () => {
    const tool = ToolRegistry.get(ToolName.SearchUiActionCard);
    const result = await tool.execute({
      query: 'list node templates',
      domain: 'template',
      maxResults: 5,
    });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);

    const cards = result.data as Array<{
      cardId: string;
      presentationMode?: string;
      resourceType?: string;
      allowedActions?: unknown[];
    }>;
    expect(cards[0]).toMatchObject({
      cardId: 'template.open',
      presentationMode: 'resource_list',
      resourceType: 'template',
      allowedActions: [
        { key: 'edit' },
        { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
      ],
    });
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
