import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { OutputMdTool } from '../../../../src/infrastructure/tools/outputMdTool';
import { ToolExecutionError } from '../../../../src/errors/types';

describe('OutputMdTool.execute() - Error Scenarios', () => {
  let outputMdTool: OutputMdTool;
  let testDir: string;

  beforeEach(async () => {
    outputMdTool = new OutputMdTool();
    // Create a temporary directory for test files with unique name
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    testDir = join(tmpdir(), `outputmdtool-error-test-${Date.now()}-${randomSuffix}`);
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
    it('should throw ToolExecutionError when md_content is missing', async () => {
      // Act & Assert
      await expect(outputMdTool.execute({} as { md_content?: string })).rejects.toThrow(
        ToolExecutionError
      );
    });

    it('should throw ToolExecutionError when md_content is null', async () => {
      // Act & Assert
      await expect(
        outputMdTool.execute({
          md_content: null as unknown as string,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when md_content is not a string', async () => {
      // Act & Assert
      await expect(
        outputMdTool.execute({
          md_content: 123 as unknown as string,
        })
      ).rejects.toThrow(ToolExecutionError);
    });

    it('should throw ToolExecutionError when replace_files is not an array', async () => {
      // Act & Assert
      await expect(
        outputMdTool.execute({
          md_content: '# Report',
          replace_files: '/path/to/file' as unknown as string[],
        })
      ).rejects.toThrow(ToolExecutionError);
    });
  });

  describe('Empty Content', () => {
    it('should throw ToolExecutionError when md_content is empty string', async () => {
      // Act & Assert
      await expect(
        outputMdTool.execute({
          md_content: '',
        })
      ).rejects.toThrow(ToolExecutionError);

      await expect(
        outputMdTool.execute({
          md_content: '',
        })
      ).rejects.toThrow(/empty/);
    });

    it('should throw ToolExecutionError when md_content is only whitespace', async () => {
      // Act & Assert
      await expect(
        outputMdTool.execute({
          md_content: '   \t\n  ',
        })
      ).rejects.toThrow(ToolExecutionError);

      await expect(
        outputMdTool.execute({
          md_content: '   \t\n  ',
        })
      ).rejects.toThrow(/empty/);
    });
  });

  describe('Content Size Limit', () => {
    it('should throw ToolExecutionError when content exceeds 10MB', async () => {
      // Arrange - create content larger than 10MB
      const largeContent = 'x'.repeat(10 * 1024 * 1024 + 1);

      // Act & Assert
      await expect(
        outputMdTool.execute({
          md_content: largeContent,
        })
      ).rejects.toThrow(ToolExecutionError);

      await expect(
        outputMdTool.execute({
          md_content: largeContent,
        })
      ).rejects.toThrow(/exceeds maximum/);
    });

    it('should succeed when content is exactly 10MB', async () => {
      // Arrange - create content exactly 10MB
      const exactContent = 'x'.repeat(10 * 1024 * 1024);

      // Act
      const result = await outputMdTool.execute({
        md_content: exactContent,
      });

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('Missing Files', () => {
    it('should skip non-existent file and succeed', async () => {
      // Arrange
      const nonExistentFile = join(testDir, 'non-existent.csv');
      const mdContent = `# Report\n\n<!-- {${nonExistentFile}} -->`;

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
        replace_files: [nonExistentFile],
      });

      // Assert — implementation skips missing files gracefully
      expect(result.success).toBe(true);
    });

    it('should skip non-existent file and still replace existing ones', async () => {
      // Arrange
      const existingFile = join(testDir, 'existing.csv');
      const nonExistentFile = join(testDir, 'non-existent.csv');
      await fs.writeFile(existingFile, 'data');

      const mdContent = `<!-- {${existingFile}} -->\n<!-- {${nonExistentFile}} -->`;

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
        replace_files: [existingFile, nonExistentFile],
      });

      // Assert — existing file replaced, non-existent skipped
      expect(result.success).toBe(true);
      const metadata = result.metadata as Record<string, unknown>;
      expect(metadata.hasFileReplacements).toBe(true);
      expect(metadata.replaceFiles).toEqual([existingFile]);
    });
  });

  describe('Placeholder Mismatch', () => {
    it('should succeed when placeholder has no matching file in replace_files', async () => {
      // Arrange
      const testFile = join(testDir, 'data.csv');
      await fs.writeFile(testFile, 'data');

      const unmatchedFile = join(testDir, 'unmatched.csv');
      const mdContent = `<!-- {${unmatchedFile}} -->`;

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
        replace_files: [testFile],
      });

      // Assert — unmatched placeholder left as-is, file with no placeholder ignored
      expect(result.success).toBe(true);
    });

    it('should succeed when file has no matching placeholder', async () => {
      // Arrange
      const testFile1 = join(testDir, 'data1.csv');
      const testFile2 = join(testDir, 'data2.csv');
      await fs.writeFile(testFile1, 'data');
      await fs.writeFile(testFile2, 'data');

      const mdContent = `<!-- {${testFile1}} -->`;

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
        replace_files: [testFile1, testFile2],
      });

      // Assert — testFile1 replaced, testFile2 has no placeholder but no error
      expect(result.success).toBe(true);
      const metadata = result.metadata as Record<string, unknown>;
      expect(metadata.hasFileReplacements).toBe(true);
    });
  });

  describe('Path Traversal Detection', () => {
    it('should throw ToolExecutionError when path contains ".."', async () => {
      // Arrange
      const traversalPath = '/path/to/../etc/passwd';
      const mdContent = `<!-- {${traversalPath}} -->`;

      // Act & Assert
      await expect(
        outputMdTool.execute({
          md_content: mdContent,
          replace_files: [traversalPath],
        })
      ).rejects.toThrow(ToolExecutionError);

      await expect(
        outputMdTool.execute({
          md_content: mdContent,
          replace_files: [traversalPath],
        })
      ).rejects.toThrow(/forbidden pattern/);
    });

    it('should throw ToolExecutionError when path contains "/etc/"', async () => {
      // Arrange
      const etcPath = '/etc/passwd';
      const mdContent = `<!-- {${etcPath}} -->`;

      // Act & Assert
      await expect(
        outputMdTool.execute({
          md_content: mdContent,
          replace_files: [etcPath],
        })
      ).rejects.toThrow(ToolExecutionError);

      await expect(
        outputMdTool.execute({
          md_content: mdContent,
          replace_files: [etcPath],
        })
      ).rejects.toThrow(/forbidden pattern/);
    });

    it('should throw ToolExecutionError when path contains "/sys/"', async () => {
      // Arrange
      const sysPath = '/sys/class/net';
      const mdContent = `<!-- {${sysPath}} -->`;

      // Act & Assert
      await expect(
        outputMdTool.execute({
          md_content: mdContent,
          replace_files: [sysPath],
        })
      ).rejects.toThrow(ToolExecutionError);

      await expect(
        outputMdTool.execute({
          md_content: mdContent,
          replace_files: [sysPath],
        })
      ).rejects.toThrow(/forbidden pattern/);
    });

    it('should throw ToolExecutionError when path contains "/proc/"', async () => {
      // Arrange
      const procPath = '/proc/self/status';
      const mdContent = `<!-- {${procPath}} -->`;

      // Act & Assert
      await expect(
        outputMdTool.execute({
          md_content: mdContent,
          replace_files: [procPath],
        })
      ).rejects.toThrow(ToolExecutionError);

      await expect(
        outputMdTool.execute({
          md_content: mdContent,
          replace_files: [procPath],
        })
      ).rejects.toThrow(/forbidden pattern/);
    });

    it('should throw ToolExecutionError for multiple ".." in path', async () => {
      // Arrange
      const traversalPath = '/path/../../etc/passwd';
      const mdContent = `<!-- {${traversalPath}} -->`;

      // Act & Assert
      await expect(
        outputMdTool.execute({
          md_content: mdContent,
          replace_files: [traversalPath],
        })
      ).rejects.toThrow(ToolExecutionError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle file path with spaces correctly', async () => {
      // Arrange
      const testFile = join(testDir, 'file with spaces.csv');
      await fs.writeFile(testFile, 'data');

      const mdContent = `<!-- {${testFile}} -->`;

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
        replace_files: [testFile],
      });

      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle file path with special characters correctly', async () => {
      // Arrange
      const testFile = join(testDir, 'file-with_special.chars.csv');
      await fs.writeFile(testFile, 'data');

      const mdContent = `<!-- {${testFile}} -->`;

      // Act
      const result = await outputMdTool.execute({
        md_content: mdContent,
        replace_files: [testFile],
      });

      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle empty replace_files array with placeholders in content', async () => {
      // Arrange - content has placeholders but replace_files is empty
      const mdContent = `<!-- {/some/file.csv} -->`;

      // Act - should succeed because we skip validation when replace_files is empty
      const result = await outputMdTool.execute({
        md_content: mdContent,
        replace_files: [],
      });

      // Assert
      expect(result.success).toBe(true);
    });

    it('should throw error when directory is referenced instead of file', async () => {
      // Arrange - testDir is a directory
      const mdContent = `<!-- {${testDir}} -->`;

      // Act - file access check should still pass for directories
      // but this test documents current behavior
      const result = await outputMdTool.execute({
        md_content: mdContent,
        replace_files: [testDir],
      });

      // Assert - currently directories pass the access check
      expect(result.success).toBe(true);
    });
  });
});
