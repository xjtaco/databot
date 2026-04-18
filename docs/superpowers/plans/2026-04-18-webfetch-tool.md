# WebFetch Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `webfetch` tool that fetches webpages, extracts visible text with heavy filtering, returns context-safe chunks, and surfaces up to 10 relevant sub-links for cascade reads.

**Architecture:** A single `WebFetchTool` class extending the existing `Tool` base class, using `cheerio` for server-side HTML parsing. Registered in the global `ToolRegistry` (core agent) and per-agent registries (copilot/debug). Two-step pagination via `offset`/`maxChars` parameters.

**Tech Stack:** TypeScript, cheerio, iconv-lite, vitest, native fetch

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/src/infrastructure/tools/types.ts` | Modify | Add `WebFetch` to `ToolName` constant |
| `backend/src/infrastructure/tools/webFetch.ts` | Create | Core `WebFetchTool` implementation |
| `backend/src/infrastructure/tools/index.ts` | Modify | Export `WebFetchTool` |
| `backend/src/copilot/copilotTools.ts` | Modify | Add `CopilotWebFetchTool` wrapper, register in factory |
| `backend/src/copilot/debugTools.ts` | Modify | Register `WebFetchTool` in debug registry |
| `backend/tests/infrastructure/tools/webFetchTool/basic-execution.test.ts` | Create | Basic fetch, extraction, title tests |
| `backend/tests/infrastructure/tools/webFetchTool/extraction.test.ts` | Create | Heavy filtering (article/main targeting, element removal) |
| `backend/tests/infrastructure/tools/webFetchTool/chunking.test.ts` | Create | Two-step offset/maxChars pagination |
| `backend/tests/infrastructure/tools/webFetchTool/link-filtering.test.ts` | Create | Smart link filtering, scoring, 10-link cap |
| `backend/tests/infrastructure/tools/webFetchTool/error-scenarios.test.ts` | Create | Invalid URL, timeout, non-HTML, empty content, HTTP errors |
| `backend/tests/infrastructure/tools/webFetchTool/validation.test.ts` | Create | Parameter validation tests |

---

### Task 1: Add ToolName Constant and Install Dependency

**Files:**
- Modify: `backend/src/infrastructure/tools/types.ts`
- Modify: `backend/package.json` (via pnpm install)

- [ ] **Step 1: Add `WebFetch` to `ToolName`**

Add the new entry to the `ToolName` object in `backend/src/infrastructure/tools/types.ts`:

```typescript
export const ToolName = {
  Bash: 'bash',
  Edit: 'edit',
  Glob: 'glob',
  Grep: 'grep',
  ReadFile: 'read_file',
  WriteFile: 'write_file',
  Sql: 'sql',
  WebSearch: 'web_search',
  WebFetch: 'web_fetch',
  TodosWriter: 'todos_writer',
  OutputMd: 'output_md',
} as const;
```

- [ ] **Step 2: Install cheerio dependency**

Run:
```bash
cd /data/code/databot/backend && pnpm add cheerio
```

Expected: `cheerio` added to `dependencies` in `package.json`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/infrastructure/tools/types.ts backend/package.json backend/pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(webfetch): add ToolName constant and install cheerio

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Core WebFetchTool Implementation — Fetch & Basic Extraction

**Files:**
- Create: `backend/src/infrastructure/tools/webFetch.ts`
- Create: `backend/tests/infrastructure/tools/webFetchTool/basic-execution.test.ts`

- [ ] **Step 1: Write failing test for basic fetch and extraction**

Create `backend/tests/infrastructure/tools/webFetchTool/basic-execution.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock config before importing anything that depends on it
vi.mock('../../../../src/base/config', () => ({
  config: {
    port: 3000,
    env: 'test',
    base_url: '/api',
    log: { dir: 'logs', file: 'test.log', maxFiles: 5, maxSize: '20m' },
    llm: { type: 'openai', apiKey: 'test-key', model: 'gpt-4', baseUrl: 'https://api.openai.com/v1' },
    websocket: { enabled: true, path: '/ws', heartbeatInterval: 30000, heartbeatTimeout: 30000, maxMissedHeartbeats: 3 },
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
      arrayBuffer: async () => Buffer.from(html, 'utf-8').arrayBuffer(),
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
      arrayBuffer: async () => Buffer.from(html, 'utf-8').arrayBuffer(),
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
      arrayBuffer: async () => Buffer.from(html, 'utf-8').arrayBuffer(),
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
      arrayBuffer: async () => Buffer.from(html, 'utf-8').arrayBuffer(),
    });

    const result = await tool.execute({ url: 'https://example.com/chinese' });

    expect(result.success).toBe(true);
    const data = result.data as { title: string; content: string };
    expect(data.title).toBe('中文标题');
    expect(data.content).toContain('这是一段中文内容。');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /data/code/databot/backend && pnpm vitest run tests/infrastructure/tools/webFetchTool/basic-execution.test.ts
```

Expected: FAIL with module not found or class not defined errors.

- [ ] **Step 3: Create `webFetch.ts` with complete implementation**

Create `backend/src/infrastructure/tools/webFetch.ts`:

```typescript
import * as cheerio from 'cheerio';
import * as iconv from 'iconv-lite';
import { Tool } from './tools';
import { JSONSchemaObject, ToolName, ToolParams, ToolResult } from './types';
import logger from '../../utils/logger';

interface ExtractedLink {
  text: string;
  url: string;
}

interface WebFetchResult {
  title: string;
  url: string;
  content: string;
  hasMore: boolean;
  nextOffset: number;
  extractedLinks: ExtractedLink[];
  isTruncated: boolean;
}

const FETCH_TIMEOUT_MS = 10000;
const DEFAULT_MAX_CHARS = 8000;
const MIN_CONTENT_LENGTH = 50;

/**
 * Content selectors to try in priority order for finding main content.
 */
const CONTENT_SELECTORS = [
  'article',
  '[role="main"]',
  'main',
  '.post-content',
  '.entry-content',
  '.article-body',
];

/**
 * CSS selectors for elements to remove before extraction.
 */
const REMOVAL_SELECTORS = [
  'script',
  'style',
  'nav',
  'footer',
  'aside',
  'header',
  'noscript',
  'iframe',
  'svg',
  'form',
  'button',
  'input',
  '.ad',
  '.ads',
  '.sidebar',
  '.comments',
  '.cookie-banner',
  '.newsletter-signup',
];

/**
 * Block-level tags that trigger paragraph breaks in text output.
 */
const BLOCK_TAGS = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'td',
  'th',
  'pre',
  'blockquote',
  'section',
  'article',
  'br',
]);

