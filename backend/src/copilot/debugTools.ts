// backend/src/copilot/debugTools.ts

import { Tool, ToolRegistryClass } from '../infrastructure/tools/tools';
import { ToolParams, ToolResult, JSONSchemaObject } from '../infrastructure/tools/types';
import { SqlTool } from '../infrastructure/tools/sqlTool';
import { BashTool } from '../infrastructure/tools/bashTool';
import { WebFetchTool } from '../infrastructure/tools/webFetch';
import type { WorkflowAccessor } from './workflowAccessor';
import {
  WfGetNodeTool,
  WfUpdateNodeTool,
  WfPatchNodeTool,
  WfReplaceNodeTool,
  WfExecuteNodeTool,
  WfGetRunResultTool,
  ScopedGlobTool,
  ScopedGrepTool,
  ScopedReadFileTool,
} from './copilotTools';

class DebugSqlTool extends Tool {
  name = 'sql';
  description =
    'Execute SQL on a data source using a config file. Useful for exploring data source schema and data.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description: 'SQL query to execute (SELECT/WITH, must include LIMIT clause)',
      },
      conf_file: {
        type: 'string',
        description: 'Absolute path to the data source configuration file',
      },
      output_csv: {
        type: 'string',
        description:
          'Absolute file path for the CSV output of query results. Must be under the work folder directory.',
      },
    },
    required: ['sql', 'conf_file', 'output_csv'],
  };
  private sqlTool = new SqlTool();

  async execute(params: ToolParams): Promise<ToolResult> {
    return this.sqlTool.execute(params);
  }
}

class DebugBashTool extends Tool {
  name = 'bash';
  description =
    'Execute a shell command in the Docker sandbox container. Useful for running scripts, installing packages, or performing system operations.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      directory: {
        type: 'string',
        description:
          'Working directory for command execution (optional, defaults to sandbox default workdir)',
      },
      timeout: {
        type: 'integer',
        description: 'Command timeout in seconds (optional, defaults to config sandbox timeout)',
      },
    },
    required: ['command'],
  };
  private bashTool = new BashTool();

  async execute(params: ToolParams): Promise<ToolResult> {
    return this.bashTool.execute(params);
  }
}

/**
 * Create a tool registry scoped for the debug agent.
 * Contains workflow tools, scoped file tools, and data tools (sql, bash).
 */
export function createDebugToolRegistry(accessor: WorkflowAccessor): ToolRegistryClass {
  const registry = new ToolRegistryClass();

  // Workflow tools (use the accessor for DB or in-memory access)
  registry.register(new WfGetNodeTool(accessor));
  registry.register(new WfUpdateNodeTool(accessor));
  registry.register(new WfPatchNodeTool(accessor));
  registry.register(new WfReplaceNodeTool(accessor));
  registry.register(new WfExecuteNodeTool(accessor));
  registry.register(new WfGetRunResultTool(accessor));

  // Scoped file tools (use config internally, no constructor args)
  registry.register(new ScopedGlobTool());
  registry.register(new ScopedGrepTool());
  registry.register(new ScopedReadFileTool());
  registry.register(new WebFetchTool());

  // Data tools
  registry.register(new DebugSqlTool());
  registry.register(new DebugBashTool());

  return registry;
}
