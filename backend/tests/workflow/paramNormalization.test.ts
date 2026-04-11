import { normalizeParams, isTypedOutputValue } from '../../src/workflow/workflow.types';

describe('normalizeParams', () => {
  it('wraps plain string values as text ParamDefinition', () => {
    const legacy = { host: 'localhost', port: '5432' };
    const result = normalizeParams(legacy);
    expect(result).toEqual({
      host: { value: 'localhost', type: 'text' },
      port: { value: '5432', type: 'text' },
    });
  });

  it('passes through ParamDefinition values unchanged', () => {
    const typed = {
      host: { value: 'localhost', type: 'text' as const },
      pass: { value: 'secret', type: 'password' as const },
    };
    const result = normalizeParams(typed);
    expect(result).toEqual(typed);
  });

  it('handles mixed legacy and typed params', () => {
    const mixed = {
      host: 'localhost',
      pass: { value: 'secret', type: 'password' as const },
    };
    const result = normalizeParams(
      mixed as Record<string, string | import('../../src/workflow/workflow.types').ParamDefinition>
    );
    expect(result).toEqual({
      host: { value: 'localhost', type: 'text' },
      pass: { value: 'secret', type: 'password' },
    });
  });
});

describe('isTypedOutputValue', () => {
  it('returns true for TypedOutputValue objects', () => {
    expect(isTypedOutputValue({ value: '/path/to/file.csv', type: 'csvFile' })).toBe(true);
  });

  it('returns false for plain values', () => {
    expect(isTypedOutputValue('hello')).toBe(false);
    expect(isTypedOutputValue(42)).toBe(false);
    expect(isTypedOutputValue(null)).toBe(false);
  });
});
