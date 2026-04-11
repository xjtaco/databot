import { NodeConfig, NodeOutput } from '../workflow.types';

export interface NodeExecutionContext {
  workFolder: string;
  nodeId: string;
  nodeName: string;
  resolvedConfig: NodeConfig;
}

export interface NodeExecutor {
  readonly type: string;
  execute(context: NodeExecutionContext): Promise<NodeOutput>;
}
