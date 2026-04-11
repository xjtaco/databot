import { describe, it, expect } from 'vitest';
import { TodosWriter } from '../../../../src/infrastructure/tools/todosWriter';

describe('TodosWriter.execute() - Success', () => {
  let todosWriter: TodosWriter;

  beforeEach(() => {
    todosWriter = new TodosWriter();
  });

  it('should return success string for a simple todo list with pending tasks', async () => {
    // Arrange
    const params = {
      todos: [
        { content: '读取用户数据', activeForm: '正在读取用户数据', status: 'pending' },
        { content: '分析数据趋势', activeForm: '正在分析数据趋势', status: 'pending' },
        { content: '生成报告', activeForm: '正在生成报告', status: 'pending' },
      ],
    };

    // Act
    const result = await todosWriter.execute(params);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBe('Todos updated successfully.');
    expect(result.metadata!.count).toBe(3);
    expect(result.metadata!.pending).toBe(3);
    expect(result.metadata!.completed).toBe(0);
    expect(result.metadata!.inProgress).toBe(0);
  });

  it('should return correct metadata for todo list with mixed statuses', async () => {
    // Arrange
    const params = {
      todos: [
        { content: '读取用户数据', activeForm: '正在读取用户数据', status: 'completed' },
        { content: '分析数据趋势', activeForm: '正在分析数据趋势', status: 'in_progress' },
        { content: '生成报告', activeForm: '正在生成报告', status: 'pending' },
      ],
    };

    // Act
    const result = await todosWriter.execute(params);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBe('Todos updated successfully.');
    expect(result.metadata!.completed).toBe(1);
    expect(result.metadata!.inProgress).toBe(1);
    expect(result.metadata!.pending).toBe(1);
  });

  it('should include cancelled count in metadata', async () => {
    // Arrange
    const params = {
      todos: [
        { content: '读取用户数据', activeForm: '正在读取用户数据', status: 'completed' },
        { content: '分析数据趋势', activeForm: '正在分析数据趋势', status: 'cancelled' },
        { content: '生成报告', activeForm: '正在生成报告', status: 'pending' },
      ],
    };

    // Act
    const result = await todosWriter.execute(params);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBe('Todos updated successfully.');
    expect(result.metadata!.cancelled).toBe(1);
  });

  it('should handle empty todo list', async () => {
    // Arrange
    const params = {
      todos: [],
    };

    // Act
    const result = await todosWriter.execute(params);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBe('Todos updated successfully.');
    expect(result.metadata!.count).toBe(0);
  });

  it('should handle todo list with only one task', async () => {
    // Arrange
    const params = {
      todos: [{ content: '读取用户数据', activeForm: '正在读取用户数据', status: 'in_progress' }],
    };

    // Act
    const result = await todosWriter.execute(params);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBe('Todos updated successfully.');
    expect(result.metadata!.count).toBe(1);
  });

  it('should handle todo list with all completed tasks', async () => {
    // Arrange
    const params = {
      todos: [
        { content: '读取用户数据', activeForm: '正在读取用户数据', status: 'completed' },
        { content: '分析数据趋势', activeForm: '正在分析数据趋势', status: 'completed' },
        { content: '生成报告', activeForm: '正在生成报告', status: 'completed' },
      ],
    };

    // Act
    const result = await todosWriter.execute(params);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBe('Todos updated successfully.');
    expect(result.metadata!.completed).toBe(3);
    expect(result.metadata!.inProgress).toBe(0);
    expect(result.metadata!.pending).toBe(0);
  });

  it('should handle todo list with special characters in content', async () => {
    // Arrange
    const params = {
      todos: [
        {
          content: '读取用户数据（包含中文）',
          activeForm: '正在读取用户数据',
          status: 'pending',
        },
        { content: '分析 "quotes" 数据', activeForm: '正在分析数据', status: 'pending' },
        { content: "处理 'apostrophes'", activeForm: '正在处理数据', status: 'pending' },
      ],
    };

    // Act
    const result = await todosWriter.execute(params);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBe('Todos updated successfully.');
    expect(result.metadata!.count).toBe(3);
  });

  it('should include full task statistics in metadata', async () => {
    // Arrange
    const params = {
      todos: [
        { content: '读取用户数据', activeForm: '正在读取用户数据', status: 'completed' },
        { content: '分析数据趋势', activeForm: '正在分析数据趋势', status: 'in_progress' },
        { content: '生成图表', activeForm: '正在生成图表', status: 'pending' },
        { content: '导出报告', activeForm: '正在导出报告', status: 'pending' },
        { content: '清理临时文件', activeForm: '正在清理临时文件', status: 'cancelled' },
      ],
    };

    // Act
    const result = await todosWriter.execute(params);

    // Assert
    expect(result.success).toBe(true);
    expect(result.data).toBe('Todos updated successfully.');
    expect(result.metadata!.count).toBe(5);
    expect(result.metadata!.completed).toBe(1);
    expect(result.metadata!.inProgress).toBe(1);
    expect(result.metadata!.pending).toBe(2);
    expect(result.metadata!.cancelled).toBe(1);
  });

  it('should include parameters and todos in metadata', async () => {
    // Arrange
    const params = {
      todos: [
        { content: '读取用户数据', activeForm: '正在读取用户数据', status: 'completed' },
        { content: '分析数据趋势', activeForm: '正在分析数据趋势', status: 'in_progress' },
      ],
    };

    // Act
    const result = await todosWriter.execute(params);

    // Assert
    expect(result.success).toBe(true);
    expect(result.metadata!.parameters).toEqual(params);
    expect(result.metadata!.todos).toEqual(params.todos);
  });
});

describe('TodosWriter - Metadata', () => {
  it('should have correct name', () => {
    // Arrange
    const todosWriter = new TodosWriter();

    // Assert
    expect(todosWriter.name).toBe('todos_writer');
  });

  it('should have description', () => {
    // Arrange
    const todosWriter = new TodosWriter();

    // Assert
    expect(todosWriter.description).toBeDefined();
    expect(todosWriter.description.length).toBeGreaterThan(0);
  });

  it('should have parameters schema', () => {
    // Arrange
    const todosWriter = new TodosWriter();

    // Assert
    expect(todosWriter.parameters).toBeDefined();
    expect(todosWriter.parameters.type).toBe('object');
    expect(todosWriter.parameters.properties).toBeDefined();
    expect(todosWriter.parameters.required).toBeDefined();
  });

  it('should include todos parameter in schema', () => {
    // Arrange
    const todosWriter = new TodosWriter();

    // Assert
    expect(todosWriter.parameters.properties.todos).toBeDefined();
  });

  it('should mark todos as required', () => {
    // Arrange
    const todosWriter = new TodosWriter();

    // Assert
    expect(todosWriter.parameters.required).toContain('todos');
  });

  it('should get metadata correctly', () => {
    // Arrange
    const todosWriter = new TodosWriter();

    // Act
    const metadata = todosWriter.getMetadata();

    // Assert
    expect(metadata.name).toBe('todos_writer');
    expect(metadata.description).toBeDefined();
    expect(metadata.parameters).toBeDefined();
  });
});
