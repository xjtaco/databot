import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  searchCatalog,
  getCardDefinition,
} from '../../../src/infrastructure/tools/uiActionCardCatalog';
import type { ActionDomain } from '../../../src/infrastructure/tools/uiActionCardTypes';

function requireCardDefinition(cardId: string) {
  const def = getCardDefinition(cardId);
  if (!def) {
    throw new Error(`Expected card definition for ${cardId}`);
  }

  return def;
}

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
    const def = requireCardDefinition('data.datasource_create');
    expect(def.cardId).toBe('data.datasource_create');
    expect(def.domain).toBe('data');
    expect(def.action).toBe('datasource_create');
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
      const def = requireCardDefinition(cardId);
      expect(def.presentationMode).toBe('resource_list');
      expect(def.confirmationMode).toBe('modal');
      expect(def.riskLevel).toBe('danger');
      expect(def.confirmRequired).toBe(true);
      expect(def.requiredParams).toEqual([]);
      expect(def.allowedActions).toEqual([
        { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
      ]);
    }
  });

  it('defines open cards as resource lists without navigation-only presentation', () => {
    expect(requireCardDefinition('workflow.open')).toMatchObject({
      presentationMode: 'resource_list',
      resourceType: 'workflow',
      allowedActions: [
        { key: 'edit', confirmationMode: 'modal' },
        { key: 'execute' },
        { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
      ],
    });

    expect(requireCardDefinition('data.open')).toMatchObject({
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

    expect(requireCardDefinition('knowledge.open')).toMatchObject({
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

    expect(requireCardDefinition('schedule.open')).toMatchObject({
      presentationMode: 'resource_list',
      resourceType: 'schedule',
      allowedActions: [
        { key: 'edit' },
        { key: 'enable' },
        { key: 'disable' },
        { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
      ],
    });

    expect(requireCardDefinition('template.open')).toMatchObject({
      presentationMode: 'resource_list',
      resourceType: 'template',
      allowedActions: [
        { key: 'edit', confirmationMode: 'modal' },
        { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
      ],
    });
  });

  it('omits duplicate workflow template creation cards', () => {
    expect(getCardDefinition('workflow.template_node')).toBeUndefined();
    expect(getCardDefinition('workflow.template_etl')).toBeUndefined();
    expect(getCardDefinition('workflow.template_report')).toBeUndefined();
  });

  it('keeps schedule.create as an inline form with optional defaults', () => {
    const def = requireCardDefinition('schedule.create');
    expect(def.presentationMode).toBe('inline_form');
    expect(def.requiredParams.map((param) => param.name)).not.toContain('workflowId');
    expect(def.requiredParams.map((param) => param.name)).not.toContain('cronExpr');
    expect(def.optionalParams.map((param) => param.name)).toEqual(
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

describe('guidance search terms', () => {
  function searchableText(cardId: string): string {
    const def = requireCardDefinition(cardId);

    return [
      def.description,
      def.usage,
      ...def.requiredParams.map((param) => param.description),
      ...def.optionalParams.map((param) => param.description),
    ]
      .join(' ')
      .toLowerCase();
  }

  function searchCardIds(query: string, options?: Parameters<typeof searchCatalog>[1]): string[] {
    return searchCatalog(query, { ...options, maxResults: 10 }).map((card) => card.cardId);
  }

  it('finds data setup cards through upload, import, connect, and analysis terms', () => {
    expect(searchableText('data.file_upload')).toContain('import');
    expect(searchableText('data.file_upload')).toContain('analysis');
    expect(searchableText('data.datasource_create')).toContain('connect');
    expect(searchCardIds('import analysis', { domain: 'data' })).toContain('data.file_upload');
    expect(searchCardIds('connect analysis', { domain: 'data' })).toContain(
      'data.datasource_create'
    );
  });

  it('describes open cards with browse, list, and manage terms', () => {
    for (const cardId of ['data.open', 'knowledge.open', 'workflow.open']) {
      const text = searchableText(cardId);
      expect(text).toContain('browse');
      expect(text).toContain('list');
      expect(text).toContain('manage');
    }
  });

  it('finds workflow and schedule cards through report and recurring guidance terms', () => {
    expect(searchableText('workflow.copilot_create')).toContain('business goal');
    expect(searchableText('workflow.copilot_create')).toContain('dashboard');
    expect(searchableText('workflow.copilot_create')).toContain('report');
    expect(searchableText('schedule.create')).toContain('recurring');
    expect(searchCardIds('business goal', { domain: 'workflow' })[0]).toBe(
      'workflow.copilot_create'
    );
    expect(searchCardIds('dashboard recurring report', { domain: 'workflow' })[0]).toBe(
      'workflow.copilot_create'
    );
    expect(searchCardIds('recurring report', { domain: 'schedule' })).toContain('schedule.create');
  });

  it('finds template copilot creation as reusable workflow or custom node setup', () => {
    const text = searchableText('template.copilot_create');
    expect(text).toContain('reusable workflow');
    expect(searchCardIds('reusable workflow template', { domain: 'template' })[0]).toBe(
      'template.copilot_create'
    );
    expect(searchCardIds('custom node', { domain: 'template' })[0]).toBe('template.copilot_create');
  });

  it('finds the template list card through browse, list, and manage terms', () => {
    const text = searchableText('template.open');
    expect(text).toContain('browse');
    expect(text).toContain('list');
    expect(text).toContain('manage');
    expect(searchCardIds('list node templates', { domain: 'template' })[0]).toBe('template.open');
    expect(searchCardIds('manage custom node templates', { domain: 'template' })).toContain(
      'template.open'
    );
  });
});
