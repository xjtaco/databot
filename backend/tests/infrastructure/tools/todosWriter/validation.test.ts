import { describe, it, expect } from 'vitest';
import { TodosWriter } from '../../../../src/infrastructure/tools/todosWriter';
import { ToolExecutionError } from '../../../../src/errors/types';

describe('TodosWriter.validate() - Parameter Validation', () => {
  let todosWriter: TodosWriter;

  beforeEach(() => {
    todosWriter = new TodosWriter();
  });

  describe('Valid parameters', () => {
    it('should accept valid todo list with all required fields', () => {
      // Arrange
      const params = {
        todos: [
          { content: '读取用户数据', activeForm: '正在读取用户数据', status: 'pending' },
          { content: '分析数据趋势', activeForm: '正在分析数据趋势', status: 'in_progress' },
        ],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should accept empty todo array', () => {
      // Arrange
      const params = { todos: [] };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should accept all valid status values', () => {
      // Arrange
      const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'] as const;

      for (const status of validStatuses) {
        const params = {
          todos: [{ content: '测试任务', activeForm: '正在测试', status }],
        };

        // Act
        const isValid = todosWriter.validate(params);

        // Assert
        expect(isValid).toBe(true);
      }
    });

    it('should accept todo with content containing special characters', () => {
      // Arrange
      const params = {
        todos: [
          {
            content: '处理包含 "引号" 和\'单引号\'的数据！@#$%',
            activeForm: '正在处理特殊字符数据',
            status: 'pending',
          },
        ],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should accept todo with content containing only spaces and content', () => {
      // Arrange
      const params = {
        todos: [{ content: '  有效描述  ', activeForm: '  正在执行  ', status: 'pending' }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(true);
    });
  });

  describe('Invalid parameters', () => {
    it('should reject when todos is missing', () => {
      // Arrange
      const params = {};

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when todos is null', () => {
      // Arrange
      const params = { todos: null };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when todos is undefined', () => {
      // Arrange
      const params = { todos: undefined };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when todos is not an array', () => {
      // Arrange
      const params = { todos: 'not an array' };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when todo item is not an object', () => {
      // Arrange
      const params = { todos: ['string item'] };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when todo item is null', () => {
      // Arrange
      const params = { todos: [null] };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when content is missing', () => {
      // Arrange
      const params = {
        todos: [{ activeForm: '正在测试', status: 'pending' }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when content is null', () => {
      // Arrange
      const params = {
        todos: [{ content: null, activeForm: '正在测试', status: 'pending' }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when content is undefined', () => {
      // Arrange
      const params = {
        todos: [{ content: undefined, activeForm: '正在测试', status: 'pending' }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when content is not a string', () => {
      // Arrange
      const params = {
        todos: [{ content: 123, activeForm: '正在测试', status: 'pending' }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when content is empty string', () => {
      // Arrange
      const params = {
        todos: [{ content: '', activeForm: '正在测试', status: 'pending' }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when content contains only whitespace', () => {
      // Arrange
      const params = {
        todos: [{ content: '   ', activeForm: '正在测试', status: 'pending' }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when activeForm is missing', () => {
      // Arrange
      const params = {
        todos: [{ content: '测试任务', status: 'pending' }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when activeForm is empty string', () => {
      // Arrange
      const params = {
        todos: [{ content: '测试任务', activeForm: '', status: 'pending' }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when activeForm contains only whitespace', () => {
      // Arrange
      const params = {
        todos: [{ content: '测试任务', activeForm: '   ', status: 'pending' }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when activeForm is not a string', () => {
      // Arrange
      const params = {
        todos: [{ content: '测试任务', activeForm: 123, status: 'pending' }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when status is missing', () => {
      // Arrange
      const params = {
        todos: [{ content: '测试任务', activeForm: '正在测试' }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when status is null', () => {
      // Arrange
      const params = {
        todos: [{ content: '测试任务', activeForm: '正在测试', status: null }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when status is undefined', () => {
      // Arrange
      const params = {
        todos: [{ content: '测试任务', activeForm: '正在测试', status: undefined }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when status is not a string', () => {
      // Arrange
      const params = {
        todos: [{ content: '测试任务', activeForm: '正在测试', status: 123 }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when status is invalid value', () => {
      // Arrange
      const params = {
        todos: [{ content: '测试任务', activeForm: '正在测试', status: 'invalid_status' }],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });

    it('should reject when status is invalid type', () => {
      // Arrange
      const invalidStatuses = [123, true, {}, [], null, undefined];

      for (const status of invalidStatuses) {
        const params = {
          todos: [{ content: '测试任务', activeForm: '正在测试', status }],
        };

        // Act
        const isValid = todosWriter.validate(params);

        // Assert
        expect(isValid).toBe(false);
      }
    });

    it('should reject when any todo item in array is invalid', () => {
      // Arrange
      const params = {
        todos: [
          { content: '有效任务', activeForm: '正在执行有效任务', status: 'pending' },
          { content: '', activeForm: '正在执行', status: 'pending' }, // Invalid: empty content
        ],
      };

      // Act
      const isValid = todosWriter.validate(params);

      // Assert
      expect(isValid).toBe(false);
    });
  });
});

describe('TodosWriter.execute() - Error Scenarios', () => {
  let todosWriter: TodosWriter;

  beforeEach(() => {
    todosWriter = new TodosWriter();
  });

  it('should throw ToolExecutionError for invalid parameters', async () => {
    // Arrange
    const params = { todos: 'invalid' };

    // Act & Assert
    await expect(todosWriter.execute(params)).rejects.toThrow(ToolExecutionError);
    await expect(todosWriter.execute(params)).rejects.toThrow('Invalid parameters');
  });

  it('should throw ToolExecutionError when multiple tasks are in_progress', async () => {
    // Arrange
    const params = {
      todos: [
        { content: '任务1', activeForm: '正在执行任务1', status: 'in_progress' },
        { content: '任务2', activeForm: '正在执行任务2', status: 'in_progress' },
        { content: '任务3', activeForm: '正在执行任务3', status: 'pending' },
      ],
    };

    // Act & Assert
    await expect(todosWriter.execute(params)).rejects.toThrow(ToolExecutionError);
    await expect(todosWriter.execute(params)).rejects.toThrow(
      'Only one subtask can be in in_progress status'
    );
  });

  it('should throw ToolExecutionError when more than two tasks are in_progress', async () => {
    // Arrange
    const params = {
      todos: [
        { content: '任务1', activeForm: '正在执行任务1', status: 'in_progress' },
        { content: '任务2', activeForm: '正在执行任务2', status: 'in_progress' },
        { content: '任务3', activeForm: '正在执行任务3', status: 'in_progress' },
      ],
    };

    // Act & Assert
    await expect(todosWriter.execute(params)).rejects.toThrow(ToolExecutionError);
    await expect(todosWriter.execute(params)).rejects.toThrow('currently 3 are in progress');
  });

  it('should allow zero tasks in_progress', async () => {
    // Arrange
    const params = {
      todos: [
        { content: '任务1', activeForm: '正在执行任务1', status: 'pending' },
        { content: '任务2', activeForm: '正在执行任务2', status: 'pending' },
      ],
    };

    // Act
    const result = await todosWriter.execute(params);

    // Assert
    expect(result.success).toBe(true);
    expect(result.metadata!.inProgress).toBe(0);
  });

  it('should allow exactly one task in_progress', async () => {
    // Arrange
    const params = {
      todos: [
        { content: '任务1', activeForm: '正在执行任务1', status: 'pending' },
        { content: '任务2', activeForm: '正在执行任务2', status: 'in_progress' },
        { content: '任务3', activeForm: '正在执行任务3', status: 'pending' },
      ],
    };

    // Act
    const result = await todosWriter.execute(params);

    // Assert
    expect(result.success).toBe(true);
    expect(result.metadata!.inProgress).toBe(1);
  });
});
