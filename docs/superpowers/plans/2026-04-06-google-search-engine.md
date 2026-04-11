# Google Custom Search Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Custom Search JSON API as a third web search engine option alongside existing Alibaba Cloud IQS and Baidu AI Search.

**Architecture:** Extends existing `WebSearchProvider` abstract class with a new `GoogleSearchProvider`. Adds optional `cx` field to the shared config type. Factory `switch` gets one new case. Frontend conditionally shows the CX input when Google type is selected.

**Tech Stack:** TypeScript, Express.js v5, Vue 3, Element Plus, Vitest

**Spec:** `docs/superpowers/specs/2026-04-06-google-search-engine-design.md`

---

### Task 1: Backend — Add `cx` to config types

**Files:**
- Modify: `backend/src/globalConfig/globalConfig.types.ts:11-16`

- [ ] **Step 1: Add `cx` to `WebSearchConfigData`**

In `backend/src/globalConfig/globalConfig.types.ts`, add the optional `cx` field to `WebSearchConfigData`:

```typescript
export interface WebSearchConfigData {
  type: string;
  apiKey: string;
  cx?: string;
  numResults: number;
  timeout: number;
}
```

`WEB_SEARCH_DEFAULTS` stays unchanged — `cx` defaults to `undefined`.

- [ ] **Step 2: Add `cx` to frontend `WebSearchConfigForm`**

In `frontend/src/types/globalConfig.ts`, add the optional `cx` field:

```typescript
export interface WebSearchConfigForm {
  type: string;
  apiKey: string;
  cx?: string;
  numResults: number;
  timeout: number;
}
```

- [ ] **Step 3: Run typecheck to verify**

Run: `cd backend/ && pnpm run typecheck`
Expected: PASS (no type errors — `cx` is optional so existing code is unaffected)

Run: `cd frontend/ && pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/globalConfig/globalConfig.types.ts frontend/src/types/globalConfig.ts
git commit -m "feat: add optional cx field to WebSearchConfigData and WebSearchConfigForm"
```

---

### Task 2: Backend — Config service load/save `cx`

**Files:**
- Modify: `backend/src/globalConfig/globalConfig.service.ts:146-202`

- [ ] **Step 1: Update `getWebSearchConfig()` to read `cx`**

In `backend/src/globalConfig/globalConfig.service.ts`, in the `getWebSearchConfig()` function, after reading `apiKey` (line 162), add reading `cx` from the config map. Then include it in the cached config object:

```typescript
export async function getWebSearchConfig(): Promise<WebSearchConfigData> {
  if (cachedWebSearchConfig) {
    return cachedWebSearchConfig;
  }

  const rows = await getConfigsByCategory('web_search');
  const map = new Map(rows.map((r) => [r.configKey, r.configValue]));

  const type = map.get('web_search_type') ?? WEB_SEARCH_DEFAULTS.type;
  const numResultsRaw = map.get('web_search_num_results');
  const timeoutRaw = map.get('web_search_timeout');

  const numResults = numResultsRaw ? Number(numResultsRaw) : WEB_SEARCH_DEFAULTS.numResults;
  const timeout = timeoutRaw ? Number(timeoutRaw) : WEB_SEARCH_DEFAULTS.timeout;

  const apiKeyRaw = map.get('web_search_api_key');
  const apiKey = apiKeyRaw ? decryptPassword(apiKeyRaw) : WEB_SEARCH_DEFAULTS.apiKey;

  const cx = map.get('web_search_cx') ?? undefined;

  cachedWebSearchConfig = {
    type,
    apiKey,
    ...(cx ? { cx } : {}),
    numResults: Number.isNaN(numResults) ? WEB_SEARCH_DEFAULTS.numResults : numResults,
    timeout: Number.isNaN(timeout) ? WEB_SEARCH_DEFAULTS.timeout : timeout,
  };

  return cachedWebSearchConfig;
}
```

- [ ] **Step 2: Update `saveWebSearchConfig()` to persist `cx`**

In the `saveWebSearchConfig()` function, add `web_search_cx` to the `upsertConfigs` call. `cx` is NOT sensitive — stored as plain text:

