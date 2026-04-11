/**
 * Abstract Tool base class and ToolRegistry for managing tools
 */

import logger from '../../utils/logger';
import { ToolParams, ToolResult, ToolMetadata, JSONSchemaObject } from './types';

/**
 * Abstract base class for all tools
 * Provides common interface and optional validation
 */
export abstract class Tool {
  /**
   * Unique identifier for the tool
   */
  abstract name: string;

  /**
   * Human-readable description of what the tool does
   */
  abstract description: string;

  /**
   * JSON Schema definition for tool parameters
   * Defines the expected structure of input parameters
   */
  abstract parameters: JSONSchemaObject;

  /**
   * Execute the tool with given parameters
   * @param params - Tool input parameters
   * @returns Promise resolving to ToolResult
   */
  abstract execute(params: ToolParams): Promise<ToolResult>;

  /**
   * Optional parameter validation method
   * Override this to add custom parameter validation
   * @param params - Parameters to validate
   * @returns true if parameters are valid, false otherwise
   */
  validate?(params: ToolParams): boolean;

  /**
   * Get metadata about this tool
   * @returns ToolMetadata object
   */
  getMetadata(): ToolMetadata {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
    };
  }
}

/**
 * Registry for managing tool registration and execution
 * Implements singleton pattern for global access
 */
export class ToolRegistryClass {
  private tools: Map<string, Tool> = new Map();

  /**
   * Register a tool in the registry
   * @param tool - Tool instance to register
   * @throws Error if tool with same name already exists
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }

    this.tools.set(tool.name, tool);
    logger.info(`Tool registered: ${tool.name}`);
  }

  /**
   * Get a tool by name
   * @param name - Tool name
   * @returns Tool instance
   * @throws Error if tool not found
   */
  get(name: string): Tool {
    const tool = this.tools.get(name);

    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }

    return tool;
  }

  /**
   * Execute a tool by name with given parameters
   * @param name - Tool name
   * @param params - Tool parameters
   * @returns Promise resolving to ToolResult
   * @throws Error if tool not found or validation fails
   */
  async execute(name: string, params: ToolParams): Promise<ToolResult> {
    const tool = this.get(name);

    // Validate parameters if tool provides validation
    if (tool.validate && !tool.validate(params)) {
      throw new Error(`Parameter validation failed for tool '${name}'`);
    }

    logger.debug(`Executing tool '${name}' with params:`, params);

    try {
      const result = await tool.execute(params);
      logger.debug(`Tool '${name}' execution completed: success=${result.success}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Tool '${name}' execution failed:`, errorMessage);

      return {
        success: false,
        data: null,
        error: errorMessage,
        metadata: {
          parameters: params,
        },
      };
    }
  }

  /**
   * List all registered tool names
   * @returns Array of tool names
   */
  list(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Check if a tool is registered
   * @param name - Tool name
   * @returns true if tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get metadata for all registered tools
   * @returns Array of ToolMetadata objects
   */
  getAllMetadata(): ToolMetadata[] {
    return Array.from(this.tools.values()).map((tool) => tool.getMetadata());
  }

  /**
   * Get all tool schemas in a format suitable for LLM function calling
   * @returns Array of tool schemas with name, description, and parameters
   */
  getAllToolSchemas(): Array<{
    name: string;
    description: string;
    parameters: JSONSchemaObject;
  }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }
}

// Export singleton instance
export const ToolRegistry = new ToolRegistryClass();
