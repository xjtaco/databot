import type { Application } from 'express';
import expressWs from 'express-ws';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import logger from '../utils/logger';
import { CoreAgentSession, AgentSessionManager } from './';
import { config } from '../base/config';
import type { SessionConfig } from './';
import { getSession } from '../chatSession/chatSession.service';
import { waitForWsAuth } from '../auth/wsAuth';

/**
 * WebSocket routes module.
 * Handles WebSocket connections for agent sessions.
 */

/**
 * Initialize WebSocket routes.
 */
export default function initWebsockets(app: Application): void {
  // Initialize express-ws
  const wsInstance = expressWs(app);

  // Check if WebSocket is enabled
  if (!config.websocket.enabled) {
    logger.info('WebSocket is disabled');
    return;
  }

  // Get the WebSocket-enabled app
  const wsApp = wsInstance.app as Application & {
    ws(route: string, handler: (ws: WebSocket, req: IncomingMessage) => void): void;
  };

  // Agent connection endpoint
  wsApp.ws(`${config.websocket.path}/agent`, (ws: WebSocket, req: IncomingMessage) => {
    // Require auth handshake before proceeding
    waitForWsAuth(ws)
      .then(() => {
        // Generate unique session ID using crypto.randomUUID()
        const sessionId = globalThis.crypto.randomUUID();

        // Get client IP
        const clientIp = req.socket.remoteAddress || 'unknown';

        logger.info('WebSocket connection established', {
          sessionId,
          clientIp,
          userAgent: req.headers['user-agent'],
        });

        // Extract optional chatSessionId from query parameters
        const parsedUrl = new globalThis.URL(
          req.url || '',
          `http://${req.headers.host || 'localhost'}`
        );
        const requestedSessionId = parsedUrl.searchParams.get('sessionId');

        /**
         * Attach the WebSocket to a CoreAgentSession and wire up lifecycle handlers.
         */
        function setupSession(chatSessionId: string | undefined): void {
          try {
            const sessionConfig: SessionConfig = {
              sessionId,
              chatSessionId,
              heartbeatInterval: config.websocket.heartbeatInterval,
              heartbeatTimeout: config.websocket.heartbeatTimeout,
              maxMissedHeartbeats: config.websocket.maxMissedHeartbeats,
            };

            const session = new CoreAgentSession(sessionConfig);
            AgentSessionManager.addSession(session);
            session.connect(ws);

            ws.on('close', () => {
              logger.info('WebSocket disconnected', { sessionId });
              AgentSessionManager.removeSession(sessionId);
            });
          } catch (error) {
            logger.error('Failed to establish WebSocket connection', { error });
            ws.close();
          }
        }

        if (requestedSessionId) {
          // Async path: buffer messages while looking up the existing session
          const messageBuffer: Buffer[] = [];
          const bufferHandler = (data: Buffer) => {
            messageBuffer.push(data);
          };
          ws.on('message', bufferHandler);

          getSession(requestedSessionId)
            .then((existing) => existing.id)
            .catch(() => {
              logger.info('Requested chat session not found', { requestedSessionId });
              return undefined;
            })
            .then((chatSessionId) => {
              ws.removeListener('message', bufferHandler);
              setupSession(chatSessionId);

              // Replay any messages that arrived during the async lookup
              for (const msg of messageBuffer) {
                ws.emit('message', msg);
              }
            })
            .catch((error: unknown) => {
              logger.error('Failed to establish WebSocket connection', { error });
              ws.close();
            });
        } else {
          // Synchronous path: no DB lookup needed, attach session immediately
          setupSession(undefined);
        }
      })
      .catch(() => {
        // Auth failed — socket already closed by waitForWsAuth
      });
  });

  logger.info('WebSocket routes initialized', { path: config.websocket.path });
}
