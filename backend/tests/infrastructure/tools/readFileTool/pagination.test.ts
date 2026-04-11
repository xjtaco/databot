import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ReadFileTool } from '../../../../src/infrastructure/tools/readFileTool';

describe('ReadFileTool.execute() - Pagination', () => {
  let readFileTool: ReadFileTool;
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    readFileTool = new ReadFileTool();
    // Create a temporary directory for test files with unique name
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `readfiletool-pagination-test-${Date.now()}-${randomSuffix}`);
    await fs.mkdir(testDir, { recursive: true });
    testFilePath = join(testDir, 'test.txt');
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Basic Pagination', () => {
    it('should truncate content when file exceeds default limit', async () => {
      // Arrange - create a file with 150 lines (exceeds default limit of 100)
      const lines: string[] = [];
      for (let i = 1; i <= 150; i++) {
        lines.push(`Line ${i}`);
      }
      const content = lines.join('\n');
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as {
        content: string;
        totalLines: number;
        linesRead: number;
        truncated: boolean;
      };
      expect(data.totalLines).toBe(150);
      expect(data.linesRead).toBe(100);
      expect(data.truncated).toBe(true);
      expect(data.content).toContain('**Important**: File content has been truncated');
      expect(data.content).toContain('Showing lines 1–100 of 150 total');
    });

    it('should read first page with custom limit', async () => {
      // Arrange
      const lines: string[] = [];
      for (let i = 1; i <= 50; i++) {
        lines.push(`Line ${i}`);
      }
      const content = lines.join('\n');
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
        offset: 0,
        limit: 10,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as {
        content: string;
        offset: number;
        limit: number;
        totalLines: number;
        linesRead: number;
        truncated: boolean;
      };
      // Content should include truncation notice when truncated is true
      expect(data.content).toContain(
        'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10'
      );
      expect(data.content).toContain('**Important**: File content has been truncated');
      expect(data.content).toContain('Showing lines 1–10 of 50 total');
      expect(data.offset).toBe(0);
      expect(data.limit).toBe(10);
      expect(data.totalLines).toBe(50);
      expect(data.linesRead).toBe(10);
      expect(data.truncated).toBe(true);
    });

    it('should read middle portion of file with offset and limit', async () => {
      // Arrange
      const lines: string[] = [];
      for (let i = 1; i <= 100; i++) {
        lines.push(`Line ${i}`);
      }
      const content = lines.join('\n');
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
        offset: 40,
        limit: 10,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as {
        content: string;
        offset: number;
        linesRead: number;
        truncated: boolean;
      };
      // Content should include truncation notice when truncated is true
      expect(data.content).toContain(
        'Line 41\nLine 42\nLine 43\nLine 44\nLine 45\nLine 46\nLine 47\nLine 48\nLine 49\nLine 50'
      );
      expect(data.content).toContain('**Important**: File content has been truncated');
      expect(data.content).toContain('Showing lines 41–50 of 100 total');
      expect(data.offset).toBe(40);
      expect(data.linesRead).toBe(10);
      expect(data.truncated).toBe(true);
    });

    it('should read last portion of file', async () => {
      // Arrange
      const lines: string[] = [];
      for (let i = 1; i <= 30; i++) {
        lines.push(`Line ${i}`);
      }
      const content = lines.join('\n');
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
        offset: 20,
        limit: 20,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as {
        content: string;
        linesRead: number;
        truncated: boolean;
      };
      expect(data.content).toBe(
        'Line 21\nLine 22\nLine 23\nLine 24\nLine 25\nLine 26\nLine 27\nLine 28\nLine 29\nLine 30'
      );
      expect(data.linesRead).toBe(10);
      expect(data.truncated).toBe(false);
    });

    it('should return empty result when offset is at the last line', async () => {
      // Arrange
      const content = 'Line 1\nLine 2\nLine 3';
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
        offset: 3,
        limit: 10,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as {
        content: string;
        linesRead: number;
        truncated: boolean;
      };
      expect(data.content).toBe('');
      expect(data.linesRead).toBe(0);
      expect(data.truncated).toBe(false);
    });
  });

  describe('Truncation Notice', () => {
    it('should include truncation notice with correct information', async () => {
      // Arrange
      const lines: string[] = [];
      for (let i = 1; i <= 200; i++) {
        lines.push(`Line ${i}`);
      }
      const content = lines.join('\n');
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
        offset: 50,
        limit: 30,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as { content: string };
      expect(data.content).toContain('**Important**: File content has been truncated');
      expect(data.content).toContain('Showing lines 51–80 of 200 total');
      expect(data.content).toContain(
        'For example, to read the next portion of the file, use `offset`: 80'
      );
    });

    it('should suggest next offset correctly', async () => {
      // Arrange
      const lines: string[] = [];
      for (let i = 1; i <= 150; i++) {
        lines.push(`Line ${i}`);
      }
      const content = lines.join('\n');
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act - read first 50 lines
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
        offset: 0,
        limit: 50,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as { content: string };
      // The next offset should be 50 (0 + 50)
      expect(data.content).toContain('`offset`: 50');
    });

    it('should not include truncation notice when all content fits', async () => {
      // Arrange
      const content = 'Line 1\nLine 2\nLine 3';
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as {
        content: string;
        truncated: boolean;
      };
      expect(data.content).not.toContain('**Important**: File content has been truncated');
      expect(data.truncated).toBe(false);
    });
  });

  describe('Sequential Reading', () => {
    it('should support sequential reading of large file', async () => {
      // Arrange - create a file with 250 lines
      const lines: string[] = [];
      for (let i = 1; i <= 250; i++) {
        lines.push(`Line ${i}`);
      }
      const content = lines.join('\n');
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act - read first page
      const page1 = await readFileTool.execute({
        absolute_path: testFilePath,
        offset: 0,
        limit: 100,
      });

      // Assert first page
      const page1Data = page1.data as { content: string; linesRead: number; truncated: boolean };
      expect(page1Data.linesRead).toBe(100);
      expect(page1Data.truncated).toBe(true);
      expect(page1Data.content).toContain('Line 1');
      expect(page1Data.content).toContain('Line 100');
      expect(page1Data.content).not.toContain('Line 101');
      expect(page1Data.content).toContain('Showing lines 1–100 of 250 total');

      // Act - read second page
      const page2 = await readFileTool.execute({
        absolute_path: testFilePath,
        offset: 100,
        limit: 100,
      });

      // Assert second page
      const page2Data = page2.data as { content: string; linesRead: number; truncated: boolean };
      expect(page2Data.linesRead).toBe(100);
      expect(page2Data.truncated).toBe(true);
      expect(page2Data.content).toContain('Line 101');
      expect(page2Data.content).toContain('Line 200');
      expect(page2Data.content).not.toContain('Line 201');
      expect(page2Data.content).toContain('Showing lines 101–200 of 250 total');

      // Act - read third page
      const page3 = await readFileTool.execute({
        absolute_path: testFilePath,
        offset: 200,
        limit: 100,
      });

      // Assert third page
      const page3Data = page3.data as { content: string; linesRead: number; truncated: boolean };
      expect(page3Data.linesRead).toBe(50);
      expect(page3Data.truncated).toBe(false);
      expect(page3Data.content).toContain('Line 201');
      expect(page3Data.content).toContain('Line 250');
      expect(page3Data.content).not.toContain('Showing lines');
    });

    it('should read entire file page by page', async () => {
      // Arrange - create a file with 95 lines (not multiple of page size)
      const pageSize = 30;
      const lines: string[] = [];
      for (let i = 1; i <= 95; i++) {
        lines.push(`Line ${i}`);
      }
      const content = lines.join('\n');
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act - read all pages
      const allLines: string[] = [];
      let offset = 0;
      let pageCount = 0;

      while (true) {
        const result = await readFileTool.execute({
          absolute_path: testFilePath,
          offset,
          limit: pageSize,
        });

        const data = result.data as {
          content: string;
          linesRead: number;
          truncated: boolean;
        };

        // Extract lines from content (without truncation notice)
        const contentOnly = data.content.split('\n\n---')[0];
        const lines = contentOnly.split('\n').filter((line) => line.length > 0);
        allLines.push(...lines);

        pageCount++;

        if (!data.truncated) {
          break;
        }

        offset += pageSize;
      }

      // Assert
      expect(allLines.length).toBe(95);
      expect(allLines[0]).toBe('Line 1');
      expect(allLines[94]).toBe('Line 95');
      expect(pageCount).toBe(4); // 30 + 30 + 30 + 5 = 95
    });
  });

  describe('Edge Cases', () => {
    it('should handle pagination with limit of 1', async () => {
      // Arrange
      const content = 'Line 1\nLine 2\nLine 3';
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
        offset: 1,
        limit: 1,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as {
        content: string;
        linesRead: number;
        truncated: boolean;
      };
      // Content should include truncation notice when truncated is true
      expect(data.content).toContain('Line 2');
      expect(data.content).toContain('**Important**: File content has been truncated');
      expect(data.linesRead).toBe(1);
      expect(data.truncated).toBe(true);
    });

    it('should handle very large limit value', async () => {
      // Arrange
      const content = 'Line 1\nLine 2\nLine 3';
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
        offset: 0,
        limit: 999999,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as {
        content: string;
        linesRead: number;
        truncated: boolean;
      };
      expect(data.linesRead).toBe(3);
      expect(data.truncated).toBe(false);
    });

    it('should handle offset that results in partial last page', async () => {
      // Arrange - create a file with 103 lines
      const lines: string[] = [];
      for (let i = 1; i <= 103; i++) {
        lines.push(`Line ${i}`);
      }
      const content = lines.join('\n');
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act - read from offset 100 with limit 10 (should only get 3 lines)
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
        offset: 100,
        limit: 10,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as {
        content: string;
        linesRead: number;
        truncated: boolean;
      };
      expect(data.content).toBe('Line 101\nLine 102\nLine 103');
      expect(data.linesRead).toBe(3);
      expect(data.truncated).toBe(false);
    });

    it('should handle file with exact multiple of limit', async () => {
      // Arrange - create a file with exactly 100 lines (default limit)
      const lines: string[] = [];
      for (let i = 1; i <= 100; i++) {
        lines.push(`Line ${i}`);
      }
      const content = lines.join('\n');
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as {
        linesRead: number;
        truncated: boolean;
      };
      expect(data.linesRead).toBe(100);
      expect(data.truncated).toBe(false);
    });
  });

  describe('Line Numbering', () => {
    it('should report correct line numbers in truncation notice (1-based)', async () => {
      // Arrange
      const lines: string[] = [];
      for (let i = 1; i <= 120; i++) {
        lines.push(`Line ${i}`);
      }
      const content = lines.join('\n');
      await fs.writeFile(testFilePath, content, 'utf-8');

      // Act
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
        offset: 10,
        limit: 20,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as { content: string };
      // Should show lines 11-30 (1-based: offset+1 to offset+limit)
      expect(data.content).toContain('Showing lines 11–30 of 120 total');
    });
  });
});
