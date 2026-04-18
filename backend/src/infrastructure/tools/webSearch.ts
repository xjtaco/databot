import { JSONSchemaObject, ToolName, ToolParams, ToolResult } from './types';
import { Tool, ToolRegistry } from './tools';
import logger from '../../utils/logger';
import { ToolExecutionError } from '../../errors/types';
import type { WebSearchConfigData } from '../../globalConfig/globalConfig.types';

/**
 * Ali IQS API response structure
 */
interface AliSearchResponse {
  pageItems?: AliPageItem[];
  errorMessage?: string;
}

interface AliPageItem {
  hostname: string;
  summary: string;
  url?: string;
  title?: string;
}

/**
 * Baidu AI Search API response structure
 */
interface BaiduSearchResponse {
  request_id?: string;
  references?: BaiduReference[];
  code?: string;
  message?: string;
}

interface BaiduReference {
  title: string;
  url: string;
  content: string;
  date?: string;
  type?: string;
  rerank_score?: number;
}

/**
 * Google Custom Search API response structure
 */
interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
  error?: { code: number; message: string };
}

interface GoogleSearchItem {
  title: string;
  link: string;
  snippet: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Web search provider abstract interface
 */
abstract class WebSearchProvider {
  protected timeout: number;

  constructor(timeout: number) {
    this.timeout = timeout;
  }

  /**
   * Execute search and return formatted results
   */
  abstract search(query: string): Promise<string[]>;

  abstract searchStructured(query: string): Promise<WebSearchResult[]>;
}

/**
 * Alibaba Cloud IQS (Intelligent Query Service) search implementation
 */
class AliUnifySearchProvider extends WebSearchProvider {
  private static readonly ENDPOINT = 'https://cloud-iqs.aliyuncs.com/search/llm';
  private readonly apiKey: string;
  private readonly numResults: number;

  constructor(apiKey: string, numResults: number, timeout: number) {
    super(timeout);
    this.apiKey = apiKey;
    this.numResults = numResults;
  }

  async search(query: string): Promise<string[]> {
    const payload = {
      query,
      numResults: this.numResults,
    };

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      logger.debug(`Executing Ali IQS search with query: "${query}"`);

      const response = await fetch(AliUnifySearchProvider.ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorMessage = `HTTP status error: ${response.status} ${response.statusText}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as AliSearchResponse;

      if (result?.pageItems && Array.isArray(result.pageItems)) {
        logger.info(`Search returned ${result.pageItems.length} results for query: "${query}"`);
        return result.pageItems.map((item) => `Source: ${item.hostname}: Content: ${item.summary}`);
      }

      logger.warn(`No results found for query: "${query}"`);
      return [];
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          const timeoutError = `Search request timeout (${this.timeout}ms)`;
          logger.error(timeoutError);
          return [];
        }

        logger.error(`Search request failed: ${error.message}`);
      }

      return [];
    }
  }

  async searchStructured(query: string): Promise<WebSearchResult[]> {
    const payload = { query, numResults: this.numResults };
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(AliUnifySearchProvider.ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP status error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as AliSearchResponse;
      if (result?.pageItems && Array.isArray(result.pageItems)) {
        return result.pageItems.map((item) => ({
          title: item.title ?? item.hostname,
          url: item.url ?? '',
          snippet: item.summary,
        }));
      }
      return [];
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error(`Search request timeout (${this.timeout}ms)`);
      }
      throw error;
    }
  }
}

/**
 * Baidu AI Search implementation
 */
class BaiduSearchProvider extends WebSearchProvider {
  private static readonly ENDPOINT = 'https://qianfan.baidubce.com/v2/ai_search/web_search';
  private readonly apiKey: string;
  private readonly numResults: number;

  constructor(apiKey: string, numResults: number, timeout: number) {
    super(timeout);
    this.apiKey = apiKey;
    this.numResults = numResults;
  }

  async search(query: string): Promise<string[]> {
    const payload = {
      messages: [{ content: query, role: 'user' }],
      search_source: 'baidu_search_v2',
      resource_type_filter: [{ type: 'web', top_k: this.numResults }],
    };

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      logger.debug(`Executing Baidu search with query: "${query}"`);

      const response = await fetch(BaiduSearchProvider.ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorMessage = `Baidu search HTTP error: ${response.status} ${response.statusText}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as BaiduSearchResponse;

      if (result?.references && Array.isArray(result.references)) {
        logger.info(
          `Baidu search returned ${result.references.length} results for query: "${query}"`
        );
        return result.references.map(
          (ref) => `Source: ${ref.url}: Title: ${ref.title} Content: ${ref.content}`
        );
      }

      logger.warn(`No Baidu search results for query: "${query}"`);
      return [];
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          logger.error(`Baidu search timeout (${this.timeout}ms)`);
          return [];
        }

        logger.error(`Baidu search request failed: ${error.message}`);
      }

      return [];
    }
  }

  async searchStructured(query: string): Promise<WebSearchResult[]> {
    const payload = {
      messages: [{ content: query, role: 'user' }],
      search_source: 'baidu_search_v2',
      resource_type_filter: [{ type: 'web', top_k: this.numResults }],
    };
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(BaiduSearchProvider.ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Baidu search HTTP error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as BaiduSearchResponse;
      if (result?.references && Array.isArray(result.references)) {
        return result.references.map((ref) => ({
          title: ref.title,
          url: ref.url,
          snippet: ref.content,
        }));
      }
      return [];
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error(`Baidu search timeout (${this.timeout}ms)`);
      }
      throw error;
    }
  }
}

