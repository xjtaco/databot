import { describe, it, expect } from 'vitest';
import { WriteFileTool } from '../../../../src/infrastructure/tools/writeFileTool';

describe('WriteFileTool.validate()', () => {
  let writeFileTool: WriteFileTool;

  beforeEach(() => {
    writeFileTool = new WriteFileTool();
  });

  describe('Valid parameters', () => {
    it('should return true for valid parameters with file_path and content', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: 'file content',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for valid parameters with absolute path starting with /', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/absolute/path/to/file.txt',
        content: 'content',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for empty string content', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: '',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for content with special characters', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: 'Content with "quotes" and \'apostrophes\' and $pecial chars',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for content with newlines', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: 'Line 1\nLine 2\nLine 3',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for content with UTF-8 characters', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: 'Hello 你好\nWorld 世界',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for very long content', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: 'x'.repeat(1000000),
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for file_path with spaces', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some path/with spaces/file.txt',
        content: 'content',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for file_path with dots', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/path/to/../file.txt',
        content: 'content',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for file_path with extension', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/path/to/file.json',
        content: '{"key": "value"}',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for file_path with multiple extensions', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/path/to/file.tar.gz',
        content: 'binary content',
      });

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('Invalid file_path parameters', () => {
    it('should return false when file_path is undefined', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: undefined as unknown as string,
        content: 'content',
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when file_path is null', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: null as unknown as string,
        content: 'content',
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when file_path is not a string', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: 123 as unknown as string,
        content: 'content',
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when file_path is empty string', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '',
        content: 'content',
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when file_path is only whitespace', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '   \t\n  ',
        content: 'content',
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when file_path is a number (as number)', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: 42 as unknown as string,
        content: 'content',
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when file_path is a boolean', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: true as unknown as string,
        content: 'content',
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when file_path is an object', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: { path: '/some/path' } as unknown as string,
        content: 'content',
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when file_path is an array', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: ['/path'] as unknown as string,
        content: 'content',
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return true for relative path (validation only checks type, not absolute path)', () => {
      // Note: validate() only checks parameter types, not whether path is absolute
      // The execute() method will check for absolute path separately
      // Act
      const result = writeFileTool.validate({
        file_path: 'relative/path/file.txt',
        content: 'content',
      });

      // Assert - validation passes, but execute() will fail
      expect(result).toBe(true);
    });
  });

  describe('Invalid content parameters', () => {
    it('should return false when content is undefined', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: undefined as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when content is null', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: null as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when content is not a string', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: 123 as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when content is a number', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: 42 as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when content is a boolean', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: false as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when content is an object', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: { text: 'content' } as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when content is an array', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: ['content'] as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Both parameters invalid', () => {
    it('should return false when both file_path and content are undefined', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: undefined as unknown as string,
        content: undefined as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when both file_path and content are null', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: null as unknown as string,
        content: null as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when both parameters have wrong types', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: 123 as unknown as string,
        content: [] as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should return true for file_path with only a slash', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/',
        content: 'content',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for file_path at root level', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/file.txt',
        content: 'content',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for content that is a single character', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: 'a',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for content with only whitespace', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: '   \t\n  ',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for content with null bytes', () => {
      // Note: While this might not be a valid file content, validation should pass
      // The actual file write might fail, which is tested in error scenarios
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: 'content\x00with\x00nulls',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should handle empty object parameters', () => {
      // Act
      const result = writeFileTool.validate({});

      // Assert
      expect(result).toBe(false);
    });

    it('should ignore extra unknown parameters', () => {
      // Act
      const result = writeFileTool.validate({
        file_path: '/some/path/file.txt',
        content: 'content',
        extra_param: 'some value',
        another_param: 123,
      } as { file_path: string; content: string });

      // Assert
      expect(result).toBe(true);
    });
  });
});
