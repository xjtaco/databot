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

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WebFetchTool.execute() - Basic Execution', () => {
  let tool: WebFetchTool;

  beforeEach(() => {
    tool = new WebFetchTool();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch a page and extract article content', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test Article</title></head>
        <body>
          <nav>Navigation</nav>
          <article>
            <h1>Main Title</h1>
            <p>This is the main content paragraph.</p>
          </article>
          <footer>Footer content</footer>
        </body>
      </html>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'text/html; charset=utf-8']]),
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

    const result = await tool.execute({ url: 'https://example.com/article' });

    expect(result.success).toBe(true);
    const data = result.data as {
      title: string;
      url: string;
      content: string;
      hasMore: boolean;
      extractedLinks: Array<{ text: string; url: string }>;
    };
    expect(data.title).toBe('Test Article');
    expect(data.url).toBe('https://example.com/article');
    expect(data.content).toContain('Main Title');
    expect(data.content).toContain('This is the main content paragraph.');
    expect(data.content).not.toContain('Navigation');
    expect(data.content).not.toContain('Footer content');
    expect(data.hasMore).toBe(false);
  });

  it('should fall back to body when no article/main found', async () => {
    const html = `
      <html><head><title>Plain Page</title></head>
      <body><p>Body content here.</p></body></html>
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

    const result = await tool.execute({ url: 'https://example.com/plain' });

    expect(result.success).toBe(true);
    const data = result.data as { content: string; title: string };
    expect(data.title).toBe('Plain Page');
    expect(data.content).toContain('Body content here.');
  });

  it('should convert images to alt text markers', async () => {
    const html = `
      <html><head><title>Image Test</title></head>
      <body>
        <article>
          <p>Before image.</p>
          <img src="pic.jpg" alt="A beautiful sunset" />
          <p>After image.</p>
        </article>
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

    const result = await tool.execute({ url: 'https://example.com/images' });

    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain('[Image: A beautiful sunset]');
  });

  it('should handle Chinese content correctly', async () => {
    const html = `
      <html><head><title>中文标题</title></head>
      <body>
        <article><p>这是一段中文内容。</p></article>
      </body></html>
    `;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'text/html; charset=utf-8']]),
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

    const result = await tool.execute({ url: 'https://example.com/chinese' });

    expect(result.success).toBe(true);
    const data = result.data as { title: string; content: string };
    expect(data.title).toBe('中文标题');
    expect(data.content).toContain('这是一段中文内容。');
  });
});
