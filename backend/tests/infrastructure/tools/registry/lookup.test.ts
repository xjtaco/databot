import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../../../../src/infrastructure/tools/tools';
import { MockTool, createMockTool } from '../fixtures';

describe('ToolRegistry.get()', () => {
  beforeEach(() => {
    // Clear registry before each test
    const toolNames = ToolRegistry.list();
    toolNames.forEach((name) => {
      (ToolRegistry as any).tools.delete(name);
    });
  });

  describe('Successful Lookup', () => {
    it('should return registered tool by name', () => {
      // Arrange
      const tool = new MockTool();
      ToolRegistry.register(tool);

      // Act
      const retrieved = ToolRegistry.get(tool.name);

      // Assert
      expect(retrieved).toBe(tool);
    });

    it('should return tool with correct metadata', () => {
      // Arrange
      const tool = new MockTool();
      ToolRegistry.register(tool);

      // Act
      const retrieved = ToolRegistry.get(tool.name);

      // Assert
      const metadata = retrieved.getMetadata();
      expect(metadata.name).toBe(tool.name);
      expect(metadata.description).toBe(tool.description);
      expect(metadata.parameters).toEqual(tool.parameters);
    });
  });

  describe('Failed Lookup', () => {
    it('should throw error for non-existent tool', () => {
      // Act & Assert
      expect(() => ToolRegistry.get('nonexistent')).toThrow("Tool 'nonexistent' not found");
    });

    it('should throw error with empty string', () => {
      // Act & Assert
      expect(() => ToolRegistry.get('')).toThrow("Tool '' not found");
    });

    it('should throw error for undefined input', () => {
      // Act & Assert
      expect(() => ToolRegistry.get(undefined as unknown as string)).toThrow(
        "Tool 'undefined' not found"
      );
    });
  });
});

describe('ToolRegistry.has()', () => {
  beforeEach(() => {
    // Clear registry before each test
    const toolNames = ToolRegistry.list();
    toolNames.forEach((name) => {
      (ToolRegistry as any).tools.delete(name);
    });
  });

  it('should return true for registered tool', () => {
    // Arrange
    const tool = new MockTool();
    ToolRegistry.register(tool);

    // Act & Assert
    expect(ToolRegistry.has(tool.name)).toBe(true);
  });

  it('should return false for non-existent tool', () => {
    // Act & Assert
    expect(ToolRegistry.has('nonexistent')).toBe(false);
  });

  it('should be case-sensitive', () => {
    // Arrange
    const tool = createMockTool('MyTool');
    ToolRegistry.register(tool);

    // Act & Assert
    expect(ToolRegistry.has('MyTool')).toBe(true);
    expect(ToolRegistry.has('mytool')).toBe(false);
    expect(ToolRegistry.has('MYTOOL')).toBe(false);
  });

  it('should return false for empty string', () => {
    // Act & Assert
    expect(ToolRegistry.has('')).toBe(false);
  });
});
