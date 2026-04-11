import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useToolCallStore } from '@/stores/toolCallStore';

describe('toolCallStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should have empty calls array', () => {
      const store = useToolCallStore();
      expect(store.calls).toEqual([]);
    });

    it('should have isExpanded as false', () => {
      const store = useToolCallStore();
      expect(store.isExpanded).toBe(false);
    });

    it('should have hasCalls as false when empty', () => {
      const store = useToolCallStore();
      expect(store.hasCalls).toBe(false);
    });

    it('should have isAgentRunning as false', () => {
      const store = useToolCallStore();
      expect(store.isAgentRunning).toBe(false);
    });

    it('should have callCount as 0 when empty', () => {
      const store = useToolCallStore();
      expect(store.callCount).toBe(0);
    });
  });

  describe('addToolCall', () => {
    it('should add a tool call to the list', () => {
      const store = useToolCallStore();
      const call = {
        id: 'tc-1',
        name: 'sql',
        timestamp: Date.now(),
        status: 'completed' as const,
      };

      store.addToolCall(call);

      expect(store.calls).toHaveLength(1);
      expect(store.calls[0]).toEqual(call);
      expect(store.hasCalls).toBe(true);
    });

    it('should add multiple tool calls', () => {
      const store = useToolCallStore();

      store.addToolCall({
        id: 'tc-1',
        name: 'sql',
        timestamp: Date.now(),
        status: 'completed',
      });
      store.addToolCall({
        id: 'tc-2',
        name: 'grep',
        timestamp: Date.now(),
        status: 'running',
      });

      expect(store.calls).toHaveLength(2);
    });

    it('should limit calls to max 1000 items', () => {
      const store = useToolCallStore();

      for (let i = 0; i < 1005; i++) {
        store.addToolCall({
          id: `tc-${i}`,
          name: `tool-${i}`,
          timestamp: Date.now(),
          status: 'completed',
        });
      }

      expect(store.calls).toHaveLength(1000);
      expect(store.calls[0].id).toBe('tc-5');
      expect(store.calls[999].id).toBe('tc-1004');
    });

    it('should include metadata if provided', () => {
      const store = useToolCallStore();
      const metadata = { query: 'SELECT * FROM users' };

      store.addToolCall({
        id: 'tc-1',
        name: 'sql',
        timestamp: Date.now(),
        status: 'completed',
        metadata,
      });

      expect(store.calls[0].metadata).toEqual(metadata);
    });
  });

  describe('completeToolCall', () => {
    it('should update status to completed', () => {
      const store = useToolCallStore();
      store.addToolCall({
        id: 'tc-1',
        name: 'sql',
        timestamp: Date.now(),
        status: 'running',
      });

      store.completeToolCall('tc-1');

      expect(store.calls[0].status).toBe('completed');
    });

    it('should not throw if call not found', () => {
      const store = useToolCallStore();

      expect(() => store.completeToolCall('non-existent')).not.toThrow();
    });
  });

  describe('toggleExpanded', () => {
    it('should toggle isExpanded from false to true', () => {
      const store = useToolCallStore();
      expect(store.isExpanded).toBe(false);

      store.toggleExpanded();

      expect(store.isExpanded).toBe(true);
    });

    it('should toggle isExpanded from true to false', () => {
      const store = useToolCallStore();
      store.toggleExpanded();
      expect(store.isExpanded).toBe(true);

      store.toggleExpanded();

      expect(store.isExpanded).toBe(false);
    });
  });

  describe('setAgentRunning', () => {
    it('should set isAgentRunning to true', () => {
      const store = useToolCallStore();
      expect(store.isAgentRunning).toBe(false);

      store.setAgentRunning(true);

      expect(store.isAgentRunning).toBe(true);
    });

    it('should set isAgentRunning to false', () => {
      const store = useToolCallStore();
      store.setAgentRunning(true);
      expect(store.isAgentRunning).toBe(true);

      store.setAgentRunning(false);

      expect(store.isAgentRunning).toBe(false);
    });
  });

  describe('clearHistory', () => {
    it('should clear all calls', () => {
      const store = useToolCallStore();
      store.addToolCall({
        id: 'tc-1',
        name: 'sql',
        timestamp: Date.now(),
        status: 'completed',
      });
      store.addToolCall({
        id: 'tc-2',
        name: 'grep',
        timestamp: Date.now(),
        status: 'completed',
      });

      store.clearHistory();

      expect(store.calls).toHaveLength(0);
      expect(store.hasCalls).toBe(false);
    });

    it('should reset isExpanded to false', () => {
      const store = useToolCallStore();
      store.toggleExpanded();
      expect(store.isExpanded).toBe(true);

      store.clearHistory();

      expect(store.isExpanded).toBe(false);
    });

    it('should reset isAgentRunning to false', () => {
      const store = useToolCallStore();
      store.setAgentRunning(true);
      expect(store.isAgentRunning).toBe(true);

      store.clearHistory();

      expect(store.isAgentRunning).toBe(false);
    });
  });

  describe('callCount getter', () => {
    it('should return the number of calls', () => {
      const store = useToolCallStore();

      store.addToolCall({
        id: 'tc-1',
        name: 'sql',
        timestamp: Date.now(),
        status: 'completed',
      });
      store.addToolCall({
        id: 'tc-2',
        name: 'grep',
        timestamp: Date.now(),
        status: 'completed',
      });

      expect(store.callCount).toBe(2);
    });
  });

  describe('recentCalls getter', () => {
    it('should return last 5 calls', () => {
      const store = useToolCallStore();

      for (let i = 0; i < 10; i++) {
        store.addToolCall({
          id: `tc-${i}`,
          name: `tool-${i}`,
          timestamp: Date.now(),
          status: 'completed',
        });
      }

      expect(store.recentCalls).toHaveLength(5);
      expect(store.recentCalls[0].id).toBe('tc-5');
      expect(store.recentCalls[4].id).toBe('tc-9');
    });

    it('should return all calls if less than 5', () => {
      const store = useToolCallStore();

      store.addToolCall({
        id: 'tc-1',
        name: 'sql',
        timestamp: Date.now(),
        status: 'completed',
      });
      store.addToolCall({
        id: 'tc-2',
        name: 'grep',
        timestamp: Date.now(),
        status: 'completed',
      });

      expect(store.recentCalls).toHaveLength(2);
    });
  });
});
