import { Tool } from '../../../src/infrastructure/tools/tools';
import { ToolParams, ToolResult, JSONSchemaObject } from '../../../src/infrastructure/tools/types';

/**
 * Mock tool implementation for testing
 */
export class MockTool extends Tool {
  name = 'mock-tool';
  description = 'A mock tool for testing';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      input: { type: 'string' },
    },
    required: ['input'],
  };

  // Mock execute behavior
  executeResult: ToolResult = {
    success: true,
    data: { output: 'mock result' },
  };

  shouldThrow = false;
  validationResult = true;

  async execute(_params: ToolParams): Promise<ToolResult> {
    if (this.shouldThrow) {
      throw new Error('Mock tool error');
    }
    return this.executeResult;
  }

  validate(_params: ToolParams): boolean {
    return this.validationResult;
  }

  // Helper to set execute result
  setExecuteResult(result: ToolResult) {
    this.executeResult = result;
  }
}

/**
 * Create a mock tool with custom name
 */
export function createMockTool(name: string): MockTool {
  const tool = new MockTool();
  tool.name = name;
  return tool;
}

/**
 * Create mock tool with validation
 */
export function createMockToolWithValidation(
  name: string,
  validateFn: (params: ToolParams) => boolean
): Tool {
  const tool = new MockTool();
  tool.name = name;
  tool.validate = validateFn;
  return tool;
}

/**
 * Create a realistic BashTool result fixture
 */
export function createBashResultFixture(overrides?: Partial<any>): any {
  return {
    command: 'echo test',
    directory: '/tmp',
    stdout: 'test',
    stderr: '',
    error: '(none)',
    exitCode: 0,
    signal: null,
    backgroundPIDs: [],
    processGroupPGID: null,
    ...overrides,
  };
}
