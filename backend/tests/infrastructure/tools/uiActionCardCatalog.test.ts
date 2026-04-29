import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  searchCatalog,
  getCardDefinition,
} from '../../../src/infrastructure/tools/uiActionCardCatalog';
import type { ActionDomain } from '../../../src/infrastructure/tools/uiActionCardTypes';

describe('searchCatalog', () => {
  it('returns cards matching a query string', () => {
    const results = searchCatalog('create datasource');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.cardId === 'data.datasource_create')).toBe(true);
  });

  it('returns cards filtered by domain', () => {
    const results = searchCatalog('folder', { domain: 'knowledge' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.domain === 'knowledge')).toBe(true);
  });

  it('returns empty for query matching nothing', () => {
    const results = searchCatalog('xyz_nonexistent_query_abc');
    expect(results).toEqual([]);
  });

  it('does not return the full catalog for a broad single-word query', () => {
    const results = searchCatalog('open');
    expect(results.length).toBeLessThan(10);
  });
});

describe('getCardDefinition', () => {
  it('returns the definition for a valid cardId', () => {
    const def = getCardDefinition('data.datasource_create');
    expect(def).toBeDefined();
    expect(def!.cardId).toBe('data.datasource_create');
    expect(def!.domain).toBe('data');
    expect(def!.action).toBe('datasource_create');
  });

  it('returns undefined for an unknown cardId', () => {
    const def = getCardDefinition('nonexistent.card');
    expect(def).toBeUndefined();
  });

  it('returns definitions across all domains', () => {
    const domains: ActionDomain[] = ['data', 'knowledge', 'schedule', 'workflow', 'template'];
    for (const domain of domains) {
      const results = searchCatalog('', { domain });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.domain === domain)).toBe(true);
    }
  });

  it('includes direct delete cards that require modal confirmation', () => {
    const cardIds = [
      'workflow.delete',
      'data.datasource_delete',
      'data.table_delete',
      'knowledge.folder_delete',
      'knowledge.file_delete',
      'schedule.delete',
      'template.delete',
    ];

    for (const cardId of cardIds) {
      const def = getCardDefinition(cardId);
      expect(def).toBeDefined();
      expect(def!.presentationMode).toBe('resource_list');
      expect(def!.confirmationMode).toBe('modal');
      expect(def!.riskLevel).toBe('danger');
      expect(def!.confirmRequired).toBe(true);
      expect(def!.requiredParams).toEqual([]);
      expect(def!.allowedActions).toEqual([
        { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
      ]);
    }
  });

  it('defines open cards as resource lists without navigation-only presentation', () => {
    expect(getCardDefinition('workflow.open')).toMatchObject({
      presentationMode: 'resource_list',
      resourceType: 'workflow',
      allowedActions: [
        { key: 'edit' },
        { key: 'execute' },
        { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
      ],
    });

    expect(getCardDefinition('data.open')).toMatchObject({
      presentationMode: 'resource_list',
      resourceSections: [
        {
          resourceType: 'datasource',
          titleKey: 'chat.actionCards.resource.datasource.sectionTitle',
          emptyKey: 'chat.actionCards.resource.datasource.empty',
          allowedActions: [{ key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
        },
        {
          resourceType: 'table',
          titleKey: 'chat.actionCards.resource.table.sectionTitle',
          emptyKey: 'chat.actionCards.resource.table.empty',
          allowedActions: [
            { key: 'view' },
            { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
          ],
        },
      ],
    });

    expect(getCardDefinition('knowledge.open')).toMatchObject({
      presentationMode: 'resource_list',
      resourceSections: [
        {
          resourceType: 'knowledge_folder',
          allowedActions: [{ key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
        },
        {
          resourceType: 'knowledge_file',
          allowedActions: [
            { key: 'view' },
            { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
          ],
        },
      ],
    });

    expect(getCardDefinition('schedule.open')).toMatchObject({
      presentationMode: 'resource_list',
      resourceType: 'schedule',
      allowedActions: [
        { key: 'edit' },
        { key: 'enable' },
        { key: 'disable' },
        { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
      ],
    });
  });

  it('keeps schedule.create as an inline form with optional defaults', () => {
    const def = getCardDefinition('schedule.create');
    expect(def).toBeDefined();
    expect(def!.presentationMode).toBe('inline_form');
    expect(def!.requiredParams.map((param) => param.name)).not.toContain('workflowId');
    expect(def!.requiredParams.map((param) => param.name)).not.toContain('cronExpr');
    expect(def!.optionalParams.map((param) => param.name)).toEqual(
      expect.arrayContaining([
        'workflowName',
        'workflowQuery',
        'scheduleType',
        'cronExpr',
        'time',
        'timezone',
        'enabled',
        'name',
        'description',
      ])
    );
  });
});