/**
 * Substrings that disqualify a link from extraction.
 */
const EXCLUDED_LINK_PATTERNS = [
  'twitter.com',
  'facebook.com',
  'linkedin.com',
  'share?',
  '/share/',
  'login',
  'signin',
  'auth',
  'register',
  'mailto:',
  'tel:',
  '/ad/',
  'utm_',
  'sponsored',
  'bit.ly',
  't.co',
];

/**
 * Keywords that boost link relevance score.
 */
const LINK_KEYWORDS = ['guide', 'tutorial', 'reference', 'docs'];

/**
 * WebFetch Tool - Fetches a webpage and extracts user-visible text.
 *
 * Features:
 * - Heavy content filtering (targets article/main, strips nav/ads/scripts)
 * - Two-step pagination via offset/maxChars
 * - Smart link extraction (up to 10 relevant sub-links)
 * - Encoding detection and conversion
 */
export class WebFetchTool extends Tool {
  name = ToolName.WebFetch;
  description =
    'Fetch a webpage and extract user-visible text content. Supports two-step reading via offset parameter. Returns up to 10 relevant sub-links for potential cascade reads.';

  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The page URL to fetch',
      },
      offset: {
        type: 'number',
        description: 'Character offset to start reading from',
        default: 0,
      },
      maxChars: {
        type: 'number',
        description: 'Maximum characters to return in this chunk',
        default: 8000,
      },
    },
    required: ['url'],
  };

  /**
   * Validate input parameters.
   */
  validate(params: ToolParams): boolean {
    const { url } = params;

    if (typeof url !== 'string' || url.trim().length === 0) {
      throw new Error('url is required and must be a non-empty string');
    }

    try {
      // eslint-disable-next-line no-new
      new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    return true;
  }

  /**
   * Execute the web fetch.
   */
  async execute(params: ToolParams): Promise<ToolResult> {
    const url = (params.url as string).trim();
    const offset = typeof params.offset === 'number' ? Math.max(0, params.offset) : 0;
    const maxChars =
      typeof params.maxChars === 'number' && params.maxChars > 0 ? params.maxChars : DEFAULT_MAX_CHARS;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      logger.debug(`Fetching page: ${url}`);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Databot/1.0)',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        throw new Error(`URL returned non-HTML content: ${contentType || 'unknown'}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      let html = buffer.toString('utf-8');

      // Attempt encoding detection from meta charset tag
      const charsetMatch = html.match(/<meta[^>]*charset=["']?([^"'>;\s]+)/i);
      if (charsetMatch) {
        const detectedCharset = charsetMatch[1].toLowerCase();
        if (detectedCharset !== 'utf-8' && detectedCharset !== 'utf8') {
          html = iconv.decode(buffer, detectedCharset);
        }
      }

      const result = this.extractContent(html, url, offset, maxChars);

      if (result.content.length < MIN_CONTENT_LENGTH) {
        throw new Error('Page content is empty or could not be extracted.');
      }

      return {
        success: true,
        data: result,
        metadata: {
          parameters: params,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const message = error instanceof Error ? error.message : String(error);

      if (
        message.toLowerCase().includes('abort') ||
        message.toLowerCase().includes('timeout')
      ) {
        throw new Error(`Failed to fetch page: Request timeout (${FETCH_TIMEOUT_MS}ms)`);
      }

      throw new Error(`Failed to fetch page: ${message}`);
    }
  }

  /**
   * Extract visible text and links from HTML.
   */
  private extractContent(
    html: string,
    pageUrl: string,
    offset: number,
    maxChars: number
  ): WebFetchResult {
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $(REMOVAL_SELECTORS.join(', ')).remove();

    // Find main content element
    let contentEl = cheerio.load('')();
    for (const selector of CONTENT_SELECTORS) {
      contentEl = $(selector).first();
      if (contentEl.length > 0) {
        break;
      }
    }
    if (contentEl.length === 0) {
      contentEl = $('body');
    }

    const title = $('title').first().text().trim() || '';
    const extractedLinks = this.extractLinks($, contentEl, pageUrl);
    const text = this.domToText($, contentEl);

    const totalLength = text.length;
    const endOffset = offset + maxChars;
    const hasMore = endOffset < totalLength;
    const chunk = hasMore ? text.slice(offset, endOffset) : text.slice(offset);
    const isTruncated = hasMore;

    return {
      title,
      url: pageUrl,
      content: chunk + (isTruncated ? '\n\n(truncated...)' : ''),
      hasMore,
      nextOffset: hasMore ? endOffset : offset,
      extractedLinks,
      isTruncated,
    };
  }

  /**
   * Recursively walk a cheerio DOM subtree and produce plain text.
   * - Block tags produce paragraph breaks.
   * - `<a>` tags produce `text (href)`.
   * - `<img>` tags produce `[Image: alt]` when alt is present.
   */
  private domToText($: cheerio.CheerioAPI, el: cheerio.Cheerio): string {
    const parts: string[] = [];

    const walk = (node: cheerio.Cheerio): void => {
      node.contents().each((_, child) => {
        if (child.type === 'text') {
          parts.push($(child).text());
          return;
        }

        if (child.type !== 'tag') {
          return;
        }

        const tagName = child.name?.toLowerCase() ?? '';

        if (tagName === 'a') {
          const href = $(child).attr('href');
          const text = $(child).text().trim();
          if (href && text) {
            parts.push(`${text} (${href})`);
          } else if (text) {
            parts.push(text);
          }
          return;
        }

        if (tagName === 'img') {
          const alt = $(child).attr('alt') || '';
          if (alt) {
            parts.push(`[Image: ${alt}]`);
          }
          return;
        }

        const isBlock = BLOCK_TAGS.has(tagName);
        if (isBlock) {
          parts.push('\n\n');
        }

        walk($(child));

        if (isBlock) {
          parts.push('\n\n');
        }
      });
    };

    walk(el);

    return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
  }

  /**
   * Extract and score up to 10 relevant links from the content area.
   */
  private extractLinks(
    $: cheerio.CheerioAPI,
    contentEl: cheerio.Cheerio,
    pageUrl: string
  ): ExtractedLink[] {
    const baseUrl = new URL(pageUrl);
    const scoredLinks: Array<{ text: string; url: string; score: number }> = [];

    contentEl.find('a').each((_, elem) => {
      const $a = $(elem);
      const href = $a.attr('href');
      const text = $a.text().trim();

      if (!href || !text) {
        return;
      }

      const lowerHref = href.toLowerCase();

      // Exclude patterns
      if (EXCLUDED_LINK_PATTERNS.some((p) => lowerHref.includes(p))) {
        return;
      }
      if (href.startsWith('#') || href.startsWith('javascript:')) {
        return;
      }

      // Resolve URL
      let resolvedUrl: string;
      try {
        resolvedUrl = new URL(href, pageUrl).href;
      } catch {
        return;
      }

      // Score
      let score = 0;
      const linkUrl = new URL(resolvedUrl);
      if (linkUrl.hostname === baseUrl.hostname) {
        score += 10;
      }
      if (text.length > 20) {
        score += 5;
      }
      const lowerText = text.toLowerCase();
      if (LINK_KEYWORDS.some((k) => lowerText.includes(k) || lowerHref.includes(k))) {
        score += 3;
      }
      const pathDepth = linkUrl.pathname.split('/').filter(Boolean).length;
      if (pathDepth > 1) {
        score += 2;
      }

      scoredLinks.push({ text, url: resolvedUrl, score });
    });

    return scoredLinks
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ text, url }) => ({ text, url }));
  }
}
```

- [ ] **Step 4: Run basic execution tests**

Run:
```bash
cd /data/code/databot/backend && pnpm vitest run tests/infrastructure/tools/webFetchTool/basic-execution.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/infrastructure/tools/webFetch.ts backend/tests/infrastructure/tools/webFetchTool/basic-execution.test.ts
git commit -m "$(cat <<'EOF'
feat(webfetch): implement core fetch and extraction logic

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Heavy Filtering Tests

