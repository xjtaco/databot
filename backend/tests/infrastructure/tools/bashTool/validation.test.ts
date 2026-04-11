import { describe, it, expect, beforeEach } from 'vitest';
import { BashTool } from '../../../../src/infrastructure/tools/bashTool';

describe('BashTool.validate()', () => {
  let bashTool: BashTool;

  beforeEach(() => {
    bashTool = new BashTool();
  });

  describe('Valid Parameters', () => {
    it('should return true for valid params', () => {
      // Arrange
      const params = { command: 'echo test' };

      // Act
      const result = bashTool.validate(params);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true with optional directory', () => {
      // Arrange
      const params = { command: 'echo test', directory: '/tmp' };

      // Act
      const result = bashTool.validate(params);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true for empty string command', () => {
      // Arrange
      const params = { command: '' };

      // Act
      const result = bashTool.validate(params);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('Invalid Parameters', () => {
    it('should return false for missing command', () => {
      // Arrange
      const params = {};

      // Act
      const result = bashTool.validate(params);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for null command', () => {
      // Arrange
      const params = { command: null };

      // Act
      const result = bashTool.validate(params);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for undefined command', () => {
      // Arrange
      const params = { command: undefined };

      // Act
      const result = bashTool.validate(params);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for non-string command', () => {
      // Arrange
      const params1 = { command: 123 };
      const params2 = { command: true };
      const params3 = { command: {} };
      const params4 = { command: [] };

      // Act
      const result1 = bashTool.validate(params1);
      const result2 = bashTool.validate(params2);
      const result3 = bashTool.validate(params3);
      const result4 = bashTool.validate(params4);

      // Assert
      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(false);
      expect(result4).toBe(false);
    });

    it('should return false for non-string directory', () => {
      // Arrange
      const params1 = { command: 'echo test', directory: 123 };
      const params2 = { command: 'echo test', directory: true };
      const params3 = { command: 'echo test', directory: {} };
      const params4 = { command: 'echo test', directory: [] };

      // Act
      const result1 = bashTool.validate(params1);
      const result2 = bashTool.validate(params2);
      const result3 = bashTool.validate(params3);
      const result4 = bashTool.validate(params4);

      // Assert
      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(false);
      expect(result4).toBe(false);
    });

    it('should return false when directory exists but command is invalid', () => {
      // Arrange
      const params = { command: null, directory: '/tmp' };

      // Act
      const result = bashTool.validate(params);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle whitespace-only command', () => {
      // Arrange
      const params = { command: '   ' };

      // Act
      const result = bashTool.validate(params);

      // Assert
      expect(result).toBe(true); // String validation only checks type
    });

    it('should handle empty string directory', () => {
      // Arrange
      const params = { command: 'echo test', directory: '' };

      // Act
      const result = bashTool.validate(params);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle undefined directory', () => {
      // Arrange
      const params = { command: 'echo test', directory: undefined };

      // Act
      const result = bashTool.validate(params);

      // Assert
      expect(result).toBe(true);
    });
  });
});
