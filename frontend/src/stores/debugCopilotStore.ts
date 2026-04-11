import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { WorkflowNodeInfo } from '@/types/workflow';
import { i18n } from '@/locales';
import { useAuthStore } from '@/stores/authStore';

// ── Message Types ────────────────────────────────────────
export type DebugCopilotMessage =
  | { type: 'user'; content: string }
  | { type: 'assistant'; content: string; done: boolean }
  | {
      type: 'tool_status';
      toolCallId: string;
      toolName: string;
      status: 'running' | 'success' | 'error';
      summary: string;
    };

// ── Server Message Types ─────────────────────────────────
interface TextDelta {
  type: 'text_delta';
  content: string;
}
interface TextDone {
  type: 'text_done';
}
interface ToolStart {
  type: 'tool_start';
  toolName: string;
  toolCallId: string;
  summary: string;
}
interface ToolDone {
  type: 'tool_done';
  toolCallId: string;
  success: boolean;
  summary: string;
}
interface ToolError {
  type: 'tool_error';
  toolCallId: string;
  error: string;
}
interface WorkflowChanged {
  type: 'workflow_changed';
  changeType: string;
  nodeId?: string;
  nodeData?: WorkflowNodeInfo;
}
interface TurnDone {
  type: 'turn_done';
}
interface Pong {
  type: 'pong';
}
interface ExecutionEvent {
  type: 'execution_event';
  event: {
    type: string;
    runId: string;
    nodeId?: string;
    nodeName?: string;
    error?: string;
    status?: string;
    preview?: Record<string, unknown> | null;
  };
}
interface ErrorMsg {
  type: 'error';
  message: string;
  errorType?: string;
  configType?: string;
}

type DebugServerMessage =
  | TextDelta
  | TextDone
  | ToolStart
  | ToolDone
  | ToolError
  | WorkflowChanged
  | ExecutionEvent
  | TurnDone
  | Pong
  | ErrorMsg;

export const useDebugCopilotStore = defineStore('debugCopilot', () => {
  const isConnected = ref(false);
  const templateId = ref<string | null>(null);
  const messages = ref<DebugCopilotMessage[]>([]);
  const isAgentThinking = ref(false);

  let ws: WebSocket | null = null;
  let onNodeChangedCallback:
    | ((changeType: string, nodeId?: string, nodeData?: WorkflowNodeInfo) => void)
    | null = null;
  let onExecutionEventCallback: ((event: ExecutionEvent['event']) => void) | null = null;

  // ── WebSocket Connection ─────────────────────────────
  function connect(tplId: string): void {
    templateId.value = tplId;
    reset();
    createConnection();
  }

  function disconnect(): void {
    if (ws) {
      ws.close();
      ws = null;
    }
    isConnected.value = false;
    templateId.value = null;
  }

  function createConnection(): void {
    if (!templateId.value) return;

    const wsBase = import.meta.env.VITE_WS_URL || '/ws';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const prefix = wsBase.startsWith('/') ? `${protocol}//${host}${wsBase}` : wsBase;
    const locale = i18n.global.locale.value;
    const url = `${prefix}/custom-node-debug?templateId=${templateId.value}&locale=${locale}`;

    ws = new WebSocket(url);

    ws.onopen = () => {
      // Send auth handshake as first frame
      const authStore = useAuthStore();
      if (authStore.accessToken && ws) {
        ws.send(JSON.stringify({ type: 'auth', token: authStore.accessToken }));
      }
      isConnected.value = true;
    };

    ws.onclose = () => {
      isConnected.value = false;
      ws = null;
      // No reconnect — in-memory workflow is gone on disconnect
    };

    ws.onerror = () => {
      // Error will trigger onclose
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(String(event.data)) as DebugServerMessage;
        handleServerMessage(data);
      } catch {
        // Ignore unparseable messages
      }
    };
  }

  function wsSend(data: Record<string, unknown>): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // ── Actions ──────────────────────────────────────────
  function sendMessage(content: string): void {
    if (isAgentThinking.value) {
      wsSend({ type: 'abort' });
    }
    messages.value.push({ type: 'user', content });
    isAgentThinking.value = true;
    wsSend({ type: 'user_message', content });
  }

  function executeNode(nodeId: string): void {
    isAgentThinking.value = true;
    wsSend({ type: 'execute_node', nodeId });
  }

  function abort(): void {
    wsSend({ type: 'abort' });
    isAgentThinking.value = false;
  }

  function reset(): void {
    messages.value = [];
    isAgentThinking.value = false;
  }

  function setOnNodeChanged(
    callback: ((changeType: string, nodeId?: string, nodeData?: WorkflowNodeInfo) => void) | null
  ): void {
    onNodeChangedCallback = callback;
  }

  function setOnExecutionEvent(callback: ((event: ExecutionEvent['event']) => void) | null): void {
    onExecutionEventCallback = callback;
  }

  // ── Server Message Handler ───────────────────────────
  function handleServerMessage(msg: DebugServerMessage): void {
    switch (msg.type) {
      case 'text_delta': {
        const last = messages.value[messages.value.length - 1];
        if (last && last.type === 'assistant' && !last.done) {
          last.content += msg.content;
        } else {
          messages.value.push({ type: 'assistant', content: msg.content, done: false });
        }
        break;
      }
      case 'text_done': {
        const last = messages.value[messages.value.length - 1];
        if (last && last.type === 'assistant') {
          last.done = true;
        }
        break;
      }
      case 'tool_start':
        messages.value.push({
          type: 'tool_status',
          toolCallId: msg.toolCallId,
          toolName: msg.toolName,
          status: 'running',
          summary: msg.summary,
        });
        break;
      case 'tool_done': {
        const tool = messages.value.find(
          (m) => m.type === 'tool_status' && m.toolCallId === msg.toolCallId
        );
        if (tool && tool.type === 'tool_status') {
          tool.status = msg.success ? 'success' : 'error';
          tool.summary = msg.summary;
        }
        break;
      }
      case 'tool_error': {
        const tool = messages.value.find(
          (m) => m.type === 'tool_status' && m.toolCallId === msg.toolCallId
        );
        if (tool && tool.type === 'tool_status') {
          tool.status = 'error';
          tool.summary = msg.error;
        }
        break;
      }
      case 'workflow_changed': {
        if (onNodeChangedCallback) {
          onNodeChangedCallback(msg.changeType, msg.nodeId, msg.nodeData);
        }
        break;
      }
      case 'execution_event': {
        if (onExecutionEventCallback) {
          onExecutionEventCallback(msg.event);
        }
        break;
      }
      case 'turn_done':
        isAgentThinking.value = false;
        break;
      case 'error':
        messages.value.push({ type: 'assistant', content: msg.message, done: true });
        isAgentThinking.value = false;
        break;
      case 'pong':
        // Heartbeat response, ignore
        break;
    }
  }

  return {
    // State
    isConnected,
    templateId,
    messages,
    isAgentThinking,
    // Actions
    connect,
    disconnect,
    sendMessage,
    executeNode,
    abort,
    reset,
    setOnNodeChanged,
    setOnExecutionEvent,
  };
});
