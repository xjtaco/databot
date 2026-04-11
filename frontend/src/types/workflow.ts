export type WorkflowNodeType = 'sql' | 'python' | 'llm' | 'email' | 'branch' | 'web_search';

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface WorkflowListItem {
  id: string;
  name: string;
  description: string | null;
  nodeCount: number;
  lastRunAt: string | null;
  lastRunStatus: ExecutionStatus | null;
  createdAt: string;
  updatedAt: string;
  creatorName: string | null;
}

export interface ExportedWorkflowNode {
  name: string;
  description: string | null;
  type: WorkflowNodeType;
  config: NodeConfig;
  positionX: number;
  positionY: number;
}

export interface ExportedWorkflowEdge {
  sourceNodeName: string;
  targetNodeName: string;
  sourceHandle?: string;
}

export interface ExportedWorkflow {
  name: string;
  description: string | null;
  nodes: ExportedWorkflowNode[];
  edges: ExportedWorkflowEdge[];
}

export interface ImportWorkflowResult {
  id: string;
  name: string;
  renamed: boolean;
}

export interface ImportResultItem {
  originalName: string;
  result?: ImportWorkflowResult;
  error?: string;
}

export interface WorkflowNodeInfo {
  id: string;
  workflowId: string;
  name: string;
  description: string | null;
  type: WorkflowNodeType;
  config: NodeConfig;
  positionX: number;
  positionY: number;
}

export interface WorkflowEdgeInfo {
  id: string;
  workflowId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
}

export interface WorkflowDetail {
  id: string;
  name: string;
  description: string | null;
  nodes: WorkflowNodeInfo[];
  edges: WorkflowEdgeInfo[];
  createdAt: string;
  updatedAt: string;
}

export interface SqlNodeConfig {
  nodeType: 'sql';
  datasourceId: string;
  params: Record<string, string | ParamDefinition>;
  sql: string;
  outputVariable: string;
}

export type ParamValueType = 'text' | 'password' | 'number' | 'checkbox' | 'radio' | 'select';

export interface ParamDefinition {
  value: string | number | boolean;
  type: ParamValueType;
  label?: string;
  options?: string[];
}

export type OutputValueType =
  | 'text'
  | 'filePath'
  | 'csvFile'
  | 'markdownFile'
  | 'jsonFile'
  | 'imageFile';

export interface TypedOutputValue {
  value: string;
  type: OutputValueType;
}

export interface PythonNodeConfig {
  nodeType: 'python';
  params: Record<string, string | ParamDefinition>;
  script: string;
  timeout?: number;
  outputVariable: string;
}

export interface LlmNodeConfig {
  nodeType: 'llm';
  params: Record<string, string | ParamDefinition>;
  prompt: string;
  outputVariable: string;
}

export interface EmailNodeConfig {
  nodeType: 'email';
  to: string;
  subject: string;
  contentSource: 'inline' | 'upstream';
  body?: string;
  upstreamField?: string;
  isHtml: boolean;
  outputVariable: string;
}

export interface BranchNodeConfig {
  nodeType: 'branch';
  field: string;
  outputVariable: string;
}

export interface WebSearchNodeConfig {
  nodeType: 'web_search';
  params: Record<string, string | ParamDefinition>;
  keywords: string;
  outputVariable: string;
}

export type NodeConfig =
  | SqlNodeConfig
  | PythonNodeConfig
  | LlmNodeConfig
  | EmailNodeConfig
  | BranchNodeConfig
  | WebSearchNodeConfig;

export interface WorkflowRunInfo {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface WorkflowNodeRunInfo {
  id: string;
  runId: string;
  nodeId: string;
  status: ExecutionStatus;
  inputs: Record<string, unknown> | null;
  outputs: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  nodeName?: string;
  nodeType?: string;
}

export interface WorkflowRunDetail extends WorkflowRunInfo {
  nodeRuns: WorkflowNodeRunInfo[];
}

export interface ListRunsParams {
  page?: number;
  pageSize?: number;
  status?: ExecutionStatus;
  startFrom?: string;
  startTo?: string;
}

export interface ListRunsResponse {
  runs: WorkflowRunInfo[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SaveWorkflowNodeInput {
  id?: string;
  tempId?: string;
  name: string;
  description?: string;
  type: WorkflowNodeType;
  config: NodeConfig;
  positionX: number;
  positionY: number;
}

export interface SaveWorkflowInput {
  name: string;
  description?: string;
  nodes: SaveWorkflowNodeInput[];
  edges: { sourceNodeId: string; targetNodeId: string; sourceHandle?: string }[];
}

export interface CustomNodeTemplateInfo {
  id: string;
  name: string;
  description: string | null;
  type: WorkflowNodeType;
  config: NodeConfig;
  createdAt: string;
  updatedAt: string;
  creatorName: string | null;
}

export interface WsWorkflowEvent {
  type: 'node_start' | 'node_complete' | 'node_error' | 'node_skipped' | 'run_complete';
  runId: string;
  nodeId?: string;
  nodeName?: string;
  preview?: Record<string, unknown> | null;
  error?: string;
  status?: 'completed' | 'failed';
}
