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

describe('WebFetchTool.execute() - Link Filtering', () => {
  let tool: WebFetchTool;

  beforeEach(() => {
    tool = new WebFetchTool();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should exclude social and share links', async () => {
    const html = `
      <html><head><title>Social Links</title></head><body>
        <article>
          <p>This is the article content that provides enough text to exceed the minimum content length threshold of fifty characters for the extraction validation check.</p>
          <a href="https://twitter.com/user/status/123">Tweet</a>
          <a href="https://facebook.com/post/456">Facebook Post</a>
          <a href="https://linkedin.com/in/someone">LinkedIn Profile</a>
          <a href="/share?url=example.com">Share this page</a>
          <a href="/share/article">Share article</a>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/social' });
    const data = result.data as { extractedLinks: Array<{ url: string }> };

    const urls = data.extractedLinks.map((l) => l.url);
    expect(urls).not.toContain('https://twitter.com/user/status/123');
    expect(urls).not.toContain('https://facebook.com/post/456');
    expect(urls).not.toContain('https://linkedin.com/in/someone');
    expect(urls).not.toContain('https://example.com/share?url=example.com');
    expect(urls).not.toContain('https://example.com/share/article');
  });

  it('should exclude login and auth links', async () => {
    const html = `
      <html><head><title>Login Links</title></head><body>
        <article>
          <p>This is article content with enough text to pass the minimum content length validation check reliably during the test execution without any issues.</p>
          <a href="/login">Sign In</a>
          <a href="/signin">Sign In Again</a>
          <a href="/auth/callback">OAuth Callback</a>
          <a href="/register">Create Account</a>
          <a href="/auth/login">Auth Login</a>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/login' });
    const data = result.data as { extractedLinks: Array<{ url: string }> };

    const urls = data.extractedLinks.map((l) => l.url);
    expect(urls).not.toContain('https://example.com/login');
    expect(urls).not.toContain('https://example.com/signin');
    expect(urls).not.toContain('https://example.com/auth/callback');
    expect(urls).not.toContain('https://example.com/register');
    expect(urls).not.toContain('https://example.com/auth/login');
  });

  it('should exclude anchor, javascript, mailto, tel links', async () => {
    const html = `
      <html><head><title>Special Links</title></head><body>
        <article>
          <p>This is article content providing enough text to exceed the fifty character minimum content length threshold for the extraction validation logic to pass.</p>
          <a href="#section1">Jump to section</a>
          <a href="javascript:void(0)">Click me</a>
          <a href="mailto:test@example.com">Email us</a>
          <a href="tel:+1234567890">Call us</a>
          <a href="/ad/campaign">Ad Campaign</a>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/special' });
    const data = result.data as { extractedLinks: Array<{ url: string }> };

    const urls = data.extractedLinks.map((l) => l.url);
    expect(urls).not.toContain('https://example.com/#section1');
    expect(urls).not.toContain('javascript:void(0)');
    expect(urls).not.toContain('mailto:test@example.com');
    expect(urls).not.toContain('tel:+1234567890');
    expect(urls).not.toContain('https://example.com/ad/campaign');
  });

  it('should prefer same-domain links', async () => {
    const html = `
      <html><head><title>Same Domain</title></head><body>
        <article>
          <p>This is article content to test same-domain link preference. We need enough text here to exceed the minimum content length threshold reliably.</p>
          <a href="https://example.com/guide">Internal Guide</a>
          <a href="https://other-domain.com/article">External Article</a>
          <a href="https://example.com/docs">Internal Docs</a>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/same-domain' });
    const data = result.data as { extractedLinks: Array<{ url: string }> };

    // Same-domain links should appear first (higher score)
    const firstUrl = data.extractedLinks[0]?.url;
    expect(firstUrl).toBe('https://example.com/guide');
  });

  it('should boost links with guide/tutorial/reference/docs keywords', async () => {
    const html = `
      <html><head><title>Keyword Boost</title></head><body>
        <article>
          <p>This is article content to test keyword-based link scoring. We need enough text to exceed the minimum content length validation threshold.</p>
          <a href="https://example.com/guide">Guide Link</a>
          <a href="https://example.com/tutorial">Tutorial Link</a>
          <a href="https://example.com/reference">Reference Link</a>
          <a href="https://example.com/docs">Docs Link</a>
          <a href="https://example.com/about">About Link</a>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/keywords' });
    const data = result.data as { extractedLinks: Array<{ url: string }> };

    const urls = data.extractedLinks.map((l) => l.url);
    // About link (no keyword boost, score 10+2=12) should rank below keyword links (score 10+3+2=15)
    const aboutIndex = urls.indexOf('https://example.com/about');
    const guideIndex = urls.indexOf('https://example.com/guide');
    expect(aboutIndex).toBeGreaterThan(guideIndex);
  });

  it('should cap extractedLinks at 10', async () => {
    const links = Array.from({ length: 15 }, (_, i) => {
      const pathDepth = `a/b/c/d/e/f/g`.slice(0, (i % 5) * 2 + 3);
      return `<a href="https://example.com/${pathDepth}/page-${i}">Link number ${i} with descriptive text to ensure it passes the minimum text length check for scoring purposes</a>`;
    }).join('\n');

    const html = `
      <html><head><title>Link Cap</title></head><body>
        <article>
          <p>This is article content to test that extracted links are capped at ten. We need enough text to exceed the minimum content length threshold reliably.</p>
          ${links}
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/cap' });
    const data = result.data as { extractedLinks: Array<{ url: string }> };

    expect(data.extractedLinks.length).toBeLessThanOrEqual(10);
  });

  it('should resolve relative URLs', async () => {
    const html = `
      <html><head><title>Relative URLs</title></head><body>
        <article>
          <p>This is article content to test relative URL resolution. The tool should resolve relative links against the base page URL correctly.</p>
          <a href="/about">About Page</a>
          <a href="guide/start">Getting Started Guide</a>
          <a href="../docs/api">API Documentation</a>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/article/relative' });
    const data = result.data as { extractedLinks: Array<{ url: string }> };

    const urls = data.extractedLinks.map((l) => l.url);
    expect(urls).toContain('https://example.com/about');
    expect(urls).toContain('https://example.com/article/guide/start');
    expect(urls).toContain('https://example.com/docs/api');
  });
});
