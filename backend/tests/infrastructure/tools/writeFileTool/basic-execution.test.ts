import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { WriteFileTool } from '../../../../src/infrastructure/tools/writeFileTool';

// Mock the pathSecurity module to allow writing to temp directories during tests
vi.mock('../../../../src/utils/pathSecurity', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../src/utils/pathSecurity')>();
  return {
    ...original,
    validateFilePath: (filePath: string) => {
      // Use the original validation but with tmpdir as the work folder
      return original.validateFilePath(filePath, tmpdir());
    },
  };
});

describe('WriteFileTool.execute() - Success', () => {
  let writeFileTool: WriteFileTool;
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    writeFileTool = new WriteFileTool();
    // Create a temporary directory for test files with unique name
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `writefiletool-test-${Date.now()}-${randomSuffix}`);
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

  it('should write content to a new file', async () => {
    // Arrange
    const content = 'Hello, World!';

    // Act
    const result = await writeFileTool.execute({
      file_path: testFilePath,
      content: content,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toContain('created new file');
    expect(result.data).toContain(testFilePath);

    // Verify file was actually written
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    expect(fileContent).toBe(content);
  });

  it('should overwrite content in an existing file', async () => {
    // Arrange
    const initialContent = 'Initial content';
    const newContent = 'New content';
    await fs.writeFile(testFilePath, initialContent, 'utf-8');

    // Act
    const result = await writeFileTool.execute({
      file_path: testFilePath,
      content: newContent,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toContain('overwrote existing file');
    expect(result.data).toContain(testFilePath);

    // Verify file was overwritten
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    expect(fileContent).toBe(newContent);
  });

  it('should write multi-line content', async () => {
    // Arrange
    const content = 'Line 1\nLine 2\nLine 3';

    // Act
    const result = await writeFileTool.execute({
      file_path: testFilePath,
      content: content,
    });

    // Assert
    expect(result.success).toBe(true);

    // Verify file was written correctly
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    expect(fileContent).toBe(content);
  });

  it('should write empty content', async () => {
    // Arrange
    const content = '';

    // Act
    const result = await writeFileTool.execute({
      file_path: testFilePath,
      content: content,
    });

    // Assert
    expect(result.success).toBe(true);

    // Verify file was written
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    expect(fileContent).toBe('');
  });

  it('should write content with special characters', async () => {
    // Arrange
    const content = 'Line with "quotes"\nLine with \'apostrophes\'\nLine with $pecial @#!% chars';

    // Act
    const result = await writeFileTool.execute({
      file_path: testFilePath,
      content: content,
    });

    // Assert
    expect(result.success).toBe(true);

    // Verify file was written correctly
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    expect(fileContent).toBe(content);
  });

  it('should write content with UTF-8 characters', async () => {
    // Arrange
    const content = 'Hello 你好\nWorld 世界\nTest 测试';

    // Act
    const result = await writeFileTool.execute({
      file_path: testFilePath,
      content: content,
    });

    // Assert
    expect(result.success).toBe(true);

    // Verify file was written correctly
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    expect(fileContent).toBe(content);
  });

  it('should create nested directories if they do not exist', async () => {
    // Arrange
    const nestedPath = join(testDir, 'level1', 'level2', 'file.txt');
    const content = 'Content in nested directory';

    // Act
    const result = await writeFileTool.execute({
      file_path: nestedPath,
      content: content,
    });

    // Assert
    expect(result.success).toBe(true);

    // Verify file was written
    const fileContent = await fs.readFile(nestedPath, 'utf-8');
    expect(fileContent).toBe(content);
  });

  it('should write large content', async () => {
    // Arrange
    const largeContent = 'A'.repeat(100000);

    // Act
    const result = await writeFileTool.execute({
      file_path: testFilePath,
      content: largeContent,
    });

    // Assert
    expect(result.success).toBe(true);

    // Verify file was written correctly
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    expect(fileContent).toBe(largeContent);
  });

  it('should write content with Windows-style line endings (CRLF)', async () => {
    // Arrange
    const content = 'Line 1\r\nLine 2\r\nLine 3';

    // Act
    const result = await writeFileTool.execute({
      file_path: testFilePath,
      content: content,
    });

    // Assert
    expect(result.success).toBe(true);

    // Verify file was written correctly
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    expect(fileContent).toBe(content);
  });

  it('should write JSON content', async () => {
    // Arrange
    const jsonContent = JSON.stringify(
      { key: 'value', number: 123, nested: { prop: true } },
      null,
      2
    );

    // Act
    const result = await writeFileTool.execute({
      file_path: testFilePath,
      content: jsonContent,
    });

    // Assert
    expect(result.success).toBe(true);

    // Verify file was written correctly
    const fileContent = await fs.readFile(testFilePath, 'utf-8');
    expect(fileContent).toBe(jsonContent);
    JSON.parse(fileContent); // Should not throw
  });

  it('should handle very long file paths', async () => {
    // Arrange
    const longDirName = 'a'.repeat(100);
    const longPath = join(testDir, longDirName, 'file.txt');
    const content = 'Content with long path';

    // Act
    const result = await writeFileTool.execute({
      file_path: longPath,
      content: content,
    });

    // Assert
    expect(result.success).toBe(true);

    // Verify file was written
    const fileContent = await fs.readFile(longPath, 'utf-8');
    expect(fileContent).toBe(content);
  });
});

describe('WriteFileTool - Metadata', () => {
  it('should have correct name', () => {
    // Arrange
    const writeFileTool = new WriteFileTool();

    // Assert
    expect(writeFileTool.name).toBe('write_file');
  });

  it('should have description', () => {
    // Arrange
    const writeFileTool = new WriteFileTool();

    // Assert
    expect(writeFileTool.description).toBeDefined();
    expect(writeFileTool.description.length).toBeGreaterThan(0);
  });

  it('should have parameters schema', () => {
    // Arrange
    const writeFileTool = new WriteFileTool();

    // Assert
    expect(writeFileTool.parameters).toBeDefined();
    expect(writeFileTool.parameters.type).toBe('object');
    expect(writeFileTool.parameters.properties).toBeDefined();
    expect(writeFileTool.parameters.required).toBeDefined();
  });

  it('should include all required parameters in schema', () => {
    // Arrange
    const writeFileTool = new WriteFileTool();

    // Assert
    expect(writeFileTool.parameters.properties.file_path).toBeDefined();
    expect(writeFileTool.parameters.properties.content).toBeDefined();
  });

  it('should mark both file_path and content as required', () => {
    // Arrange
    const writeFileTool = new WriteFileTool();

    // Assert
    expect(writeFileTool.parameters.required).toContain('file_path');
    expect(writeFileTool.parameters.required).toContain('content');
  });

  it('should get metadata correctly', () => {
    // Arrange
    const writeFileTool = new WriteFileTool();

    // Act
    const metadata = writeFileTool.getMetadata();

    // Assert
    expect(metadata.name).toBe('write_file');
    expect(metadata.description).toBeDefined();
    expect(metadata.parameters).toBeDefined();
  });
});
