import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the config module before importing anything else
vi.mock('../../../../src/base/config', () => ({
  config: {
    port: 3000,
    env: 'test',
    base_url: '/api',
    log: {
      dir: 'logs',
      file: 'test.log',
      maxFiles: 5,
      maxSize: '20m',
    },
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
    webSearch: {
      type: 'ali_iqs',
      apiKey: 'test-api-key',
      baseUrl: 'https://test-api.example.com/search',
      timeout: 60,
      sslVerify: true,
      numResults: 10,
    },
  },
}));

// Mock globalConfig service to avoid DB access
vi.mock('../../../../src/globalConfig/globalConfig.service', () => ({
  getWebSearchConfig: () =>
    Promise.resolve({
      type: 'ali_iqs',
      apiKey: 'test-api-key',
      numResults: 10,
      timeout: 60,
    }),
}));

import { WebSearch } from '../../../../src/infrastructure/tools/webSearch';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WebSearch.execute() - Success Cases', () => {
  let webSearch: WebSearch;

  beforeEach(() => {
    webSearch = new WebSearch();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully execute web search and return results', async () => {
    // Arrange
    const mockResponse = {
      pageItems: [
        {
          hostname: 'example.com',
          summary: 'Test search result summary 1',
          url: 'https://example.com/1',
          title: 'Test Title 1',
        },
        {
          hostname: 'test.org',
          summary: 'Test search result summary 2',
          url: 'https://test.org/2',
          title: 'Test Title 2',
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Act
    const result = await webSearch.execute({
      query: 'test search query',
    });

    // Assert
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/search'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        }),
      })
    );

    const data = result.data as string[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
    expect(data[0]).toContain('example.com');
    expect(data[0]).toContain('Test search result summary 1');
    expect(data[1]).toContain('test.org');
    expect(data[1]).toContain('Test search result summary 2');

    expect(result.metadata).toBeDefined();
    const metadata = result.metadata as {
      parameters: { query: string };
      resultCount: number;
      timestamp: string;
    };
    expect(metadata.parameters.query).toBe('test search query');
    expect(metadata.resultCount).toBe(2);
    expect(metadata.timestamp).toBeDefined();
  });

  it('should handle empty search results gracefully', async () => {
    // Arrange
    const mockResponse = {
      pageItems: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Act
    const result = await webSearch.execute({
      query: 'empty results query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(0);
    expect(result.metadata?.resultCount).toBe(0);
  });

  it('should handle search response without pageItems', async () => {
    // Arrange
    const mockResponse = {};

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Act
    const result = await webSearch.execute({
      query: 'no pageItems query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(0);
    expect(result.metadata?.resultCount).toBe(0);
  });

  it('should format search results correctly with Chinese labels', async () => {
    // Arrange
    const mockResponse = {
      pageItems: [
        {
          hostname: 'baidu.com',
          summary: '百度搜索结果摘要',
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Act
    const result = await webSearch.execute({
      query: '中文搜索查询',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data[0]).toBe('Source: baidu.com: Content: 百度搜索结果摘要');
  });

  it('should handle large number of search results', async () => {
    // Arrange
    const mockItems = Array.from({ length: 50 }, (_, i) => ({
      hostname: `site${i}.com`,
      summary: `Summary ${i}`,
    }));

    const mockResponse = {
      pageItems: mockItems,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Act
    const result = await webSearch.execute({
      query: 'large results query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(50);
    expect(result.metadata?.resultCount).toBe(50);
  });

  it('should handle special characters in search query', async () => {
    // Arrange
    const mockResponse = {
      pageItems: [
        {
          hostname: 'special.com',
          summary: 'Special characters result: @#$%^&*()',
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Act
    const result = await webSearch.execute({
      query: 'special chars: @#$%^&*()',
    });

    // Assert
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('@#$%^&*()'),
      })
    );
  });

  it('should handle UTF-8 encoded search query', async () => {
    // Arrange
    const mockResponse = {
      pageItems: [
        {
          hostname: 'unicode.com',
          summary: 'Unicode test: 你好 🌍',
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Act
    const result = await webSearch.execute({
      query: 'search: 你好 🌍',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data[0]).toContain('你好');
  });

  it('should include optional fields in results when available', async () => {
    // Arrange
    const mockResponse = {
      pageItems: [
        {
          hostname: 'fullinfo.com',
          summary: 'Complete info',
          url: 'https://fullinfo.com/page',
          title: 'Full Info Title',
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Act
    const result = await webSearch.execute({
      query: 'complete info query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data[0]).toContain('fullinfo.com');
    expect(data[0]).toContain('Complete info');
  });
});
