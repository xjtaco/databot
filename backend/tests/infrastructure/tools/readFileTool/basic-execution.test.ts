import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ReadFileTool } from '../../../../src/infrastructure/tools/readFileTool';

describe('ReadFileTool.execute() - Success', () => {
  let readFileTool: ReadFileTool;
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    readFileTool = new ReadFileTool();
    // Create a temporary directory for test files with unique name
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `readfiletool-test-${Date.now()}-${randomSuffix}`);
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

  it('should read a simple text file completely', async () => {
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
      path: string;
      offset: number;
      limit: number;
      totalLines: number;
      linesRead: number;
      truncated: boolean;
    };
    expect(data.content).toContain('Line 1');
    expect(data.content).toContain('Line 2');
    expect(data.content).toContain('Line 3');
    expect(data.path).toBe(testFilePath);
    expect(data.totalLines).toBe(3);
    expect(data.linesRead).toBe(3);
    expect(data.truncated).toBe(false);
  });

  it('should read file with default offset (0) and limit (100)', async () => {
    // Arrange
    const content = 'Line 1\nLine 2\nLine 3';
    await fs.writeFile(testFilePath, content, 'utf-8');

    // Act
    const result = await readFileTool.execute({
      absolute_path: testFilePath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as { offset: number; limit: number };
    expect(data.offset).toBe(0);
    expect(data.limit).toBe(100);
  });

  it('should read file with custom offset and limit', async () => {
    // Arrange
    const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    await fs.writeFile(testFilePath, content, 'utf-8');

    // Act
    const result = await readFileTool.execute({
      absolute_path: testFilePath,
      offset: 2,
      limit: 2,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as {
      content: string;
      offset: number;
      limit: number;
      linesRead: number;
    };
    // Content should include truncation notice when truncated is true
    expect(data.content).toContain('Line 3\nLine 4');
    expect(data.content).toContain('**Important**: File content has been truncated');
    expect(data.offset).toBe(2);
    expect(data.limit).toBe(2);
    expect(data.linesRead).toBe(2);
  });

  it('should handle file with only one line', async () => {
    // Arrange
    const content = 'Single line content';
    await fs.writeFile(testFilePath, content, 'utf-8');

    // Act
    const result = await readFileTool.execute({
      absolute_path: testFilePath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as { totalLines: number; linesRead: number };
    expect(data.totalLines).toBe(1);
    expect(data.linesRead).toBe(1);
  });

  it('should handle empty file', async () => {
    // Arrange
    await fs.writeFile(testFilePath, '', 'utf-8');

    // Act
    const result = await readFileTool.execute({
      absolute_path: testFilePath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as { content: string; totalLines: number; linesRead: number };
    expect(data.content).toBe('');
    expect(data.totalLines).toBe(0);
    expect(data.linesRead).toBe(0);
  });

  it('should handle file with Windows-style line endings (CRLF)', async () => {
    // Arrange
    const content = 'Line 1\r\nLine 2\r\nLine 3';
    await fs.writeFile(testFilePath, content, 'utf-8');

    // Act
    const result = await readFileTool.execute({
      absolute_path: testFilePath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as { content: string; totalLines: number };
    expect(data.totalLines).toBe(3);
    expect(data.content).toContain('Line 1');
    expect(data.content).toContain('Line 2');
    expect(data.content).toContain('Line 3');
  });

  it('should handle file with mixed line endings', async () => {
    // Arrange
    const content = 'Line 1\nLine 2\r\nLine 3\nLine 4';
    await fs.writeFile(testFilePath, content, 'utf-8');

    // Act
    const result = await readFileTool.execute({
      absolute_path: testFilePath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as { totalLines: number };
    expect(data.totalLines).toBe(4);
  });

  it('should return empty content when offset exceeds total lines', async () => {
    // Arrange
    const content = 'Line 1\nLine 2\nLine 3';
    await fs.writeFile(testFilePath, content, 'utf-8');

    // Act
    const result = await readFileTool.execute({
      absolute_path: testFilePath,
      offset: 10,
      limit: 5,
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

  it('should handle file with very long lines', async () => {
    // Arrange
    const longLine = 'A'.repeat(10000);
    const content = `${longLine}\nLine 2\n${longLine}`;
    await fs.writeFile(testFilePath, content, 'utf-8');

    // Act
    const result = await readFileTool.execute({
      absolute_path: testFilePath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as { totalLines: number; linesRead: number };
    expect(data.totalLines).toBe(3);
    expect(data.linesRead).toBe(3);
  });

  it('should read file with UTF-8 content', async () => {
    // Arrange
    const content = 'Hello 你好\nWorld 世界\nTest 测试';
    await fs.writeFile(testFilePath, content, 'utf-8');

    // Act
    const result = await readFileTool.execute({
      absolute_path: testFilePath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain('你好');
    expect(data.content).toContain('世界');
    expect(data.content).toContain('测试');
  });

  it('should handle file with special characters', async () => {
    // Arrange
    const content = 'Line with "quotes"\nLine with \'apostrophes\'\nLine with $pecial chars @#%';
    await fs.writeFile(testFilePath, content, 'utf-8');

    // Act
    const result = await readFileTool.execute({
      absolute_path: testFilePath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as { content: string };
    expect(data.content).toContain('"quotes"');
    expect(data.content).toContain("'apostrophes'");
    expect(data.content).toContain('$pecial');
  });

  it('should handle file ending with newline', async () => {
    // Arrange
    const content = 'Line 1\nLine 2\nLine 3\n';
    await fs.writeFile(testFilePath, content, 'utf-8');

    // Act
    const result = await readFileTool.execute({
      absolute_path: testFilePath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as { content: string; totalLines: number };
    expect(data.totalLines).toBe(4); // Empty line after last \n
  });

  it('should handle file without trailing newline', async () => {
    // Arrange
    const content = 'Line 1\nLine 2\nLine 3';
    await fs.writeFile(testFilePath, content, 'utf-8');

    // Act
    const result = await readFileTool.execute({
      absolute_path: testFilePath,
    });

    // Assert
    expect(result.success).toBe(true);
    const data = result.data as { content: string; totalLines: number };
    expect(data.totalLines).toBe(3);
  });
});

describe('ReadFileTool - Metadata', () => {
  it('should have correct name', () => {
    // Arrange
    const readFileTool = new ReadFileTool();

    // Assert
    expect(readFileTool.name).toBe('read_file');
  });

  it('should have description', () => {
    // Arrange
    const readFileTool = new ReadFileTool();

    // Assert
    expect(readFileTool.description).toBeDefined();
    expect(readFileTool.description.length).toBeGreaterThan(0);
  });

  it('should have parameters schema', () => {
    // Arrange
    const readFileTool = new ReadFileTool();

    // Assert
    expect(readFileTool.parameters).toBeDefined();
    expect(readFileTool.parameters.type).toBe('object');
    expect(readFileTool.parameters.properties).toBeDefined();
    expect(readFileTool.parameters.required).toBeDefined();
  });

  it('should include all required parameters in schema', () => {
    // Arrange
    const readFileTool = new ReadFileTool();

    // Assert
    expect(readFileTool.parameters.properties.absolute_path).toBeDefined();
    expect(readFileTool.parameters.properties.offset).toBeDefined();
    expect(readFileTool.parameters.properties.limit).toBeDefined();
  });

  it('should mark absolute_path as required but not offset and limit', () => {
    // Arrange
    const readFileTool = new ReadFileTool();

    // Assert
    expect(readFileTool.parameters.required).toContain('absolute_path');
    expect(readFileTool.parameters.required).not.toContain('offset');
    expect(readFileTool.parameters.required).not.toContain('limit');
  });

  it('should get metadata correctly', () => {
    // Arrange
    const readFileTool = new ReadFileTool();

    // Act
    const metadata = readFileTool.getMetadata();

    // Assert
    expect(metadata.name).toBe('read_file');
    expect(metadata.description).toBeDefined();
    expect(metadata.parameters).toBeDefined();
  });
});
