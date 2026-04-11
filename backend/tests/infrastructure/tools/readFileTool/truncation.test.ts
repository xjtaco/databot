import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ReadFileTool } from '../../../../src/infrastructure/tools/readFileTool';

describe('ReadFileTool - Truncation & Limits', () => {
  let readFileTool: ReadFileTool;
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    readFileTool = new ReadFileTool();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `readfiletool-trunc-test-${Date.now()}-${randomSuffix}`);
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

  describe('MAX_LIMIT cap', () => {
    it('should cap limit to 500 even when larger value is requested', async () => {
      // Arrange - create a file with 600 lines
      const lines: string[] = [];
      for (let i = 1; i <= 600; i++) {
        lines.push(`Line ${i}`);
      }
      await fs.writeFile(testFilePath, lines.join('\n'), 'utf-8');

      // Act - request 1000 lines
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
        limit: 1000,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as {
        linesRead: number;
        truncated: boolean;
        totalLines: number;
      };
      expect(data.linesRead).toBe(500);
      expect(data.truncated).toBe(true);
      expect(data.totalLines).toBe(600);
    });

    it('should allow limit values within MAX_LIMIT', async () => {
      // Arrange
      const lines: string[] = [];
      for (let i = 1; i <= 300; i++) {
        lines.push(`Line ${i}`);
      }
      await fs.writeFile(testFilePath, lines.join('\n'), 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
        limit: 200,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as { linesRead: number; truncated: boolean };
      expect(data.linesRead).toBe(200);
      expect(data.truncated).toBe(true);
    });

    it('should use default limit of 100 when not specified', async () => {
      // Arrange
      const lines: string[] = [];
      for (let i = 1; i <= 150; i++) {
        lines.push(`Line ${i}`);
      }
      await fs.writeFile(testFilePath, lines.join('\n'), 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as { linesRead: number };
      expect(data.linesRead).toBe(100);
    });
  });

  describe('Long line truncation', () => {
    // Use 'A_' pattern instead of single-char repeats to avoid triggering
    // base64 sanitization (underscore breaks base64 character runs).
    it('should truncate lines exceeding 500 characters', async () => {
      // Arrange
      const longLine = 'A_'.repeat(500); // 1000 chars
      await fs.writeFile(testFilePath, longLine, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as { content: string };
      expect(data.content).toContain('... [truncated 500 chars]');
      // Should contain the first 500 chars
      expect(data.content).toContain('A_'.repeat(250));
      // Content should be much shorter than original
      expect(data.content.length).toBeLessThan(1000);
    });

    it('should not truncate lines within 500 characters', async () => {
      // Arrange
      const normalLine = 'B_'.repeat(200); // 400 chars
      await fs.writeFile(testFilePath, normalLine, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as { content: string };
      expect(data.content).toBe(normalLine);
      expect(data.content).not.toContain('[truncated');
    });

    it('should truncate each long line independently', async () => {
      // Arrange
      const longLine1 = 'X_'.repeat(400); // 800 chars
      const shortLine = 'short';
      const longLine2 = 'Y_'.repeat(350); // 700 chars
      await fs.writeFile(testFilePath, [longLine1, shortLine, longLine2].join('\n'), 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as { content: string };
      const contentLines = data.content.split('\n');
      // First line truncated
      expect(contentLines[0]).toContain('[truncated 300 chars]');
      // Second line untouched
      expect(contentLines[1]).toBe('short');
      // Third line truncated
      expect(contentLines[2]).toContain('[truncated 200 chars]');
    });

    it('should report correct truncated char count', async () => {
      // Arrange
      const lineLength = 600;
      const maxLineLength = 500; // matches MAX_LINE_LENGTH
      const longLine = 'Z_'.repeat(lineLength / 2); // 600 chars
      await fs.writeFile(testFilePath, longLine, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as { content: string };
      expect(data.content).toContain(`[truncated ${lineLength - maxLineLength} chars]`);
    });

    it('should handle line exactly at the limit', async () => {
      // Arrange - exactly 500 chars should NOT be truncated
      const exactLine = 'C_'.repeat(250); // 500 chars
      await fs.writeFile(testFilePath, exactLine, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as { content: string };
      expect(data.content).toBe(exactLine);
      expect(data.content).not.toContain('[truncated');
    });
  });
});
