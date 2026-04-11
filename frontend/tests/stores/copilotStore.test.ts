import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCopilotStore } from '@/stores/copilotStore';

describe('copilotStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
