import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../../src/base/config', () => ({
  config: {
    port: 3000,
    env: 'test',
    base_url: '/api',
    log: { dir: 'logs', file: 'test.log', maxFiles: 5, maxSize: '20m' },
    llm: {
      type: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
      baseUrl: 'https://api.openai.com/v1',
    },
    websocket: {
      enabled: true,
      path: '/ws',
      heartbeatInterval: 30000,
      heartbeatTimeout: 30000,
      maxMissedHeartbeats: 3,
    },
    webSearch: { type: 'google', apiKey: 'test-google-key', timeout: 60, numResults: 5 },
  },
}));

vi.mock('../../../../src/globalConfig/globalConfig.service', () => ({
  getWebSearchConfig: () =>
    Promise.resolve({
      type: 'google',
      apiKey: 'test-google-key',
      cx: 'test-cx-id',
      numResults: 5,
      timeout: 60,
    }),
}));

import { createWebSearchProviderFromConfig } from '../../../../src/infrastructure/tools/webSearch';
import type { WebSearchConfigData } from '../../../../src/globalConfig/globalConfig.types';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GoogleSearchProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should make GET request with correct query params', async () => {
    const googleResponse = {
      items: [
        { title: 'Result 1', link: 'https://example.com/1', snippet: 'Snippet 1' },
        { title: 'Result 2', link: 'https://test.org/2', snippet: 'Snippet 2' },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => googleResponse,
    });

    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'test-google-key',
      cx: 'test-cx-id',
      numResults: 5,
      timeout: 60,
    };
    const provider = createWebSearchProviderFromConfig(config);
    const results = await provider.search('test query');

    expect(results).toHaveLength(2);
    expect(results[0]).toBe('Source: https://example.com/1: Title: Result 1 Content: Snippet 1');
    expect(results[1]).toBe('Source: https://test.org/2: Title: Result 2 Content: Snippet 2');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://www.googleapis.com/customsearch/v1');
    expect(url).toContain('key=test-google-key');
    expect(url).toContain('cx=test-cx-id');
    expect(url).toContain('q=test+query');
    expect(url).toContain('num=5');
    expect(options.method).toBe('GET');
  });

  it('should cap num at 10 even if numResults is higher', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'key',
      cx: 'cx-id',
      numResults: 20,
      timeout: 60,
    };
    const provider = createWebSearchProviderFromConfig(config);
    await provider.search('test');

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('num=10');
  });

  it('should return empty array when no items in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'key',
      cx: 'cx-id',
      numResults: 5,
      timeout: 60,
    };
    const provider = createWebSearchProviderFromConfig(config);
    const results = await provider.search('empty query');

    expect(results).toEqual([]);
  });

  it('should handle HTTP error gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'key',
      cx: 'cx-id',
      numResults: 5,
      timeout: 60,
    };
    const provider = createWebSearchProviderFromConfig(config);
    const results = await provider.search('forbidden query');

    expect(results).toEqual([]);
  });

  it('should handle error body in 200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        error: { code: 429, message: 'Rate limit exceeded' },
      }),
    });

    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'key',
      cx: 'cx-id',
      numResults: 5,
      timeout: 60,
    };
    const provider = createWebSearchProviderFromConfig(config);
    const results = await provider.search('rate limited query');

    expect(results).toEqual([]);
  });

  it('should handle timeout gracefully', async () => {
    const abortError = new Error('AbortError');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'key',
      cx: 'cx-id',
      numResults: 5,
      timeout: 60,
    };
    const provider = createWebSearchProviderFromConfig(config);
    const results = await provider.search('timeout query');

    expect(results).toEqual([]);
  });

  it('should throw ToolExecutionError when cx is missing', () => {
    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'key',
      numResults: 5,
      timeout: 60,
    };

    expect(() => createWebSearchProviderFromConfig(config)).toThrow(
      'Google Custom Search requires CX (Search Engine ID)'
    );
  });

  it('searchStructured should return structured results', async () => {
    const googleResponse = {
      items: [{ title: 'Title A', link: 'https://a.com', snippet: 'Snippet A' }],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => googleResponse,
    });

    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'key',
      cx: 'cx-id',
      numResults: 5,
      timeout: 60,
    };
    const provider = createWebSearchProviderFromConfig(config);
    const results = await provider.searchStructured('test');

    expect(results).toEqual([{ title: 'Title A', url: 'https://a.com', snippet: 'Snippet A' }]);
  });
});
