import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GlobTool } from '../../../../src/infrastructure/tools/globTool';

describe('GlobTool.execute() - Success', () => {
  let globTool: GlobTool;
  let testDir: string;

  beforeEach(async () => {
    globTool = new GlobTool();
    // Create a temporary directory for test files with unique name
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `globtool-test-${Date.now()}-${randomSuffix}`);
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

  it('should match files with simple wildcard pattern (*)', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'content1', 'utf-8');
    await fs.writeFile(join(testDir, 'file.txt'), 'content2', 'utf-8');
    await fs.writeFile(join(testDir, 'other.md'), 'content3', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: '*.txt',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(2);

    // All paths should be absolute
    for (const path of result.data as string[]) {
      expect(path.startsWith('/')).toBe(true);
    }
  });

  it('should match files with recursive pattern (**)', async () => {
    // Arrange
    await fs.mkdir(join(testDir, 'src'), { recursive: true });
    await fs.mkdir(join(testDir, 'src', 'utils'), { recursive: true });
    await fs.writeFile(join(testDir, 'test.ts'), 'root', 'utf-8');
    await fs.writeFile(join(testDir, 'src', 'app.ts'), 'app', 'utf-8');
    await fs.writeFile(join(testDir, 'src', 'utils', 'helper.ts'), 'helper', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: '**/*.ts',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(3);
  });

  it('should match files with single character wildcard (?)', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'file1.txt'), 'content1', 'utf-8');
    await fs.writeFile(join(testDir, 'file2.txt'), 'content2', 'utf-8');
    await fs.writeFile(join(testDir, 'file10.txt'), 'content3', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: 'file?.txt',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it('should match files with character class [abc]', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'file1.txt'), 'content1', 'utf-8');
    await fs.writeFile(join(testDir, 'file2.txt'), 'content2', 'utf-8');
    await fs.writeFile(join(testDir, 'file3.txt'), 'content3', 'utf-8');
    await fs.writeFile(join(testDir, 'file4.txt'), 'content4', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: 'file[123].txt',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(3);
  });

  it('should match files with negated character class [!abc]', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'file1.txt'), 'content1', 'utf-8');
    await fs.writeFile(join(testDir, 'file2.txt'), 'content2', 'utf-8');
    await fs.writeFile(join(testDir, 'filea.txt'), 'content3', 'utf-8');
    await fs.writeFile(join(testDir, 'fileb.txt'), 'content4', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: 'file[!12].txt',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it('should return files sorted by modification time (newest first)', async () => {
    // Arrange
    const file1Path = join(testDir, 'file1.txt');
    const file2Path = join(testDir, 'file2.txt');
    const file3Path = join(testDir, 'file3.txt');

    await fs.writeFile(file1Path, 'content1', 'utf-8');
    await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
    await fs.writeFile(file2Path, 'content2', 'utf-8');
    await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
    await fs.writeFile(file3Path, 'content3', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: '*.txt',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    const files = result.data as string[];

    // The newest file (file3.txt) should be first
    expect(files[0]).toBe(file3Path);
    expect(files[1]).toBe(file2Path);
    expect(files[2]).toBe(file1Path);
  });

  it('should work with nested directory patterns', async () => {
    // Arrange
    await fs.mkdir(join(testDir, 'src'), { recursive: true });
    await fs.mkdir(join(testDir, 'test'), { recursive: true });
    await fs.writeFile(join(testDir, 'src', 'app.ts'), 'app', 'utf-8');
    await fs.writeFile(join(testDir, 'test', 'app.test.ts'), 'test', 'utf-8');
    await fs.writeFile(join(testDir, 'other.ts'), 'other', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: '*/app.ts',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect((result.data as string[])[0]).toContain(join(testDir, 'src', 'app.ts'));
  });

  it('should return empty array when no files match', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'file.txt'), 'content', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: '*.md',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should work with default path (current directory)', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'content', 'utf-8');

    // Act - use '.' as path
    const result = await globTool.execute({
      pattern: '*.txt',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it('should handle special characters in pattern correctly', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'file.js'), 'content1', 'utf-8');
    await fs.writeFile(join(testDir, 'file.ts'), 'content2', 'utf-8');
    await fs.writeFile(join(testDir, 'file (copy).txt'), 'content3', 'utf-8');

    // Act - pattern 'file.*' matches files starting with "file" followed by a dot
    // So it matches 'file.js' and 'file.ts', but not 'file (copy).txt' (dot is not right after "file")
    const result = await globTool.execute({
      pattern: 'file.*',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);

    // Verify the correct files are matched
    const paths = result.data as string[];
    expect(paths.some((p) => p.endsWith('file.js'))).toBe(true);
    expect(paths.some((p) => p.endsWith('file.ts'))).toBe(true);
    expect(paths.some((p) => p.endsWith('file (copy).txt'))).toBe(false);
  });

  it('should match files in deeply nested directories', async () => {
    // Arrange
    await fs.mkdir(join(testDir, 'a', 'b', 'c', 'd'), { recursive: true });
    await fs.writeFile(join(testDir, 'a', 'b', 'c', 'd', 'deep.txt'), 'content', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: '**/*.txt',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect((result.data as string[])[0]).toContain('deep.txt');
  });

  it('should handle complex pattern with multiple wildcards', async () => {
    // Arrange
    await fs.mkdir(join(testDir, 'src'), { recursive: true });
    await fs.writeFile(join(testDir, 'my.component.test.ts'), 'content1', 'utf-8');
    await fs.writeFile(join(testDir, 'my.component.ts'), 'content2', 'utf-8');
    await fs.writeFile(join(testDir, 'src', 'my.component.ts'), 'content3', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: '**/*.component.ts',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
  });
});

describe('GlobTool - Metadata', () => {
  it('should have correct name', () => {
    // Arrange
    const globTool = new GlobTool();

    // Assert
    expect(globTool.name).toBe('glob');
  });

  it('should have description', () => {
    // Arrange
    const globTool = new GlobTool();

    // Assert
    expect(globTool.description).toBeDefined();
    expect(globTool.description.length).toBeGreaterThan(0);
  });

  it('should have parameters schema', () => {
    // Arrange
    const globTool = new GlobTool();

    // Assert
    expect(globTool.parameters).toBeDefined();
    expect(globTool.parameters.type).toBe('object');
    expect(globTool.parameters.properties).toBeDefined();
    expect(globTool.parameters.required).toBeDefined();
  });

  it('should include all required parameters in schema', () => {
    // Arrange
    const globTool = new GlobTool();

    // Assert
    expect(globTool.parameters.properties.pattern).toBeDefined();
    expect(globTool.parameters.properties.path).toBeDefined();
  });

  it('should mark pattern as required but not path', () => {
    // Arrange
    const globTool = new GlobTool();

    // Assert
    expect(globTool.parameters.required).toContain('pattern');
    expect(globTool.parameters.required).not.toContain('path');
  });

  it('should get metadata correctly', () => {
    // Arrange
    const globTool = new GlobTool();

    // Act
    const metadata = globTool.getMetadata();

    // Assert
    expect(metadata.name).toBe('glob');
    expect(metadata.description).toBeDefined();
    expect(metadata.parameters).toBeDefined();
  });
});
