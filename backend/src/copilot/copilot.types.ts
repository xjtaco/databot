// backend/src/copilot/copilot.types.ts
import { NodeConfig, WsWorkflowEvent, WorkflowNodeInfo } from '../workflow/workflow.types';

// ── Client → Server Messages ─────────────────────────────
export interface CopilotUserMessage {
  type: 'user_message';
  content: string;
}

export interface CopilotAbort {
  type: 'abort';
}

export interface CopilotExecuteNode {
  type: 'execute_node';
  nodeId: string;
}

export interface CopilotPing {
  type: 'ping';
}

export interface CopilotLayoutSession {
  type: 'layout_session';
  hasManualLayoutEdits: boolean;
}

export type CopilotClientMessage =
  | CopilotUserMessage
  | CopilotAbort
  | CopilotExecuteNode
  | CopilotPing
  | CopilotLayoutSession;

// ── Server → Client Messages ─────────────────────────────
export interface CopilotTextDelta {
  type: 'text_delta';
  content: string;
}

export interface CopilotTextDone {
  type: 'text_done';
}

export interface CopilotToolStart {
  type: 'tool_start';
  toolName: string;
  toolCallId: string;
  summary: string;
}

export interface CopilotToolDone {
  type: 'tool_done';
  toolCallId: string;
  success: boolean;
  summary: string;
}

export interface CopilotToolErrorEvent {
  type: 'tool_error';
  toolCallId: string;
  error: string;
}

export interface CopilotNodeConfigCard {
  type: 'node_config_card';
  nodeId: string;
  nodeName: string;
  nodeType: string;
  config: NodeConfig;
}

export interface CopilotWorkflowChanged {
  type: 'workflow_changed';
  changeType: 'node_added' | 'node_updated' | 'node_deleted' | 'edge_added' | 'edge_deleted';
  nodeId?: string;
  nodeData?: WorkflowNodeInfo;
}

export interface CopilotExecutionEvent {
  type: 'execution_event';
  event: WsWorkflowEvent;
}

export interface CopilotTodosUpdate {
  type: 'todos_update';
  todos: Array<{
    content: string;
    activeForm: string;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  }>;
  stats: {
    count: number;
    completed: number;
    inProgress: number;
    pending: number;
    cancelled: number;
  };
}

export interface CopilotTurnDone {
  type: 'turn_done';
}

export interface CopilotPong {
  type: 'pong';
}

export interface CopilotErrorEvent {
  type: 'error';
  message: string;
  errorType?: 'config_missing';
  configType?: 'llm';
}

export type CopilotLayoutOwnership = 'copilot' | 'mixed' | 'user';

export interface CopilotRoundMutationSummary {
  addedNodes: number;
  deletedNodes: number;
  addedEdges: number;
  deletedEdges: number;
  replacedNodes: number;
  updatedNodes: number;
}

export type CopilotServerMessage =
  | CopilotTextDelta
  | CopilotTextDone
  | CopilotToolStart
  | CopilotToolDone
  | CopilotToolErrorEvent
  | CopilotNodeConfigCard
  | CopilotWorkflowChanged
  | CopilotExecutionEvent
  | CopilotTodosUpdate
  | CopilotTurnDone
  | CopilotPong
  | CopilotErrorEvent;

// ── Agent Configuration ──────────────────────────────────
export const COPILOT_MAX_TOOL_CALLS_PER_TURN = 80;
