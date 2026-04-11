import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GrepTool } from '../../../../src/infrastructure/tools/grepTool';

describe('GrepTool - Truncation & Limits', () => {
  let grepTool: GrepTool;
  let testDir: string;

  beforeEach(async () => {
    grepTool = new GrepTool();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `greptool-trunc-test-${Date.now()}-${randomSuffix}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Match count limit', () => {
    it('should return at most 100 matches', async () => {
      // Arrange - create a file with 150 matching lines
      const lines: string[] = [];
      for (let i = 1; i <= 150; i++) {
        lines.push(`match line ${i}`);
      }
      await fs.writeFile(join(testDir, 'many.txt'), lines.join('\n'), 'utf-8');

      // Act
      const result = await grepTool.execute({
        pattern: 'match',
        path: testDir,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as string;
      // Split by newline, filter out the truncation notice section
      const resultLines = data.split('\n\n---')[0].split('\n').filter(Boolean);
      expect(resultLines.length).toBe(100);
    });

    it('should include truncation notice when matches are capped', async () => {
      // Arrange
      const lines: string[] = [];
      for (let i = 1; i <= 120; i++) {
        lines.push(`keyword ${i}`);
      }
      await fs.writeFile(join(testDir, 'big.txt'), lines.join('\n'), 'utf-8');

      // Act
      const result = await grepTool.execute({
        pattern: 'keyword',
        path: testDir,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as string;
      expect(data).toContain('Results truncated at 100 matches');
      expect(data).toContain('more specific pattern');
    });

    it('should not include truncation notice when matches are within limit', async () => {
      // Arrange
      const lines: string[] = [];
      for (let i = 1; i <= 50; i++) {
        lines.push(`keyword ${i}`);
      }
      await fs.writeFile(join(testDir, 'small.txt'), lines.join('\n'), 'utf-8');

      // Act
      const result = await grepTool.execute({
        pattern: 'keyword',
        path: testDir,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as string;
      expect(data).not.toContain('truncated');
    });

    it('should stop scanning files early once limit is reached', async () => {
      // Arrange - create multiple files with matches
      for (let f = 0; f < 5; f++) {
        const lines: string[] = [];
        for (let i = 1; i <= 30; i++) {
          lines.push(`target line ${i}`);
        }
        await fs.writeFile(join(testDir, `file${f}.txt`), lines.join('\n'), 'utf-8');
      }

      // Act - 5 files * 30 matches = 150 total, should cap at 100
      const result = await grepTool.execute({
        pattern: 'target',
        path: testDir,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as string;
      const resultLines = data.split('\n\n---')[0].split('\n').filter(Boolean);
      expect(resultLines.length).toBe(100);
    });
  });

  describe('Long line trimming', () => {
    // Use 'A_' pattern instead of single-char repeats to avoid triggering
    // base64 sanitization (underscore breaks base64 character runs).
    it('should trim long matched lines around the match position', async () => {
      // Arrange - create a line with ~807 chars, match near the middle
      const prefix = 'A_'.repeat(200); // 400 chars
      const suffix = 'B_'.repeat(200); // 400 chars
      const longLine = `${prefix}KEYWORD${suffix}`;
      await fs.writeFile(join(testDir, 'long.txt'), longLine, 'utf-8');

      // Act
      const result = await grepTool.execute({
        pattern: 'KEYWORD',
        path: testDir,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as string;
      // The result should contain the keyword
      expect(data).toContain('KEYWORD');
      // The result should be significantly shorter than the original line
      const matchContent = data.split(':').slice(2).join(':');
      expect(matchContent.length).toBeLessThan(longLine.length);
      // Should have ellipsis and truncated char count
      expect(matchContent).toContain('...');
      expect(matchContent).toMatch(/\[truncated \d+ chars\]/);
    });

    it('should not trim short lines', async () => {
      // Arrange
      const shortLine = 'hello world keyword here';
      await fs.writeFile(join(testDir, 'short.txt'), shortLine, 'utf-8');

      // Act
      const result = await grepTool.execute({
        pattern: 'keyword',
        path: testDir,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as string;
      expect(data).toContain(shortLine);
      // Should not have truncation indicators within the content
      const matchContent = data.split(':').slice(2).join(':');
      expect(matchContent).not.toContain('[truncated');
    });

    it('should show context around match at the beginning of a long line', async () => {
      // Arrange - match at the very beginning
      const longLine = `KEYWORD${'X_'.repeat(400)}`; // 807 chars
      await fs.writeFile(join(testDir, 'begin.txt'), longLine, 'utf-8');

      // Act
      const result = await grepTool.execute({
        pattern: 'KEYWORD',
        path: testDir,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as string;
      const matchContent = data.split(':').slice(2).join(':');
      expect(matchContent).toContain('KEYWORD');
      // Should not have prefix ellipsis since match is at start
      expect(matchContent.startsWith('...')).toBe(false);
      // Should have suffix ellipsis and truncated notice
      expect(matchContent).toContain('...');
      expect(matchContent).toMatch(/\[truncated \d+ chars\]/);
    });

    it('should show context around match at the end of a long line', async () => {
      // Arrange - match at the very end
      const longLine = `${'X_'.repeat(400)}KEYWORD`; // 807 chars
      await fs.writeFile(join(testDir, 'end.txt'), longLine, 'utf-8');

      // Act
      const result = await grepTool.execute({
        pattern: 'KEYWORD',
        path: testDir,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as string;
      const matchContent = data.split(':').slice(2).join(':');
      expect(matchContent).toContain('KEYWORD');
      // Should have prefix ellipsis
      expect(matchContent).toContain('...');
      // Should have truncated char count
      expect(matchContent).toMatch(/\[truncated \d+ chars\]$/);
    });
  });
});
