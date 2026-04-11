import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentSessionManager } from '../../../src/agent';
import type { SessionConfig } from '../../../src/agent';
import { AgentSession } from '../../../src/agent';

// Mock implementation of AgentSession for testing
class MockAgentSession extends AgentSession {
  constructor(config: SessionConfig) {
    super(config);
  }

  protected onMessage(): void {
    // Mock implementation
  }
}

describe('AgentSessionManager', () => {
  beforeEach(() => {
    // Clear the singleton instance before each test
    (AgentSessionManager as any).sessions.clear();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = (AgentSessionManager as any).constructor.getInstance();
      const instance2 = (AgentSessionManager as any).constructor.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('addSession', () => {
    it('should add a session to the manager', () => {
      const config: SessionConfig = { sessionId: 'test-session-1' };
      const session = new MockAgentSession(config);

      AgentSessionManager.addSession(session);

      expect(AgentSessionManager.getSession('test-session-1')).toBe(session);
    });

    it('should increase session count', () => {
      const config1: SessionConfig = { sessionId: 'test-session-1' };
      const config2: SessionConfig = { sessionId: 'test-session-2' };

      AgentSessionManager.addSession(new MockAgentSession(config1));
      AgentSessionManager.addSession(new MockAgentSession(config2));

      expect(AgentSessionManager.getSessionCount()).toBe(2);
    });

    it('should throw error when adding duplicate session ID', () => {
      const config: SessionConfig = { sessionId: 'test-session-1' };
      const session1 = new MockAgentSession(config);
      const session2 = new MockAgentSession(config);

      AgentSessionManager.addSession(session1);

      expect(() => {
        AgentSessionManager.addSession(session2);
      }).toThrow('Session with ID test-session-1 already exists');
    });
  });

  describe('removeSession', () => {
    it('should remove a session from the manager', () => {
      const config: SessionConfig = { sessionId: 'test-session-1' };
      const session = new MockAgentSession(config);

      AgentSessionManager.addSession(session);
      expect(AgentSessionManager.getSession('test-session-1')).toBe(session);

      AgentSessionManager.removeSession('test-session-1');
      expect(AgentSessionManager.getSession('test-session-1')).toBeNull();
    });

    it('should decrease session count', () => {
      const config: SessionConfig = { sessionId: 'test-session-1' };
      const session = new MockAgentSession(config);

      AgentSessionManager.addSession(session);
      expect(AgentSessionManager.getSessionCount()).toBe(1);

      AgentSessionManager.removeSession('test-session-1');
      expect(AgentSessionManager.getSessionCount()).toBe(0);
    });

    it('should call disconnect on the session', () => {
      const config: SessionConfig = { sessionId: 'test-session-1' };
      const session = new MockAgentSession(config);
      const disconnectSpy = vi.spyOn(session, 'disconnect');

      AgentSessionManager.addSession(session);
      AgentSessionManager.removeSession('test-session-1');

      expect(disconnectSpy).toHaveBeenCalled();
    });

    it('should not throw when removing non-existent session', () => {
      expect(() => {
        AgentSessionManager.removeSession('non-existent');
      }).not.toThrow();
    });
  });

  describe('getSession', () => {
    it('should return the session when it exists', () => {
      const config: SessionConfig = { sessionId: 'test-session-1' };
      const session = new MockAgentSession(config);

      AgentSessionManager.addSession(session);

      expect(AgentSessionManager.getSession('test-session-1')).toBe(session);
    });

    it('should return null when session does not exist', () => {
      expect(AgentSessionManager.getSession('non-existent')).toBeNull();
    });
  });

  describe('getAllSessions', () => {
    it('should return empty array when no sessions', () => {
      expect(AgentSessionManager.getAllSessions()).toEqual([]);
    });

    it('should return all sessions', () => {
      const config1: SessionConfig = { sessionId: 'test-session-1' };
      const config2: SessionConfig = { sessionId: 'test-session-2' };
      const session1 = new MockAgentSession(config1);
      const session2 = new MockAgentSession(config2);

      AgentSessionManager.addSession(session1);
      AgentSessionManager.addSession(session2);

      const sessions = AgentSessionManager.getAllSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions).toContain(session1);
      expect(sessions).toContain(session2);
    });

    it('should return a copy of sessions array', () => {
      const config: SessionConfig = { sessionId: 'test-session-1' };
      const session = new MockAgentSession(config);

      AgentSessionManager.addSession(session);
      const sessions1 = AgentSessionManager.getAllSessions();
      const sessions2 = AgentSessionManager.getAllSessions();

      expect(sessions1).not.toBe(sessions2);
    });
  });

  describe('getSessionCount', () => {
    it('should return 0 when no sessions', () => {
      expect(AgentSessionManager.getSessionCount()).toBe(0);
    });

    it('should return correct count', () => {
      const config1: SessionConfig = { sessionId: 'test-session-1' };
      const config2: SessionConfig = { sessionId: 'test-session-2' };
      const config3: SessionConfig = { sessionId: 'test-session-3' };

      AgentSessionManager.addSession(new MockAgentSession(config1));
      expect(AgentSessionManager.getSessionCount()).toBe(1);

      AgentSessionManager.addSession(new MockAgentSession(config2));
      AgentSessionManager.addSession(new MockAgentSession(config3));
      expect(AgentSessionManager.getSessionCount()).toBe(3);
    });
  });

  describe('clearAllSessions', () => {
    it('should remove all sessions', () => {
      const config1: SessionConfig = { sessionId: 'test-session-1' };
      const config2: SessionConfig = { sessionId: 'test-session-2' };

      AgentSessionManager.addSession(new MockAgentSession(config1));
      AgentSessionManager.addSession(new MockAgentSession(config2));

      expect(AgentSessionManager.getSessionCount()).toBe(2);

      AgentSessionManager.clearAllSessions();

      expect(AgentSessionManager.getSessionCount()).toBe(0);
      expect(AgentSessionManager.getAllSessions()).toEqual([]);
    });

    it('should call disconnect on all sessions', () => {
      const config1: SessionConfig = { sessionId: 'test-session-1' };
      const config2: SessionConfig = { sessionId: 'test-session-2' };
      const session1 = new MockAgentSession(config1);
      const session2 = new MockAgentSession(config2);

      const disconnectSpy1 = vi.spyOn(session1, 'disconnect');
      const disconnectSpy2 = vi.spyOn(session2, 'disconnect');

      AgentSessionManager.addSession(session1);
      AgentSessionManager.addSession(session2);

      AgentSessionManager.clearAllSessions();

      expect(disconnectSpy1).toHaveBeenCalled();
      expect(disconnectSpy2).toHaveBeenCalled();
    });

    it('should handle empty sessions gracefully', () => {
      expect(() => {
        AgentSessionManager.clearAllSessions();
      }).not.toThrow();
    });
  });
});
