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
import { ToolExecutionError } from '../../../../src/errors/types';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WebFetchTool.execute() - Error Scenarios', () => {
  let tool: WebFetchTool;

  beforeEach(() => {
    tool = new WebFetchTool();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should error on private/loopback URL (127.0.0.1)', async () => {
    try {
      await tool.execute({ url: 'http://127.0.0.1/admin' });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolExecutionError);
      expect((error as Error).message).toContain('private or internal network');
    }
  });

  it('should error on HTTP 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Map([['content-type', 'text/html']]),
    });

    try {
      await tool.execute({ url: 'https://example.com/not-found' });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolExecutionError);
      expect((error as Error).message).toContain('HTTP 404');
    }
  });

  it('should error on HTTP 500', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Map([['content-type', 'text/html']]),
    });

    try {
      await tool.execute({ url: 'https://example.com/server-error' });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolExecutionError);
      expect((error as Error).message).toContain('HTTP 500');
    }
  });

  it('should error on non-HTML content type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      arrayBuffer: async () => new ArrayBuffer(10),
    });

    try {
      await tool.execute({ url: 'https://example.com/data.json' });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolExecutionError);
      expect((error as Error).message).toContain('non-HTML content');
    }
  });

  it('should error on empty content after filtering', async () => {
    const html = `
      <html><head><title>Empty Page</title></head><body>
        <nav>Nav only</nav>
        <footer>Footer only</footer>
        <script>var x = 1;</script>
        <style>body { color: red; }</style>
      </body></html>
    `;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'text/html']]),
      arrayBuffer: async () => {
        const buf = Buffer.from(html, 'utf-8');
        const ab = new ArrayBuffer(buf.length);
        const view = new Uint8Array(ab);
        for (let i = 0; i < buf.length; i++) {
          view[i] = buf[i];
        }
        return ab;
      },
    });

    try {
      await tool.execute({ url: 'https://example.com/empty' });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolExecutionError);
      expect((error as Error).message).toContain('Page content is empty or could not be extracted');
    }
  });

  it('should error on network timeout (AbortError)', async () => {
    const abortError = new globalThis.DOMException('The operation was aborted', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortError);

    try {
      await tool.execute({ url: 'https://example.com/timeout' });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolExecutionError);
      expect((error as Error).message).toContain('Request timeout');
    }
  });

  it('should error on fetch failure (ECONNREFUSED)', async () => {
    const connError = new TypeError('fetch failed');
    (connError as TypeError & { cause?: Error }).cause = new Error(
      'connect ECONNREFUSED 127.0.0.1:443'
    );
    mockFetch.mockRejectedValueOnce(connError);

    try {
      await tool.execute({ url: 'https://example.com/refused' });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolExecutionError);
      expect((error as Error).message).toContain('Failed to fetch page');
    }
  });

  it('should error on missing content-type header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map<string, string>(),
      arrayBuffer: async () => new ArrayBuffer(10),
    });

    try {
      await tool.execute({ url: 'https://example.com/no-ct' });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolExecutionError);
      expect((error as Error).message).toContain('non-HTML content');
    }
  });

  it('should error on ftp:// URL via execute()', async () => {
    try {
      await tool.execute({ url: 'ftp://example.com/file' });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolExecutionError);
      expect((error as Error).message).toContain('URL must use http or https protocol');
    }
  });
});