```typescript
export async function saveWebSearchConfig(data: WebSearchConfigData): Promise<void> {
  let apiKeyToStore: string;

  if (isPasswordMask(data.apiKey)) {
    const rows = await getConfigsByCategory('web_search');
    const existing = rows.find((r) => r.configKey === 'web_search_api_key');
    if (!existing) {
      throw new ValidationError('Cannot save masked API key without existing value');
    }
    apiKeyToStore = existing.configValue;
  } else {
    apiKeyToStore = encryptPassword(data.apiKey);
  }

  await upsertConfigs('web_search', [
    { key: 'web_search_type', value: data.type },
    { key: 'web_search_api_key', value: apiKeyToStore },
    { key: 'web_search_cx', value: data.cx ?? '' },
    { key: 'web_search_num_results', value: String(data.numResults) },
    { key: 'web_search_timeout', value: String(data.timeout) },
  ]);

  invalidateWebSearchConfigCache();
  logger.info('Web search configuration saved');
}
```

- [ ] **Step 3: Add service-layer tests for `cx` round-trip**

In `backend/tests/globalConfig/globalConfig.service.test.ts`, add the following tests inside the `getWebSearchConfig` describe block (after the existing "should return DB values when rows exist" test):

```typescript
    it('should return cx when web_search_cx exists in DB', async () => {
      mockGetConfigsByCategory.mockResolvedValue([
        { configKey: 'web_search_type', configValue: 'google' },
        { configKey: 'web_search_api_key', configValue: 'enc:google-key' },
        { configKey: 'web_search_cx', configValue: 'my-cx-id' },
        { configKey: 'web_search_num_results', configValue: '5' },
        { configKey: 'web_search_timeout', configValue: '30' },
      ]);

      const config = await getWebSearchConfig();

      expect(config.type).toBe('google');
      expect(config.cx).toBe('my-cx-id');
    });

    it('should not include cx when web_search_cx is absent', async () => {
      mockGetConfigsByCategory.mockResolvedValue([
        { configKey: 'web_search_type', configValue: 'ali_iqs' },
        { configKey: 'web_search_api_key', configValue: 'enc:key' },
      ]);

      const config = await getWebSearchConfig();

      expect(config.cx).toBeUndefined();
    });
```

Add the following test inside the `saveWebSearchConfig` describe block:

```typescript
    it('should persist cx when provided', async () => {
      mockUpsertConfigs.mockResolvedValue(undefined);

      await saveWebSearchConfig({
        type: 'google',
        apiKey: 'key',
        cx: 'my-cx-id',
        numResults: 5,
        timeout: 30,
      });

      expect(mockUpsertConfigs).toHaveBeenCalledWith('web_search', expect.arrayContaining([
        { key: 'web_search_cx', value: 'my-cx-id' },
      ]));
    });

    it('should persist empty cx when not provided', async () => {
      mockUpsertConfigs.mockResolvedValue(undefined);

      await saveWebSearchConfig({
        type: 'ali_iqs',
        apiKey: 'key',
        numResults: 5,
        timeout: 30,
      });

      expect(mockUpsertConfigs).toHaveBeenCalledWith('web_search', expect.arrayContaining([
        { key: 'web_search_cx', value: '' },
      ]));
    });
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd backend/ && pnpm test -- --run globalConfig.service`
Expected: FAIL — new tests fail because `cx` is not yet read/saved

- [ ] **Step 5: Run all backend tests after implementing Step 1 and 2**

Run: `cd backend/ && pnpm test -- --run`
Expected: All tests PASS (existing + new service tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/globalConfig/globalConfig.service.ts backend/tests/globalConfig/globalConfig.service.test.ts
git commit -m "feat: load and persist web_search_cx config value"
```

---

### Task 3: Backend — Controller validation for Google type

**Files:**
- Modify: `backend/src/globalConfig/globalConfig.controller.ts:61-97`
- Modify: `backend/tests/globalConfig/globalConfig.controller.test.ts`

- [ ] **Step 1: Write failing tests for Google validation**

In `backend/tests/globalConfig/globalConfig.controller.test.ts`, **update the existing "invalid search type" test** (line 187-193) — change it from `type: 'google'` to `type: 'bing'` since `google` will now be valid. Then add new test cases in the `saveWebSearchConfigHandler` describe block:

```typescript
it('should throw ValidationError for invalid search type', async () => {
  const body = { type: 'bing', apiKey: 'key', numResults: 3, timeout: 60 };

  await expect(
    saveWebSearchConfigHandler(createMockReq(body), createMockRes())
  ).rejects.toThrow('Search provider type must be one of');
});

it('should validate and save google config with cx', async () => {
  const body = { type: 'google', apiKey: 'key', cx: 'my-cx-id', numResults: 3, timeout: 60 };
  const responseConfig = { ...body, apiKey: '********' };

  mockSaveWebSearchConfig.mockResolvedValue(undefined);
  mockGetWebSearchConfigResponse.mockResolvedValue(responseConfig);

  const res = createMockRes();
  await saveWebSearchConfigHandler(createMockReq(body), res);

  expect(mockSaveWebSearchConfig).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'google', cx: 'my-cx-id' })
  );
  expect(res.json).toHaveBeenCalledWith(responseConfig);
});

