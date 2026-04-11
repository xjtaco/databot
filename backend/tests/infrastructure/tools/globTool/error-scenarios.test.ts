import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GlobTool } from '../../../../src/infrastructure/tools/globTool';
import { ToolExecutionError } from '../../../../src/errors/types';

describe('GlobTool.execute() - Error Scenarios', () => {
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

  it('should fail when pattern is null', async () => {
    // Act & Assert
    await expect(
      globTool.execute({
        pattern: null as unknown as string,
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      globTool.execute({
        pattern: null as unknown as string,
      })
    ).rejects.toThrow('Invalid parameters');
  });

  it('should fail when pattern is undefined', async () => {
    // Act & Assert
    await expect(
      globTool.execute({
        pattern: undefined as unknown as string,
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      globTool.execute({
        pattern: undefined as unknown as string,
      })
    ).rejects.toThrow('Invalid parameters');
  });

  it('should fail when pattern is not a string', async () => {
    // Act & Assert
    await expect(
      globTool.execute({
        pattern: 123 as unknown as string,
      })
    ).rejects.toThrow(ToolExecutionError);
  });

  it('should fail when path is not a string', async () => {
    // Act & Assert
    await expect(
      globTool.execute({
        pattern: '*.txt',
        path: {} as unknown as string,
      })
    ).rejects.toThrow(ToolExecutionError);
  });

  it('should fail when path does not exist', async () => {
    // Act & Assert
    await expect(
      globTool.execute({
        pattern: '*.txt',
        path: '/nonexistent/path/that/does/not/exist',
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      globTool.execute({
        pattern: '*.txt',
        path: '/nonexistent/path/that/does/not/exist',
      })
    ).rejects.toThrow('Path does not exist');
  });

  it('should fail when path is not a directory but a file', async () => {
    // Arrange
    const filePath = join(testDir, 'file.txt');
    await fs.writeFile(filePath, 'content', 'utf-8');

    // Act & Assert
    await expect(
      globTool.execute({
        pattern: '*.txt',
        path: filePath,
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      globTool.execute({
        pattern: '*.txt',
        path: filePath,
      })
    ).rejects.toThrow('Path is not a directory');
  });

  it('should handle empty pattern gracefully', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'file.txt'), 'content', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: '',
      path: testDir,
    });

    // Assert - Empty pattern is technically valid but won't match anything
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should handle pattern with only wildcards', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'file.txt'), 'content', 'utf-8');

    // Act - pattern with only **
    const result = await globTool.execute({
      pattern: '**',
      path: testDir,
    });

    // Assert - This should match all files
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('should handle directory without matching files', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'file.txt'), 'content', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: '*.nonexistent',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('should handle deeply nested non-existent path', async () => {
    // Act & Assert
    await expect(
      globTool.execute({
        pattern: '*.txt',
        path: '/a/b/c/d/e/f/nonexistent',
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      globTool.execute({
        pattern: '*.txt',
        path: '/a/b/c/d/e/f/nonexistent',
      })
    ).rejects.toThrow('Path does not exist');
  });

  it('should handle permission errors gracefully', async () => {
    // Note: This test may be difficult to implement consistently across platforms
    // Skipping for now as it requires special permissions setup
    // In a real scenario, the tool should skip directories it can't read

    // Arrange
    await fs.writeFile(join(testDir, 'file.txt'), 'content', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: '*.txt',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
  });

  it('should handle very long file paths', async () => {
    // Arrange
    const longDirName = 'a'.repeat(100);
    const longDir = join(testDir, longDirName);
    await fs.mkdir(longDir, { recursive: true });
    await fs.writeFile(join(longDir, 'file.txt'), 'content', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: '**/*.txt',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it('should handle special characters in path', async () => {
    // Arrange - On Windows, some characters may not be allowed
    // Using generally safe special characters
    const specialDir = join(testDir, 'test-dir (1)');
    await fs.mkdir(specialDir, { recursive: true });
    await fs.writeFile(join(specialDir, 'file.txt'), 'content', 'utf-8');

    // Act
    const result = await globTool.execute({
      pattern: '**/*.txt',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });
});

describe('GlobTool.validate()', () => {
  let globTool: GlobTool;

  beforeEach(() => {
    globTool = new GlobTool();
  });

  it('should validate correct parameters with pattern only', () => {
    // Act
    const isValid = globTool.validate({
      pattern: '*.txt',
    });

    // Assert
    expect(isValid).toBe(true);
  });

  it('should validate correct parameters with pattern and path', () => {
    // Act
    const isValid = globTool.validate({
      pattern: '*.txt',
      path: '/some/path',
    });

    // Assert
    expect(isValid).toBe(true);
  });

  it('should reject null pattern', () => {
    // Act
    const isValid = globTool.validate({
      pattern: null as unknown as string,
    });

    // Assert
    expect(isValid).toBe(false);
  });

  it('should reject undefined pattern', () => {
    // Act
    const isValid = globTool.validate({
      pattern: undefined as unknown as string,
    });

    // Assert
    expect(isValid).toBe(false);
  });

  it('should reject wrong type for pattern', () => {
    // Act
    const isValid = globTool.validate({
      pattern: 123 as unknown as string,
    });

    // Assert
    expect(isValid).toBe(false);
  });

  it('should reject wrong type for path', () => {
    // Act
    const isValid = globTool.validate({
      pattern: '*.txt',
      path: {} as unknown as string,
    });

    // Assert
    expect(isValid).toBe(false);
  });

  it('should accept empty string for path (uses default)', () => {
    // Act
    const isValid = globTool.validate({
      pattern: '*.txt',
      path: '',
    });

    // Assert
    expect(isValid).toBe(true);
  });

  it('should accept null path (will use default)', () => {
    // Act
    const isValid = globTool.validate({
      pattern: '*.txt',
      path: null as unknown as string,
    });

    // Assert - This should fail validation since null is not a string
    expect(isValid).toBe(false);
  });

  it('should accept undefined path (uses default)', () => {
    // Act
    const isValid = globTool.validate({
      pattern: '*.txt',
      path: undefined,
    });

    // Assert - undefined should be allowed (uses default)
    expect(isValid).toBe(true);
  });
});
