import { describe, expect, it } from 'vitest';
import { sanitizeForLlm } from '../../../src/infrastructure/tools/objectSanitizer';

function b64(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[i % chars.length];
  }
  return result;
}

describe('sanitizeForLlm', () => {
  it('keeps short strings unchanged', () => {
    expect(sanitizeForLlm({ note: 'short text' })).toEqual({ note: 'short text' });
  });

  it('summarizes long text with preview', () => {
    const longText = 'abc '.repeat(400);

    expect(sanitizeForLlm({ prompt: longText })).toEqual({
      _sanitized: {
        applied: true,
        reasons: ['large_text'],
      },
      prompt: {
        _summary: {
          kind: 'text',
          chars: longText.length,
          preview: longText.slice(0, 160),
        },
      },
    });
  });

  it('summarizes data-uri base64 without preview', () => {
    const payload = b64(800);
    const value = `data:image/png;base64,${payload}`;

    expect(sanitizeForLlm({ image: value })).toEqual({
      _sanitized: {
        applied: true,
        reasons: ['base64'],
      },
      image: {
        _summary: {
          kind: 'base64',
          mimeType: 'image/png',
          chars: payload.length,
        },
      },
    });
  });

  it('summarizes oversized arrays with preview items', () => {
    expect(
      sanitizeForLlm({
        rows: Array.from({ length: 8 }, (_, index) => ({ id: index + 1, value: `row-${index + 1}` })),
      })
    ).toEqual({
      _sanitized: {
        applied: true,
        reasons: ['array_truncated'],
      },
      rows: {
        _summary: {
          kind: 'array',
          totalItems: 8,
          keptItems: 5,
        },
        items: [
          { id: 1, value: 'row-1' },
          { id: 2, value: 'row-2' },
          { id: 3, value: 'row-3' },
          { id: 4, value: 'row-4' },
          { id: 5, value: 'row-5' },
        ],
      },
    });
  });
});
