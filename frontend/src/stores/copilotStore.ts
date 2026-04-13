import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { NodeConfig, WsWorkflowEvent } from '@/types/workflow';
import { i18n } from '@/locales';
import { useWorkflowStore } from './workflowStore';
import { useTodosStore } from './todosStore';
import { useAuthStore } from './authStore';

// ── Message Types ────────────────────────────────────────
export type CopilotMessage =
  | { type: 'user'; content: string }
  | { type: 'assistant'; content: string; done: boolean }
  | {
      type: 'tool_status';
      toolCallId: string;
      toolName: string;
      status: 'running' | 'success' | 'error';
      summary: string;
    }
  | {
      type: 'node_config_card';
      nodeId: string;
      nodeName: string;
      nodeType: string;
      config: NodeConfig;
    };

// ── Server Message Types (matching backend CopilotServerMessage) ─
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
interface NodeConfigCard {
  type: 'node_config_card';
  nodeId: string;
  nodeName: string;
  nodeType: string;
  config: NodeConfig;
}
interface WorkflowChanged {
  type: 'workflow_changed';
  changeType: string;
  nodeId?: string;
}
interface ExecutionEvent {
  type: 'execution_event';
  event: WsWorkflowEvent;
}
interface TurnDone {
  type: 'turn_done';
}
interface Pong {
  type: 'pong';
}
interface ErrorMsg {
  type: 'error';
  message: string;
  errorType?: 'config_missing';
  configType?: 'llm';
}
interface TodosUpdate {
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

type CopilotServerMessage =
  | TextDelta
  | TextDone
  | ToolStart
  | ToolDone
  | ToolError
  | NodeConfigCard
  | WorkflowChanged
  | ExecutionEvent
  | TodosUpdate
  | TurnDone
  | Pong
  | ErrorMsg;

export const useCopilotStore = defineStore('copilot', () => {
  const workflowStore = useWorkflowStore();
  const isConnected = ref(false);
  const workflowId = ref<string | null>(null);
  const messages = ref<CopilotMessage[]>([]);
  const isAgentThinking = ref(false);
  const pendingMessage = ref<string | null>(null);
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  const MAX_RECONNECT_DELAY = 30000;

  // ── WebSocket Connection ─────────────────────────────
  function connect(wfId: string): void {
    workflowId.value = wfId;
    reset();
    createConnection();
  }

  function disconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    isConnected.value = false;
    workflowId.value = null;
  }

  function createConnection(): void {
    if (!workflowId.value) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const locale = i18n.global.locale.value;
    const url = `${protocol}//${host}/ws/copilot?workflowId=${workflowId.value}&locale=${locale}`;

    ws = new WebSocket(url);

    ws.onopen = () => {
      // Send auth handshake as first frame
      const authStore = useAuthStore();
      if (authStore.accessToken && ws) {
        ws.send(JSON.stringify({ type: 'auth', token: authStore.accessToken }));
      }
      isConnected.value = true;
      reconnectDelay = 1000;
      sendLayoutSessionSignal(workflowStore.hasManualLayoutEdits);
    };

    ws.onclose = () => {
      isConnected.value = false;
      scheduleReconnect();
    };

    ws.onerror = () => {
      // Error will trigger onclose
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(String(event.data)) as CopilotServerMessage;
        handleServerMessage(data);
      } catch {
        // Ignore unparseable messages
      }
    };
  }

  function scheduleReconnect(): void {
    if (!workflowId.value) return;
    reconnectTimer = setTimeout(() => {
      createConnection();
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    }, reconnectDelay);
  }

  function wsSend(data: Record<string, unknown>): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  function sendLayoutSessionSignal(hasManualLayoutEdits: boolean): void {
    wsSend({ type: 'layout_session', hasManualLayoutEdits });
  }

  watch(
    () => workflowStore.hasManualLayoutEdits,
    (hasManualLayoutEdits) => {
      sendLayoutSessionSignal(hasManualLayoutEdits);
    }
  );

  // ── Actions ──────────────────────────────────────────
  function sendMessage(content: string): void {
    messages.value.push({ type: 'user', content });
    if (isAgentThinking.value) {
      pendingMessage.value = content;
      wsSend({ type: 'abort' });
      return;
    }
    sendUserMessage(content);
  }

  function abort(): void {
    pendingMessage.value = null;
    wsSend({ type: 'abort' });
    isAgentThinking.value = false;
  }

  function reset(): void {
    messages.value = [];
    isAgentThinking.value = false;
    pendingMessage.value = null;
    const todosStore = useTodosStore();
    todosStore.clear();
  }

  function removeMessage(index: number): void {
    if (index >= 0 && index < messages.value.length) {
      messages.value.splice(index, 1);
    }
  }

  function appendNodeConfigCard(
    nodeId: string,
    nodeName: string,
    nodeType: string,
    config: NodeConfig
  ): void {
    messages.value.push({ type: 'node_config_card', nodeId, nodeName, nodeType, config });
  }

  // ── Server Message Handler ───────────────────────────
  function handleServerMessage(msg: CopilotServerMessage): void {
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
      case 'node_config_card':
        messages.value.push({
          type: 'node_config_card',
          nodeId: msg.nodeId,
          nodeName: msg.nodeName,
          nodeType: msg.nodeType,
          config: msg.config,
        });
        break;
      case 'workflow_changed': {
        if (workflowId.value) {
          workflowStore.loadForEditing(workflowId.value);
        }
        break;
      }
      case 'execution_event': {
        workflowStore.handleExecutionEvent(msg.event);
        break;
      }
      case 'todos_update': {
        const todosStore = useTodosStore();
        todosStore.updateTodos(msg.todos, msg.stats);
        break;
      }
      case 'turn_done':
        isAgentThinking.value = false;
        if (pendingMessage.value) {
          const nextMessage = pendingMessage.value;
          pendingMessage.value = null;
          sendUserMessage(nextMessage);
        }
        break;
      case 'error': {
        const content =
          msg.errorType === 'config_missing' && msg.configType === 'llm'
            ? i18n.global.t('errors.llmNotConfigured')
            : msg.message;
        messages.value.push({ type: 'assistant', content, done: true });
        isAgentThinking.value = false;
        break;
      }
      case 'pong':
        // Heartbeat response, ignore
        break;
    }
  }

  function sendUserMessage(content: string): void {
    isAgentThinking.value = true;
    wsSend({ type: 'user_message', content });
  }

  return {
    // State
    isConnected,
    workflowId,
    messages,
    isAgentThinking,
    // Actions
    connect,
    disconnect,
    sendMessage,
    abort,
    reset,
    appendNodeConfigCard,
    removeMessage,
    handleServerMessage,
  };
});