/**
 * Google Custom Search implementation
 */
class GoogleSearchProvider extends WebSearchProvider {
  private static readonly ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
  private readonly apiKey: string;
  private readonly cx: string;
  private readonly numResults: number;

  constructor(apiKey: string, cx: string, numResults: number, timeout: number) {
    super(timeout);
    this.apiKey = apiKey;
    this.cx = cx;
    this.numResults = Math.min(numResults, 10);
  }

  async search(query: string): Promise<string[]> {
    const params = new URLSearchParams({
      key: this.apiKey,
      cx: this.cx,
      q: query,
      num: String(this.numResults),
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      logger.debug(`Executing Google search with query: "${query}"`);

      const response = await fetch(`${GoogleSearchProvider.ENDPOINT}?${params.toString()}`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorMessage = `Google search HTTP error: ${response.status} ${response.statusText}`;
        logger.error(errorMessage);
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as GoogleSearchResponse;

      if (result.error) {
        logger.error(`Google search API error: ${result.error.message}`);
        throw new Error(`Google search API error: ${result.error.message}`);
      }

      if (result?.items && Array.isArray(result.items)) {
        logger.info(`Google search returned ${result.items.length} results for query: "${query}"`);
        return result.items.map(
          (item) => `Source: ${item.link}: Title: ${item.title} Content: ${item.snippet}`
        );
      }

      logger.warn(`No Google search results for query: "${query}"`);
      return [];
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          logger.error(`Google search timeout (${this.timeout}ms)`);
          return [];
        }

        logger.error(`Google search request failed: ${error.message}`);
      }

      return [];
    }
  }

  async searchStructured(query: string): Promise<WebSearchResult[]> {
    const params = new URLSearchParams({
      key: this.apiKey,
      cx: this.cx,
      q: query,
      num: String(this.numResults),
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${GoogleSearchProvider.ENDPOINT}?${params.toString()}`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Google search HTTP error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as GoogleSearchResponse;

      if (result.error) {
        throw new Error(`Google search API error: ${result.error.message}`);
      }

      if (result?.items && Array.isArray(result.items)) {
        return result.items.map((item) => ({
          title: item.title,
          url: item.link,
          snippet: item.snippet,
        }));
      }
      return [];
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error(`Google search timeout (${this.timeout}ms)`);
      }
      throw error;
    }
  }
}

/**
 * Create web search provider from an explicit config object
 */
export function createWebSearchProviderFromConfig(
  wsConfig: WebSearchConfigData
): WebSearchProvider {
  const searchType = wsConfig.type.toLowerCase();
  // timeout is stored in seconds in config, convert to milliseconds
  const timeoutMs = wsConfig.timeout * 1000;

  switch (searchType) {
    case 'ali_iqs':
      return new AliUnifySearchProvider(wsConfig.apiKey, wsConfig.numResults, timeoutMs);
    case 'baidu':
      return new BaiduSearchProvider(wsConfig.apiKey, wsConfig.numResults, timeoutMs);
    case 'google':
      if (!wsConfig.cx) {
        throw new ToolExecutionError('Google Custom Search requires CX (Search Engine ID)');
      }
      return new GoogleSearchProvider(wsConfig.apiKey, wsConfig.cx, wsConfig.numResults, timeoutMs);
    default:
      throw new ToolExecutionError(`Unsupported web search type: ${wsConfig.type}`);
  }
}

/**
 * Factory function to create web search provider from DB config
 */
async function createWebSearchProvider(): Promise<WebSearchProvider> {
  const { getWebSearchConfig } = await import('../../globalConfig/globalConfig.service');
  const wsConfig = await getWebSearchConfig();
  return createWebSearchProviderFromConfig(wsConfig);
}

/**
 * WebSearch Tool - Performs web search queries using configured search provider
 *
 * Features:
 * - Supports Alibaba Cloud IQS search API
 * - Supports Baidu AI Search API
 * - Supports Google Custom Search API
 * - Configurable timeout and result count
 * - Returns formatted search results with source and summary
 */
export class WebSearch extends Tool {
  name = ToolName.WebSearch;
  description =
    'Use web search engines for real-time information retrieval to get the latest web content and data.';

  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The query keywords or phrase to search for.',
      },
    },
    required: ['query'],
  };

  /**
   * Validate input parameters
   */
  validate(params: ToolParams): boolean {
    const { query } = params;

    if (typeof query !== 'string') {
      throw new ToolExecutionError('Query parameter must be a string');
    }

    if (query.trim().length === 0) {
      throw new ToolExecutionError('Query parameter cannot be empty');
    }

    if (query.length > 500) {
      throw new ToolExecutionError('Query parameter exceeds maximum length of 500 characters');
    }

    return true;
  }

  /**
   * Execute web search
   */
  async execute(params: ToolParams): Promise<ToolResult> {
    try {
      this.validate(params);

      const { query } = params as { query: string };
      const provider = await createWebSearchProvider();

      const results = await provider.search(query);

      return {
        success: true,
        data: results,
        metadata: {
          parameters: params,
          resultCount: results.length,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof ToolExecutionError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      logger.error(`WebSearch execution failed: ${errorMessage}`);

      throw new ToolExecutionError(
        `Failed to execute web search: ${errorMessage}`,
        params,
        error instanceof Error ? error : undefined
      );
    }
  }
}

// Register the WebSearch tool
ToolRegistry.register(new WebSearch());
