import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from '../../../../src/infrastructure/tools/tools';
import { MockTool, createMockTool } from '../fixtures';

// Mock logger module
vi.mock('../../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import the mocked logger
import logger from '../../../../src/utils/logger';
const mockedLogger = vi.mocked(logger);

describe('ToolRegistry.register()', () => {
  beforeEach(() => {
    // Clear registry before each test
    const toolNames = ToolRegistry.list();
    toolNames.forEach((name) => {
      (ToolRegistry as any).tools.delete(name);
    });
  });

  describe('Successful Registration', () => {
    it('should register a tool successfully', () => {
      // Arrange
      const tool = new MockTool();

      // Act
      ToolRegistry.register(tool);

      // Assert
      expect(ToolRegistry.has(tool.name)).toBe(true);
      expect(ToolRegistry.get(tool.name)).toBe(tool);
    });

    it('should log registration info', () => {
      // Arrange
      const tool = new MockTool();

      // Act
      ToolRegistry.register(tool);

      // Assert
      expect(mockedLogger.info).toHaveBeenCalledWith(`Tool registered: ${tool.name}`);
    });

    it('should register multiple different tools', () => {
      // Arrange
      const tool1 = createMockTool('tool-1');
      const tool2 = createMockTool('tool-2');
      const tool3 = createMockTool('tool-3');

      // Act
      ToolRegistry.register(tool1);
      ToolRegistry.register(tool2);
      ToolRegistry.register(tool3);

      // Assert
      expect(ToolRegistry.list()).toHaveLength(3);
      expect(ToolRegistry.has('tool-1')).toBe(true);
      expect(ToolRegistry.has('tool-2')).toBe(true);
      expect(ToolRegistry.has('tool-3')).toBe(true);
    });

    it('should handle tools with special characters in name', () => {
      // Arrange
      const tool1 = createMockTool('my-tool');
      const tool2 = createMockTool('my_tool');
      const tool3 = createMockTool('my.tool');

      // Act
      ToolRegistry.register(tool1);
      ToolRegistry.register(tool2);
      ToolRegistry.register(tool3);

      // Assert
      expect(ToolRegistry.list()).toHaveLength(3);
      expect(ToolRegistry.has('my-tool')).toBe(true);
      expect(ToolRegistry.has('my_tool')).toBe(true);
      expect(ToolRegistry.has('my.tool')).toBe(true);
    });
  });

  describe('Error Cases', () => {
    it('should throw error when registering duplicate tool', () => {
      // Arrange
      const tool = new MockTool();
      ToolRegistry.register(tool);

      // Act & Assert
      expect(() => ToolRegistry.register(tool)).toThrow(
        `Tool '${tool.name}' is already registered`
      );
    });

    it('should not add tool on duplicate registration', () => {
      // Arrange
      const tool = new MockTool();
      ToolRegistry.register(tool);

      // Act
      try {
        ToolRegistry.register(tool);
      } catch {
        // Expected error
      }

      // Assert
      expect(ToolRegistry.list()).toHaveLength(1);
    });
  });
});
