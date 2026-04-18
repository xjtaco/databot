import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock config before importing anything that depends on it
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
  },
}));

import { WebFetchTool } from '../../../../src/infrastructure/tools/webFetch';

describe('WebFetchTool.validate()', () => {
  let tool: WebFetchTool;

  beforeEach(() => {
    tool = new WebFetchTool();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reject missing url', () => {
    expect(() => tool.validate({})).toThrow('url is required');
  });

  it('should reject empty string url', () => {
    expect(() => tool.validate({ url: '' })).toThrow('url is required');
  });

  it('should reject whitespace-only url', () => {
    expect(() => tool.validate({ url: '   ' })).toThrow('url is required');
  });

  it('should reject non-string url', () => {
    expect(() => tool.validate({ url: 123 })).toThrow('url is required');
  });

  it('should reject invalid URL format', () => {
    expect(() => tool.validate({ url: 'not-a-url' })).toThrow('Invalid URL');
  });

  it('should accept valid http URL', () => {
    expect(() => tool.validate({ url: 'http://example.com/page' })).not.toThrow();
  });

  it('should accept valid https URL', () => {
    expect(() => tool.validate({ url: 'https://example.com/page' })).not.toThrow();
  });
});
