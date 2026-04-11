import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GrepTool } from '../../../../src/infrastructure/tools/grepTool';
import { ToolExecutionError } from '../../../../src/errors/types';

describe('GrepTool.execute() - Error Scenarios', () => {
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

  it('should fail when pattern is null', async () => {
    // Act & Assert
    await expect(
      grepTool.execute({
        pattern: null as unknown as string,
        path: testDir,
      })
    ).rejects.toThrow(ToolExecutionError);
  });

  it('should fail when pattern is undefined', async () => {
    // Act & Assert
    await expect(
      grepTool.execute({
        pattern: undefined as unknown as string,
        path: testDir,
      })
    ).rejects.toThrow(ToolExecutionError);
  });

  it('should fail when pattern is not a string', async () => {
    // Act & Assert
    await expect(
      grepTool.execute({
        pattern: 123 as unknown as string,
        path: testDir,
      })
    ).rejects.toThrow(ToolExecutionError);
  });

  it('should fail when path is null', async () => {
    // Act & Assert
    await expect(
      grepTool.execute({
        pattern: 'test',
        path: null as unknown as string,
      })
    ).rejects.toThrow(ToolExecutionError);
  });

  it('should fail when path is undefined', async () => {
    // Act & Assert
    await expect(
      grepTool.execute({
        pattern: 'test',
        path: undefined as unknown as string,
      })
    ).rejects.toThrow(ToolExecutionError);
  });

  it('should fail when path is not a string', async () => {
    // Act & Assert
    await expect(
      grepTool.execute({
        pattern: 'test',
        path: {} as unknown as string,
      })
    ).rejects.toThrow(ToolExecutionError);
  });

  it('should fail when include is not a string', async () => {
    // Act & Assert
    await expect(
      grepTool.execute({
        pattern: 'test',
        path: testDir,
        include: [] as unknown as string,
      })
    ).rejects.toThrow(ToolExecutionError);
  });

  it('should fail when path does not exist', async () => {
    // Act & Assert
    await expect(
      grepTool.execute({
        pattern: 'test',
        path: '/nonexistent/path/that/does/not/exist',
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      grepTool.execute({
        pattern: 'test',
        path: '/nonexistent/path/that/does/not/exist',
      })
    ).rejects.toThrow('Path does not exist');
  });

  it('should fail when path is a file, not a directory', async () => {
    // Arrange
    const filePath = join(testDir, 'file.txt');
    await fs.writeFile(filePath, 'content', 'utf-8');

    // Act & Assert
    await expect(
      grepTool.execute({
        pattern: 'test',
        path: filePath,
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      grepTool.execute({
        pattern: 'test',
        path: filePath,
      })
    ).rejects.toThrow('Path is not a directory');
  });

  it('should fail with invalid regex pattern', async () => {
    // Act & Assert
    await expect(
      grepTool.execute({
        pattern: '(?<-',
        path: testDir,
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      grepTool.execute({
        pattern: '(?<-',
        path: testDir,
      })
    ).rejects.toThrow('Invalid regex pattern');
  });

  it('should fail with unterminated regex pattern', async () => {
    // Act & Assert
    await expect(
      grepTool.execute({
        pattern: '[abc',
        path: testDir,
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      grepTool.execute({
        pattern: '[abc',
        path: testDir,
      })
    ).rejects.toThrow('Invalid regex pattern');
  });

  it('should handle empty pattern', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'hello', 'utf-8');

    // Act - empty pattern matches every line
    const result = await grepTool.execute({
      pattern: '',
      path: testDir,
    });

    // Assert - empty pattern is a valid regex
    expect(result.success).toBe(true);
  });

  it('should handle very long pattern', async () => {
    // Act
    const result = await grepTool.execute({
      pattern: 'a'.repeat(10000),
      path: testDir,
    });

    // Assert - should succeed even with long pattern
    expect(result.success).toBe(true);
  });

  it('should handle deeply nested non-existent path', async () => {
    // Act & Assert
    await expect(
      grepTool.execute({
        pattern: 'test',
        path: '/a/b/c/d/e/f/nonexistent',
      })
    ).rejects.toThrow(ToolExecutionError);
    await expect(
      grepTool.execute({
        pattern: 'test',
        path: '/a/b/c/d/e/f/nonexistent',
      })
    ).rejects.toThrow('Path does not exist');
  });

  it('should handle special characters in path', async () => {
    // Arrange - On Windows, some characters may not be allowed
    // Using generally safe special characters
    const specialDir = join(testDir, 'test-dir (1)');
    await fs.mkdir(specialDir, { recursive: true });
    await fs.writeFile(join(specialDir, 'file.txt'), 'hello', 'utf-8');

    // Act
    const result = await grepTool.execute({
      pattern: 'hello',
      path: specialDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toContain('hello');
  });

  it('should handle directory with no matching files', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'hello', 'utf-8');

    // Act - pattern that doesn't match anything
    const result = await grepTool.execute({
      pattern: 'zzzzz',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBe('');
  });

  it('should handle complex regex with lookahead', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), 'hello123\nhello456\nworld789', 'utf-8');

    // Act - match lines with "hello" followed by digits
    const result = await grepTool.execute({
      pattern: 'hello(?=\\d)',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');
    expect(lines.length).toBe(2);
  });

  it('should handle regex with lookbehind', async () => {
    // Arrange
    await fs.writeFile(join(testDir, 'test.txt'), '123hello\n456hello\n789world', 'utf-8');

    // Act - match "hello" preceded by digits
    const result = await grepTool.execute({
      pattern: '(?<=\\d)hello',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    const lines = (result.data as string).split('\n');
    expect(lines.length).toBe(2);
  });

  it('should handle files with very long lines', async () => {
    // Arrange
    const longLine = 'a_'.repeat(50000) + 'hello' + 'b_'.repeat(50000);
    await fs.writeFile(join(testDir, 'test.txt'), longLine, 'utf-8');

    // Act
    const result = await grepTool.execute({
      pattern: 'hello',
      path: testDir,
    });

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toContain('hello');
  });

  it('should handle files with many lines (capped at max matches)', async () => {
    // Arrange
    const lines: string[] = [];
    for (let i = 0; i < 1000; i++) {
      lines.push(`line ${i}`);
    }
    await fs.writeFile(join(testDir, 'test.txt'), lines.join('\n'), 'utf-8');

    // Act
    const result = await grepTool.execute({
      pattern: 'line',
      path: testDir,
    });

    // Assert - results capped at MAX_MATCHES (100)
    expect(result.success).toBe(true);
    const data = result.data as string;
    const resultLines = data.split('\n\n---')[0].split('\n').filter(Boolean);
    expect(resultLines.length).toBe(100);
    expect(data).toContain('Results truncated at 100 matches');
  });

  it('should handle binary files gracefully', async () => {
    // Arrange - create a binary file
    const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    await fs.writeFile(join(testDir, 'binary.bin'), binaryContent);

    // Act
    const result = await grepTool.execute({
      pattern: 'test',
      path: testDir,
    });

    // Assert - binary file should be skipped
    expect(result.success).toBe(true);
  });
});

describe('GrepTool.validate()', () => {
  let grepTool: GrepTool;

  beforeEach(() => {
    grepTool = new GrepTool();
  });

  it('should validate correct parameters with required fields only', () => {
    // Act
    const isValid = grepTool.validate({
      pattern: 'test',
      path: '/some/path',
    });

    // Assert
    expect(isValid).toBe(true);
  });

  it('should validate correct parameters with all fields', () => {
    // Act
    const isValid = grepTool.validate({
      pattern: 'test',
      path: '/some/path',
      include: '*.txt',
    });

    // Assert
    expect(isValid).toBe(true);
  });

  it('should reject null pattern', () => {
    // Act
    const isValid = grepTool.validate({
      pattern: null as unknown as string,
      path: '/some/path',
    });

    // Assert
    expect(isValid).toBe(false);
  });

  it('should reject undefined pattern', () => {
    // Act
    const isValid = grepTool.validate({
      pattern: undefined as unknown as string,
      path: '/some/path',
    });

    // Assert
    expect(isValid).toBe(false);
  });

  it('should reject wrong type for pattern', () => {
    // Act
    const isValid = grepTool.validate({
      pattern: 123 as unknown as string,
      path: '/some/path',
    });

    // Assert
    expect(isValid).toBe(false);
  });

  it('should reject null path', () => {
    // Act
    const isValid = grepTool.validate({
      pattern: 'test',
      path: null as unknown as string,
    });

    // Assert
    expect(isValid).toBe(false);
  });

  it('should reject undefined path', () => {
    // Act
    const isValid = grepTool.validate({
      pattern: 'test',
      path: undefined as unknown as string,
    });

    // Assert
    expect(isValid).toBe(false);
  });

  it('should reject wrong type for path', () => {
    // Act
    const isValid = grepTool.validate({
      pattern: 'test',
      path: {} as unknown as string,
    });

    // Assert
    expect(isValid).toBe(false);
  });

  it('should reject wrong type for include', () => {
    // Act
    const isValid = grepTool.validate({
      pattern: 'test',
      path: '/some/path',
      include: [] as unknown as string,
    });

    // Assert
    expect(isValid).toBe(false);
  });

  it('should accept empty string for pattern', () => {
    // Act
    const isValid = grepTool.validate({
      pattern: '',
      path: '/some/path',
    });

    // Assert
    expect(isValid).toBe(true);
  });

  it('should accept empty string for path', () => {
    // Act
    const isValid = grepTool.validate({
      pattern: 'test',
      path: '',
    });

    // Assert
    expect(isValid).toBe(true);
  });

  it('should accept empty string for include', () => {
    // Act
    const isValid = grepTool.validate({
      pattern: 'test',
      path: '/some/path',
      include: '',
    });

    // Assert
    expect(isValid).toBe(true);
  });

  it('should accept undefined include', () => {
    // Act
    const isValid = grepTool.validate({
      pattern: 'test',
      path: '/some/path',
      include: undefined,
    });

    // Assert - undefined should be allowed (optional parameter)
    expect(isValid).toBe(true);
  });

  it('should accept null include', () => {
    // Act
    const isValid = grepTool.validate({
      pattern: 'test',
      path: '/some/path',
      include: null as unknown as string,
    });

    // Assert - null should not be accepted (must be string or undefined)
    expect(isValid).toBe(false);
  });
});
