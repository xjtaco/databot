/**
 * Utilities for sanitising file content before returning it to the LLM.
 *
 * Long base64-encoded blobs (data-URIs, embedded images / certificates, etc.)
 * burn tokens without adding value.  {@link sanitizeBase64} replaces them with
 * a short human-readable placeholder.
 */

/**
 * Minimum number of base64 characters required before replacement kicks in.
 */
const BASE64_MIN_LENGTH = 256;

/**
 * Matches `data:<mime>;base64,<payload>` where payload >= BASE64_MIN_LENGTH.
 */
const DATA_URI_BASE64_RE = new RegExp(
  `data:[\\w+/.-]+;base64,([A-Za-z0-9+/]{${BASE64_MIN_LENGTH},}={0,2})`,
  'g'
);

/**
 * Matches standalone long runs of base64 characters (256+).
 * Requires the run to NOT be preceded or followed by a word character so that
 * we don't accidentally match long identifiers or paths.
 */
const STANDALONE_BASE64_RE = new RegExp(
  `(?<![\\w])([A-Za-z0-9+/]{${BASE64_MIN_LENGTH},}={0,2})(?![\\w])`,
  'g'
);

/**
 * Replace long base64-encoded content in {@link line} with a short placeholder.
 *
 * Two patterns are handled:
 * 1. **Data URIs** – `data:image/png;base64,AAA…` → `[base64 image/png, 12345 chars]`
 * 2. **Standalone blobs** – a ≥256-char run of base64 alphabet → `[base64 content, 12345 chars]`
 *
 * Short base64 strings (< 256 chars) are left untouched.
 */
export function sanitizeBase64(line: string): string {
  // 1. Data URIs
  let result = line.replace(DATA_URI_BASE64_RE, (_match, payload: string) => {
    const colonIdx = _match.indexOf(':');
    const semiIdx = _match.indexOf(';');
    const mimeType = _match.slice(colonIdx + 1, semiIdx);
    return `[base64 ${mimeType}, ${payload.length} chars]`;
  });

  // 2. Standalone blobs (only on parts not already replaced)
  result = result.replace(STANDALONE_BASE64_RE, (_match, payload: string) => {
    return `[base64 content, ${payload.length} chars]`;
  });

  return result;
}
