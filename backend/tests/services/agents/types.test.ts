import { describe, it, expect } from 'vitest';
import type { WsMessage, SessionState, SessionConfig, MessageType } from '../../../src/agent';
import { ValidMessageTypes } from '../../../src/agent';

describe('AgentSession Types', () => {
  describe('MessageType', () => {
    it('should have ping and pong types', () => {
      const types: MessageType[] = ['ping', 'pong'];
      expect(types).toContain('ping');
      expect(types).toContain('pong');
    });

    it('should have all new message types', () => {
      const newTypes: MessageType[] = [
        'user_message',
        'agent_response',
        'tool_call',
        'error',
        'usage_report',
        'stop',
        'turn_complete',
      ];
      expect(newTypes).toContain('user_message');
      expect(newTypes).toContain('agent_response');
      expect(newTypes).toContain('tool_call');
      expect(newTypes).toContain('error');
      expect(newTypes).toContain('usage_report');
      expect(newTypes).toContain('stop');
      expect(newTypes).toContain('turn_complete');
    });

    it('should have ValidMessageTypes exported', () => {
      expect(ValidMessageTypes).toEqual([
        'ping',
        'pong',
        'user_message',
        'agent_response',
        'tool_call',
        'action_card',
        'error',
        'usage_report',
        'stop',
        'turn_complete',
        'session_info',
      ]);
    });
  });

  describe('WsMessage', () => {
    it('should accept ping message', () => {
      const message: WsMessage = {
        type: 'ping',
        timestamp: Date.now(),
      };

      expect(message.type).toBe('ping');
      expect(typeof message.timestamp).toBe('number');
    });

    it('should accept pong message', () => {
      const message: WsMessage = {
        type: 'pong',
        timestamp: Date.now(),
      };

      expect(message.type).toBe('pong');
      expect(typeof message.timestamp).toBe('number');
    });

    it('should accept message with data', () => {
      const message: WsMessage = {
        type: 'ping',
        timestamp: Date.now(),
        data: { key: 'value' },
      };

      expect(message.type).toBe('ping');
      expect(message.data).toEqual({ key: 'value' });
    });

    it('should accept message without data', () => {
      const message: WsMessage = {
        type: 'pong',
        timestamp: Date.now(),
      };

      expect(message.type).toBe('pong');
      expect(message.data).toBeUndefined();
    });

    it('should allow unknown data type', () => {
      const message: WsMessage = {
        type: 'ping',
        timestamp: Date.now(),
        data: 'string data',
      };

      const message2: WsMessage = {
        type: 'pong',
        timestamp: Date.now(),
        data: [1, 2, 3],
      };

      const message3: WsMessage = {
        type: 'ping',
        timestamp: Date.now(),
        data: null,
      };

      expect(message.data).toBe('string data');
      expect(message2.data).toEqual([1, 2, 3]);
      expect(message3.data).toBeNull();
    });

    it('should require both type and timestamp', () => {
      const validMessage: WsMessage = {
        type: 'ping',
        timestamp: 123456,
      };

      expect(validMessage).toBeDefined();
    });
  });

  describe('SessionState', () => {
    it('should accept connecting state', () => {
      const state: SessionState = 'connecting';
      expect(state).toBe('connecting');
    });

    it('should accept connected state', () => {
      const state: SessionState = 'connected';
      expect(state).toBe('connected');
    });

    it('should accept disconnected state', () => {
      const state: SessionState = 'disconnected';
      expect(state).toBe('disconnected');
    });

    it('should accept error state', () => {
      const state: SessionState = 'error';
      expect(state).toBe('error');
    });

    it('should only accept valid state values', () => {
      const validStates: SessionState[] = ['connecting', 'connected', 'disconnected', 'error'];

      validStates.forEach((state) => {
        expect(['connecting', 'connected', 'disconnected', 'error']).toContain(state);
      });
    });
  });

  describe('SessionConfig', () => {
    it('should accept minimal config with only sessionId', () => {
      const config: SessionConfig = {
        sessionId: 'test-session',
      };

      expect(config.sessionId).toBe('test-session');
    });

    it('should accept config with all optional fields', () => {
      const config: SessionConfig = {
        sessionId: 'test-session',
        heartbeatInterval: 30000,
        heartbeatTimeout: 30000,
        maxMissedHeartbeats: 5,
      };

      expect(config.heartbeatInterval).toBe(30000);
      expect(config.heartbeatTimeout).toBe(30000);
      expect(config.maxMissedHeartbeats).toBe(5);
    });

    it('should allow optional fields to be undefined', () => {
      const config: SessionConfig = {
        sessionId: 'test-session',
        heartbeatInterval: undefined,
        heartbeatTimeout: undefined,
        maxMissedHeartbeats: undefined,
      };

      expect(config.heartbeatInterval).toBeUndefined();
      expect(config.heartbeatTimeout).toBeUndefined();
      expect(config.maxMissedHeartbeats).toBeUndefined();
    });

    it('should require sessionId to be a string', () => {
      const config: SessionConfig = {
        sessionId: 'valid-session-id',
      };

      expect(typeof config.sessionId).toBe('string');
    });

    it('should require heartbeat values to be numbers when provided', () => {
      const config: SessionConfig = {
        sessionId: 'test-session',
        heartbeatInterval: 10000,
        heartbeatTimeout: 5000,
      };

      expect(typeof config.heartbeatInterval).toBe('number');
      expect(typeof config.heartbeatTimeout).toBe('number');
    });

    it('should require maxMissedHeartbeats to be a number when provided', () => {
      const config: SessionConfig = {
        sessionId: 'test-session',
        maxMissedHeartbeats: 3,
      };

      expect(typeof config.maxMissedHeartbeats).toBe('number');
    });
  });

  describe('Type Compatibility', () => {
    it('should preserve type specificity', () => {
      const pingMessage: WsMessage = {
        type: 'ping',
        timestamp: Date.now(),
      };

      const pongMessage: WsMessage = {
        type: 'pong',
        timestamp: Date.now(),
      };

      expect(pingMessage.type).toBe('ping');
      expect(pongMessage.type).toBe('pong');
    });

    it('should allow type narrowing', () => {
      const message: WsMessage = {
        type: 'ping',
        timestamp: Date.now(),
      };

      if (message.type === 'ping') {
        expect(message.type).toBe('ping');
      } else {
        // This branch should never be reached
        expect(true).toBe(false);
      }
    });
  });
});
