import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentSession } from '../../../src/agent';
import type { SessionConfig, WsMessage } from '../../../src/agent';
import { SessionError } from '../../../src/errors/types';

// Mock WebSocket
class MockWebSocket {
  readyState = 1; // OPEN state
  send = vi.fn();
  close = vi.fn();
  on = vi.fn();
  off = vi.fn();

  // Make OPEN accessible as instance property
  get OPEN() {
    return 1;
  }

  get CLOSED() {
    return 3;
  }

  // Simulate message event
  simulateMessage(data: string) {
    const messageHandler = this.on.mock.calls.find((call) => call[0] === 'message');
    if (messageHandler) {
      const callback = messageHandler[1];
      callback(Buffer.from(data));
    }
  }

  // Simulate close event
  simulateClose(code: number, reason: string) {
    const closeHandler = this.on.mock.calls.find((call) => call[0] === 'close');
    if (closeHandler) {
      const callback = closeHandler[1];
      callback(code, Buffer.from(reason));
    }
  }

  // Simulate error event
  simulateError(error: Error) {
    const errorHandler = this.on.mock.calls.find((call) => call[0] === 'error');
    if (errorHandler) {
      const callback = errorHandler[1];
      callback(error);
    }
  }
}

// Concrete implementation for testing
class TestAgentSession extends AgentSession {
  public lastMessage: WsMessage | null = null;

  constructor(config: SessionConfig) {
    super(config);
  }

  protected onMessage(message: WsMessage): void {
    this.lastMessage = message;
  }

  // Expose protected methods for testing
  public exposeStartHeartbeat() {
    this.startHeartbeat();
  }

  public exposeStopHeartbeat() {
    this.stopHeartbeat();
  }

  public exposeSendHeartbeat() {
    this.sendHeartbeat();
  }

  public exposeOnHeartbeatMessage(message: WsMessage) {
    this.onHeartbeatMessage(message);
  }
}

