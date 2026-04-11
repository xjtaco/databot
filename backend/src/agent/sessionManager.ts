import logger from '../utils/logger';
import { SessionError } from '../errors/types';
import type { AgentSession } from './base';

/**
 * Singleton manager for agent sessions.
 * Provides centralized session lifecycle management.
 */
class AgentSessionManagerClass {
  private sessions: Map<string, AgentSession>;
  private static instance: AgentSessionManagerClass;

  private constructor() {
    this.sessions = new Map();
    logger.info('AgentSessionManager initialized');
  }

  /**
   * Get the singleton instance of AgentSessionManager.
   */
  static getInstance(): AgentSessionManagerClass {
    if (!AgentSessionManagerClass.instance) {
      AgentSessionManagerClass.instance = new AgentSessionManagerClass();
    }
    return AgentSessionManagerClass.instance;
  }

  /**
   * Add a session to the manager.
   * @throws {SessionError} if a session with the same ID already exists
   */
  addSession(session: AgentSession): void {
    const sessionId = session.getSessionId();

    if (this.sessions.has(sessionId)) {
      throw new SessionError(`Session with ID ${sessionId} already exists`);
    }

    this.sessions.set(sessionId, session);
    logger.info('Session added to manager', { sessionId });
  }

  /**
   * Remove a session from the manager.
   * Calls disconnect() on the session before removal.
   */
  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn('Session not found in manager', { sessionId });
      return;
    }

    session.disconnect();
    this.sessions.delete(sessionId);
    logger.info('Session removed from manager', { sessionId });
  }

  /**
   * Get a session by ID.
   * Returns null if the session doesn't exist.
   */
  getSession(sessionId: string): AgentSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all active sessions.
   * Returns a new array containing session references (not deep copies).
   * The array itself is new but the AgentSession objects are shared references.
   */
  getAllSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get the number of active sessions.
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clear all sessions.
   * Calls disconnect() on all sessions before clearing.
   */
  clearAllSessions(): void {
    const count = this.sessions.size;

    for (const session of this.sessions.values()) {
      session.disconnect();
    }

    this.sessions.clear();
    logger.info('All sessions cleared', { count });
  }
}

// Export singleton instance
export const AgentSessionManager = AgentSessionManagerClass.getInstance();
