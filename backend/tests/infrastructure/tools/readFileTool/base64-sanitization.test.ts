import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ReadFileTool } from '../../../../src/infrastructure/tools/readFileTool';

/** Helper: generate a base64-safe string of given length */
function b64(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[i % chars.length];
  }
  return result;
}

describe('ReadFileTool - Base64 Sanitization', () => {
  let readFileTool: ReadFileTool;
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    readFileTool = new ReadFileTool();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `readfiletool-b64-test-${Date.now()}-${randomSuffix}`);
    await fs.mkdir(testDir, { recursive: true });
    testFilePath = join(testDir, 'test.txt');
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should replace long data URI base64 content with a placeholder', async () => {
    const payload = b64(1000);
    const content = `line1\nbackground: url("data:image/png;base64,${payload}");\nline3`;
    await fs.writeFile(testFilePath, content, 'utf-8');

    const result = await readFileTool.execute({ absolute_path: testFilePath });

    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain('[base64 image/png, 1000 chars]');
    expect(data.content).not.toContain(payload);
    // Surrounding content preserved
    expect(data.content).toContain('line1');
    expect(data.content).toContain('line3');
  });

  it('should replace long standalone base64 content with a placeholder', async () => {
    const payload = b64(500);
    const content = `{"cert": "${payload}"}`;
    await fs.writeFile(testFilePath, content, 'utf-8');

    const result = await readFileTool.execute({ absolute_path: testFilePath });

    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain('[base64 content, 500 chars]');
    expect(data.content).not.toContain(payload);
  });

  it('should NOT replace short base64 strings', async () => {
    const payload = b64(100);
    const content = `token: ${payload}`;
    await fs.writeFile(testFilePath, content, 'utf-8');

    const result = await readFileTool.execute({ absolute_path: testFilePath });

    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain(payload);
    expect(data.content).not.toContain('[base64');
  });

  it('should sanitize base64 before applying line-length truncation', async () => {
    // A line with a very long base64 blob that exceeds MAX_LINE_LENGTH (500)
    // After sanitization the line should be short enough to avoid truncation
    const payload = b64(2000);
    const content = `"img": "data:image/png;base64,${payload}"`;
    await fs.writeFile(testFilePath, content, 'utf-8');

    const result = await readFileTool.execute({ absolute_path: testFilePath });

    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    // Should have the placeholder, NOT a double-truncation
    expect(data.content).toContain('[base64 image/png, 2000 chars]');
    // The sanitized line is short so no line-length truncation should occur
    expect(data.content).not.toContain('[truncated');
  });

  it('should leave normal code untouched', async () => {
    const content = 'const x = 42;\nfunction hello() { return "world"; }';
    await fs.writeFile(testFilePath, content, 'utf-8');

    const result = await readFileTool.execute({ absolute_path: testFilePath });

    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toBe(content);
  });

  it('should handle multiple base64 blobs across different lines', async () => {
    const p1 = b64(300);
    const p2 = b64(400);
    const content = `data:image/png;base64,${p1}\nnormal line\ndata:image/jpeg;base64,${p2}`;
    await fs.writeFile(testFilePath, content, 'utf-8');

    const result = await readFileTool.execute({ absolute_path: testFilePath });

    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain('[base64 image/png, 300 chars]');
    expect(data.content).toContain('[base64 image/jpeg, 400 chars]');
    expect(data.content).toContain('normal line');
  });
});
