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

  it('summarizes circular references instead of recursing forever', () => {
    const node: Record<string, unknown> = { label: 'root' };
    node.self = node;

    expect(sanitizeForLlm(node)).toEqual({
      _sanitized: {
        applied: true,
        reasons: ['circular_reference'],
      },
      label: 'root',
      self: {
        _summary: {
          kind: 'unsupported',
          valueType: 'Object',
          reason: 'circular_reference',
        },
      },
    });
  });

  it('summarizes unsupported values explicitly', () => {
    expect(
      sanitizeForLlm({
        createdAt: new Date('2024-01-01T00:00:00Z'),
        failure: new Error('boom'),
        missing: undefined,
      })
    ).toEqual({
      _sanitized: {
        applied: true,
        reasons: ['non_plain_object', 'unsupported_value'],
      },
      createdAt: {
        _summary: {
          kind: 'unsupported',
          valueType: 'Date',
          reason: 'non_plain_object',
        },
      },
      failure: {
        _summary: {
          kind: 'unsupported',
          valueType: 'Error',
          reason: 'non_plain_object',
        },
      },
      missing: {
        _summary: {
          kind: 'unsupported',
          valueType: 'undefined',
          reason: 'unsupported_value',
        },
      },
    });
  });

  it('summarizes unsupported root values explicitly', () => {
    expect(sanitizeForLlm(new Date('2024-01-01T00:00:00Z'))).toEqual({
      _summary: {
        kind: 'unsupported',
        valueType: 'Date',
        reason: 'non_plain_object',
      },
    });
  });

  it('keeps reserved root metadata stable when the input has a _sanitized key', () => {
    const longText = 'lorem ipsum dolor sit amet '.repeat(40);

    expect(
      sanitizeForLlm({
        _sanitized: 'user value',
        prompt: longText,
      })
    ).toEqual({
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

  it('summarizes deep objects after the max depth', () => {
    expect(
      sanitizeForLlm({
        a: {
          b: {
            c: {
              d: {
                e: {
                  f: {
                    g: {
                      h: {
                        label: 'too deep',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })
    ).toEqual({
      _sanitized: {
        applied: true,
        reasons: ['max_depth'],
      },
      a: {
        b: {
          c: {
            d: {
              e: {
                f: {
                  g: {
                    h: {
                      _summary: {
                        kind: 'unsupported',
                        valueType: 'Object',
                        reason: 'max_depth',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it('compacts nested objects when the sanitized root would exceed the total budget', () => {
    const section = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [`field${index + 1}`, 'x'.repeat(180)])
    );

    expect(
      sanitizeForLlm({
        alpha: section,
        beta: section,
        gamma: section,
        delta: section,
      })
    ).toEqual({
      _sanitized: {
        applied: true,
        reasons: ['budget_compacted'],
      },
      alpha: section,
      beta: {
        _summary: {
          kind: 'object',
          totalKeys: 6,
          note: 'omitted due to budget',
        },
      },
      gamma: {
        _summary: {
          kind: 'object',
          totalKeys: 6,
          note: 'omitted due to budget',
        },
      },
      delta: {
        _summary: {
          kind: 'object',
          totalKeys: 6,
          note: 'omitted due to budget',
        },
      },
    });
  });

  it('keeps summarized root arrays as zero-preview summaries instead of dropping them during budget compaction', () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      payload: 'y'.repeat(120),
    }));

    expect(
      sanitizeForLlm({
        alpha: rows,
        beta: rows,
        gamma: rows,
        delta: rows,
      })
    ).toEqual({
      _sanitized: {
        applied: true,
        reasons: ['array_truncated', 'budget_compacted'],
      },
      alpha: {
        _summary: {
          kind: 'array',
          totalItems: 8,
          keptItems: 5,
        },
        items: [
          { id: 1, payload: 'y'.repeat(120) },
          { id: 2, payload: 'y'.repeat(120) },
          { id: 3, payload: 'y'.repeat(120) },
          { id: 4, payload: 'y'.repeat(120) },
          { id: 5, payload: 'y'.repeat(120) },
        ],
      },
      beta: {
        _summary: {
          kind: 'array',
          totalItems: 8,
          keptItems: 5,
        },
        items: [
          { id: 1, payload: 'y'.repeat(120) },
          { id: 2, payload: 'y'.repeat(120) },
          { id: 3, payload: 'y'.repeat(120) },
          { id: 4, payload: 'y'.repeat(120) },
          { id: 5, payload: 'y'.repeat(120) },
        ],
      },
      gamma: {
        _summary: {
          kind: 'array',
          totalItems: 8,
          keptItems: 0,
        },
      },
      delta: {
        _summary: {
          kind: 'array',
          totalItems: 8,
          keptItems: 0,
        },
      },
    });
  });

  it('keeps sanitizer reasons in a deterministic order', () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      payload: 'z'.repeat(140),
    }));
    const longText = 'abc '.repeat(400);

    expect(
      sanitizeForLlm({
        prompt: longText,
        rowsA: rows,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        rowsB: rows,
        rowsC: rows,
      })
    ).toMatchObject({
      _sanitized: {
        applied: true,
        reasons: ['large_text', 'array_truncated', 'non_plain_object', 'budget_compacted'],
      },
    });
  });
});
