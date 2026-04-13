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
 * Summary describing a detected base64 payload.
 */
export interface Base64Summary {
  kind: 'base64';
  mimeType?: string;
  chars: number;
}

function isLikelyStandaloneBase64(value: string): boolean {
  if (value.length < BASE64_MIN_LENGTH || value.length % 4 !== 0) {
    return false;
  }

  // Be conservative for standalone blobs: require non-alphanumeric base64 markers
  // so long tokens/slugs are not misclassified as base64.
  return /[+/=]/.test(value);
}

/**
 * Detect a full-string base64 payload, either as a data URI or a standalone blob.
 */
export function summarizeBase64String(value: string): Base64Summary | null {
  const dataUriMatch = value.match(
    new RegExp(`^data:([\\w+/.-]+);base64,([A-Za-z0-9+/]{${BASE64_MIN_LENGTH},}={0,2})$`)
  );
  if (dataUriMatch) {
    return {
      kind: 'base64',
      mimeType: dataUriMatch[1],
      chars: dataUriMatch[2].length,
    };
  }

  const standaloneMatch = value.match(new RegExp(`^([A-Za-z0-9+/]{${BASE64_MIN_LENGTH},}={0,2})$`));
  if (standaloneMatch && isLikelyStandaloneBase64(standaloneMatch[1])) {
    return {
      kind: 'base64',
      chars: standaloneMatch[1].length,
    };
  }

  return null;
}

/**
 * Matches `data:<mime>;base64,<payload>` where payload >= BASE64_MIN_LENGTH.
 */
const DATA_URI_BASE64_RE = new RegExp(
  `data:([\\w+/.-]+);base64,([A-Za-z0-9+/]{${BASE64_MIN_LENGTH},}={0,2})`,
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
  let result = line.replace(DATA_URI_BASE64_RE, (_match, mimeType: string, payload: string) => {
    return `[base64 ${mimeType}, ${payload.length} chars]`;
  });

  // 2. Standalone blobs (only on parts not already replaced)
  result = result.replace(STANDALONE_BASE64_RE, (_match, payload: string) => {
    if (!isLikelyStandaloneBase64(payload)) {
      return payload;
    }
    return `[base64 content, ${payload.length} chars]`;
  });

  return result;
}
