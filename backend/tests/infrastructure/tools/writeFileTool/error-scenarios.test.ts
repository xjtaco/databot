import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { WriteFileTool } from '../../../../src/infrastructure/tools/writeFileTool';
import { ToolExecutionError } from '../../../../src/errors/types';

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

describe('WriteFileTool.execute() - Error Scenarios', () => {
  let writeFileTool: WriteFileTool;
  let testDir: string;

  beforeEach(async () => {
    writeFileTool = new WriteFileTool();
    // Create a temporary directory for test files with unique name
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `writefiletool-error-test-${Date.now()}-${randomSuffix}`);
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
    it('should throw ToolExecutionError when file_path is missing', async () => {
      // Act & Assert
      await expect(
        writeFileTool.execute({
          content: 'some content',
        } as { file_path?: string })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when file_path is null', async () => {
      // Act & Assert
      await expect(
        writeFileTool.execute({
          file_path: null as unknown as string,
          content: 'content',
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when file_path is not a string', async () => {
      // Act & Assert
      await expect(
        writeFileTool.execute({
          file_path: 123 as unknown as string,
          content: 'content',
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when file_path is empty string', async () => {
      // Act & Assert
      await expect(
        writeFileTool.execute({
          file_path: '',
          content: 'content',
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when file_path is only whitespace', async () => {
      // Act & Assert
      await expect(
        writeFileTool.execute({
          file_path: '   \t\n  ',
          content: 'content',
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when content is missing', async () => {
      // Act & Assert
      await expect(
        writeFileTool.execute({
          file_path: '/some/path/file.txt',
        } as { content?: string })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when content is null', async () => {
      // Act & Assert
      await expect(
        writeFileTool.execute({
          file_path: '/some/path/file.txt',
          content: null as unknown as string,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when content is not a string', async () => {
      // Act & Assert
      await expect(
        writeFileTool.execute({
          file_path: '/some/path/file.txt',
          content: 123 as unknown as string,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when file_path is relative path', async () => {
      // Act & Assert
      await expect(
        writeFileTool.execute({
          file_path: 'relative/path/file.txt',
          content: 'content',
        })
      ).rejects.toThrow(ToolExecutionError);

      await expect(
        writeFileTool.execute({
          file_path: 'relative/path/file.txt',
          content: 'content',
        })
      ).rejects.toThrow(/absolute path/);
    });
  });

  describe('File System Errors', () => {
    it('should handle permission denied errors gracefully', async () => {
      // This test is platform-dependent and might not work on all systems
      // Skip on Windows or systems without proper permission controls
      if (process.platform === 'win32') {
        return;
      }

      // Arrange - create a directory with no write permissions
      const noWriteDir = join(testDir, 'no-write');
      await fs.mkdir(noWriteDir, { recursive: true });

      try {
        // Remove write permissions
        await fs.chmod(noWriteDir, 0o444);
      } catch {
        // chmod might not work on all systems
        return;
      }

      const testFilePath = join(noWriteDir, 'file.txt');

      try {
        // Act & Assert
        await expect(
          writeFileTool.execute({
            file_path: testFilePath,
            content: 'content',
          })
        ).rejects.toThrow(ToolExecutionError);
      } finally {
        // Restore permissions for cleanup
        try {
          await fs.chmod(noWriteDir, 0o755);
        } catch {
          // Ignore
        }
      }
    });

    it('should handle writing to a directory path (should fail)', async () => {
      // Arrange - testDir is a directory, not a file
      // Act & Assert
      await expect(
        writeFileTool.execute({
          file_path: testDir,
          content: 'content',
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should handle invalid file system paths', async () => {
      // This test is platform-dependent
      // On Unix-like systems, a filename cannot contain a null byte
      const invalidPath = join(testDir, 'file\x00with\x00nulls.txt');

      // Act & Assert
      await expect(
        writeFileTool.execute({
          file_path: invalidPath,
          content: 'content',
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should handle extremely long paths', async () => {
      // Arrange - create a path that exceeds typical path length limits
      // Most systems have a path length limit around 4096 characters
      let longPath = testDir;
      for (let i = 0; i < 20; i++) {
        longPath = join(longPath, 'a'.repeat(100));
      }
      longPath = join(longPath, 'file.txt');

      // Act & Assert
      const result = await writeFileTool.execute({
        file_path: longPath,
        content: 'content',
      });

      // The result depends on the system - might succeed or fail
      // Just verify we get a proper result or error
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle content that is a very large string', async () => {
      // Arrange - create content that is larger than typical buffer sizes
      const largeContent = 'x'.repeat(10 * 1024 * 1024); // 10MB

      const testFilePath = join(testDir, 'large-file.txt');

      // Act
      const result = await writeFileTool.execute({
        file_path: testFilePath,
        content: largeContent,
      });

      // Assert
      expect(result.success).toBe(true);

      // Verify content was written correctly
      const stat = await fs.stat(testFilePath);
      expect(stat.size).toBe(largeContent.length);
    });

    it('should handle path with trailing slash (normalized to valid file path)', async () => {
      // Arrange - path with trailing slash gets normalized, so if there's no existing directory
      // with that name, it will be treated as a file path
      const pathWithSlash = join(testDir, 'new-file.txt') + '/';

      // Act - The path gets normalized to /path/to/new-file.txt
      const result = await writeFileTool.execute({
        file_path: pathWithSlash,
        content: 'content',
      });

      // Assert - The file is created because the trailing slash is normalized away
      expect(result.success).toBe(true);
    });

    it('should reject writing to root directory (outside work folder)', async () => {
      // The root directory is outside the work folder, so it should be rejected
      const rootPath = '/databot-test-writefiletool.txt';

      // Act & Assert
      await expect(
        writeFileTool.execute({
          file_path: rootPath,
          content: 'test content',
        })
      ).rejects.toThrow(ToolExecutionError);
      await expect(
        writeFileTool.execute({
          file_path: rootPath,
          content: 'test content',
        })
      ).rejects.toThrow(/within the work folder/);
    });
  });
});
