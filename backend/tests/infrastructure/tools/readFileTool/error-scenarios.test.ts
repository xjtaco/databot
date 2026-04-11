import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ReadFileTool } from '../../../../src/infrastructure/tools/readFileTool';
import { ToolExecutionError } from '../../../../src/errors/types';

describe('ReadFileTool.execute() - Error Scenarios', () => {
  let readFileTool: ReadFileTool;
  let testDir: string;

  beforeEach(async () => {
    readFileTool = new ReadFileTool();
    // Create a temporary directory for test files with unique name
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `readfiletool-error-test-${Date.now()}-${randomSuffix}`);
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

  describe('Parameter Validation', () => {
    it('should throw ToolExecutionError when absolute_path is missing', async () => {
      // Act & Assert
      await expect(
        readFileTool.execute({
          offset: 0,
          limit: 10,
        } as { absolute_path?: string })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when absolute_path is null', async () => {
      // Act & Assert
      await expect(
        readFileTool.execute({
          absolute_path: null as unknown as string,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when absolute_path is not a string', async () => {
      // Act & Assert
      await expect(
        readFileTool.execute({
          absolute_path: 123 as unknown as string,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when absolute_path is empty string', async () => {
      // Act & Assert
      await expect(
        readFileTool.execute({
          absolute_path: '',
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when absolute_path is only whitespace', async () => {
      // Act & Assert
      await expect(
        readFileTool.execute({
          absolute_path: '   \t\n  ',
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when offset is negative', async () => {
      // Arrange
      const testFilePath = join(testDir, 'test.txt');
      await fs.writeFile(testFilePath, 'content', 'utf-8');

      // Act & Assert
      await expect(
        readFileTool.execute({
          absolute_path: testFilePath,
          offset: -1,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when offset is not a number', async () => {
      // Arrange
      const testFilePath = join(testDir, 'test.txt');
      await fs.writeFile(testFilePath, 'content', 'utf-8');

      // Act & Assert
      await expect(
        readFileTool.execute({
          absolute_path: testFilePath,
          offset: '5' as unknown as number,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when limit is zero', async () => {
      // Arrange
      const testFilePath = join(testDir, 'test.txt');
      await fs.writeFile(testFilePath, 'content', 'utf-8');

      // Act & Assert
      await expect(
        readFileTool.execute({
          absolute_path: testFilePath,
          limit: 0,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when limit is negative', async () => {
      // Arrange
      const testFilePath = join(testDir, 'test.txt');
      await fs.writeFile(testFilePath, 'content', 'utf-8');

      // Act & Assert
      await expect(
        readFileTool.execute({
          absolute_path: testFilePath,
          limit: -10,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when limit is not a number', async () => {
      // Arrange
      const testFilePath = join(testDir, 'test.txt');
      await fs.writeFile(testFilePath, 'content', 'utf-8');

      // Act & Assert
      await expect(
        readFileTool.execute({
          absolute_path: testFilePath,
          limit: '10' as unknown as number,
        })
      ).rejects.toThrow(ToolExecutionError);
    });
  });

  describe('File System Errors', () => {
    it('should throw ToolExecutionError when file does not exist', async () => {
      // Arrange
      const nonExistentPath = join(testDir, 'does-not-exist.txt');

      // Act & Assert
      await expect(
        readFileTool.execute({
          absolute_path: nonExistentPath,
        })
      ).rejects.toThrow(ToolExecutionError);

      await expect(
        readFileTool.execute({
          absolute_path: nonExistentPath,
        })
      ).rejects.toThrow(/File does not exist/);
    });

    it('should throw ToolExecutionError when path is a directory', async () => {
      // Act & Assert
      await expect(
        readFileTool.execute({
          absolute_path: testDir,
        })
      ).rejects.toThrow(ToolExecutionError);

      await expect(
        readFileTool.execute({
          absolute_path: testDir,
        })
      ).rejects.toThrow(/Path is not a file/);
    });

    it('should throw ToolExecutionError when path is a symbolic link to directory', async () => {
      // Arrange
      const linkPath = join(testDir, 'symlink');
      const targetDir = join(testDir, 'target');
      await fs.mkdir(targetDir, { recursive: true });

      try {
        await fs.symlink(targetDir, linkPath, 'dir');
      } catch {
        // Symbolic links might not be supported on all systems
        // Skip this test if symlink creation fails
        return;
      }

      // Act & Assert
      await expect(
        readFileTool.execute({
          absolute_path: linkPath,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should handle permission denied errors gracefully', async () => {
      // This test is platform-dependent and might not work on all systems
      // Skip on Windows or systems without proper permission controls
      if (process.platform === 'win32') {
        return;
      }

      // Arrange
      const testFilePath = join(testDir, 'no-permission.txt');
      await fs.writeFile(testFilePath, 'content', 'utf-8');

      try {
        // Remove read permissions
        await fs.chmod(testFilePath, 0o000);
      } catch {
        // chmod might not work on all systems
        return;
      }

      try {
        // Act & Assert
        const result = await readFileTool.execute({
          absolute_path: testFilePath,
        });
        // On some systems, root might still be able to read the file
        // In that case, we don't expect an error
        expect(result.success).toBe(true);
      } catch (error) {
        // On most systems, we expect a permission error
        expect(error).toBeInstanceOf(ToolExecutionError);
      } finally {
        // Restore permissions for cleanup
        try {
          await fs.chmod(testFilePath, 0o644);
        } catch {
          // Ignore
        }
      }
    });

    it('should handle binary files gracefully', async () => {
      // Arrange
      const testFilePath = join(testDir, 'binary.bin');
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd]);
      await fs.writeFile(testFilePath, binaryContent);

      // Act - should be able to read, though content might not be meaningful
      const result = await readFileTool.execute({
        absolute_path: testFilePath,
      });

      // Assert
      expect(result.success).toBe(true);
      const data = result.data as { content: string };
      expect(data.content).toBeDefined();
    });
  });

  describe('validate() method', () => {
    it('should return true for valid parameters with only absolute_path', () => {
      // Act
      const result = readFileTool.validate({
        absolute_path: '/some/path/file.txt',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for valid parameters with offset and limit', () => {
      // Act
      const result = readFileTool.validate({
        absolute_path: '/some/path/file.txt',
        offset: 10,
        limit: 50,
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true when offset is 0', () => {
      // Act
      const result = readFileTool.validate({
        absolute_path: '/some/path/file.txt',
        offset: 0,
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true when limit is a positive decimal', () => {
      // Act
      const result = readFileTool.validate({
        absolute_path: '/some/path/file.txt',
        limit: 10.5,
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when absolute_path is undefined', () => {
      // Act
      const result = readFileTool.validate({
        absolute_path: undefined as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when absolute_path is null', () => {
      // Act
      const result = readFileTool.validate({
        absolute_path: null as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when absolute_path is not a string', () => {
      // Act
      const result = readFileTool.validate({
        absolute_path: 123 as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when absolute_path is empty string', () => {
      // Act
      const result = readFileTool.validate({
        absolute_path: '',
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when offset is negative', () => {
      // Act
      const result = readFileTool.validate({
        absolute_path: '/some/path/file.txt',
        offset: -1,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when offset is not a number', () => {
      // Act
      const result = readFileTool.validate({
        absolute_path: '/some/path/file.txt',
        offset: '5' as unknown as number,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when limit is zero', () => {
      // Act
      const result = readFileTool.validate({
        absolute_path: '/some/path/file.txt',
        limit: 0,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when limit is negative', () => {
      // Act
      const result = readFileTool.validate({
        absolute_path: '/some/path/file.txt',
        limit: -10,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when limit is not a number', () => {
      // Act
      const result = readFileTool.validate({
        absolute_path: '/some/path/file.txt',
        limit: '10' as unknown as number,
      });

      // Assert
      expect(result).toBe(false);
    });
  });
});
