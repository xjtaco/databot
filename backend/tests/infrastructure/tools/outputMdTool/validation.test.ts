import { describe, it, expect, beforeEach } from 'vitest';
import { OutputMdTool } from '../../../../src/infrastructure/tools/outputMdTool';

describe('OutputMdTool.validate()', () => {
  let outputMdTool: OutputMdTool;

  beforeEach(() => {
    outputMdTool = new OutputMdTool();
  });

  describe('Valid parameters', () => {
    it('should return true for valid md_content string', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Hello World',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for md_content with optional replace_files array', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Report\n\n<!-- {/path/to/file.csv} -->',
        replace_files: ['/path/to/file.csv'],
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for md_content with empty replace_files array', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Simple Report',
        replace_files: [],
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for md_content with multiple replace_files', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Report',
        replace_files: ['/file1.csv', '/file2.png', '/file3.md'],
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for empty string md_content (validation only checks type)', () => {
      // Note: Empty content is validated in execute(), not in validate()
      // Act
      const result = outputMdTool.validate({
        md_content: '',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for md_content with special characters', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Report with "quotes" and \'apostrophes\' and $special chars',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for md_content with newlines', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Title\n\n## Section\n\nParagraph text.',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for md_content with UTF-8 characters', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# 数据分析报告\n\n分析结果如下：',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for very long md_content', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: 'x'.repeat(1000000),
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true when replace_files is undefined', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Report',
      });

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('Invalid md_content parameters', () => {
    it('should return false when md_content is undefined', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: undefined as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when md_content is null', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: null as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when md_content is not a string', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: 123 as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when md_content is a number', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: 42 as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when md_content is a boolean', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: true as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when md_content is an object', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: { content: '# Report' } as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when md_content is an array', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: ['# Report'] as unknown as string,
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when md_content is missing', () => {
      // Act
      const result = outputMdTool.validate({});

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Invalid replace_files parameters', () => {
    it('should return false when replace_files is not an array', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Report',
        replace_files: '/path/to/file.csv' as unknown as string[],
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when replace_files is a number', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Report',
        replace_files: 123 as unknown as string[],
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when replace_files is an object', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Report',
        replace_files: { file: '/path' } as unknown as string[],
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when replace_files contains non-string elements', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Report',
        replace_files: ['/path/to/file.csv', 123 as unknown as string],
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when replace_files contains null elements', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Report',
        replace_files: ['/path/to/file.csv', null as unknown as string],
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when replace_files contains object elements', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Report',
        replace_files: [{ path: '/file' } as unknown as string],
      });

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when replace_files contains array elements', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Report',
        replace_files: [['/file'] as unknown as string],
      });

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should return true for md_content with only whitespace (validation passes, execute may fail)', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '   \t\n  ',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for md_content with markdown placeholders', () => {
      // Act
      const result = outputMdTool.validate({
        md_content:
          '# Report\n\n<!-- {/path/to/data.csv} -->\n\n![Chart](<!-- {/path/to/chart.png} -->)',
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should return true when replace_files contains empty strings', () => {
      // Validation passes, but execute would fail
      // Act
      const result = outputMdTool.validate({
        md_content: '# Report',
        replace_files: ['', '/path/to/file.csv'],
      });

      // Assert
      expect(result).toBe(true);
    });

    it('should ignore extra unknown parameters', () => {
      // Act
      const result = outputMdTool.validate({
        md_content: '# Report',
        replace_files: ['/path/to/file.csv'],
        extra_param: 'some value',
        another_param: 123,
      } as { md_content: string; replace_files?: string[] });

      // Assert
      expect(result).toBe(true);
    });
  });
});