**Files:**
- Create: `backend/tests/infrastructure/tools/webFetchTool/extraction.test.ts`

- [ ] **Step 1: Write tests for heavy content filtering**

Create `backend/tests/infrastructure/tools/webFetchTool/extraction.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../../src/base/config', () => ({
  config: {
    port: 3000,
    env: 'test',
    base_url: '/api',
    log: { dir: 'logs', file: 'test.log', maxFiles: 5, maxSize: '20m' },
    llm: { type: 'openai', apiKey: 'test-key', model: 'gpt-4', baseUrl: 'https://api.openai.com/v1' },
    websocket: { enabled: true, path: '/ws', heartbeatInterval: 30000, heartbeatTimeout: 30000, maxMissedHeartbeats: 3 },
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
    headers: new Map([['content-type', 'text/html']]),
    arrayBuffer: async () => Buffer.from(html, 'utf-8').arrayBuffer(),
  });
}

describe('WebFetchTool - Heavy Filtering', () => {
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
      <html><head><title>Filter Test</title><style>.red{color:red}</style></head>
      <body>
        <article><p>Keep this.</p></article>
        <script>alert('xss');</script>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/filter' });
    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain('Keep this.');
    expect(data.content).not.toContain('.red{color:red}');
    expect(data.content).not.toContain("alert('xss')");
  });

  it('should strip nav, footer, aside, header', async () => {
    const html = `
      <html><head><title>Layout Test</title></head>
      <body>
        <nav>Nav links</nav>
        <header>Site header</header>
        <article><p>Article text.</p></article>
        <aside>Sidebar ads</aside>
        <footer>Copyright 2024</footer>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/layout' });
    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain('Article text.');
    expect(data.content).not.toContain('Nav links');
    expect(data.content).not.toContain('Site header');
    expect(data.content).not.toContain('Sidebar ads');
    expect(data.content).not.toContain('Copyright 2024');
  });

  it('should strip elements by class (.ad, .ads, .sidebar, .comments, .cookie-banner, .newsletter-signup)', async () => {
    const html = `
      <html><head><title>Class Filter</title></head>
      <body>
        <article><p>Real content.</p></article>
        <div class="ad">Buy now!</div>
        <div class="ads">More ads</div>
        <div class="sidebar">Related links</div>
        <div class="comments">User comments</div>
        <div class="cookie-banner">Accept cookies</div>
        <div class="newsletter-signup">Subscribe</div>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/classes' });
    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain('Real content.');
    expect(data.content).not.toContain('Buy now!');
    expect(data.content).not.toContain('More ads');
    expect(data.content).not.toContain('Related links');
    expect(data.content).not.toContain('User comments');
    expect(data.content).not.toContain('Accept cookies');
    expect(data.content).not.toContain('Subscribe');
  });

  it('should prefer article over body', async () => {
    const html = `
      <html><head><title>Priority</title></head>
      <body>
        <p>Body intro.</p>
        <article><p>Article content only.</p></article>
        <p>Body outro.</p>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/priority' });
    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain('Article content only.');
    expect(data.content).not.toContain('Body intro.');
    expect(data.content).not.toContain('Body outro.');
  });

  it('should prefer main over body when no article', async () => {
    const html = `
      <html><head><title>Main Test</title></head>
      <body>
        <p>Outside main.</p>
        <main><p>Inside main.</p></main>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/main' });
    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain('Inside main.');
    expect(data.content).not.toContain('Outside main.');
  });

  it('should prefer role=main over main', async () => {
    const html = `
      <html><head><title>Role Main</title></head>
      <body>
        <main><p>Plain main.</p></main>
        <div role="main"><p>Aria main.</p></div>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/role' });
    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain('Aria main.');
    expect(data.content).not.toContain('Plain main.');
  });

  it('should strip iframes, svg, forms, buttons, inputs', async () => {
    const html = `
      <html><head><title>Input Test</title></head>
      <body>
        <article><p>Real text.</p></article>
        <iframe src="frame.html"></iframe>
        <svg><circle /></svg>
        <form><input type="text" /><button>Submit</button></form>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/inputs' });
    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain('Real text.');
    expect(data.content).not.toContain('frame.html');
    expect(data.content).not.toContain('circle');
    expect(data.content).not.toContain('Submit');
  });
});
```

- [ ] **Step 2: Run extraction tests**

Run:
```bash
cd /data/code/databot/backend && pnpm vitest run tests/infrastructure/tools/webFetchTool/extraction.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/infrastructure/tools/webFetchTool/extraction.test.ts
git commit -m "$(cat <<'EOF'
test(webfetch): add heavy content filtering tests

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Two-Step Chunking Tests

**Files:**
- Create: `backend/tests/infrastructure/tools/webFetchTool/chunking.test.ts`

- [ ] **Step 1: Write chunking tests**

Create `backend/tests/infrastructure/tools/webFetchTool/chunking.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../../src/base/config', () => ({
  config: {
    port: 3000,
    env: 'test',
    base_url: '/api',
    log: { dir: 'logs', file: 'test.log', maxFiles: 5, maxSize: '20m' },
    llm: { type: 'openai', apiKey: 'test-key', model: 'gpt-4', baseUrl: 'https://api.openai.com/v1' },
    websocket: { enabled: true, path: '/ws', heartbeatInterval: 30000, heartbeatTimeout: 30000, maxMissedHeartbeats: 3 },
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
    headers: new Map([['content-type', 'text/html']]),
    arrayBuffer: async () => Buffer.from(html, 'utf-8').arrayBuffer(),
  });
}

