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

describe('WebFetchTool.execute() - Content Extraction', () => {
  let tool: WebFetchTool;

  beforeEach(() => {
    tool = new WebFetchTool();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should strip scripts and styles', async () => {
    const html = `
      <html><head>
        <title>Strip Test</title>
        <script>var x = 1;</script>
        <style>body { color: red; }</style>
      </head><body>
        <article>
          <p>This is the article content that should remain after scripts and styles are stripped from the page. The extraction logic must remove these noise elements.</p>
          <p>We also need a second paragraph to ensure there is enough content to exceed the fifty character minimum content length requirement reliably.</p>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/strip-scripts' });
    const data = result.data as { content: string };

    expect(data.content).toContain('This is the article content');
    expect(data.content).not.toContain('var x = 1');
    expect(data.content).not.toContain('color: red');
  });

  it('should strip nav, footer, aside, header', async () => {
    const html = `
      <html><head><title>NavFooter Test</title></head><body>
        <header>Site Header with navigation items</header>
        <nav>
          <ul><li>Home</li><li>About</li><li>Contact</li></ul>
        </nav>
        <article>
          <p>This is the main article content. It should be preserved while the header, nav, footer, and aside elements are completely removed from the extracted text output.</p>
          <p>A second paragraph ensures we have enough text length for the minimum content length validation check to pass without issues.</p>
        </article>
        <aside>Sidebar advertisement and related links</aside>
        <footer>Copyright notice and legal information</footer>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/nav-footer' });
    const data = result.data as { content: string };

    expect(data.content).toContain('main article content');
    expect(data.content).not.toContain('Site Header');
    expect(data.content).not.toContain('Home');
    expect(data.content).not.toContain('Sidebar advertisement');
    expect(data.content).not.toContain('Copyright notice');
  });

  it('should strip elements by class (.ad, .ads, .sidebar, .comments, .cookie-banner, .newsletter-signup)', async () => {
    const html = `
      <html><head><title>Class Strip Test</title></head><body>
        <article>
          <p>This is the main article content. It should be kept while various advertising, sidebar, comments, cookie banner, and newsletter signup sections are removed from the final extracted text output.</p>
          <p>We need sufficient content length to exceed the fifty character minimum so the extraction validation does not fail on us during the test run.</p>
        </article>
        <div class="ad">Buy our product now!</div>
        <div class="ads">Sponsored content goes here</div>
        <div class="sidebar">Sidebar widgets and links</div>
        <div class="comments">
          <div>User comment one</div>
          <div>User comment two</div>
        </div>
        <div class="cookie-banner">We use cookies on this website</div>
        <div class="newsletter-signup">Subscribe to our newsletter</div>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/class-strip' });
    const data = result.data as { content: string };

    expect(data.content).toContain('main article content');
    expect(data.content).not.toContain('Buy our product');
    expect(data.content).not.toContain('Sponsored content');
    expect(data.content).not.toContain('Sidebar widgets');
    expect(data.content).not.toContain('User comment');
    expect(data.content).not.toContain('We use cookies');
    expect(data.content).not.toContain('Subscribe to our newsletter');
  });

  it('should prefer article over body', async () => {
    const html = `
      <html><head><title>Article Preference</title></head><body>
        <p>This is body text that should NOT appear because the article element has higher priority. We add more text here to ensure it has enough length to be meaningful.</p>
        <article>
          <p>This is the article content which should be extracted preferentially over the body text. The article element takes priority in the content selector chain.</p>
          <p>Adding more article text to guarantee we exceed the minimum fifty character content length threshold required by the extraction validation logic.</p>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/article-pref' });
    const data = result.data as { content: string };

    expect(data.content).toContain('article content');
    // Body text should not appear since article takes priority
    expect(data.content).not.toContain('body text that should NOT appear');
  });

  it('should prefer main over body when no article', async () => {
    const html = `
      <html><head><title>Main Preference</title></head><body>
        <p>This is body text that should not appear because the main element has higher priority than body. Adding more text here for safety margin on content length.</p>
        <main>
          <p>This is the main element content which should be extracted preferentially over the plain body text. The main tag has priority over body in the selector chain.</p>
          <p>More main content to ensure we comfortably exceed the fifty character minimum content length validation threshold during extraction.</p>
        </main>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/main-pref' });
    const data = result.data as { content: string };

    expect(data.content).toContain('main element content');
    expect(data.content).not.toContain('body text that should not appear');
  });

  it('should prefer role=main over plain main element', async () => {
    const html = `
      <html><head><title>Role Main Preference</title></head><body>
        <main>
          <p>This is the plain main element text which should NOT be extracted because role=main appears first in the selector priority list and takes precedence over main.</p>
          <p>We add extra text to make sure this fallback content is long enough to meet the minimum content length requirements.</p>
        </main>
        <div role="main">
          <p>This is the role=main content which should be extracted preferentially because the article selector comes first, then role=main, then main in the priority chain.</p>
          <p>More role=main content text to ensure the extracted text is sufficiently long and exceeds the fifty character minimum length threshold reliably.</p>
        </div>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/role-main-pref' });
    const data = result.data as { content: string };

    expect(data.content).toContain('role=main content');
    expect(data.content).not.toContain('plain main element text');
  });

  it('should strip iframes, svg, forms, buttons, inputs', async () => {
    const html = `
      <html><head><title>Interactive Strip Test</title></head><body>
        <article>
          <p>This is the article content that must remain. The extraction logic needs to strip out iframes, SVG graphics, form elements, buttons, and input fields completely.</p>
          <p>A second paragraph of content text ensures we have enough characters to exceed the minimum content length validation threshold of fifty characters.</p>
        </article>
        <iframe src="https://youtube.com/embed/xyz">Embedded video</iframe>
        <svg><rect width="100" height="100" /></svg>
        <form action="/submit">
          <input type="text" placeholder="Enter name" />
          <button type="submit">Submit Form</button>
        </form>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/interactive-strip' });
    const data = result.data as { content: string };

    expect(data.content).toContain('article content');
    expect(data.content).not.toContain('Embedded video');
    expect(data.content).not.toContain('rect');
    expect(data.content).not.toContain('Submit Form');
    expect(data.content).not.toContain('Enter name');
  });
});
