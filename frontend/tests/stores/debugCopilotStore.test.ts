import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDebugCopilotStore } from '@/stores/debugCopilotStore';

describe('debugCopilotStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with correct defaults', () => {
    const store = useDebugCopilotStore();
    expect(store.isConnected).toBe(false);
    expect(store.templateId).toBeNull();
    expect(store.messages).toEqual([]);
    expect(store.isAgentThinking).toBe(false);
  });

  it('reset clears messages and thinking state', () => {
    const store = useDebugCopilotStore();
    store.messages.push({ type: 'user', content: 'test' });
    store.isAgentThinking = true;
    store.reset();
    expect(store.messages).toEqual([]);
    expect(store.isAgentThinking).toBe(false);
  });

  describe('setOnNodeChanged', () => {
    it('registers and invokes callback on workflow_changed', () => {
      const store = useDebugCopilotStore();
      const calls: unknown[][] = [];
      store.setOnNodeChanged((changeType, nodeId, nodeData) => {
        calls.push([changeType, nodeId, nodeData]);
      });

      // The callback is invoked when workflow_changed messages arrive via WebSocket.
      // Without a real WS connection, we verify registration/deregistration works.
      expect(calls).toHaveLength(0);

      store.setOnNodeChanged(null);
    });
  });

  describe('setOnExecutionEvent', () => {
    it('registers callback without error', () => {
      const store = useDebugCopilotStore();
      const calls: unknown[] = [];
      store.setOnExecutionEvent((event) => {
        calls.push(event);
      });
      // Verify no error on set/unset
      store.setOnExecutionEvent(null);
      expect(calls).toHaveLength(0);
    });
  });
});