describe('WebFetchTool - Two-Step Chunking', () => {
  let tool: WebFetchTool;

  beforeEach(() => {
    tool = new WebFetchTool();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return hasMore=true when content exceeds maxChars', async () => {
    const longText = 'a'.repeat(10000);
    const html = `<html><head><title>Long</title></head><body><article><p>${longText}</p></article></body></html>`;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/long', maxChars: 8000 });
    expect(result.success).toBe(true);
    const data = result.data as { hasMore: boolean; nextOffset: number; content: string; isTruncated: boolean };
    expect(data.hasMore).toBe(true);
    expect(data.nextOffset).toBe(8000);
    expect(data.isTruncated).toBe(true);
    expect(data.content).toContain('(truncated...)');
    expect(data.content.length).toBeLessThanOrEqual(8000 + '\n\n(truncated...)'.length + 10);
  });

  it('should return hasMore=false when content fits in one chunk', async () => {
    const html = `<html><head><title>Short</title></head><body><article><p>Short content.</p></article></body></html>`;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/short', maxChars: 8000 });
    expect(result.success).toBe(true);
    const data = result.data as { hasMore: boolean; nextOffset: number; content: string; isTruncated: boolean };
    expect(data.hasMore).toBe(false);
    expect(data.nextOffset).toBe(0);
    expect(data.isTruncated).toBe(false);
    expect(data.content).not.toContain('(truncated...)');
  });

  it('should return second chunk with offset', async () => {
    const part1 = 'a'.repeat(8000);
    const part2 = 'b'.repeat(2000);
    const html = `<html><head><title>Two Part</title></head><body><article><p>${part1}${part2}</p></article></body></html>`;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/two', offset: 8000, maxChars: 8000 });
    expect(result.success).toBe(true);
    const data = result.data as { content: string; hasMore: boolean; nextOffset: number };
    expect(data.content).toContain('b');
    expect(data.content).not.toContain('a');
    expect(data.hasMore).toBe(false);
  });

  it('should handle offset=0 as default', async () => {
    const html = `<html><head><title>Default Offset</title></head><body><article><p>Start here.</p></article></body></html>`;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/default' });
    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain('Start here.');
  });

  it('should use default maxChars=8000 when not provided', async () => {
    const longText = 'x'.repeat(9000);
    const html = `<html><head><title>Default Max</title></head><body><article><p>${longText}</p></article></body></html>`;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/defaultmax' });
    expect(result.success).toBe(true);
    const data = result.data as { hasMore: boolean };
    expect(data.hasMore).toBe(true);
  });

  it('should allow custom maxChars', async () => {
    const longText = 'y'.repeat(500);
    const html = `<html><head><title>Custom Max</title></head><body><article><p>${longText}</p></article></body></html>`;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/custommax', maxChars: 200 });
    expect(result.success).toBe(true);
    const data = result.data as { hasMore: boolean; content: string };
    expect(data.hasMore).toBe(true);
    expect(data.content.length).toBeLessThanOrEqual(200 + '\n\n(truncated...)'.length + 10);
  });

  it('should handle offset beyond content length', async () => {
    const html = `<html><head><title>Over Offset</title></head><body><article><p>Short.</p></article></body></html>`;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/over', offset: 1000 });
    expect(result.success).toBe(true);
    const data = result.data as { content: string; hasMore: boolean };
    expect(data.content).toBe('');
    expect(data.hasMore).toBe(false);
  });
});
```

- [ ] **Step 2: Run chunking tests**

Run:
```bash
cd /data/code/databot/backend && pnpm vitest run tests/infrastructure/tools/webFetchTool/chunking.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/infrastructure/tools/webFetchTool/chunking.test.ts
git commit -m "$(cat <<'EOF'
test(webfetch): add two-step chunking tests

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Smart Link Filtering Tests

