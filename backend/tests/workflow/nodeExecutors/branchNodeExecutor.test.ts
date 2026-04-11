import { describe, it, expect } from 'vitest';
import {
  BranchNodeExecutor,
  isTruthy,
} from '../../../src/workflow/nodeExecutors/branchNodeExecutor';
import type { BranchNodeConfig } from '../../../src/workflow/workflow.types';

function makeContext(field: string) {
  const config: BranchNodeConfig = {
    nodeType: 'branch',
    field,
    outputVariable: 'branch_result',
  };
  return { workFolder: '/tmp/test', nodeId: 'n1', nodeName: 'branch1', resolvedConfig: config };
}

describe('isTruthy', () => {
  it('returns false for null', () => {
    expect(isTruthy(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isTruthy(undefined)).toBe(false);
  });

  it('returns true for boolean true', () => {
    expect(isTruthy(true)).toBe(true);
  });

  it('returns false for boolean false', () => {
    expect(isTruthy(false)).toBe(false);
  });

  it('returns false for 0', () => {
    expect(isTruthy(0)).toBe(false);
  });

  it('returns true for 42', () => {
    expect(isTruthy(42)).toBe(true);
  });

  it('returns true for -1', () => {
    expect(isTruthy(-1)).toBe(true);
  });

  it('returns false for NaN', () => {
    expect(isTruthy(NaN)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isTruthy('')).toBe(false);
  });

  it('returns false for "false" (case-insensitive)', () => {
    expect(isTruthy('false')).toBe(false);
  });

  it('returns false for "FALSE"', () => {
    expect(isTruthy('FALSE')).toBe(false);
  });

  it('returns true for "hello"', () => {
    expect(isTruthy('hello')).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(isTruthy([])).toBe(false);
  });

  it('returns true for non-empty array', () => {
    expect(isTruthy([1, 2])).toBe(true);
  });

  it('returns false for empty object', () => {
    expect(isTruthy({})).toBe(false);
  });

  it('returns true for non-empty object', () => {
    expect(isTruthy({ key: 'val' })).toBe(true);
  });
});

describe('BranchNodeExecutor', () => {
  const executor = new BranchNodeExecutor();

  it('should have type "branch"', () => {
    expect(executor.type).toBe('branch');
  });

  it('returns true for a truthy string field', async () => {
    const result = await executor.execute(makeContext('hello'));
    expect(result.result).toBe(true);
  });

  it('returns false for an empty string field', async () => {
    const result = await executor.execute(makeContext(''));
    expect(result.result).toBe(false);
  });

  it('returns false for "false" string field', async () => {
    const result = await executor.execute(makeContext('false'));
    expect(result.result).toBe(false);
  });

  it('returns true for numeric string "42"', async () => {
    const result = await executor.execute(makeContext('42'));
    expect(result.result).toBe(true);
  });

  it('returns false for numeric string "0"', async () => {
    const result = await executor.execute(makeContext('0'));
    expect(result.result).toBe(false);
  });

  it('parses JSON array and returns true for non-empty', async () => {
    const result = await executor.execute(makeContext('[1,2,3]'));
    expect(result.result).toBe(true);
  });

  it('parses JSON array and returns false for empty', async () => {
    const result = await executor.execute(makeContext('[]'));
    expect(result.result).toBe(false);
  });

  it('parses JSON object and returns true for non-empty', async () => {
    const result = await executor.execute(makeContext('{"key":"val"}'));
    expect(result.result).toBe(true);
  });

  it('parses JSON object and returns false for empty', async () => {
    const result = await executor.execute(makeContext('{}'));
    expect(result.result).toBe(false);
  });

  it('parses JSON boolean true', async () => {
    const result = await executor.execute(makeContext('true'));
    expect(result.result).toBe(true);
  });

  it('parses JSON boolean false', async () => {
    const result = await executor.execute(makeContext('false'));
    expect(result.result).toBe(false);
  });

  it('parses JSON null as falsy', async () => {
    const result = await executor.execute(makeContext('null'));
    expect(result.result).toBe(false);
  });

  it('treats non-JSON string as truthy', async () => {
    const result = await executor.execute(makeContext('some text'));
    expect(result.result).toBe(true);
  });
});
