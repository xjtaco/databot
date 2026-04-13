import { nextTick } from 'vue';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCopilotStore } from '@/stores/copilotStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import * as workflowApi from '@/api/workflow';
import type { WorkflowDetail } from '@/types/workflow';

vi.mock('@/api/workflow');

class InspectableWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: InspectableWebSocket[] = [];

  readyState = InspectableWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(public url: string) {
    InspectableWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = InspectableWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 0);
  }

  send = vi.fn();
  close = vi.fn();
}

function createEditorWorkflow() {
  const workflow: WorkflowDetail = {
    id: 'wf-1',
    name: 'Test Workflow',
    description: null,
    nodes: [
      {
        id: 'node-1',
        workflowId: 'wf-1',
        name: 'Node 1',
        description: null,
        type: 'sql',
        config: {
          nodeType: 'sql',
          datasourceId: 'ds-1',
          params: {},
          sql: 'select 1',
          outputVariable: 'result_1',
        },
        positionX: 0,
        positionY: 0,
        },
      ],
    edges: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  return workflow;
}

describe('copilotStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.clearAllMocks();
    InspectableWebSocket.instances = [];
    global.WebSocket = InspectableWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with correct defaults', () => {
    const store = useCopilotStore();
    expect(store.isConnected).toBe(false);
    expect(store.workflowId).toBeNull();
    expect(store.messages).toEqual([]);
    expect(store.isAgentThinking).toBe(false);
  });

  it('reset clears all state', () => {
    const store = useCopilotStore();
    store.messages.push({ type: 'user', content: 'test' });
    store.isAgentThinking = true;
    store.reset();
    expect(store.messages).toEqual([]);
    expect(store.isAgentThinking).toBe(false);
  });

  it('queues a follow-up message until turn_done when sending during active processing', () => {
    const store = useCopilotStore();
    store.connect('wf-1');
    vi.runAllTimers();
    const ws = InspectableWebSocket.instances[0];
    ws.send.mockClear();

    store.sendMessage('first');
    store.sendMessage('second');

    const payloadsBeforeTurnDone = ws.send.mock.calls.map(([payload]) => JSON.parse(String(payload)));

    expect(payloadsBeforeTurnDone).toEqual([
      { type: 'layout_session', hasManualLayoutEdits: false },
      { type: 'user_message', content: 'first' },
      { type: 'abort' },
    ]);

    store.handleServerMessage({ type: 'turn_done' });

    const payloadsAfterTurnDone = ws.send.mock.calls.map(([payload]) => JSON.parse(String(payload)));

    expect(payloadsAfterTurnDone).toEqual([
      { type: 'layout_session', hasManualLayoutEdits: false },
      { type: 'user_message', content: 'first' },
      { type: 'abort' },
      { type: 'layout_session', hasManualLayoutEdits: false },
      { type: 'user_message', content: 'second' },
    ]);
  });

  it('sends the manual-layout session signal immediately before each user message', () => {
    const store = useCopilotStore();
    store.connect('wf-1');
    vi.runAllTimers();

    const ws = InspectableWebSocket.instances[0];
    ws.send.mockClear();

    store.sendMessage('first');

    const payloads = ws.send.mock.calls.map(([payload]) => JSON.parse(String(payload)));

    expect(payloads).toEqual([
      { type: 'layout_session', hasManualLayoutEdits: false },
      { type: 'user_message', content: 'first' },
    ]);
  });

  it('marks the workflow as manually arranged after node dragging', () => {
    const workflowStore = useWorkflowStore();
    workflowStore.editorWorkflow = createEditorWorkflow();

    workflowStore.updateNodePosition('node-1', 320, 240, { source: 'user-drag' });

    expect(workflowStore.hasManualLayoutEdits).toBe(true);
  });

  it('does not mark the workflow as manually arranged for system position updates', () => {
    const workflowStore = useWorkflowStore();
    workflowStore.editorWorkflow = createEditorWorkflow();

    workflowStore.updateNodePosition('node-1', 320, 240, { source: 'system' });

    expect(workflowStore.hasManualLayoutEdits).toBe(false);
  });

  it('sends the manual-layout session signal after a user drag', async () => {
    const workflowStore = useWorkflowStore();
    workflowStore.editorWorkflow = createEditorWorkflow();

    const store = useCopilotStore();
    store.connect('wf-1');
    vi.runAllTimers();

    const ws = InspectableWebSocket.instances[0];
    ws.send.mockClear();

    workflowStore.updateNodePosition('node-1', 320, 240, { source: 'user-drag' });
    await nextTick();

    const payloads = ws.send.mock.calls.map(([payload]) => JSON.parse(String(payload)));
    expect(payloads).toContainEqual({
      type: 'layout_session',
      hasManualLayoutEdits: true,
    });
  });

  it('resets manual-layout edits when workflow data reloads from backend state', async () => {
    const workflowStore = useWorkflowStore();
    workflowStore.editorWorkflow = createEditorWorkflow();
    workflowStore.updateNodePosition('node-1', 320, 240, { source: 'user-drag' });
    expect(workflowStore.hasManualLayoutEdits).toBe(true);

    vi.mocked(workflowApi.getWorkflow).mockResolvedValue({
      ...createEditorWorkflow(),
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    vi.mocked(workflowApi.listRuns).mockResolvedValue([]);

    await workflowStore.loadForEditing('wf-1');

    expect(workflowStore.hasManualLayoutEdits).toBe(false);
  });

  describe('handleServerMessage', () => {
    it('handles text_delta by creating assistant message', () => {
      const store = useCopilotStore();
      store.handleServerMessage({ type: 'text_delta', content: 'Hello' });
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0]).toEqual({ type: 'assistant', content: 'Hello', done: false });
    });

    it('handles text_delta by appending to existing assistant message', () => {
      const store = useCopilotStore();
      store.handleServerMessage({ type: 'text_delta', content: 'Hello' });
      store.handleServerMessage({ type: 'text_delta', content: ' world' });
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0]).toEqual({ type: 'assistant', content: 'Hello world', done: false });
    });

    it('handles text_done by marking assistant message done', () => {
      const store = useCopilotStore();
      store.handleServerMessage({ type: 'text_delta', content: 'Hi' });
      store.handleServerMessage({ type: 'text_done' });
      expect(store.messages[0]).toEqual({ type: 'assistant', content: 'Hi', done: true });
    });

    it('handles tool_start by adding tool_status message', () => {
      const store = useCopilotStore();
      store.handleServerMessage({
        type: 'tool_start',
        toolName: 'wf_add_node',
        toolCallId: 'tc1',
        summary: 'Creating node',
      });
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0]).toEqual({
        type: 'tool_status',
        toolCallId: 'tc1',
        toolName: 'wf_add_node',
        status: 'running',
        summary: 'Creating node',
      });
    });

    it('handles tool_done by updating tool_status', () => {
      const store = useCopilotStore();
      store.handleServerMessage({
        type: 'tool_start',
        toolName: 'wf_add_node',
        toolCallId: 'tc1',
        summary: 'Creating node',
      });
      store.handleServerMessage({
        type: 'tool_done',
        toolCallId: 'tc1',
        success: true,
        summary: 'Node created',
      });
      expect(store.messages[0]).toMatchObject({
        type: 'tool_status',
        status: 'success',
        summary: 'Node created',
      });
    });

    it('handles turn_done by clearing isAgentThinking', () => {
      const store = useCopilotStore();
      store.isAgentThinking = true;
      store.handleServerMessage({ type: 'turn_done' });
      expect(store.isAgentThinking).toBe(false);
    });

    it('handles error by adding assistant message', () => {
      const store = useCopilotStore();
      store.isAgentThinking = true;
      store.handleServerMessage({ type: 'error', message: 'Something went wrong' });
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0]).toEqual({
        type: 'assistant',
        content: 'Something went wrong',
        done: true,
      });
      expect(store.isAgentThinking).toBe(false);
    });

    it('handles node_config_card by adding card message', () => {
      const store = useCopilotStore();
      store.handleServerMessage({
        type: 'node_config_card',
        nodeId: 'n1',
        nodeName: 'Query',
        nodeType: 'sql',
        config: {
          nodeType: 'sql',
          datasourceId: 'ds1',
          params: {},
          sql: 'SELECT 1',
          outputVariable: 'q',
        },
      });
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0]).toMatchObject({ type: 'node_config_card', nodeId: 'n1' });
    });
  });
});
