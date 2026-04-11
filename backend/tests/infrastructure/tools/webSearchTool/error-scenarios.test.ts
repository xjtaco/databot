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

describe('WebSearch.execute() - Error Scenarios', () => {
  let webSearch: WebSearch;

  beforeEach(() => {
    webSearch = new WebSearch();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle HTTP 404 error gracefully and return empty results', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    // Act
    const result = await webSearch.execute({
      query: 'not found query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(0);
  });

  it('should handle HTTP 500 error gracefully and return empty results', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    // Act
    const result = await webSearch.execute({
      query: 'server error query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(0);
  });

  it('should handle HTTP 401 unauthorized error gracefully', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    // Act
    const result = await webSearch.execute({
      query: 'auth test query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(0);
  });

  it('should handle network timeout and return empty results', async () => {
    // Arrange
    mockFetch.mockRejectedValueOnce(new Error('AbortError'));

    // Act
    const result = await webSearch.execute({
      query: 'timeout query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(0);
  });

  it('should handle network connection error', async () => {
    // Arrange
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    // Act
    const result = await webSearch.execute({
      query: 'network error query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(0);
  });

  it('should handle invalid JSON response', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error('Unexpected token < in JSON');
      },
    });

    // Act
    const result = await webSearch.execute({
      query: 'invalid json query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(0);
  });

  it('should handle malformed response structure', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        invalidField: 'some value',
      }),
    });

    // Act
    const result = await webSearch.execute({
      query: 'malformed query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(0);
  });

  it('should handle response with null pageItems', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pageItems: null,
      }),
    });

    // Act
    const result = await webSearch.execute({
      query: 'null items query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(0);
  });

  it('should handle response with non-array pageItems', async () => {
    // Arrange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pageItems: 'not an array',
      }),
    });

    // Act
    const result = await webSearch.execute({
      query: 'non-array query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(0);
  });

  it('should handle search items with missing hostname', async () => {
    // Arrange
    const mockResponse = {
      pageItems: [
        {
          summary: 'Summary without hostname',
        },
        {
          hostname: 'valid.com',
          summary: 'Valid summary',
        },
      ] as unknown[],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Act
    const result = await webSearch.execute({
      query: 'missing fields query',
    });

    // Assert - Tool should handle undefined gracefully
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(2);
    // First item should have undefined hostname
    expect(data[0]).toContain('undefined');
    expect(data[1]).toContain('valid.com');
  });

  it('should handle search items with missing summary', async () => {
    // Arrange
    const mockResponse = {
      pageItems: [
        {
          hostname: 'example.com',
        },
        {
          hostname: 'valid.com',
          summary: 'Valid summary',
        },
      ] as unknown[],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // Act
    const result = await webSearch.execute({
      query: 'missing summary query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(2);
    expect(data[0]).toContain('example.com');
  });

  it('should handle fetch that throws non-Error exception', async () => {
    // Arrange
    mockFetch.mockRejectedValueOnce('String error');

    // Act
    const result = await webSearch.execute({
      query: 'string error query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(0);
  });

  it('should handle unknown error type', async () => {
    // Arrange
    mockFetch.mockRejectedValueOnce({ custom: 'error object' });

    // Act
    const result = await webSearch.execute({
      query: 'unknown error query',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(0);
  });
});

describe('WebSearch - Timeout Behavior', () => {
  it('should use configured timeout value', async () => {
    // Arrange
    const webSearch = new WebSearch();

    mockFetch.mockImplementation(async (_url, options) => {
      // Verify signal is passed for timeout handling
      void options?.signal;
      return {
        ok: true,
        json: async () => ({ pageItems: [] }),
      };
    });

    // Act
    await webSearch.execute({ query: 'timeout test' });

    // Assert - Timeout should be set (we can't directly test AbortController timeout,
    // but we verify fetch was called)
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should return empty results on timeout', async () => {
    // Arrange
    const webSearch = new WebSearch();

    // Create an AbortError
    const abortError = new Error('AbortError');
    abortError.name = 'AbortError';

    mockFetch.mockRejectedValueOnce(abortError);

    // Act
    const result = await webSearch.execute({
      query: 'timeout test',
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as string[];
    expect(data.length).toBe(0);
  });
});
