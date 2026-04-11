# Google Custom Search Engine Integration

## Summary

Add Google Custom Search JSON API as a third web search engine option alongside existing Alibaba Cloud IQS and Baidu AI Search. Follows the existing factory pattern with minimal structural changes.

## Background

The global config system supports two web search providers (`ali_iqs`, `baidu`) via a `WebSearchProvider` abstract class and `createWebSearchProviderFromConfig()` factory. Google Custom Search requires an additional `cx` (Custom Search Engine ID) parameter beyond the shared `apiKey`/`numResults`/`timeout` fields.

## Design

### 1. Backend — GoogleSearchProvider

New class in `backend/src/infrastructure/tools/webSearch.ts`:

- Extends `WebSearchProvider`
- Endpoint: `https://www.googleapis.com/customsearch/v1` (GET request, unlike Ali/Baidu POST)
- Query params: `key`, `cx`, `q`, `num`
- `num` capped at `Math.min(numResults, 10)` (Google API limit; other providers pass through uncapped — this is a Google-specific constraint)
- If `response.ok` but `result.error` is present (e.g. quota/auth issues), throw `ToolExecutionError` with the error message
- Response `items[]` mapped to: `Source: ${item.link}: Title: ${item.title} Content: ${item.snippet}` (matches Baidu format)
- `searchStructured()` maps `items[]` to `{ title, url: link, snippet }`
- Timeout and error handling follow existing provider patterns

Google API response interface:

```typescript
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

### 2. Backend — Config Types (`globalConfig.types.ts`)

- Add optional `cx?: string` to `WebSearchConfigData`
- `WEB_SEARCH_DEFAULTS` unchanged (cx defaults to `undefined`)

### 3. Backend — Config Service (`globalConfig.service.ts`)

- `getWebSearchConfig()`: read `web_search_cx` from config map, assign to `cx` field (not encrypted, not sensitive)
- `getWebSearchConfigResponse()`: no masking needed for `cx`
- `saveWebSearchConfig()`: persist `web_search_cx` alongside other keys
- `resolveWebSearchTestConfig()`: no special handling for `cx` (not sensitive)

### 4. Backend — Controller Validation (`globalConfig.controller.ts`)

- `validateWebSearchConfig()`:
  - Add `'google'` to `validTypes` array
  - Parse `cx` from body as optional string
  - When `type === 'google'`, validate `cx` is a non-empty string
  - When `type !== 'google'`, set `cx` to `undefined` to avoid stale data in DB
  - Return `cx` in the validated object

### 5. Backend — Factory (`webSearch.ts`)

Add case in `createWebSearchProviderFromConfig()`:

```typescript
case 'google':
  if (!wsConfig.cx) {
    throw new ToolExecutionError('Google Custom Search requires CX (Search Engine ID)');
  }
  return new GoogleSearchProvider(wsConfig.apiKey, wsConfig.cx, wsConfig.numResults, timeoutMs);
```

### 6. Frontend — Types (`types/globalConfig.ts`)

- Add optional `cx?: string` to `WebSearchConfigForm`

### 7. Frontend — WebSearchConfigCard.vue

- Add `<el-option>` for Google: `value="google"`
- Add `cx` to reactive `formData` (default `''`)
- Conditional `cx` input field: `v-if="formData.type === 'google'"`, regular text input (not password)
- Load `cx` from store config on mount
- Form validation: when type is `google`, cx required

### 8. Frontend — i18n

**zh-CN.ts** additions in `settings.webSearch`:
```
typeGoogle: 'Google 搜索'
cx: '搜索引擎 ID (CX)'
cxPlaceholder: '输入 Google 自定义搜索引擎 ID'
cxRequired: '搜索引擎 ID 不能为空'
googleNumResultsHint: 'Google 搜索最多返回 10 条结果'
```

**en-US.ts** additions in `settings.webSearch`:
```
typeGoogle: 'Google Search'
cx: 'Search Engine ID (CX)'
cxPlaceholder: 'Enter Google Custom Search Engine ID'
cxRequired: 'Search Engine ID is required'
googleNumResultsHint: 'Google Search returns a maximum of 10 results'
```

### 9. Testing

**Backend unit tests** (`backend/tests/infrastructure/tools/webSearchTool/`):
- New test file or test group for GoogleSearchProvider:
  - Successful search with parsed results
  - Empty results handling (no items)
  - HTTP error handling
  - `num` capped at 10
  - GET request with correct query params

**Backend config/controller tests** (`backend/tests/globalConfig/globalConfig.controller.test.ts`):
- Validation accepts `google` type with valid `cx`
- Validation rejects `google` type without `cx`
- Config load/save round-trips `cx` field
- `ali_iqs`/`baidu` types ignore `cx`
- **Update existing test**: the current "invalid search type" test uses `type: 'google'` as an invalid example — change it to a different invalid type (e.g. `'bing'`)

**Frontend tests** (`frontend/tests/components/settings/WebSearchConfigCard.test.ts` — new file):
- Google option appears in dropdown
- CX field shown/hidden based on type selection

## Files Changed

| File | Change |
|------|--------|
| `backend/src/infrastructure/tools/webSearch.ts` | Add `GoogleSearchProvider` class + factory case |
| `backend/src/globalConfig/globalConfig.types.ts` | Add `cx?: string` to `WebSearchConfigData` |
| `backend/src/globalConfig/globalConfig.service.ts` | Load/save `web_search_cx` |
| `backend/src/globalConfig/globalConfig.controller.ts` | Validate `google` type + `cx` field |
| `frontend/src/types/globalConfig.ts` | Add `cx?: string` to `WebSearchConfigForm` |
| `frontend/src/components/settings/WebSearchConfigCard.vue` | Google option + conditional cx input |
| `frontend/src/locales/zh-CN.ts` | Google-related strings |
| `frontend/src/locales/en-US.ts` | Google-related strings |
| `backend/tests/` | GoogleSearchProvider + config tests |
| `frontend/tests/` | WebSearchConfigCard Google option tests |

## Not Changed

- Database schema (reuses existing `global_configs` key-value table)
- API routes (reuses existing CRUD + test endpoints)
- Encryption logic (`cx` is not sensitive — stored and returned as plain text, not encrypted/decrypted like `apiKey`)
- Store logic (already passes full form data through)
- API layer (already sends full form data)
