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

function mockHtmlResponse(html: string) {
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
}

function generateLongContent(charCount: number): string {
  const sentence = 'This is a sentence of content used for testing the chunking behavior of the WebFetch tool. ';
  const repeated = sentence.repeat(Math.ceil(charCount / sentence.length));
  return repeated.slice(0, charCount);
}

describe('WebFetchTool.execute() - Chunking', () => {
  let tool: WebFetchTool;

  beforeEach(() => {
    tool = new WebFetchTool();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return hasMore=true when content exceeds maxChars', async () => {
    const longText = generateLongContent(200);
    const html = `
      <html><head><title>Long Content</title></head><body>
        <article><p>${longText}</p></article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/long', maxChars: 100 });
    const data = result.data as { hasMore: boolean; content: string };

    expect(data.hasMore).toBe(true);
    expect(data.content).toContain('(truncated...)');
  });

  it('should return hasMore=false when content fits in one chunk', async () => {
    const html = `
      <html><head><title>Short Content</title></head><body>
        <article>
          <p>This is a short article content paragraph that fits within the default maxChars limit easily without any truncation needed.</p>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/short' });
    const data = result.data as { hasMore: boolean; content: string };

    expect(data.hasMore).toBe(false);
    expect(data.content).not.toContain('(truncated...)');
  });

  it('should return second chunk with offset', async () => {
    const longText = generateLongContent(200);
    const html = `
      <html><head><title>Chunked Content</title></head><body>
        <article><p>${longText}</p></article>
      </body></html>
    `;
    // First call gets chunk 1
    mockHtmlResponse(html);
    const result1 = await tool.execute({ url: 'https://example.com/chunked', maxChars: 100 });
    const data1 = result1.data as { hasMore: boolean; nextOffset: number; content: string };

    expect(data1.hasMore).toBe(true);
    const firstChunk = data1.content.replace('(truncated...)', '').trim();
    expect(firstChunk.length).toBeLessThanOrEqual(100);

    // Second call gets chunk 2
    mockHtmlResponse(html);
    const result2 = await tool.execute({ url: 'https://example.com/chunked', offset: data1.nextOffset, maxChars: 100 });
    const data2 = result2.data as { hasMore: boolean; content: string };

    // Second chunk should not contain the beginning of the text
    expect(data2.content).not.toContain(firstChunk.slice(0, 20));
  });

  it('should handle offset=0 as default', async () => {
    const html = `
      <html><head><title>Offset Default</title></head><body>
        <article>
          <p>This is article content to test the default offset behavior when no offset parameter is provided. The tool should default to zero offset and start from the beginning.</p>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/offset-default' });
    const data = result.data as { content: string };

    expect(data.content).toContain('This is article content');
  });

  it('should use default maxChars=8000 when not provided', async () => {
    const html = `
      <html><head><title>Default MaxChars</title></head><body>
        <article>
          <p>This is article content to verify that the default maxChars value of 8000 is used when no maxChars parameter is supplied by the caller.</p>
          <p>The content here is well under 8000 characters so hasMore should be false and no truncation marker should appear in the output text.</p>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/default-max' });
    const data = result.data as { hasMore: boolean; content: string };

    expect(data.hasMore).toBe(false);
    expect(data.content).not.toContain('(truncated...)');
  });

  it('should allow custom maxChars', async () => {
    const longText = generateLongContent(500);
    const html = `
      <html><head><title>Custom MaxChars</title></head><body>
        <article><p>${longText}</p></article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/custom-max', maxChars: 50 });
    const data = result.data as { hasMore: boolean; content: string };

    expect(data.hasMore).toBe(true);
    // Content (minus truncation marker) should not exceed maxChars
    const contentWithoutMarker = data.content.replace('\n\n(truncated...)', '').trim();
    expect(contentWithoutMarker.length).toBeLessThanOrEqual(50);
  });

  it('should handle offset beyond content length', async () => {
    const html = `
      <html><head><title>Beyond Offset</title></head><body>
        <article>
          <p>This is short article content for testing what happens when the offset parameter exceeds the total content length of the extracted text.</p>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    await expect(tool.execute({ url: 'https://example.com/beyond-offset', offset: 99999 })).rejects.toThrow(
      'Page content is empty or could not be extracted',
    );
  });
});