**Files:**
- Create: `backend/tests/infrastructure/tools/webFetchTool/link-filtering.test.ts`

- [ ] **Step 1: Write link filtering tests**

Create `backend/tests/infrastructure/tools/webFetchTool/link-filtering.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../../src/base/config', () => ({
  config: {
    port: 3000,
    env: 'test',
    base_url: '/api',
    log: { dir: 'logs', file: 'test.log', maxFiles: 5, maxSize: '20m' },
    llm: { type: 'openai', apiKey: 'test-key', model: 'gpt-4', baseUrl: 'https://api.openai.com/v1' },
    websocket: { enabled: true, path: '/ws', heartbeatInterval: 30000, heartbeatTimeout: 30000, maxMissedHeartbeats: 3 },
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
    headers: new Map([['content-type', 'text/html']]),
    arrayBuffer: async () => Buffer.from(html, 'utf-8').arrayBuffer(),
  });
}

describe('WebFetchTool - Smart Link Filtering', () => {
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
      <html><head><title>Links</title></head>
      <body>
        <article>
          <p>Content.</p>
          <a href="https://twitter.com/share">Share on Twitter</a>
          <a href="https://facebook.com/sharer">Share on Facebook</a>
          <a href="/share">Share</a>
          <a href="https://example.com/related">Related Article</a>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/page' });
    expect(result.success).toBe(true);
    const data = result.data as { extractedLinks: Array<{ text: string; url: string }> };
    const urls = data.extractedLinks.map((l) => l.url);
    expect(urls).toContain('https://example.com/related');
    expect(urls).not.toContain('https://twitter.com/share');
    expect(urls).not.toContain('https://facebook.com/sharer');
    expect(urls).not.toContain('https://example.com/share');
  });

  it('should exclude login/auth links', async () => {
    const html = `
      <html><head><title>Auth</title></head>
      <body>
        <article>
          <a href="/login">Login</a>
          <a href="/signin">Sign In</a>
          <a href="/auth/oauth">OAuth</a>
          <a href="/register">Register</a>
          <a href="/content">Real Content</a>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/page' });
    expect(result.success).toBe(true);
    const data = result.data as { extractedLinks: Array<{ text: string; url: string }> };
    const urls = data.extractedLinks.map((l) => l.url);
    expect(urls).toContain('https://example.com/content');
    expect(urls).not.toContain('https://example.com/login');
    expect(urls).not.toContain('https://example.com/signin');
    expect(urls).not.toContain('https://example.com/auth/oauth');
    expect(urls).not.toContain('https://example.com/register');
  });

  it('should exclude anchor, javascript, mailto, tel links', async () => {
    const html = `
      <html><head><title>Bad Links</title></head>
      <body>
        <article>
          <a href="#section">Jump</a>
          <a href="javascript:void(0)">Click</a>
          <a href="mailto:test@example.com">Email</a>
          <a href="tel:+123">Call</a>
          <a href="/real">Real Link</a>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/page' });
    expect(result.success).toBe(true);
    const data = result.data as { extractedLinks: Array<{ text: string; url: string }> };
    const urls = data.extractedLinks.map((l) => l.url);
    expect(urls).toContain('https://example.com/real');
    expect(urls).not.toContain('https://example.com/#section');
    expect(urls).not.toContain('javascript:void(0)');
    expect(urls).not.toContain('mailto:test@example.com');
    expect(urls).not.toContain('tel:+123');
  });

  it('should prefer same-domain links', async () => {
    const html = `
      <html><head><title>Domains</title></head>
      <body>
        <article>
          <a href="/local">Local Page</a>
          <a href="https://other.com/page">External Page</a>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/page' });
    expect(result.success).toBe(true);
    const data = result.data as { extractedLinks: Array<{ text: string; url: string }> };
    expect(data.extractedLinks[0].url).toBe('https://example.com/local');
  });

  it('should boost links with guide/tutorial/reference/docs keywords', async () => {
    const html = `
      <html><head><title>Keywords</title></head>
      <body>
        <article>
          <a href="/about">About Us</a>
          <a href="/tutorial">Getting Started Tutorial</a>
          <a href="/docs/api">API Reference</a>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/page' });
    expect(result.success).toBe(true);
    const data = result.data as { extractedLinks: Array<{ text: string; url: string }> };
    const urls = data.extractedLinks.map((l) => l.url);
    // tutorial and docs should rank higher than about
    expect(urls.indexOf('https://example.com/tutorial')).toBeLessThan(urls.indexOf('https://example.com/about'));
    expect(urls.indexOf('https://example.com/docs/api')).toBeLessThan(urls.indexOf('https://example.com/about'));
  });

  it('should cap extractedLinks at 10', async () => {
    const links = Array.from({ length: 20 }, (_, i) =>
      `<a href="/page${i}">Page ${i}</a>`
    ).join('\n');
    const html = `
      <html><head><title>Many Links</title></head>
      <body><article>${links}</article></body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/page' });
    expect(result.success).toBe(true);
    const data = result.data as { extractedLinks: Array<{ text: string; url: string }> };
    expect(data.extractedLinks.length).toBe(10);
  });

  it('should resolve relative URLs', async () => {
    const html = `
      <html><head><title>Relative</title></head>
      <body>
        <article>
          <a href="/path">Root relative</a>
          <a href="sub/page">Path relative</a>
        </article>
      </body></html>
    `;
    mockHtmlResponse(html);

    const result = await tool.execute({ url: 'https://example.com/dir/page' });
    expect(result.success).toBe(true);
    const data = result.data as { extractedLinks: Array<{ text: string; url: string }> };
    const urls = data.extractedLinks.map((l) => l.url);
    expect(urls).toContain('https://example.com/path');
    expect(urls).toContain('https://example.com/dir/sub/page');
  });
});
```

- [ ] **Step 2: Run link filtering tests**

Run:
```bash
cd /data/code/databot/backend && pnpm vitest run tests/infrastructure/tools/webFetchTool/link-filtering.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/infrastructure/tools/webFetchTool/link-filtering.test.ts
git commit -m "$(cat <<'EOF'
test(webfetch): add smart link filtering tests

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Error Scenario Tests