describe('AgentSession', () => {
  let session: TestAgentSession;
  let config: SessionConfig;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    config = {
      sessionId: 'test-session-1',
      heartbeatInterval: 5000,
      heartbeatTimeout: 3000,
      maxMissedHeartbeats: 3,
    };
    session = new TestAgentSession(config);
    mockWs = new MockWebSocket();
  });

  afterEach(() => {
    session.exposeStopHeartbeat();
  });

  describe('Constructor', () => {
    it('should initialize with config', () => {
      expect(session.getSessionId()).toBe('test-session-1');
    });

    it('should have initial state as connecting', () => {
      expect(session.getState()).toBe('connecting');
    });

    it('should have no WebSocket initially', () => {
      expect((session as any).ws).toBeNull();
    });

    it('should initialize missed heartbeats to 0', () => {
      expect((session as any).missedHeartbeats).toBe(0);
    });

    it('should have no timers initially', () => {
      expect((session as any).heartbeatTimer).toBeNull();
      expect((session as any).heartbeatTimeoutTimer).toBeNull();
    });
  });

  describe('connect', () => {
    it('should attach WebSocket connection', () => {
      session.connect(mockWs as any);
      expect((session as any).ws).toBe(mockWs);
    });

    it('should set state to connected', () => {
      session.connect(mockWs as any);
      expect(session.getState()).toBe('connected');
    });

    it('should start heartbeat', () => {
      session.connect(mockWs as any);
      expect((session as any).heartbeatTimer).not.toBeNull();
    });

    it('should attach message event listener', () => {
      session.connect(mockWs as any);
      expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should attach close event listener', () => {
      session.connect(mockWs as any);
      expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should attach error event listener', () => {
      session.connect(mockWs as any);
      expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should handle incoming valid messages', () => {
      // Mock validateMessage to accept 'test' type for this test
      vi.spyOn(session as any, 'validateMessage').mockReturnValue(true);

      session.connect(mockWs as any);

      const message = {
        type: 'test',
        timestamp: Date.now(),
      } as unknown as WsMessage;

      mockWs.simulateMessage(JSON.stringify(message));

      expect(session.lastMessage).toEqual(message);
    });

    it('should ignore invalid messages without required fields', () => {
      session.connect(mockWs as any);

      // Missing type
      mockWs.simulateMessage(JSON.stringify({ timestamp: Date.now() }));

      expect(session.lastMessage).toBeNull();
    });

    it('should ignore invalid JSON', () => {
      session.connect(mockWs as any);

      expect(() => {
        mockWs.simulateMessage('invalid json');
      }).not.toThrow();
    });

    it('should handle WebSocket close event', () => {
      session.connect(mockWs as any);

      mockWs.simulateClose(1000, 'Normal closure');

      expect(session.getState()).toBe('disconnected');
    });

    it('should handle WebSocket error event', () => {
      session.connect(mockWs as any);

      const error = new Error('WebSocket error');
      mockWs.simulateError(error);

      expect(session.getState()).toBe('error');
    });
  });

  describe('disconnect', () => {
    beforeEach(() => {
      session.connect(mockWs as any);
    });

    it('should close WebSocket connection', () => {
      session.disconnect();
      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should set ws to null', () => {
      session.disconnect();
      expect((session as any).ws).toBeNull();
    });

    it('should set state to disconnected', () => {
      session.disconnect();
      expect(session.getState()).toBe('disconnected');
    });

    it('should stop heartbeat', () => {
      session.disconnect();
      expect((session as any).heartbeatTimer).toBeNull();
    });

    it('should handle disconnect when already disconnected', () => {
      session.disconnect();
      expect(() => {
        session.disconnect();
      }).not.toThrow();
    });

    it('should handle disconnect when ws is null', () => {
      (session as any).ws = null;
      expect(() => {
        session.disconnect();
      }).not.toThrow();
    });
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      session.connect(mockWs as any);
    });

    it('should send message via WebSocket', () => {
      const message = {
        type: 'test',
        timestamp: Date.now(),
      } as unknown as WsMessage;

      (session as any).sendMessage(message);

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should throw SessionError when ws is null', () => {
      session.disconnect();

      const message = {
        type: 'test',
        timestamp: Date.now(),
      } as unknown as WsMessage;

      expect(() => {
        (session as any).sendMessage(message);
      }).toThrow(SessionError);
    });

    it('should throw SessionError when ws is not open', () => {
      mockWs.readyState = mockWs.CLOSED;

      const message = {
        type: 'test',
        timestamp: Date.now(),
      } as unknown as WsMessage;

      expect(() => {
        (session as any).sendMessage(message);
      }).toThrow(SessionError);
    });
  });

  describe('Heartbeat', () => {
    it('should send ping message', () => {
      // Mock sendMessage directly to avoid WebSocket state checks
      const sendMessageSpy = vi.spyOn(session as any, 'sendMessage').mockImplementation(() => {});

      session.exposeSendHeartbeat();

      expect(sendMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ping',
        })
      );
    });

    it('should start heartbeat timer', () => {
      session.exposeStopHeartbeat();
      session.exposeStartHeartbeat();

      expect((session as any).heartbeatTimer).not.toBeNull();
    });

    it('should stop heartbeat timer', () => {
      session.exposeStopHeartbeat();

      expect((session as any).heartbeatTimer).toBeNull();
    });

    it('should reset missed heartbeats on pong', () => {
      // Simulate missed heartbeat
      (session as any).missedHeartbeats = 2;

      const pongMessage: WsMessage = {
        type: 'pong',
        timestamp: Date.now(),
      };

      session.exposeOnHeartbeatMessage(pongMessage);

      expect((session as any).missedHeartbeats).toBe(0);
    });

    it('should clear timeout timer on pong', () => {
      // Mock sendMessage to avoid WebSocket checks
      vi.spyOn(session as any, 'sendMessage').mockImplementation(() => {});

      session.exposeSendHeartbeat();

      expect((session as any).heartbeatTimeoutTimer).not.toBeNull();

      const pongMessage: WsMessage = {
        type: 'pong',
        timestamp: Date.now(),
      };

      session.exposeOnHeartbeatMessage(pongMessage);

      expect((session as any).heartbeatTimeoutTimer).toBeNull();
    });
  });

  describe('getSessionId', () => {
    it('should return the session ID', () => {
      expect(session.getSessionId()).toBe('test-session-1');
    });
  });

  describe('getState', () => {
    it('should return the current state', () => {
      expect(session.getState()).toBe('connecting');

      session.connect(mockWs as any);
      expect(session.getState()).toBe('connected');

      session.disconnect();
      expect(session.getState()).toBe('disconnected');
    });
  });
});
