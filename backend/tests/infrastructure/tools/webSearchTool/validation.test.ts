import { describe, it, expect, beforeEach, vi } from 'vitest';

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
      timeout: 60000,
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
import { ToolExecutionError } from '../../../../src/errors/types';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WebSearch.validate() - Parameter Validation', () => {
  let webSearch: WebSearch;

  beforeEach(() => {
    webSearch = new WebSearch();
    vi.clearAllMocks();
  });

  it('should accept valid string query', () => {
    // Arrange & Act & Assert
    expect(() => webSearch.validate({ query: 'valid search' })).not.toThrow();
  });

  it('should accept query with spaces', () => {
    // Arrange & Act & Assert
    expect(() => webSearch.validate({ query: 'search with multiple words' })).not.toThrow();
  });

  it('should accept query with special characters', () => {
    // Arrange & Act & Assert
    expect(() => webSearch.validate({ query: 'search @#$%^&*() special' })).not.toThrow();
  });

  it('should accept query with emoji', () => {
    // Arrange & Act & Assert
    expect(() => webSearch.validate({ query: 'search 🔍 test' })).not.toThrow();
  });

  it('should accept query with UTF-8 characters', () => {
    // Arrange & Act & Assert
    expect(() => webSearch.validate({ query: '搜索测试' })).not.toThrow();
  });

  it('should accept query at maximum length (500 characters)', () => {
    // Arrange
    const maxLengthQuery = 'a'.repeat(500);

    // Act & Assert
    expect(() => webSearch.validate({ query: maxLengthQuery })).not.toThrow();
  });

  it('should accept query with leading/trailing whitespace but trim it', () => {
    // Arrange & Act & Assert
    expect(() => webSearch.validate({ query: '  search query  ' })).not.toThrow();
  });

  it('should throw ToolExecutionError when query is not a string', async () => {
    // Arrange & Act & Assert
    await expect(webSearch.execute({ query: 123 } as unknown as { query: string })).rejects.toThrow(
      ToolExecutionError
    );
    await expect(webSearch.execute({ query: 123 } as unknown as { query: string })).rejects.toThrow(
      'Query parameter must be a string'
    );
  });

  it('should throw ToolExecutionError when query is a boolean', async () => {
    // Arrange & Act & Assert
    await expect(
      webSearch.execute({ query: true } as unknown as { query: string })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      webSearch.execute({ query: true } as unknown as { query: string })
    ).rejects.toThrow('Query parameter must be a string');
  });

  it('should throw ToolExecutionError when query is null', async () => {
    // Arrange & Act & Assert
    await expect(
      webSearch.execute({ query: null } as unknown as { query: string })
    ).rejects.toThrow(ToolExecutionError);
  });

  it('should throw ToolExecutionError when query is undefined', async () => {
    // Arrange & Act & Assert
    await expect(webSearch.execute({} as { query: string })).rejects.toThrow(ToolExecutionError);
  });

  it('should throw ToolExecutionError when query is empty string', async () => {
    // Arrange & Act & Assert
    await expect(webSearch.execute({ query: '' })).rejects.toThrow(ToolExecutionError);
    await expect(webSearch.execute({ query: '' })).rejects.toThrow(
      'Query parameter cannot be empty'
    );
  });

  it('should throw ToolExecutionError when query contains only whitespace', async () => {
    // Arrange & Act & Assert
    await expect(webSearch.execute({ query: '   ' })).rejects.toThrow(ToolExecutionError);
    await expect(webSearch.execute({ query: '   ' })).rejects.toThrow(
      'Query parameter cannot be empty'
    );
  });

  it('should throw ToolExecutionError when query exceeds maximum length', async () => {
    // Arrange
    const tooLongQuery = 'a'.repeat(501);

    // Act & Assert
    await expect(webSearch.execute({ query: tooLongQuery })).rejects.toThrow(ToolExecutionError);
    await expect(webSearch.execute({ query: tooLongQuery })).rejects.toThrow(
      'Query parameter exceeds maximum length of 500 characters'
    );
  });

  it('should throw ToolExecutionError when query is an array', async () => {
    // Arrange & Act & Assert
    await expect(
      webSearch.execute({ query: ['search'] } as unknown as { query: string })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      webSearch.execute({ query: ['search'] } as unknown as { query: string })
    ).rejects.toThrow('Query parameter must be a string');
  });

  it('should throw ToolExecutionError when query is an object', async () => {
    // Arrange & Act & Assert
    await expect(
      webSearch.execute({ query: { search: 'query' } } as unknown as { query: string })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      webSearch.execute({ query: { search: 'query' } } as unknown as { query: string })
    ).rejects.toThrow('Query parameter must be a string');
  });

  it('should return true for valid query in validate method', () => {
    // Arrange & Act & Assert
    const result = webSearch.validate({ query: 'valid query' });
    expect(result).toBe(true);
  });
});
