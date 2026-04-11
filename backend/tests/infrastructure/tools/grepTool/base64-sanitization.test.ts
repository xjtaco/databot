import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GrepTool } from '../../../../src/infrastructure/tools/grepTool';

/** Helper: generate a base64-safe string of given length */
function b64(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[i % chars.length];
  }
  return result;
}

describe('GrepTool - Base64 Sanitization', () => {
  let grepTool: GrepTool;
  let testDir: string;

  beforeEach(async () => {
    grepTool = new GrepTool();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `greptool-b64-test-${Date.now()}-${randomSuffix}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should sanitize base64 content in grep match results', async () => {
    const payload = b64(500);
    const content = `background: url("data:image/png;base64,${payload}");`;
    await fs.writeFile(join(testDir, 'style.css'), content, 'utf-8');

    const result = await grepTool.execute({
      pattern: 'background',
      path: testDir,
    });

    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('background');
    expect(data).toContain('[base64 image/png, 500 chars]');
    expect(data).not.toContain(payload);
  });

  it('should sanitize standalone base64 in grep results', async () => {
    const payload = b64(400);
    const content = `"certificate": "${payload}"`;
    await fs.writeFile(join(testDir, 'config.json'), content, 'utf-8');

    const result = await grepTool.execute({
      pattern: 'certificate',
      path: testDir,
    });

    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('certificate');
    expect(data).toContain('[base64 content, 400 chars]');
    expect(data).not.toContain(payload);
  });

  it('should NOT sanitize short base64 strings in grep results', async () => {
    const payload = b64(100);
    const content = `token: ${payload}`;
    await fs.writeFile(join(testDir, 'auth.txt'), content, 'utf-8');

    const result = await grepTool.execute({
      pattern: 'token',
      path: testDir,
    });

    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain(payload);
    expect(data).not.toContain('[base64');
  });

  it('should still find matches on lines containing base64', async () => {
    const payload = b64(300);
    const content = `KEYWORD data:image/png;base64,${payload}`;
    await fs.writeFile(join(testDir, 'mixed.txt'), content, 'utf-8');

    const result = await grepTool.execute({
      pattern: 'KEYWORD',
      path: testDir,
    });

    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('KEYWORD');
    expect(data).toContain('[base64 image/png,');
  });

  it('should leave normal grep results untouched', async () => {
    const content = 'function hello() { return "world"; }';
    await fs.writeFile(join(testDir, 'code.ts'), content, 'utf-8');

    const result = await grepTool.execute({
      pattern: 'hello',
      path: testDir,
    });

    expect(result.success).toBe(true);
    const data = result.data as string;
    expect(data).toContain('function hello() { return "world"; }');
    expect(data).not.toContain('[base64');
  });
});