**Files:**
- Create: `backend/tests/infrastructure/tools/webFetchTool/error-scenarios.test.ts`

- [ ] **Step 1: Write error scenario tests**

Create `backend/tests/infrastructure/tools/webFetchTool/error-scenarios.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../../src/base/config', () => ({
  config: {
    port: 3000,
    env: 'test',
    base_url: '/api',
    log: { dir: 'logs', file: 'test.log', maxFiles: 5, maxSize: '20m' },
    llm: { type: 'openai', apiKey: 'test-key', model: 'gpt-4', baseUrl: 'https://api.openai.com/v1' },
    websocket: { enabled: true, path: '/ws', heartbeatInterval: 30000, heartbeatTimeout: 30000, maxMissedHeartbeats: 3 },
  },
}));

import { WebFetchTool } from '../../../../src/infrastructure/tools/webFetch';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WebFetchTool - Error Scenarios', () => {
  let tool: WebFetchTool;

  beforeEach(() => {
    tool = new WebFetchTool();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should error on HTTP 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Map([['content-type', 'text/html']]),
    });

    await expect(tool.execute({ url: 'https://example.com/missing' })).rejects.toThrow('HTTP 404: Not Found');
  });

  it('should error on HTTP 500', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Map([['content-type', 'text/html']]),
    });

    await expect(tool.execute({ url: 'https://example.com/broken' })).rejects.toThrow('HTTP 500: Internal Server Error');
  });

  it('should error on non-HTML content type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
    });

    await expect(tool.execute({ url: 'https://example.com/api' })).rejects.toThrow('URL returned non-HTML content: application/json');
  });

  it('should error on empty content after filtering', async () => {
    const html = `<html><head><title>Empty</title></head><body><script>only script</script></body></html>`;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'text/html']]),
      arrayBuffer: async () => Buffer.from(html, 'utf-8').arrayBuffer(),
    });

    await expect(tool.execute({ url: 'https://example.com/empty' })).rejects.toThrow('Page content is empty or could not be extracted.');
  });

  it('should error on network timeout', async () => {
    mockFetch.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      reject(error);
    }));

    await expect(tool.execute({ url: 'https://example.com/slow' })).rejects.toThrow('Request timeout (10000ms)');
  });

  it('should error on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(tool.execute({ url: 'https://example.com/down' })).rejects.toThrow('ECONNREFUSED');
  });

  it('should error on missing content-type header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
    });

    await expect(tool.execute({ url: 'https://example.com/nocontenttype' })).rejects.toThrow('URL returned non-HTML content: unknown');
  });
});
```

