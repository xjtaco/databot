import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from '../../../src/infrastructure/tools/tools';
import { ToolName } from '../../../src/infrastructure/tools/types';
import { ShowUiActionCardTool } from '../../../src/infrastructure/tools/showUiActionCardTool';
import type { UiActionCardPayload } from '../../../src/infrastructure/tools/uiActionCardTypes';

// Mock logger module
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock crypto.randomUUID to return a stable value for testing
vi.mock('crypto', () => ({
  ...vi.importActual('crypto'),
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}));

describe('ShowUiActionCardTool', () => {
  beforeEach(() => {
    // Clear all registered tools from ToolRegistry before each test
    const toolNames = ToolRegistry.list();
    toolNames.forEach((name: string) => {
      (ToolRegistry as unknown as { tools: Map<string, unknown> }).tools.delete(name);
    });

    // Re-register the tool under test
    ToolRegistry.register(new ShowUiActionCardTool());
  });

  it('is registered in ToolRegistry with correct name', () => {
    expect(ToolRegistry.has(ToolName.ShowUiActionCard)).toBe(true);
  });

  it('returns success with correct cardPayload for valid cardId "data.open"', async () => {
    const tool = ToolRegistry.get(ToolName.ShowUiActionCard);
    const result = await tool.execute({ cardId: 'data.open' });

    expect(result.success).toBe(true);
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.status).toBe('success');

    const cardPayload = result.metadata?.cardPayload as UiActionCardPayload;
    expect(cardPayload).toBeDefined();
    expect(cardPayload.id).toBe('test-uuid-1234');
    expect(cardPayload.cardId).toBe('data.open');
    expect(cardPayload.domain).toBe('data');
    expect(cardPayload.action).toBe('open');
    expect(cardPayload.riskLevel).toBe('low');
    expect(cardPayload.executionMode).toBe('frontend');
    expect(cardPayload.title).toBe('Open Data Panel');
  });

  it('returns failure for unknown cardId "nonexistent.card"', async () => {
    const tool = ToolRegistry.get(ToolName.ShowUiActionCard);
    const result = await tool.execute({ cardId: 'nonexistent.card' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown card');
  });

  it('returns failure when cardId is missing', async () => {
    const tool = ToolRegistry.get(ToolName.ShowUiActionCard);
    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('cardId is required');
  });

  it('passes params through to cardPayload', async () => {
    const tool = ToolRegistry.get(ToolName.ShowUiActionCard);
    const result = await tool.execute({
      cardId: 'data.datasource_test',
      params: { datasourceId: 'test-id-123' },
    });

    expect(result.success).toBe(true);

    const cardPayload = result.metadata?.cardPayload as UiActionCardPayload;
    expect(cardPayload.params.datasourceId).toBe('test-id-123');
  });

  it('masks sensitive params in payload', async () => {
    const tool = ToolRegistry.get(ToolName.ShowUiActionCard);
    const result = await tool.execute({
      cardId: 'data.datasource_create',
      params: {
        name: 'my-db',
        type: 'mysql',
        host: '192.168.1.100',
        port: 3306,
        database: 'mydb',
        username: 'admin',
        password: 'super-secret-password',
      },
    });

    expect(result.success).toBe(true);

    const cardPayload = result.metadata?.cardPayload as UiActionCardPayload;
    // Sensitive fields should be masked
    expect(cardPayload.params.host).toBe('******');
    expect(cardPayload.params.port).toBe('******');
    expect(cardPayload.params.database).toBe('******');
    expect(cardPayload.params.username).toBe('******');
    expect(cardPayload.params.password).toBe('******');
    // Non-sensitive fields should be preserved
    expect(cardPayload.params.name).toBe('my-db');
    expect(cardPayload.params.type).toBe('mysql');
  });

  it('includes copilotPrompt in payload when provided', async () => {
    const tool = ToolRegistry.get(ToolName.ShowUiActionCard);
    const result = await tool.execute({
      cardId: 'workflow.copilot_create',
      params: {
        copilotPrompt: 'Create a daily ETL workflow',
      },
    });

    expect(result.success).toBe(true);

    const cardPayload = result.metadata?.cardPayload as UiActionCardPayload;
    expect(cardPayload.copilotPrompt).toBe('Create a daily ETL workflow');
  });
});
