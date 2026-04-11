import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GrepTool } from '../../../../src/infrastructure/tools/grepTool';

describe('GrepTool.execute() - Success', () => {
  let grepTool: GrepTool;
  let testDir: string;

  beforeEach(async () => {
    grepTool = new GrepTool();
    // Create a temporary directory for test files with unique name
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `greptool-test-${Date.now()}-${randomSuffix}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should search and find matches with simple string pattern', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'hello world\nhello again', 'utf-8');
    await fs.writeFile(join(testDir, 'other.txt'), 'goodbye world', 'utf-8');

    // Act
    const result = await grepTool.execute({
      pattern: 'hello',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(typeof result.data).toBe('string');
    expect(result.data).toContain('hello');
  });

  it('should find all matches across multiple lines', async () => {
    // Arrange
    const content = 'line one\nline two\nline three\nline one again';
    await fs.writeFile(join(testDir, 'test.txt'), content, 'utf-8');

    // Act
    const result = await grepTool.execute({
      pattern: 'line one',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');
    expect(lines.length).toBe(2);
  });

  it('should support regex patterns', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'abc123\nxyz456\ndef789', 'utf-8');

    // Act - match lines with 3 digits
    const result = await grepTool.execute({
      pattern: '\\d{3}',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');
    expect(lines.length).toBe(3);
  });

  it('should support character classes in regex', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'cat\ndog\nbat\nrat', 'utf-8');

    // Act - match words starting with 'c' or 'd'
    const result = await grepTool.execute({
      pattern: '^[cd]',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');
    expect(lines.length).toBe(2);
  });

  it('should include file path and line number in results', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'hello\nworld\nhello', 'utf-8');

    // Act
    const result = await grepTool.execute({
      pattern: 'hello',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');

    // Each result should be in format "file:line:content"
    for (const line of lines) {
      if (line) {
        expect(line).toMatch(/^.+:\d+:.+$/);
      }
    }
  });

  it('should filter files using include pattern', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'hello world', 'utf-8');
    await fs.writeFile(join(testDir, 'test.js'), 'hello world', 'utf-8');
    await fs.writeFile(join(testDir, 'test.md'), 'hello world', 'utf-8');

    // Act - only search in .txt files
    const result = await grepTool.execute({
      pattern: 'hello',
      path: testDir,
      include: '*.txt',
    });

    // Assert
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('.txt:');
  });

  it('should support multiple file extensions with include pattern', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'hello', 'utf-8');
    await fs.writeFile(join(testDir, 'test.js'), 'hello', 'utf-8');
    await fs.writeFile(join(testDir, 'test.md'), 'hello', 'utf-8');

    // Act - search in .txt and .md files
    const result = await grepTool.execute({
      pattern: 'hello',
      path: testDir,
      include: '*.{txt,md}',
    });

    // Assert
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');
    expect(lines).toHaveLength(2);
  });

  it('should search recursively with ** pattern', async () => {
    // Arrange
    await fs.mkdir(join(testDir, 'src'), { recursive: true });
    await fs.mkdir(join(testDir, 'src', 'utils'), { recursive: true });
    await fs.writeFile(join(testDir, 'root.txt'), 'hello', 'utf-8');
    await fs.writeFile(join(testDir, 'src', 'app.txt'), 'hello', 'utf-8');
    await fs.writeFile(join(testDir, 'src', 'utils', 'helper.txt'), 'hello', 'utf-8');

    // Act
    const result = await grepTool.execute({
      pattern: 'hello',
      path: testDir,
      include: '**/*.txt',
    });

    // Assert
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');
    expect(lines.length).toBe(3);
  });

  it('should return empty string when no matches found', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'hello world', 'utf-8');

    // Act
    const result = await grepTool.execute({
      pattern: 'notfound',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBe('');
  });

  it('should return empty string when no files match include pattern', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'hello', 'utf-8');

    // Act
    const result = await grepTool.execute({
      pattern: 'hello',
      path: testDir,
      include: '*.nonexistent',
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBe('');
  });

  it('should handle special regex characters correctly', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'test.js\ntest.ts\ntest.java', 'utf-8');

    // Act - match .js or .ts extension (dot must be escaped)
    const result = await grepTool.execute({
      pattern: '\\.(js|ts)$',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');
    expect(lines.length).toBe(2);
  });

  it('should handle case-sensitive patterns by default', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'Hello\nHELLO\nhello', 'utf-8');

    // Act - only match lowercase "hello"
    const result = await grepTool.execute({
      pattern: 'hello',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');
    expect(lines.length).toBe(1);
  });

  it('should handle files with UTF-8 content', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), '你好世界\nHello世界', 'utf-8');

    // Act
    const result = await grepTool.execute({
      pattern: '世界',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');
    expect(lines.length).toBe(2);
  });

  it('should work with default include pattern (**/*)', async () => {
    // Arrange
    await fs.mkdir(join(testDir, 'subdir'), { recursive: true });
    await fs.writeFile(join(testDir, 'test.txt'), 'hello', 'utf-8');
    await fs.writeFile(join(testDir, 'test.js'), 'hello', 'utf-8');
    await fs.writeFile(join(testDir, 'subdir', 'nested.txt'), 'hello', 'utf-8');

    // Act - no include pattern specified
    const result = await grepTool.execute({
      pattern: 'hello',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle multiple matches on same line', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'hello hello hello', 'utf-8');

    // Act
    const result = await grepTool.execute({
      pattern: 'hello',
      path: testDir,
    });

    // Assert - should return one result per matching line
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');
    expect(lines.length).toBe(1);
  });

  it('should skip unreadable files gracefully', async () => {
    // Arrange - create a directory and file
    const subdir = join(testDir, 'subdir');
    await fs.mkdir(subdir, { recursive: true });
    await fs.writeFile(join(subdir, 'test.txt'), 'hello', 'utf-8');

    // Act - try to search
    const result = await grepTool.execute({
      pattern: 'hello',
      path: testDir,
    });

    // Assert - should succeed even if some files can't be read
    expect(result.success).toBe(true);
  });

  it('should handle empty files', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'empty.txt'), '', 'utf-8');
    await fs.writeFile(join(testDir, 'test.txt'), 'hello', 'utf-8');

    // Act
    const result = await grepTool.execute({
      pattern: 'hello',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');
    expect(lines.length).toBe(1);
  });
});

describe('GrepTool - Metadata', () => {
  it('should have correct name', () => {
    // Arrange
    const grepTool = new GrepTool();

    // Assert
    expect(grepTool.name).toBe('grep');
  });

  it('should have description', () => {
    // Arrange
    const grepTool = new GrepTool();

    // Assert
    expect(grepTool.description).toBeDefined();
    expect(grepTool.description.length).toBeGreaterThan(0);
  });

  it('should have parameters schema', () => {
    // Arrange
    const grepTool = new GrepTool();

    // Assert
    expect(grepTool.parameters).toBeDefined();
    expect(grepTool.parameters.type).toBe('object');
    expect(grepTool.parameters.properties).toBeDefined();
    expect(grepTool.parameters.required).toBeDefined();
  });

  it('should include all required parameters in schema', () => {
    // Arrange
    const grepTool = new GrepTool();

    // Assert
    expect(grepTool.parameters.properties.pattern).toBeDefined();
    expect(grepTool.parameters.properties.path).toBeDefined();
    expect(grepTool.parameters.properties.include).toBeDefined();
  });

  it('should mark pattern and path as required but not include', () => {
    // Arrange
    const grepTool = new GrepTool();

    // Assert
    expect(grepTool.parameters.required).toContain('pattern');
    expect(grepTool.parameters.required).toContain('path');
    expect(grepTool.parameters.required).not.toContain('include');
  });

  it('should get metadata correctly', () => {
    // Arrange
    const grepTool = new GrepTool();

    // Act
    const metadata = grepTool.getMetadata();

    // Assert
    expect(metadata.name).toBe('grep');
    expect(metadata.description).toBeDefined();
    expect(metadata.parameters).toBeDefined();
  });
});
