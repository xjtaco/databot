import type { WebSocket } from 'ws';
import logger from '../utils/logger';
import { SessionError } from '../errors/types';
import { ValidMessageTypes, SessionConfig, SessionState, WsMessage } from './types';
import { LLMProvider } from '../infrastructure/llm/base';
import { LLMProviderFactory } from '../infrastructure/llm';

/**
 * Abstract base class for agent session management.
 * Provides common functionality for WebSocket communication, heartbeat monitoring, and lifecycle management.
 */
export abstract class AgentSession {
  protected config: SessionConfig;
  protected state: SessionState;
  protected llm: LLMProvider;
  protected ws: WebSocket | null;
  protected heartbeatTimer: NodeJS.Timeout | null;
  protected missedHeartbeats: number;
  protected heartbeatTimeoutTimer: NodeJS.Timeout | null;

  constructor(config: SessionConfig) {
    this.config = config;
    this.state = 'connecting';
    this.llm = LLMProviderFactory.getProvider();
    this.ws = null;
    this.heartbeatTimer = null;
    this.heartbeatTimeoutTimer = null;
    this.missedHeartbeats = 0;
  }

  /**
   * Start heartbeat monitoring.
   * Sends ping messages at configured intervals.
   */
  protected startHeartbeat(): void {
    const interval = this.config.heartbeatInterval || 30000;

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, interval);

    logger.debug('Heartbeat started', { sessionId: this.config.sessionId, interval });
  }

  /**
   * Send a ping heartbeat message.
   */
  protected sendHeartbeat(): void {
    this.sendMessage({ type: 'ping', timestamp: Date.now() });

    // Clear existing timeout before setting a new one to prevent stacking
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
    }

    // Set timeout for pong response
    const timeout = this.config.heartbeatTimeout || 30000;
    this.heartbeatTimeoutTimer = setTimeout(() => {
      this.missedHeartbeats++;
      logger.warn('Heartbeat timeout', {
        sessionId: this.config.sessionId,
        missedCount: this.missedHeartbeats,
      });

      if (this.missedHeartbeats >= (this.config.maxMissedHeartbeats || 3)) {
        logger.error('Max missed heartbeats reached, disconnecting', {
          sessionId: this.config.sessionId,
        });
        this.state = 'error';
        this.disconnect();
      }
    }, timeout);
  }

  /**
   * Handle incoming heartbeat message (pong).
   */
  protected onHeartbeatMessage(message: WsMessage): void {
    if (message.type === 'pong') {
      // Clear the timeout timer
      if (this.heartbeatTimeoutTimer) {
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null;
      }

      // Reset missed heartbeats counter
      if (this.missedHeartbeats > 0) {
        logger.debug('Heartbeat recovered', {
          sessionId: this.config.sessionId,
          missedCount: this.missedHeartbeats,
        });
        this.missedHeartbeats = 0;
      }
    }
  }

  /**
   * Stop heartbeat monitoring.
   */
  protected stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger.debug('Heartbeat stopped', { sessionId: this.config.sessionId });
    }

    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  /**
   * Validate message structure and content.
   * Returns true if valid, false otherwise.
   */
  protected validateMessage(message: unknown): message is WsMessage {
    // Check if message is an object
    if (typeof message !== 'object' || message === null) {
      logger.warn('Invalid message: not an object', { sessionId: this.config.sessionId });
      return false;
    }

    const msg = message as Partial<WsMessage>;

    // Validate type field
    if (!msg.type || typeof msg.type !== 'string') {
      logger.warn('Invalid message: missing or invalid type field', {
        sessionId: this.config.sessionId,
      });
      return false;
    }

    // Validate timestamp field
    if (typeof msg.timestamp !== 'number') {
      logger.warn('Invalid message: timestamp is not a number', {
        sessionId: this.config.sessionId,
      });
      return false;
    }

    // Validate timestamp is within reasonable range (not too far in past or future)
    const now = Date.now();
    const maxTimeDrift = 5 * 60 * 1000; // 5 minutes
    if (msg.timestamp < now - maxTimeDrift || msg.timestamp > now + maxTimeDrift) {
      logger.warn('Invalid message: timestamp out of reasonable range', {
        sessionId: this.config.sessionId,
        timestamp: msg.timestamp,
        now,
      });
      return false;
    }

    // Validate known message types
    if (!ValidMessageTypes.includes(msg.type)) {
      logger.warn('Invalid message: unknown message type', {
        sessionId: this.config.sessionId,
        type: msg.type,
      });
      return false;
    }

    return true;
  }

  /**
   * Send a message via WebSocket.
   * @throws {SessionError} if WebSocket is not connected
   */
  protected sendMessage(message: WsMessage): void {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) {
      throw new SessionError(
        `Cannot send message: WebSocket is ${this.ws ? 'not open' : 'not connected'}`,
        { state: this.state }
      );
    }

    this.ws.send(JSON.stringify(message));
    logger.debug('Message sent', {
      sessionId: this.config.sessionId,
      type: message.type,
      data: message.data,
    });
  }

  /**
   * Handle incoming WebSocket message.
   * Subclasses must implement this method to handle specific message types.
   */
  protected abstract onMessage(message: WsMessage): void;

  /**
   * Attach WebSocket connection to this session.
   */
  connect(ws: WebSocket): void {
    this.ws = ws;
    this.state = 'connected';

    // Attach event listeners
    ws.on('message', (data: Buffer) => {
      try {
        const message: unknown = JSON.parse(data.toString());

        // Validate message structure and content
        if (!this.validateMessage(message)) {
          return;
        }

        const validMessage = message as WsMessage;

        // Handle heartbeat messages
        if (validMessage.type === 'pong') {
          this.onHeartbeatMessage(validMessage);
          return;
        }

        // Delegate to subclass
        this.onMessage(validMessage);
      } catch (error) {
        logger.error('Failed to parse message', {
          sessionId: this.config.sessionId,
          error,
          data: data.toString(),
        });
      }
    });

    ws.on('close', (code: number, reason: Buffer) => {
      logger.info('WebSocket closed', {
        sessionId: this.config.sessionId,
        code,
        reason: reason.toString(),
      });
      this.state = 'disconnected';
      this.stopHeartbeat();
    });

    ws.on('error', (error: Error) => {
      logger.error('WebSocket error', { sessionId: this.config.sessionId, error });
      this.state = 'error';
    });

    // Start heartbeat
    this.startHeartbeat();

    logger.info('Session connected', { sessionId: this.config.sessionId });
  }

  /**
   * Disconnect and cleanup resources.
   * Safe to call multiple times - checks WebSocket state before closing.
   */
  disconnect(): void {
    this.stopHeartbeat();

    if (this.ws && this.ws.readyState === this.ws.OPEN) {
      this.ws.close();
    }

    this.ws = null;
    this.state = 'disconnected';
    logger.info('Session disconnected', { sessionId: this.config.sessionId });
  }

  /**
   * Get the current session state.
   */
  getState(): SessionState {
    return this.state;
  }

  /**
   * Get the session ID.
   */
  getSessionId(): string {
    return this.config.sessionId;
  }
}
