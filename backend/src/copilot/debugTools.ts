// backend/src/copilot/debugTools.ts

import { ToolRegistryClass } from '../infrastructure/tools/tools';
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

/**
 * Create a tool registry scoped for the debug agent.
 * Contains 5 workflow tools (via accessor) and 3 scoped file tools.
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

  return registry;
}
