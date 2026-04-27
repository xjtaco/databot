/**
 * Type definitions for the LLM tool framework
 */

/**
 * Tool name definition
 */
export const ToolName = {
  Bash: 'bash',
  Edit: 'edit',
  Glob: 'glob',
  Grep: 'grep',
  ReadFile: 'read_file',
  WriteFile: 'write_file',
  Sql: 'sql',
  WebSearch: 'web_search',
  WebFetch: 'web_fetch',
  TodosWriter: 'todos_writer',
  OutputMd: 'output_md',
  SearchUiActionCard: 'search_ui_action_card',
  ShowUiActionCard: 'show_ui_action_card',
} as const;

/**
 * Tool input parameters - flexible key-value pairs
 */
export interface ToolParams {
  [key: string]: unknown;
}

/**
 * Standard result format for all tool executions
 */
export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * JSON Schema type definitions
 */
export type JSONSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null';

export interface JSONSchemaProperty {
  type: JSONSchemaType | JSONSchemaType[];
  description?: string;
  enum?: unknown[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface JSONSchemaObject {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required: string[];
  additionalProperties?: boolean;
}

/**
 * Metadata for tool registration
 */
export interface ToolMetadata {
  name: string;
  description: string;
  parameters?: JSONSchemaObject;
}

/**
 * Bash tool specific result data structure
 */
export interface BashResultData {
  command: string;
  directory: string;
  stdout: string;
  stderr: string;
  error: string;
  exitCode: number | null;
  signal: string | null;
}
