import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ConnectionState } from '@/types';

export const useConnectionStore = defineStore('connection', () => {
  // State
  const state = ref<ConnectionState>('disconnected');
  const lastConnectedAt = ref<number | null>(null);
  const reconnectAttempts = ref(0);
  const maxReconnectAttempts = ref(5);
  const errorMessage = ref<string | null>(null);

  // Getters
  const isConnected = computed(() => state.value === 'connected');
  const isConnecting = computed(() => state.value === 'connecting');
  const isDisconnected = computed(() => state.value === 'disconnected');
  const hasError = computed(() => state.value === 'error');
  const canReconnect = computed(() => reconnectAttempts.value < maxReconnectAttempts.value);

  // Actions
  function setConnecting() {
    state.value = 'connecting';
    errorMessage.value = null;
  }

  function setConnected() {
    state.value = 'connected';
    lastConnectedAt.value = Date.now();
    reconnectAttempts.value = 0;
    errorMessage.value = null;
  }

  function setDisconnected() {
    state.value = 'disconnected';
  }

  function setError(message: string) {
    state.value = 'error';
    errorMessage.value = message;
  }

  function incrementReconnectAttempts() {
    reconnectAttempts.value++;
  }

  function resetReconnectAttempts() {
    reconnectAttempts.value = 0;
  }

  function reset() {
    state.value = 'disconnected';
    lastConnectedAt.value = null;
    reconnectAttempts.value = 0;
    errorMessage.value = null;
  }

  return {
    // State
    state,
    lastConnectedAt,
    reconnectAttempts,
    maxReconnectAttempts,
    errorMessage,

    // Getters
    isConnected,
    isConnecting,
    isDisconnected,
    hasError,
    canReconnect,

    // Actions
    setConnecting,
    setConnected,
    setDisconnected,
    setError,
    incrementReconnectAttempts,
    resetReconnectAttempts,
    reset,
  };
});
