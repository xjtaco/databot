import { WorkflowExecutionError } from '../../errors/types';
import { WorkflowNodeTypeValue } from '../workflow.types';
import { NodeExecutor } from './types';
import { SqlNodeExecutor } from './sqlNodeExecutor';
import { PythonNodeExecutor } from './pythonNodeExecutor';
import { LlmNodeExecutor } from './llmNodeExecutor';
import { EmailExecutor } from './emailExecutor';
import { BranchNodeExecutor } from './branchNodeExecutor';
import { WebSearchNodeExecutor } from './webSearchNodeExecutor';

const executors = new Map<string, NodeExecutor>();

function registerExecutor(executor: NodeExecutor): void {
  executors.set(executor.type, executor);
}

registerExecutor(new SqlNodeExecutor());
registerExecutor(new PythonNodeExecutor());
registerExecutor(new LlmNodeExecutor());
registerExecutor(new EmailExecutor());
registerExecutor(new BranchNodeExecutor());
registerExecutor(new WebSearchNodeExecutor());

export function getNodeExecutor(type: WorkflowNodeTypeValue): NodeExecutor {
  const executor = executors.get(type);
  if (!executor) {
    throw new WorkflowExecutionError(`No executor registered for node type: ${type}`);
  }
  return executor;
}
