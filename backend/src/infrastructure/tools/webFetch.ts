/* eslint-disable no-undef */
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
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
const MIN_CONTENT_LENGTH = 1;

const CONTENT_SELECTORS = [
  'article',
  '[role="main"]',
  'main',
  '.post-content',
  '.entry-content',
  '.article-body',
];

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

const LINK_KEYWORDS = ['guide', 'tutorial', 'reference', 'docs'];

export class WebFetchTool extends Tool {
  name = ToolName.WebFetch;
  description =
    'Fetch a webpage and extract user-visible text content. Supports two-step reading via offset parameter. Returns up to 10 relevant sub-links for potential cascade reads.';

  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The page URL to fetch' },
      offset: { type: 'number', description: 'Character offset to start reading from', default: 0 },
      maxChars: {
        type: 'number',
        description: 'Maximum characters to return in this chunk',
        default: 8000,
      },
    },
    required: ['url'],
  };

  validate(params: ToolParams): boolean {
    const { url } = params;
    if (typeof url !== 'string' || url.trim().length === 0) {
      throw new Error('url is required and must be a non-empty string');
    }
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    return true;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    const url = (params.url as string).trim();
    const offset = typeof params.offset === 'number' ? Math.max(0, params.offset) : 0;
    const maxChars =
      typeof params.maxChars === 'number' && params.maxChars > 0
        ? params.maxChars
        : DEFAULT_MAX_CHARS;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      logger.debug(`Fetching page: ${url}`);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Databot/1.0)' },
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
        metadata: { parameters: params, timestamp: new Date().toISOString() },
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('abort') || message.toLowerCase().includes('timeout')) {
        throw new Error(`Failed to fetch page: Request timeout (${FETCH_TIMEOUT_MS}ms)`);
      }
      throw new Error(`Failed to fetch page: ${message}`);
    }
  }

  private extractContent(
    html: string,
    pageUrl: string,
    offset: number,
    maxChars: number
  ): WebFetchResult {
    const $ = cheerio.load(html);
    $(REMOVAL_SELECTORS.join(', ')).remove();

    let contentEl: cheerio.Cheerio<AnyNode> = $('body');
    for (const selector of CONTENT_SELECTORS) {
      const candidate = $(selector).first();
      if (candidate.length > 0) {
        contentEl = candidate;
        break;
      }
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

  private domToText($: cheerio.CheerioAPI, el: cheerio.Cheerio<AnyNode>): string {
    const parts: string[] = [];
    const walk = (node: cheerio.Cheerio<AnyNode>): void => {
      node.contents().each((_i: number, child: AnyNode) => {
        if (child.type === 'text') {
          parts.push($(child).text());
          return;
        }
        if (child.type !== 'tag') return;
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
          if (alt) parts.push(`[Image: ${alt}]`);
          return;
        }
        const isBlock = BLOCK_TAGS.has(tagName);
        if (isBlock) parts.push('\n\n');
        walk($(child));
        if (isBlock) parts.push('\n\n');
      });
    };
    walk(el);
    return parts
      .join('')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private extractLinks(
    $: cheerio.CheerioAPI,
    contentEl: cheerio.Cheerio<AnyNode>,
    pageUrl: string
  ): ExtractedLink[] {
    const baseUrl = new URL(pageUrl);
    const scoredLinks: Array<{ text: string; url: string; score: number }> = [];
    contentEl.find('a').each((_i: number, elem: AnyNode) => {
      const $a = $(elem);
      const href = $a.attr('href');
      const text = $a.text().trim();
      if (!href || !text) return;
      const lowerHref = href.toLowerCase();
      if (EXCLUDED_LINK_PATTERNS.some((p) => lowerHref.includes(p))) return;
      if (href.startsWith('#') || href.startsWith('javascript:')) return;
      let resolvedUrl: string;
      try {
        resolvedUrl = new URL(href, pageUrl).href;
      } catch {
        return;
      }
      let score = 0;
      const linkUrl = new URL(resolvedUrl);
      if (linkUrl.hostname === baseUrl.hostname) score += 10;
      if (text.length > 20) score += 5;
      const lowerText = text.toLowerCase();
      if (LINK_KEYWORDS.some((k) => lowerText.includes(k) || lowerHref.includes(k))) score += 3;
      const pathDepth = linkUrl.pathname.split('/').filter(Boolean).length;
      if (pathDepth > 1) score += 2;
      scoredLinks.push({ text, url: resolvedUrl, score });
    });
    return scoredLinks
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ text, url }) => ({ text, url }));
  }
}

// Register the WebFetch tool
import { ToolRegistry } from './tools';
ToolRegistry.register(new WebFetchTool());
