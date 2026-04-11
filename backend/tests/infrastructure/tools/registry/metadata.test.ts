import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../../../../src/infrastructure/tools/tools';
import { MockTool, createMockTool } from '../fixtures';

describe('ToolRegistry.list()', () => {
  beforeEach(() => {
    // Clear registry before each test
    const toolNames = ToolRegistry.list();
    toolNames.forEach((name) => {
      (ToolRegistry as any).tools.delete(name);
    });
  });

  it('should return empty array when no tools', () => {
    // Act
    const result = ToolRegistry.list();

    // Assert
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it('should return all tool names', () => {
    // Arrange
    const tool1 = createMockTool('tool-1');
    const tool2 = createMockTool('tool-2');
    const tool3 = createMockTool('tool-3');

    ToolRegistry.register(tool1);
    ToolRegistry.register(tool2);
    ToolRegistry.register(tool3);

    // Act
    const result = ToolRegistry.list();

    // Assert
    expect(result).toHaveLength(3);
    expect(result).toContain('tool-1');
    expect(result).toContain('tool-2');
    expect(result).toContain('tool-3');
  });

  it('should not include duplicate names', () => {
    // Arrange
    const tool1 = createMockTool('tool-1');
    const tool2 = createMockTool('tool-2');

    ToolRegistry.register(tool1);
    ToolRegistry.register(tool2);

    // Try to register duplicate (will fail but shouldn't affect list)
    try {
      ToolRegistry.register(tool1);
    } catch {
      // Expected
    }

    // Act
    const result = ToolRegistry.list();

    // Assert
    expect(result).toHaveLength(2);
    expect(result.filter((name) => name === 'tool-1')).toHaveLength(1);
  });

  it('should maintain insertion order', () => {
    // Arrange
    const tool1 = createMockTool('first-tool');
    const tool2 = createMockTool('second-tool');
    const tool3 = createMockTool('third-tool');

    ToolRegistry.register(tool1);
    ToolRegistry.register(tool2);
    ToolRegistry.register(tool3);

    // Act
    const result = ToolRegistry.list();

    // Assert
    expect(result[0]).toBe('first-tool');
    expect(result[1]).toBe('second-tool');
    expect(result[2]).toBe('third-tool');
  });
});

describe('ToolRegistry.getAllMetadata()', () => {
  beforeEach(() => {
    // Clear registry before each test
    const toolNames = ToolRegistry.list();
    toolNames.forEach((name) => {
      (ToolRegistry as any).tools.delete(name);
    });
  });

  it('should return empty array when no tools', () => {
    // Act
    const result = ToolRegistry.getAllMetadata();

    // Assert
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it('should return metadata for all tools', () => {
    // Arrange
    const tool1 = new MockTool();
    const tool2 = createMockTool('custom-tool');
    tool2.description = 'Custom tool description';
    tool2.parameters = {
      type: 'object',
      properties: {
        value: { type: 'number' },
      },
      required: ['value'],
    };

    ToolRegistry.register(tool1);
    ToolRegistry.register(tool2);

    // Act
    const result = ToolRegistry.getAllMetadata();

    // Assert
    expect(result).toHaveLength(2);

    // Check first tool metadata
    expect(result[0].name).toBe(tool1.name);
    expect(result[0].description).toBe(tool1.description);
    expect(result[0].parameters).toEqual(tool1.parameters);

    // Check second tool metadata
    expect(result[1].name).toBe(tool2.name);
    expect(result[1].description).toBe('Custom tool description');
    expect(result[1].parameters).toEqual(tool2.parameters);
  });

  it('should preserve tool order', () => {
    // Arrange
    const tools = [
      createMockTool('alpha-tool'),
      createMockTool('beta-tool'),
      createMockTool('gamma-tool'),
    ];

    tools.forEach((tool) => ToolRegistry.register(tool));

    // Act
    const result = ToolRegistry.getAllMetadata();

    // Assert
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('alpha-tool');
    expect(result[1].name).toBe('beta-tool');
    expect(result[2].name).toBe('gamma-tool');
  });
});

describe('ToolRegistry.getAllToolSchemas()', () => {
  beforeEach(() => {
    // Clear registry before each test
    const toolNames = ToolRegistry.list();
    toolNames.forEach((name) => {
      (ToolRegistry as any).tools.delete(name);
    });
  });

  it('should return schemas for LLM function calling', () => {
    // Arrange
    const tool = new MockTool();
    ToolRegistry.register(tool);

    // Act
    const result = ToolRegistry.getAllToolSchemas();

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('name');
    expect(result[0]).toHaveProperty('description');
    expect(result[0]).toHaveProperty('parameters');
  });

  it('should include name, description, parameters in schema', () => {
    // Arrange
    const tool = new MockTool();
    ToolRegistry.register(tool);

    // Act
    const result = ToolRegistry.getAllToolSchemas();

    // Assert
    const schema = result[0];
    expect(schema.name).toBe(tool.name);
    expect(schema.description).toBe(tool.description);
    expect(schema.parameters).toEqual(tool.parameters);
  });

  it('should return empty array when no tools', () => {
    // Act
    const result = ToolRegistry.getAllToolSchemas();

    // Assert
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it('should return schemas for multiple tools', () => {
    // Arrange
    const tool1 = new MockTool();
    const tool2 = createMockTool('another-tool');
    tool2.description = 'Another tool for testing';
    tool2.parameters = {
      type: 'object',
      properties: {
        data: { type: 'string' },
      },
      required: [],
    };

    ToolRegistry.register(tool1);
    ToolRegistry.register(tool2);

    // Act
    const result = ToolRegistry.getAllToolSchemas();

    // Assert
    expect(result).toHaveLength(2);

    // Check first schema
    expect(result[0].name).toBe(tool1.name);
    expect(result[0].description).toBe(tool1.description);
    expect(result[0].parameters).toEqual(tool1.parameters);

    // Check second schema
    expect(result[1].name).toBe(tool2.name);
    expect(result[1].description).toBe('Another tool for testing');
    expect(result[1].parameters).toEqual(tool2.parameters);
  });
});
