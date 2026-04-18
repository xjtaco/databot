# WebFetch Tool Design

## Overview

Add a `webfetch` tool to `coreAgent`, `copilotAgent`, and `debugAgent` that fetches a webpage, extracts user-visible text using heavy content filtering, and returns it in context-safe chunks. The tool also extracts up to 10 relevant sub-links so the LLM can decide whether to cascade reads.

## Context

- The agents use a `Tool` base class with JSON Schema parameters and async `execute()` methods.
- Tools are registered in a global `ToolRegistry` (for `CoreAgentSession`) and per-agent registries (for `CopilotAgent` and `DebugAgent`).
- There is already a `WebSearch` tool but no generic page-fetching tool.
- The backend uses native `fetch()` and has `iconv-lite` for encoding handling.

## Architecture

- A new `WebFetchTool` class in `backend/src/infrastructure/tools/webFetch.ts` extending the abstract `Tool` base class.
- Registered in:
  - Global `ToolRegistry` (`backend/src/infrastructure/tools/index.ts`) for `CoreAgentSession`
  - `createCopilotToolRegistry()` (`backend/src/copilot/copilotTools.ts`) for `CopilotAgent`
  - `createDebugToolRegistry()` (`backend/src/copilot/debugTools.ts`) for `DebugAgent`
- Uses `cheerio` as the HTML parser (new dependency).
- No frontend changes required; standard `tool_start`/`tool_done` events are emitted.

## Tool Parameters

```json
{
  "url": {
    "type": "string",
    "description": "The page URL to fetch"
  },
  "offset": {
    "type": "number",
    "default": 0,
    "description": "Character offset to start reading from"
  },
  "maxChars": {
    "type": "number",
    "default": 8000,
    "description": "Maximum characters to return in this chunk"
  }
}
```

## Two-Step Flow

1. **First call** — `offset=0`. The tool fetches the page, extracts main content, and returns the first `maxChars` chunk.
2. **Follow-up call** — If the response has `hasMore: true`, the LLM calls again with `offset=nextOffset` to get the next chunk.

## Extraction Logic

Using `cheerio`:

1. **Content targeting** — Try selectors in order: `article`, `[role="main"]`, `main`, `.post-content`, `.entry-content`, `.article-body`. Fallback to `body` if none found.
2. **Element stripping** — Remove: `script`, `style`, `nav`, `footer`, `aside`, `header`, `noscript`, `iframe`, `svg`, `form`, `button`, `input`, and classes/IDs: `.ad`, `.ads`, `.sidebar`, `.comments`, `.cookie-banner`, `.newsletter-signup`.
3. **Text conversion**
   - Block elements (`p`, `div`, `h1-h6`, `li`, `td`, `pre`) → add `\n\n` separators.
   - Inline elements → unwrap, keep text.
   - `a` → convert to `text (url)` format only if the link passes the smart filter.
   - `img` → include alt text if present: `[Image: alt text]`.
   - Collapse multiple whitespace/newlines.
4. **Truncation** — After extraction, if total text > `offset + maxChars`, slice and append a `(truncated...)` notice. Set `hasMore: true` and `nextOffset` accordingly.

## Smart Link Filtering

When extracting `<a>` tags from the content area:

1. **Exclude patterns**
   - Social/share links (`twitter.com`, `facebook.com`, `linkedin.com`, `share?`, `/share/`)
   - Login/auth links (`login`, `signin`, `auth`, `register`)
   - Anchor-only links (`href="#..."`, `href="javascript:..."`)
   - Mailto/tel links
   - Ads/sponsored (`/ad/`, `utm_`, `sponsored`)
   - External tracking/short URLs (`bit.ly`, `t.co`)
2. **Scoring**
   - Same domain as fetched page: +10 points
   - Meaningful text length > 20 chars: +5 points
   - Contains keywords like "guide", "tutorial", "reference", "docs": +3 points
   - URL path depth > 1: +2 points
3. **Selection** — Sort by score descending, take top 10. Return `{ text: string, url: string }` with relative URLs resolved against the page base URL.

## Response Shape

```json
{
  "title": "Page Title",
  "url": "https://example.com/article",
  "content": "Extracted text...",
  "hasMore": true,
  "nextOffset": 8000,
  "extractedLinks": [
    { "text": "Related Article", "url": "https://example.com/related" }
  ],
  "isTruncated": false
}
```

## Error Handling

| Scenario | Behavior |
|---|---|
| Invalid URL | Validate with `new URL(url)`. Return `{ error: "Invalid URL: ..." }` |
| Network failure / timeout | 10s fetch timeout via `AbortController`. Return `{ error: "Failed to fetch page: <message>" }` |
| Non-HTML response | Check `Content-Type` header. If not `text/html`, return `{ error: "URL returned non-HTML content: <type>" }` |
| HTTP error (4xx/5xx) | Return `{ error: "HTTP <status>: <statusText>" }` |
| Empty extraction result | If filtered content is < 50 chars, return `{ error: "Page content is empty or could not be extracted." }` |
| Relative URLs | Resolve against page base URL before returning |
| Encoding issues | Use `iconv-lite` (already a dependency) based on `Content-Type` charset or `<meta charset>` |

## Limitations

- This is a **static HTML parser only**. JavaScript-rendered SPAs may return empty or incomplete content because `cheerio` does not execute JavaScript. A headless-browser fallback can be added in a future version if needed.

## Dependencies

- `cheerio` — lightweight server-side HTML parser (new dependency in `backend/package.json`).
- `iconv-lite` — already present for encoding handling.

## Testing Plan

- Unit tests in `backend/tests/` covering:
  - Successful fetch and extraction from static HTML
  - Content targeting (`<article>`, `<main>`, fallback)
  - Element stripping (scripts, ads, nav)
  - Smart link filtering and scoring
  - Two-step chunking (`offset`/`maxChars`/`hasMore`)
  - Error cases (invalid URL, timeout, non-HTML, empty result)
