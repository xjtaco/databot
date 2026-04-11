import { describe, it, expect } from 'vitest';
import { sanitizeBase64 } from '../../../src/infrastructure/tools/contentSanitizer';

/** Helper: generate a string of repeating base64-safe characters */
function b64(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[i % chars.length];
  }
  return result;
}

describe('sanitizeBase64', () => {
  describe('data URI patterns', () => {
    it('should replace a long data:image/png;base64 URI', () => {
      const payload = b64(500);
      const line = `background: url("data:image/png;base64,${payload}");`;

      const result = sanitizeBase64(line);

      expect(result).toBe(`background: url("[base64 image/png, ${payload.length} chars]");`);
      expect(result).not.toContain(payload);
    });

    it('should replace a long data:application/pdf;base64 URI', () => {
      const payload = b64(1000);
      const line = `"file": "data:application/pdf;base64,${payload}"`;

      const result = sanitizeBase64(line);

      expect(result).toContain('[base64 application/pdf, 1000 chars]');
      expect(result).not.toContain(payload);
    });

    it('should NOT replace a short data URI (below threshold)', () => {
      const payload = b64(100);
      const line = `data:image/png;base64,${payload}`;

      const result = sanitizeBase64(line);

      expect(result).toBe(line);
    });

    it('should handle multiple data URIs in one line', () => {
      const p1 = b64(300);
      const p2 = b64(400);
      const line = `url("data:image/png;base64,${p1}") url("data:image/jpeg;base64,${p2}")`;

      const result = sanitizeBase64(line);

      expect(result).toContain('[base64 image/png, 300 chars]');
      expect(result).toContain('[base64 image/jpeg, 400 chars]');
      expect(result).not.toContain(p1);
      expect(result).not.toContain(p2);
    });

    it('should handle base64 payload with padding characters', () => {
      const payload = b64(298) + '==';
      const line = `data:image/gif;base64,${payload}`;

      const result = sanitizeBase64(line);

      expect(result).toContain('[base64 image/gif, 300 chars]');
    });
  });

  describe('standalone base64 patterns', () => {
    it('should replace a long standalone base64 string', () => {
      const payload = b64(500);
      const line = `"certificate": "${payload}"`;

      const result = sanitizeBase64(line);

      expect(result).toBe(`"certificate": "[base64 content, ${payload.length} chars]"`);
    });

    it('should NOT replace a short standalone base64 string', () => {
      const payload = b64(100);
      const line = `"token": "${payload}"`;

      const result = sanitizeBase64(line);

      expect(result).toBe(line);
    });

    it('should replace a long base64 string surrounded by non-word characters', () => {
      // Quotes, spaces etc. are not \w — the lookbehind/lookahead pass
      const payload = b64(300);
      const line = `const x = "${payload}";`;

      const result = sanitizeBase64(line);

      expect(result).toContain('[base64 content, 300 chars]');
      expect(result).not.toContain(payload);
    });

    it('should NOT match when preceded and followed by underscores (word boundary)', () => {
      // Underscore is \w but NOT in [A-Za-z0-9+/], so it breaks
      // the character-class run and the lookbehind/lookahead prevent the match
      const middle = b64(300);
      const line = `some_var_${middle}_end_part`;

      const result = sanitizeBase64(line);

      expect(result).toBe(line);
    });
  });

  describe('no false positives', () => {
    it('should leave normal code lines untouched', () => {
      const line = 'const x = await fs.readFile("/some/path", "utf-8");';

      const result = sanitizeBase64(line);

      expect(result).toBe(line);
    });

    it('should leave short lines untouched', () => {
      const line = 'hello world';

      const result = sanitizeBase64(line);

      expect(result).toBe(line);
    });

    it('should leave empty lines untouched', () => {
      expect(sanitizeBase64('')).toBe('');
    });

    it('should leave lines with short base64-like tokens untouched', () => {
      const line = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';

      const result = sanitizeBase64(line);

      expect(result).toBe(line);
    });
  });

  describe('mixed content', () => {
    it('should only replace base64 portion and keep surrounding text', () => {
      const payload = b64(400);
      const line = `prefix text "${payload}" suffix text`;

      const result = sanitizeBase64(line);

      expect(result).toContain('prefix text');
      expect(result).toContain('suffix text');
      expect(result).toContain('[base64 content, 400 chars]');
      expect(result).not.toContain(payload);
    });

    it('should handle line with both data URI and standalone base64', () => {
      const uriPayload = b64(300);
      const standalonePayload = b64(500);
      const line = `data:image/png;base64,${uriPayload} and "${standalonePayload}"`;

      const result = sanitizeBase64(line);

      expect(result).toContain('[base64 image/png, 300 chars]');
      expect(result).toContain('[base64 content, 500 chars]');
    });
  });
});
