import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface ToolCallInfo {
  id: string;
  name: string;
  timestamp: number;
  status: 'running' | 'completed' | 'error';
  resultSummary?: string;
  error?: string;
  parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

const MAX_TOOL_CALLS = 1000;

export const useToolCallStore = defineStore('toolCall', () => {
  const calls = ref<ToolCallInfo[]>([]);
  const isExpanded = ref(false);
  const isAgentRunning = ref(false);

  const hasCalls = computed(() => calls.value.length > 0);
  const recentCalls = computed(() => calls.value.slice(-5));
  const callCount = computed(() => calls.value.length);

  function addToolCall(call: ToolCallInfo) {
    calls.value.push(call);
    if (calls.value.length > MAX_TOOL_CALLS) {
      calls.value = calls.value.slice(-MAX_TOOL_CALLS);
    }
  }

  function completeToolCall(id: string) {
    const call = calls.value.find((c) => c.id === id);
    if (call) {
      call.status = 'completed';
    }
  }

  function toggleExpanded() {
    isExpanded.value = !isExpanded.value;
  }

  function setAgentRunning(running: boolean) {
    isAgentRunning.value = running;
  }

  function clearHistory() {
    calls.value = [];
    isExpanded.value = false;
    isAgentRunning.value = false;
  }

  return {
    calls,
    isExpanded,
    isAgentRunning,
    hasCalls,
    recentCalls,
    callCount,
    addToolCall,
    completeToolCall,
    toggleExpanded,
    setAgentRunning,
    clearHistory,
  };
});
