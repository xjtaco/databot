import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWebSocket } from '@/composables/useWebSocket';
import { useConnectionStore } from '@/stores';
import { withSetup } from '../setup';

describe('useWebSocket', () => {
  let mockWs: {
    readyState: number;
    onopen: ((event: Event) => void) | null;
    onclose: ((event: CloseEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
    onmessage: ((event: MessageEvent) => void) | null;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    setActivePinia(createPinia());

    mockWs = {
      readyState: WebSocket.CONNECTING,
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      send: vi.fn(),
      close: vi.fn(),
    };

    vi.spyOn(global, 'WebSocket').mockImplementation(() => {
      setTimeout(() => {
        mockWs.readyState = WebSocket.OPEN;
        if (mockWs.onopen) {
          mockWs.onopen(new Event('open'));
        }
      }, 0);
      return mockWs as unknown as WebSocket;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should connect to WebSocket on mount when autoConnect is true', async () => {
    const { result, unmount } = withSetup(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws/agent',
        autoConnect: false,
      })
    );

    result.connect();

    expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:3000/ws/agent');

    unmount();
  });

  it('should set connection state to connected when WebSocket opens', async () => {
    const connectionStore = useConnectionStore();

    const { result, unmount } = withSetup(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws/agent',
        autoConnect: false,
      })
    );

    result.connect();

    expect(connectionStore.state).toBe('connecting');

    // Wait for the mock WebSocket to "connect"
    await vi.waitFor(() => {
      expect(connectionStore.state).toBe('connected');
    });

    unmount();
  });

  it('should send pong in response to ping messages', async () => {
    const { result, unmount } = withSetup(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws/agent',
        autoConnect: false,
      })
    );

    result.connect();

    // Wait for connection
    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(WebSocket.OPEN);
    });

    // Simulate receiving a ping message
    const pingMessage = JSON.stringify({ type: 'ping', timestamp: Date.now() });
    if (mockWs.onmessage) {
      mockWs.onmessage(new MessageEvent('message', { data: pingMessage }));
    }

    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"pong"'));

    unmount();
  });

  it('should call message handlers for non-ping messages', async () => {
    const handler = vi.fn();

    const { result, unmount } = withSetup(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws/agent',
        autoConnect: false,
      })
    );

    result.onMessage(handler);
    result.connect();

    // Wait for connection
    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(WebSocket.OPEN);
    });

    // Simulate receiving an agent_response message
    const responseMessage = JSON.stringify({
      type: 'agent_response',
      timestamp: Date.now(),
      data: { content: 'Hello' },
    });
    if (mockWs.onmessage) {
      mockWs.onmessage(new MessageEvent('message', { data: responseMessage }));
    }

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agent_response',
        data: { content: 'Hello' },
      })
    );

    unmount();
  });

  it('should send messages correctly', async () => {
    const { result, unmount } = withSetup(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws/agent',
        autoConnect: false,
      })
    );

    result.connect();

    // Wait for connection
    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(WebSocket.OPEN);
    });

    result.send('user_message', { content: 'Test message' });

    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"user_message"'));
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"content":"Test message"'));

    unmount();
  });

  it('should disconnect properly', async () => {
    const connectionStore = useConnectionStore();

    const { result, unmount } = withSetup(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws/agent',
        autoConnect: false,
      })
    );

    result.connect();

    // Wait for connection
    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(WebSocket.OPEN);
    });

    result.disconnect();

    expect(mockWs.close).toHaveBeenCalledWith(1000, 'User disconnected');
    expect(connectionStore.state).toBe('disconnected');

    unmount();
  });

  it('should remove message handlers correctly', async () => {
    const handler = vi.fn();

    const { result, unmount } = withSetup(() =>
      useWebSocket({
        url: 'ws://localhost:3000/ws/agent',
        autoConnect: false,
      })
    );

    result.onMessage(handler);
    result.connect();

    // Wait for connection
    await vi.waitFor(() => {
      expect(mockWs.readyState).toBe(WebSocket.OPEN);
    });

    // Remove the handler
    result.offMessage(handler);

    // Simulate receiving a message
    const responseMessage = JSON.stringify({
      type: 'agent_response',
      timestamp: Date.now(),
      data: { content: 'Hello' },
    });
    if (mockWs.onmessage) {
      mockWs.onmessage(new MessageEvent('message', { data: responseMessage }));
    }

    expect(handler).not.toHaveBeenCalled();

    unmount();
  });
});
