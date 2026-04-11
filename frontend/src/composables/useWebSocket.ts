import { ref, onMounted, onUnmounted } from 'vue';
import { useConnectionStore } from '@/stores';
import type { WsMessage, MessageType } from '@/types';

export interface UseWebSocketOptions {
  url: string;
  token?: string | null;
  autoConnect?: boolean;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
}

export interface UseWebSocketReturn {
  connect: () => void;
  disconnect: () => void;
  send: (type: MessageType, data?: unknown) => void;
  onMessage: (handler: (message: WsMessage) => void) => void;
  offMessage: (handler: (message: WsMessage) => void) => void;
  setToken: (token: string | null) => void;
  reconnectWithUrl: (newUrl: string) => void;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url: initialUrl,
    token: initialToken = null,
    autoConnect = true,
    reconnectDelay = 1000,
    maxReconnectDelay = 30000,
  } = options;

  const currentToken = ref(initialToken);

  const connectionStore = useConnectionStore();
  const ws = ref<WebSocket | null>(null);
  const currentUrl = ref(initialUrl);
  const messageHandlers = ref<Set<(message: WsMessage) => void>>(new Set());
  const reconnectTimeoutId = ref<ReturnType<typeof setTimeout> | null>(null);
  const currentReconnectDelay = ref(reconnectDelay);

  function createWebSocket() {
    if (ws.value?.readyState === WebSocket.OPEN) {
      return;
    }

    connectionStore.setConnecting();

    const socket = new WebSocket(currentUrl.value);

    socket.onopen = () => {
      // Send auth handshake as first frame
      if (currentToken.value) {
        socket.send(JSON.stringify({ type: 'auth', token: currentToken.value }));
      }
      connectionStore.setConnected();
      currentReconnectDelay.value = reconnectDelay;
    };

    socket.onclose = (event) => {
      connectionStore.setDisconnected();
      ws.value = null;

      // Attempt reconnect if not a clean close
      if (!event.wasClean && connectionStore.canReconnect) {
        scheduleReconnect();
      }
    };

    socket.onerror = () => {
      connectionStore.setError('WebSocket connection error');
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WsMessage;
        handleMessage(message);
      } catch {
        console.error('Failed to parse WebSocket message');
      }
    };

    ws.value = socket;
  }

  function handleMessage(message: WsMessage) {
    // Handle ping/pong internally
    if (message.type === 'ping') {
      send('pong');
      return;
    }

    // Notify all message handlers
    messageHandlers.value.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    });
  }

  function scheduleReconnect() {
    if (reconnectTimeoutId.value) {
      clearTimeout(reconnectTimeoutId.value);
    }

    connectionStore.incrementReconnectAttempts();

    reconnectTimeoutId.value = setTimeout(() => {
      createWebSocket();
      // Exponential backoff
      currentReconnectDelay.value = Math.min(currentReconnectDelay.value * 2, maxReconnectDelay);
    }, currentReconnectDelay.value);
  }

  function connect() {
    connectionStore.resetReconnectAttempts();
    currentReconnectDelay.value = reconnectDelay;
    createWebSocket();
  }

  function disconnect() {
    if (reconnectTimeoutId.value) {
      clearTimeout(reconnectTimeoutId.value);
      reconnectTimeoutId.value = null;
    }

    if (ws.value) {
      // Remove event handlers before closing to prevent the old socket's onclose
      // from clobbering the new connection's state during reconnection
      ws.value.onopen = null;
      ws.value.onclose = null;
      ws.value.onerror = null;
      ws.value.onmessage = null;
      ws.value.close(1000, 'User disconnected');
      ws.value = null;
    }

    connectionStore.setDisconnected();
  }

  function send(type: MessageType, data?: unknown) {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket is not connected');
      return;
    }

    const message: WsMessage = {
      type,
      timestamp: Date.now(),
      data,
    };

    ws.value.send(JSON.stringify(message));
  }

  function onMessage(handler: (message: WsMessage) => void) {
    messageHandlers.value.add(handler);
  }

  function offMessage(handler: (message: WsMessage) => void) {
    messageHandlers.value.delete(handler);
  }

  function setToken(token: string | null): void {
    currentToken.value = token;
  }

  function reconnectWithUrl(newUrl: string) {
    disconnect();
    currentUrl.value = newUrl;
    connect();
  }

  onMounted(() => {
    if (autoConnect) {
      connect();
    }
  });

  onUnmounted(() => {
    disconnect();
    messageHandlers.value.clear();
  });

  return {
    connect,
    disconnect,
    send,
    onMessage,
    offMessage,
    setToken,
    reconnectWithUrl,
  };
}
