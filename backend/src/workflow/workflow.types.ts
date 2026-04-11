// ── Node Type Constants ───────────────────────────────────
export const WorkflowNodeType = {
  Sql: 'sql',
  Python: 'python',
  Llm: 'llm',
  Email: 'email',
  Branch: 'branch',
  WebSearch: 'web_search',
} as const;

export type WorkflowNodeTypeValue = (typeof WorkflowNodeType)[keyof typeof WorkflowNodeType];

const validNodeTypes = new Set<string>(Object.values(WorkflowNodeType));

export function isValidNodeType(type: string): type is WorkflowNodeTypeValue {
  return validNodeTypes.has(type);
}

// ── Run Status Constants ──────────────────────────────────
export const RunStatus = {
  Pending: 'pending',
  Running: 'running',
  Completed: 'completed',
  Failed: 'failed',
  Cancelled: 'cancelled',
  Skipped: 'skipped',
} as const;

export type RunStatusValue = (typeof RunStatus)[keyof typeof RunStatus];

// --- Typed I/O System ---

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

export type OutputFieldValue = string | number | boolean | TypedOutputValue;

/** Type guard for TypedOutputValue */
export function isTypedOutputValue(val: unknown): val is TypedOutputValue {
  return (
    typeof val === 'object' &&
    val !== null &&
    'value' in val &&
    'type' in val &&
    typeof (val as TypedOutputValue).value === 'string' &&
    typeof (val as TypedOutputValue).type === 'string'
  );
}

/** Normalize legacy Record<string, string> params to Record<string, ParamDefinition> */
export function normalizeParams(
  params: Record<string, string | ParamDefinition>
): Record<string, ParamDefinition> {
  const result: Record<string, ParamDefinition> = {};
  for (const [key, val] of Object.entries(params)) {
    if (typeof val === 'string') {
      result[key] = { value: val, type: 'text' };
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ── Node Config Types ─────────────────────────────────────
export interface SqlNodeConfig {
  nodeType: 'sql';
  datasourceId: string;
  params: Record<string, string | ParamDefinition>;
  sql: string;
  outputVariable: string;
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
  field: string; // Template variable, e.g. "{{sqlNode.totalRows}}"
  outputVariable: string;
}

export interface WebSearchNodeConfig {
  nodeType: 'web_search';
  params: Record<string, string | ParamDefinition>;
  keywords: string; // Supports {{}} template variables
  outputVariable: string;
}

export type NodeConfig =
  | SqlNodeConfig
  | PythonNodeConfig
  | LlmNodeConfig
  | EmailNodeConfig
  | BranchNodeConfig
  | WebSearchNodeConfig;

// ── Node Output Types ─────────────────────────────────────
export interface SqlNodeOutput {
  csvPath: string;
  totalRows: number;
  columns: string[];
  previewData: Record<string, unknown>[];
}

export interface PythonNodeOutput {
  result: Record<string, unknown>;
  csvPath?: string;
  stderr: string;
}

export interface LlmNodeOutput {
  result: Record<string, unknown>;
  rawResponse: string;
}

export interface EmailNodeOutput {
  success: boolean;
  messageId: string;
  recipients: string[];
}

export interface BranchNodeOutput {
  result: boolean;
}

export interface WebSearchNodeOutput {
  markdownPath: string;
  totalResults: number;
}

export type NodeOutput =
  | SqlNodeOutput
  | PythonNodeOutput
  | LlmNodeOutput
  | EmailNodeOutput
  | BranchNodeOutput
  | WebSearchNodeOutput;

// ── API DTOs ──────────────────────────────────────────────
export interface WorkflowListItem {
  id: string;
  name: string;
  description: string | null;
  nodeCount: number;
  lastRunAt: Date | null;
  lastRunStatus: RunStatusValue | null;
  createdAt: Date;
  updatedAt: Date;
  creatorName: string | null;
}

export interface ExportedWorkflowNode {
  name: string;
  description: string | null;
  type: WorkflowNodeTypeValue;
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

export interface WorkflowNodeInfo {
  id: string;
  workflowId: string;
  name: string;
  description: string | null;
  type: WorkflowNodeTypeValue;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowRunInfo {
  id: string;
  workflowId: string;
  status: RunStatusValue;
  startedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
}

export interface ListRunsFilter {
  page: number;
  pageSize: number;
  status?: RunStatusValue;
  startFrom?: Date;
  startTo?: Date;
}

export interface ListRunsPage {
  runs: WorkflowRunInfo[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WorkflowNodeRunInfo {
  id: string;
  runId: string;
  nodeId: string;
  status: RunStatusValue;
  inputs: Record<string, unknown> | null;
  outputs: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  nodeName?: string;
  nodeType?: string;
}

export interface WorkflowRunDetail extends WorkflowRunInfo {
  nodeRuns: WorkflowNodeRunInfo[];
}

// ── Save (Batch) DTO ──────────────────────────────────────
export interface SaveWorkflowNodeInput {
  id?: string;
  tempId?: string;
  name: string;
  description?: string;
  type: WorkflowNodeTypeValue;
  config: NodeConfig;
  positionX: number;
  positionY: number;
}

export interface SaveWorkflowEdgeInput {
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
}

export interface SaveWorkflowInput {
  name: string;
  description?: string;
  nodes: SaveWorkflowNodeInput[];
  edges: SaveWorkflowEdgeInput[];
}

// ── Execution Input ───────────────────────────────────────
export interface RunWorkflowInput {
  params?: Record<string, string>;
}

// ── Custom Node Template ──────────────────────────────────
export interface CustomNodeTemplateInfo {
  id: string;
  name: string;
  description: string | null;
  type: WorkflowNodeTypeValue;
  config: NodeConfig;
  createdAt: Date;
  updatedAt: Date;
  creatorName: string | null;
}

export interface CreateCustomNodeTemplateInput {
  name: string;
  description?: string;
  type: WorkflowNodeTypeValue;
  config: NodeConfig;
}

// ── WebSocket Events ──────────────────────────────────────
export type WsWorkflowEvent =
  | { type: 'node_start'; runId: string; nodeId: string; nodeName: string }
  | {
      type: 'node_complete';
      runId: string;
      nodeId: string;
      nodeName: string;
      preview: Record<string, unknown> | null;
    }
  | { type: 'node_error'; runId: string; nodeId: string; nodeName: string; error: string }
  | { type: 'node_skipped'; runId: string; nodeId: string; nodeName: string }
  | { type: 'run_complete'; runId: string; status: 'completed' | 'failed' };
