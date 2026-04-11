import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from '../../../../src/infrastructure/tools/tools';
import { ToolParams, ToolResult } from '../../../../src/infrastructure/tools/types';
import { MockTool, createMockTool, createMockToolWithValidation } from '../fixtures';

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

describe('ToolRegistry.execute()', () => {
  beforeEach(() => {
    // Clear registry before each test
    const toolNames = ToolRegistry.list();
    toolNames.forEach((name) => {
      (ToolRegistry as any).tools.delete(name);
    });
  });

  describe('Successful Execution', () => {
    it('should execute tool with valid params', async () => {
      // Arrange
      const tool = new MockTool();
      const mockResult: ToolResult = {
        success: true,
        data: { result: 'test output' },
      };
      tool.setExecuteResult(mockResult);
      ToolRegistry.register(tool);

      const params: ToolParams = { input: 'test' };

      // Act
      const result = await ToolRegistry.execute(tool.name, params);

      // Assert
      expect(result).toEqual(mockResult);
      expect(result.success).toBe(true);
      expect(mockedLogger.debug).toHaveBeenCalledWith(
        `Executing tool '${tool.name}' with params:`,
        params
      );
    });

    it('should pass params to tool execute method', async () => {
      // Arrange
      const tool = new MockTool();
      const params: ToolParams = { input: 'test input', option: 123 };
      ToolRegistry.register(tool);

      // Spy on execute method
      const executeSpy = vi.spyOn(tool, 'execute');

      // Act
      await ToolRegistry.execute(tool.name, params);

      // Assert
      expect(executeSpy).toHaveBeenCalledWith(params);
    });
  });

  describe('Execution with Validation', () => {
    it('should call tool.validate() if available', async () => {
      // Arrange
      const validateFn = vi.fn((_params: ToolParams) => true);
      const tool = createMockToolWithValidation('validated-tool', validateFn);
      ToolRegistry.register(tool);

      const params: ToolParams = { input: 'test' };

      // Act
      await ToolRegistry.execute('validated-tool', params);

      // Assert
      expect(validateFn).toHaveBeenCalledWith(params);
    });

    it('should throw when validation fails', async () => {
      // Arrange
      const validateFn = vi.fn((_params: ToolParams) => false);
      const tool = createMockToolWithValidation('validated-tool', validateFn);
      ToolRegistry.register(tool);

      const params: ToolParams = { input: 'invalid' };

      // Act & Assert
      await expect(ToolRegistry.execute('validated-tool', params)).rejects.toThrow(
        'Parameter validation failed for tool'
      );
      expect(validateFn).toHaveBeenCalledWith(params);
    });

    it('should execute when validate returns true', async () => {
      // Arrange
      const validateFn = vi.fn((_params: ToolParams) => true);
      const tool = createMockToolWithValidation('validated-tool', validateFn);
      ToolRegistry.register(tool);

      const params: ToolParams = { input: 'valid' };

      // Act
      const result = await ToolRegistry.execute('validated-tool', params);

      // Assert
      expect(result.success).toBe(true);
      expect(validateFn).toHaveBeenCalledWith(params);
    });

    it('should not call validate if not implemented', async () => {
      // Arrange
      const tool = new MockTool();
      delete (tool as any).validate; // Remove validate method
      ToolRegistry.register(tool);

      const params: ToolParams = { input: 'test' };

      // Act - should not throw
      const result = await ToolRegistry.execute(tool.name, params);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('Execution Errors', () => {
    it('should return failed result on tool error', async () => {
      // Arrange
      const tool = new MockTool();
      tool.shouldThrow = true;
      ToolRegistry.register(tool);

      const params: ToolParams = { input: 'test' };

      // Act
      const result = await ToolRegistry.execute(tool.name, params);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Mock tool error');
      expect(mockedLogger.error).toHaveBeenCalledWith(
        `Tool '${tool.name}' execution failed:`,
        'Mock tool error'
      );
    });

    it('should handle non-Error exceptions', async () => {
      // Arrange
      const tool = createMockTool('throw-string-tool');
      tool.execute = async () => {
        throw 'String error message';
      };
      ToolRegistry.register(tool);

      // Act
      const result = await ToolRegistry.execute('throw-string-tool', {});

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('String error message');
      expect(mockedLogger.error).toHaveBeenCalled();
    });

    it('should handle object exceptions', async () => {
      // Arrange
      const tool = createMockTool('throw-object-tool');
      const errorObj = { code: 500, message: 'Server error' };
      tool.execute = async () => {
        throw errorObj;
      };
      ToolRegistry.register(tool);

      // Act
      const result = await ToolRegistry.execute('throw-object-tool', {});

      // Assert
      expect(result.success).toBe(false);
      expect(mockedLogger.error).toHaveBeenCalled();
    });
  });

  describe('Unknown Tool', () => {
    it('should throw for unknown tool', async () => {
      // Arrange
      const params: ToolParams = { input: 'test' };

      // Act & Assert
      await expect(ToolRegistry.execute('unknown-tool', params)).rejects.toThrow(
        "Tool 'unknown-tool' not found"
      );
    });

    it('should not execute for unknown tool', async () => {
      // Arrange
      const tool = new MockTool();
      const executeSpy = vi.spyOn(tool, 'execute');
      ToolRegistry.register(tool);

      const params: ToolParams = { input: 'test' };

      // Act & Assert
      await expect(ToolRegistry.execute('different-tool', params)).rejects.toThrow();
      expect(executeSpy).not.toHaveBeenCalled();
    });
  });
});