it('should throw ValidationError for google type without cx', async () => {
  const body = { type: 'google', apiKey: 'key', numResults: 3, timeout: 60 };

  await expect(
    saveWebSearchConfigHandler(createMockReq(body), createMockRes())
  ).rejects.toThrow('Search Engine ID (CX) is required');
});

it('should strip cx when type is not google', async () => {
  const body = { type: 'ali_iqs', apiKey: 'key', cx: 'stale-cx', numResults: 3, timeout: 60 };
  const responseConfig = { type: 'ali_iqs', apiKey: '********', numResults: 3, timeout: 60 };

  mockSaveWebSearchConfig.mockResolvedValue(undefined);
  mockGetWebSearchConfigResponse.mockResolvedValue(responseConfig);

  const res = createMockRes();
  await saveWebSearchConfigHandler(createMockReq(body), res);

  expect(mockSaveWebSearchConfig).toHaveBeenCalledWith(
    expect.not.objectContaining({ cx: 'stale-cx' })
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend/ && pnpm test -- --run globalConfig.controller`
Expected: FAIL — new tests fail because `google` is not yet in `validTypes`

- [ ] **Step 3: Update `validateWebSearchConfig()` in controller**

In `backend/src/globalConfig/globalConfig.controller.ts`, update the `validateWebSearchConfig` function:

```typescript
function validateWebSearchConfig(body: unknown): WebSearchConfigData {
  const data = body as Record<string, unknown>;

  if (typeof data.type !== 'string' || data.type.trim() === '') {
    throw new ValidationError('Search provider type is required');
  }

  const validTypes = ['ali_iqs', 'baidu', 'google'];
  if (!validTypes.includes(data.type.trim().toLowerCase())) {
    throw new ValidationError(`Search provider type must be one of: ${validTypes.join(', ')}`);
  }

  if (typeof data.apiKey !== 'string') {
    throw new ValidationError('API Key is required');
  }

  if (!isPasswordMask(data.apiKey) && data.apiKey.trim() === '') {
    throw new ValidationError('API Key cannot be empty');
  }

  const numResults = Number(data.numResults);
  if (isNaN(numResults) || numResults < 1 || numResults > 20) {
    throw new ValidationError('Number of results must be between 1 and 20');
  }

  const timeout = Number(data.timeout);
  if (isNaN(timeout) || timeout < 5 || timeout > 120) {
    throw new ValidationError('Timeout must be between 5 and 120 seconds');
  }

  const type = data.type.trim().toLowerCase();

  let cx: string | undefined;
  if (type === 'google') {
    if (typeof data.cx !== 'string' || data.cx.trim() === '') {
      throw new ValidationError('Search Engine ID (CX) is required for Google search');
    }
    cx = data.cx.trim();
  }

  return {
    type,
    apiKey: data.apiKey,
    ...(cx ? { cx } : {}),
    numResults,
    timeout,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend/ && pnpm test -- --run globalConfig.controller`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/globalConfig/globalConfig.controller.ts backend/tests/globalConfig/globalConfig.controller.test.ts
git commit -m "feat: add google to valid web search types with cx validation"
```

---

### Task 4: Backend — GoogleSearchProvider class

**Files:**
- Modify: `backend/src/infrastructure/tools/webSearch.ts`
- Create: `backend/tests/infrastructure/tools/webSearchTool/google-provider.test.ts`

- [ ] **Step 1: Write failing tests for GoogleSearchProvider**

Create `backend/tests/infrastructure/tools/webSearchTool/google-provider.test.ts`. Follow the same mock structure as `basic-execution.test.ts` but configure the mock `getWebSearchConfig` to return `type: 'google'` with a `cx` field:

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
    webSearch: { type: 'google', apiKey: 'test-google-key', timeout: 60, numResults: 5 },
  },
}));

vi.mock('../../../../src/globalConfig/globalConfig.service', () => ({
  getWebSearchConfig: () =>
    Promise.resolve({
      type: 'google',
      apiKey: 'test-google-key',
      cx: 'test-cx-id',
      numResults: 5,
      timeout: 60,
    }),
}));

import { createWebSearchProviderFromConfig } from '../../../../src/infrastructure/tools/webSearch';
import type { WebSearchConfigData } from '../../../../src/globalConfig/globalConfig.types';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GoogleSearchProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should make GET request with correct query params', async () => {
    const googleResponse = {
      items: [
        { title: 'Result 1', link: 'https://example.com/1', snippet: 'Snippet 1' },
        { title: 'Result 2', link: 'https://test.org/2', snippet: 'Snippet 2' },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => googleResponse,
    });

    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'test-google-key',
      cx: 'test-cx-id',
      numResults: 5,
      timeout: 60,
    };
    const provider = createWebSearchProviderFromConfig(config);
    const results = await provider.search('test query');

    expect(results).toHaveLength(2);
    expect(results[0]).toBe('Source: https://example.com/1: Title: Result 1 Content: Snippet 1');
    expect(results[1]).toBe('Source: https://test.org/2: Title: Result 2 Content: Snippet 2');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://www.googleapis.com/customsearch/v1');
    expect(url).toContain('key=test-google-key');
    expect(url).toContain('cx=test-cx-id');
    expect(url).toContain('q=test+query');
    expect(url).toContain('num=5');
    expect(options.method).toBe('GET');
  });

  it('should cap num at 10 even if numResults is higher', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'key',
      cx: 'cx-id',
      numResults: 20,
      timeout: 60,
    };
    const provider = createWebSearchProviderFromConfig(config);
    await provider.search('test');

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('num=10');
  });

  it('should return empty array when no items in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'key',
      cx: 'cx-id',
      numResults: 5,
      timeout: 60,
    };
    const provider = createWebSearchProviderFromConfig(config);
    const results = await provider.search('empty query');

    expect(results).toEqual([]);
  });

  it('should handle HTTP error gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'key',
      cx: 'cx-id',
      numResults: 5,
      timeout: 60,
    };
    const provider = createWebSearchProviderFromConfig(config);
    const results = await provider.search('forbidden query');

    expect(results).toEqual([]);
  });

  it('should handle error body in 200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        error: { code: 429, message: 'Rate limit exceeded' },
      }),
    });

    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'key',
      cx: 'cx-id',
      numResults: 5,
      timeout: 60,
    };
    const provider = createWebSearchProviderFromConfig(config);
    const results = await provider.search('rate limited query');

    expect(results).toEqual([]);
  });

  it('should handle timeout gracefully', async () => {
    const abortError = new Error('AbortError');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'key',
      cx: 'cx-id',
      numResults: 5,
      timeout: 60,
    };
    const provider = createWebSearchProviderFromConfig(config);
    const results = await provider.search('timeout query');

    expect(results).toEqual([]);
  });

  it('should throw ToolExecutionError when cx is missing', () => {
    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'key',
      numResults: 5,
      timeout: 60,
    };

    expect(() => createWebSearchProviderFromConfig(config)).toThrow(
      'Google Custom Search requires CX (Search Engine ID)'
    );
  });

  it('searchStructured should return structured results', async () => {
    const googleResponse = {
      items: [
        { title: 'Title A', link: 'https://a.com', snippet: 'Snippet A' },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => googleResponse,
    });

    const config: WebSearchConfigData = {
      type: 'google',
      apiKey: 'key',
      cx: 'cx-id',
      numResults: 5,
      timeout: 60,
    };
    const provider = createWebSearchProviderFromConfig(config);
    const results = await provider.searchStructured('test');

    expect(results).toEqual([
      { title: 'Title A', url: 'https://a.com', snippet: 'Snippet A' },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend/ && pnpm test -- --run google-provider`
Expected: FAIL — `GoogleSearchProvider` class does not exist yet, factory throws "Unsupported web search type: google"

- [ ] **Step 3: Implement GoogleSearchProvider and factory case**

In `backend/src/infrastructure/tools/webSearch.ts`, add the Google response interfaces after the Baidu interfaces (after line 40):

```typescript
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
```

Add the `GoogleSearchProvider` class after `BaiduSearchProvider` (after line 304):

```typescript
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
        logger.info(
          `Google search returned ${result.items.length} results for query: "${query}"`
        );
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
```

Add the factory case in `createWebSearchProviderFromConfig()` — add before the `default:` line:

```typescript
    case 'google':
      if (!wsConfig.cx) {
        throw new ToolExecutionError('Google Custom Search requires CX (Search Engine ID)');
      }
      return new GoogleSearchProvider(wsConfig.apiKey, wsConfig.cx, wsConfig.numResults, timeoutMs);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend/ && pnpm test -- --run google-provider`
Expected: All tests PASS

- [ ] **Step 5: Run all backend tests to check for regressions**

Run: `cd backend/ && pnpm test -- --run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/infrastructure/tools/webSearch.ts backend/tests/infrastructure/tools/webSearchTool/google-provider.test.ts
git commit -m "feat: add GoogleSearchProvider with factory integration"
```

---

### Task 5: Frontend — i18n strings

**Files:**
- Modify: `frontend/src/locales/zh-CN.ts` (inside `settings.webSearch` object, around line 215)
- Modify: `frontend/src/locales/en-US.ts` (inside `settings.webSearch` object, around line 216)

- [ ] **Step 1: Add Chinese locale strings**

In `frontend/src/locales/zh-CN.ts`, add the following keys inside the `webSearch` object, after `typeBaidu: '百度搜索',` (line 215):

```typescript
      typeGoogle: 'Google 搜索',
      cx: '搜索引擎 ID (CX)',
      cxPlaceholder: '输入 Google 自定义搜索引擎 ID',
      cxRequired: '搜索引擎 ID 不能为空',
      googleNumResultsHint: 'Google 搜索最多返回 10 条结果',
```

- [ ] **Step 2: Add English locale strings**

In `frontend/src/locales/en-US.ts`, add the following keys inside the `webSearch` object, after `typeBaidu: 'Baidu Search',` (line 216):

```typescript
      typeGoogle: 'Google Search',
      cx: 'Search Engine ID (CX)',
      cxPlaceholder: 'Enter Google Custom Search Engine ID',
      cxRequired: 'Search Engine ID is required',
      googleNumResultsHint: 'Google Search returns a maximum of 10 results',
```

- [ ] **Step 3: Run frontend typecheck**

Run: `cd frontend/ && pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/locales/zh-CN.ts frontend/src/locales/en-US.ts
git commit -m "feat: add i18n strings for Google search engine config"
```

---

### Task 6: Frontend — WebSearchConfigCard.vue Google option + CX field

**Files:**
- Modify: `frontend/src/components/settings/WebSearchConfigCard.vue`

- [ ] **Step 1: Add Google option to dropdown**

In `frontend/src/components/settings/WebSearchConfigCard.vue`, in the `<el-select>` for search type (line 23-24), add the Google option after Baidu:

```vue
            <el-option :label="t('settings.webSearch.typeAliIQS')" value="ali_iqs" />
            <el-option :label="t('settings.webSearch.typeBaidu')" value="baidu" />
            <el-option :label="t('settings.webSearch.typeGoogle')" value="google" />
```

- [ ] **Step 2: Add `cx` to reactive formData**

In the `<script setup>` section (line 104-109), add `cx` to the reactive form data:

```typescript
const formData = reactive({
  type: 'ali_iqs',
  apiKey: '',
  cx: '',
  numResults: 3,
  timeout: 60,
});
```

- [ ] **Step 3: Add conditional CX input field**

In the template, after the apiKey `config-field` div (after line 41, end of the apiKey field), add a conditional CX field that only shows when Google is selected. Add it as a new row before the numResults/timeout row:

```vue
      <div v-if="formData.type === 'google'" class="config-card__row">
        <div class="config-field" style="flex: 1">
          <label class="config-field__label">{{ t('settings.webSearch.cx') }}</label>
          <div class="config-field__input-box">
            <input
              v-model="formData.cx"
              type="text"
              class="config-field__input"
              :placeholder="t('settings.webSearch.cxPlaceholder')"
              :disabled="isSubmitting"
            />
          </div>
        </div>
      </div>
```

- [ ] **Step 4: Add Google-specific hint on numResults field**

In the template, after the numResults input (after the closing `</div>` of the numResults `config-field`, around line 57), add a conditional hint:

```vue
          <span v-if="formData.type === 'google'" class="config-field__hint">
            {{ t('settings.webSearch.googleNumResultsHint') }}
          </span>
```

Add the hint style in `frontend/src/components/settings/_config-card.scss`, inside the `.config-field` block after the `&__toggle` block (after line 166), using the existing design tokens:

```scss
  &__hint {
    font-size: $font-size-xs;
    line-height: 1.4;
    color: $text-muted;
  }
```

- [ ] **Step 5: Load `cx` from store on mount**

In the `onMounted` callback (line 123-138), add loading `cx` from the store config:

```typescript
onMounted(async () => {
  isLoading.value = true;
  try {
    await store.fetchWebSearchConfig();
    if (store.webSearchConfig) {
      formData.type = store.webSearchConfig.type;
      formData.apiKey = store.webSearchConfig.apiKey;
      formData.cx = store.webSearchConfig.cx ?? '';
      formData.numResults = store.webSearchConfig.numResults;
      formData.timeout = store.webSearchConfig.timeout;
    }
  } catch {
    // Use defaults
  } finally {
    isLoading.value = false;
  }
});
```

- [ ] **Step 6: Run frontend preflight**

Run: `cd frontend/ && pnpm run preflight`
Expected: PASS (typecheck, lint, build all pass)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/settings/WebSearchConfigCard.vue frontend/src/components/settings/_config-card.scss
git commit -m "feat: add Google search option with conditional CX field in settings"
```

---

### Task 7: Frontend — WebSearchConfigCard tests

**Files:**
- Create: `frontend/tests/components/settings/WebSearchConfigCard.test.ts`

- [ ] **Step 1: Write tests for Google option and CX field**

Create `frontend/tests/components/settings/WebSearchConfigCard.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import WebSearchConfigCard from '@/components/settings/WebSearchConfigCard.vue';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

vi.mock('@/api/globalConfig', () => ({
  getWebSearchConfig: vi.fn().mockResolvedValue({
    type: 'ali_iqs',
    apiKey: '********',
    numResults: 3,
    timeout: 60,
  }),
  saveWebSearchConfig: vi.fn(),
  testWebSearchConnection: vi.fn(),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});

function mountCard() {
  return mount(WebSearchConfigCard, {
    global: { plugins: [i18n, createPinia(), ElementPlus] },
    attachTo: document.body,
  });
}

describe('WebSearchConfigCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders Google option in the search type dropdown', () => {
    const wrapper = mountCard();
    // el-option elements are rendered inside the el-select component
    const selectEl = wrapper.findComponent({ name: 'ElSelect' });
    expect(selectEl.exists()).toBe(true);
    // Verify Google option exists by checking the el-option components
    const options = wrapper.findAllComponents({ name: 'ElOption' });
    const values = options.map((o) => o.props('value'));
    expect(values).toContain('google');
  });

  it('does not show CX field when type is ali_iqs', () => {
    const wrapper = mountCard();
    expect(wrapper.text()).not.toContain('Search Engine ID (CX)');
  });

  it('shows CX field when type is google', async () => {
    const wrapper = mountCard();
    // Simulate selecting google type by changing the reactive formData
    const vm = wrapper.vm as unknown as { formData: { type: string } };
    vm.formData.type = 'google';
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Search Engine ID (CX)');
  });

  it('shows numResults hint when type is google', async () => {
    const wrapper = mountCard();
    const vm = wrapper.vm as unknown as { formData: { type: string } };
    vm.formData.type = 'google';
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Google Search returns a maximum of 10 results');
  });
});
```

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend/ && pnpm test -- --run WebSearchConfigCard`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/components/settings/WebSearchConfigCard.test.ts
git commit -m "test: add WebSearchConfigCard tests for Google search option"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full backend preflight**

Run: `cd backend/ && pnpm run preflight`
Expected: PASS (lint, typecheck, build all pass)

- [ ] **Step 2: Run full frontend preflight**

Run: `cd frontend/ && pnpm run preflight`
Expected: PASS (lint, typecheck, stylelint, build all pass)

- [ ] **Step 3: Run all backend tests**

Run: `cd backend/ && pnpm test -- --run`
Expected: All tests PASS

- [ ] **Step 4: Run all frontend tests**

Run: `cd frontend/ && pnpm test -- --run`
Expected: All tests PASS
