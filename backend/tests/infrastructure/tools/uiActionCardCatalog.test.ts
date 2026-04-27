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
});