- [ ] **Step 2: Run error scenario tests**

Run:
```bash
cd /data/code/databot/backend && pnpm vitest run tests/infrastructure/tools/webFetchTool/error-scenarios.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/infrastructure/tools/webFetchTool/error-scenarios.test.ts
git commit -m "$(cat <<'EOF'
test(webfetch): add error scenario tests

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Validation Tests

**Files:**
- Create: `backend/tests/infrastructure/tools/webFetchTool/validation.test.ts`

- [ ] **Step 1: Write validation tests**

Create `backend/tests/infrastructure/tools/webFetchTool/validation.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../../src/base/config', () => ({
  config: {
    port: 3000,
    env: 'test',
    base_url: '/api',
    log: { dir: 'logs', file: 'test.log', maxFiles: 5, maxSize: '20m' },
    llm: { type: 'openai', apiKey: 'test-key', model: 'gpt-4', baseUrl: 'https://api.openai.com/v1' },
    websocket: { enabled: true, path: '/ws', heartbeatInterval: 30000, heartbeatTimeout: 30000, maxMissedHeartbeats: 3 },
  },
}));

import { WebFetchTool } from '../../../../src/infrastructure/tools/webFetch';

describe('WebFetchTool - Validation', () => {
  let tool: WebFetchTool;

  beforeEach(() => {
    tool = new WebFetchTool();
  });

  it('should reject missing url', () => {
    expect(() => tool.validate({})).toThrow('url is required');
  });

  it('should reject empty string url', () => {
    expect(() => tool.validate({ url: '' })).toThrow('url is required');
    expect(() => tool.validate({ url: '   ' })).toThrow('url is required');
  });

  it('should reject non-string url', () => {
    expect(() => tool.validate({ url: 123 })).toThrow('url is required');
  });

  it('should reject invalid URL format', () => {
    expect(() => tool.validate({ url: 'not-a-url' })).toThrow('Invalid URL: not-a-url');
    expect(() => tool.validate({ url: 'ftp://example.com' })).toThrow('Invalid URL: ftp://example.com');
  });

  it('should accept valid http URL', () => {
    expect(() => tool.validate({ url: 'http://example.com' })).not.toThrow();
  });

  it('should accept valid https URL', () => {
    expect(() => tool.validate({ url: 'https://example.com/path?q=1' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run validation tests**

Run:
```bash
cd /data/code/databot/backend && pnpm vitest run tests/infrastructure/tools/webFetchTool/validation.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/infrastructure/tools/webFetchTool/validation.test.ts
git commit -m "$(cat <<'EOF'
test(webfetch): add parameter validation tests

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Register Tool in All Registries

**Files:**
- Modify: `backend/src/infrastructure/tools/index.ts`
- Modify: `backend/src/copilot/copilotTools.ts`
- Modify: `backend/src/copilot/debugTools.ts`

- [ ] **Step 1: Export from tools index**

Modify `backend/src/infrastructure/tools/index.ts`. Add after the WebSearch export line:

```typescript
// Export WebFetch tool implementation
export { WebFetchTool } from './webFetch';
```

- [ ] **Step 2: Register in global ToolRegistry**

At the bottom of `backend/src/infrastructure/tools/webFetch.ts`, after the class definition, add:

```typescript
// Register the WebFetch tool
import { ToolRegistry } from './tools';
ToolRegistry.register(new WebFetchTool());
```

Wait — this creates a circular import risk because `webFetch.ts` imports `Tool` from `tools.ts`, and `tools.ts` doesn't import `webFetch.ts`. Actually, looking at `webSearch.ts`, it imports `ToolRegistry` from `./tools` at the top and registers at the bottom. So `webFetch.ts` already imports `Tool` from `./tools`, adding `ToolRegistry` to the same import is fine. No circular dependency.

Actually, looking at `webSearch.ts` lines 2-3:
```typescript
import { JSONSchemaObject, ToolName, ToolParams, ToolResult } from './types';
import { Tool, ToolRegistry } from './tools';
```

And at the bottom:
```typescript
// Register the WebSearch tool
ToolRegistry.register(new WebSearch());
```

So I should add `ToolRegistry` to the import and register at the bottom of `webFetch.ts`.

- [ ] **Step 3: Register in Copilot registry**

Modify `backend/src/copilot/copilotTools.ts`:

1. Add import at the top (around line 11, after WebSearch import):
```typescript
import { WebFetchTool } from '../infrastructure/tools/webFetch';
```

2. Add `'web_fetch'` to `COPILOT_TOOL_NAMES` array (around line 62, after `'web_search'`):
```typescript
  'web_search',
  'web_fetch',
```

3. Add wrapper class after `CopilotWebSearchTool` (around line 1252, after the closing brace of `CopilotWebSearchTool`):

```typescript
class CopilotWebFetchTool extends Tool {
  name = 'web_fetch';
  description = 'Fetch a webpage and extract user-visible text content. Supports reading in chunks via offset. Returns up to 10 relevant sub-links.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The page URL to fetch' },
      offset: { type: 'number', description: 'Character offset to start reading from', default: 0 },
      maxChars: { type: 'number', description: 'Maximum characters to return in this chunk', default: 8000 },
    },
    required: ['url'],
  };
  private webFetchTool = new WebFetchTool();

  async execute(params: ToolParams): Promise<ToolResult> {
    return this.webFetchTool.execute(params);
  }
}
```

4. Register in `createCopilotToolRegistry` (around line 1373, after `CopilotWebSearchTool` registration):
```typescript
  registry.register(new CopilotWebFetchTool());
```

- [ ] **Step 4: Register in Debug registry**

Modify `backend/src/copilot/debugTools.ts`:

1. Add import at the top:
```typescript
import { WebFetchTool } from '../infrastructure/tools/webFetch';
```

2. Register in `createDebugToolRegistry` (after `ScopedReadFileTool`):
```typescript
  registry.register(new WebFetchTool());
```

- [ ] **Step 5: Run registry tests**

Run:
```bash
cd /data/code/databot/backend && pnpm vitest run tests/infrastructure/tools/registry/
```

Expected: All registry tests PASS (the new tool should be registered globally).

- [ ] **Step 6: Commit**

```bash
git add backend/src/infrastructure/tools/index.ts backend/src/infrastructure/tools/webFetch.ts backend/src/copilot/copilotTools.ts backend/src/copilot/debugTools.ts
git commit -m "$(cat <<'EOF'
feat(webfetch): register tool in core, copilot, and debug agent registries

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Full Verification

**Files:**
- All test files

- [ ] **Step 1: Run all webFetch tests**

Run:
```bash
cd /data/code/databot/backend && pnpm vitest run tests/infrastructure/tools/webFetchTool/
```

Expected: All tests PASS.

- [ ] **Step 2: Run full backend test suite**

Run:
```bash
cd /data/code/databot/backend && pnpm test
```

Expected: Full suite PASS (or existing failures only, no new regressions).

- [ ] **Step 3: Run preflight**

Run:
```bash
cd /data/code/databot/backend && pnpm run preflight
```

Expected: lint, format, typecheck, build, and tests all pass.

- [ ] **Step 4: Final commit**

```bash
git commit -m "$(cat <<'EOF'
feat(webfetch): complete tool implementation with tests

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Spec Coverage Check

| Spec Requirement | Implementing Task |
|---|---|
| Add `WebFetch` to `ToolName` | Task 1 |
| Install `cheerio` dependency | Task 1 |
| Tool parameters: `url`, `offset`, `maxChars` | Task 2 |
| Two-step flow with `hasMore`/`nextOffset` | Task 2, Task 4 |
| Content targeting (`article`, `main`, fallback) | Task 2, Task 3 |
| Element stripping (scripts, nav, ads, etc.) | Task 2, Task 3 |
| Text conversion (block elements, images as alt) | Task 2 |
| Smart link filtering (exclude patterns, scoring) | Task 2, Task 5 |
| 10-link cap | Task 2, Task 5 |
| Error handling (invalid URL, timeout, non-HTML, empty, HTTP errors) | Task 2, Task 6 |
| Encoding detection with `iconv-lite` | Task 2 |
| Register in global `ToolRegistry` | Task 8 |
| Register in Copilot registry | Task 8 |
| Register in Debug registry | Task 8 |
| Unit tests for all behavior | Tasks 2-7 |
| Preflight passes | Task 9 |

## Placeholder Scan

- No TBD, TODO, or "implement later" found.
- All steps contain exact file paths, code blocks, and commands.
- No vague requirements like "add appropriate error handling" — each error case is explicitly tested and implemented.
- Type consistency verified: `WebFetchResult`, `ExtractedLink`, `WebFetchTool`, `ToolName.WebFetch`, `'web_fetch'` used consistently.

## Type Consistency Check

- Tool name: `ToolName.WebFetch` (PascalCase key) → `'web_fetch'` (snake_case value) — consistent with existing `WebSearch` → `'web_search'`.
- Copilot wrapper name: `'web_fetch'` — consistent.
- `COPILOT_TOOL_NAMES` entry: `'web_fetch'` — consistent.
- Parameters: `url: string`, `offset: number`, `maxChars: number` — consistent across tool class, wrapper class, and tests.
- Response shape: `{ title, url, content, hasMore, nextOffset, extractedLinks, isTruncated }` — consistent across implementation and tests.
