import type { Application } from 'express';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import logger from '../utils/logger';
import { config } from '../base/config';
import { createDebugAgent, DebugAgent } from './debugAgent';
import type { CopilotClientMessage, CopilotServerMessage } from './copilot.types';
import { waitForWsAuth } from '../auth/wsAuth';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Initialize Debug WebSocket route using express-ws.
 * Must be called AFTER express-ws has been initialized on the app.
 */
export function initDebugWebSocket(app: Application): void {
  const wsApp = app as Application & {
    ws(route: string, handler: (ws: WebSocket, req: IncomingMessage) => void): void;
  };

  wsApp.ws(`${config.websocket.path}/custom-node-debug`, (ws: WebSocket, req: IncomingMessage) => {
    // Require auth handshake before proceeding
    waitForWsAuth(ws)
      .then(() => {
        const url = new globalThis.URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
        const templateId = url.searchParams.get('templateId');

        if (!templateId) {
          ws.close(4000, 'templateId query parameter is required');
          return;
        }

        if (!UUID_REGEX.test(templateId)) {
          ws.close(4001, 'templateId must be a valid UUID');
          return;
        }

        const locale = url.searchParams.get('locale') ?? 'zh-CN';
        logger.info('Debug WebSocket connected', { templateId, locale });

        // Create sendEvent callback
        const sendEvent = (event: CopilotServerMessage): void => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(event));
          }
        };

        // Agent is created asynchronously; buffer messages until ready
        let agent: DebugAgent | null = null;
        let initError: string | null = null;
        const pendingMessages: string[] = [];

        const processMessage = (raw: string): void => {
          if (raw === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }

          const message = JSON.parse(raw) as CopilotClientMessage;

          switch (message.type) {
            case 'user_message':
              if (!agent) {
                sendEvent({ type: 'error', message: initError ?? 'Debug agent is not ready yet' });
                return;
              }
              agent.handleUserMessage(message.content).catch((err: unknown) => {
                logger.error('Debug handleUserMessage error', {
                  templateId,
                  error: err instanceof Error ? err.message : String(err),
                });
              });
              break;

            case 'execute_node':
              if (!agent) {
                sendEvent({ type: 'error', message: initError ?? 'Debug agent is not ready yet' });
                return;
              }
              agent.executeNodeDirectly(message.nodeId).catch((err: unknown) => {
                logger.error('Debug executeNodeDirectly error', {
                  templateId,
                  error: err instanceof Error ? err.message : String(err),
                });
              });
              break;

            case 'abort':
              if (agent) {
                agent.abort();
              }
              break;

            case 'ping':
              sendEvent({ type: 'pong' });
              break;

            default:
              logger.warn('Unknown debug message type', { raw });
          }
        };

        // Initialize agent asynchronously
        createDebugAgent(templateId, sendEvent, locale)
          .then((createdAgent) => {
            agent = createdAgent;
            logger.info('Debug agent initialized', { templateId });

            // Process any messages that arrived before agent was ready
            for (const raw of pendingMessages) {
              try {
                processMessage(raw);
              } catch (err) {
                logger.error('Failed to process buffered debug message', {
                  templateId,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
            pendingMessages.length = 0;
          })
          .catch((err: unknown) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error('Failed to initialize debug agent', { templateId, error: errorMessage });
            initError = errorMessage;
            sendEvent({
              type: 'error',
              message: `Failed to initialize debug agent: ${errorMessage}`,
            });
            ws.close(4002, 'Failed to initialize debug agent');
          });

        // Handle incoming messages
        ws.on('message', (data: Buffer) => {
          try {
            const raw = data.toString();

            // Buffer messages if agent is not yet ready
            if (!agent && !initError) {
              pendingMessages.push(raw);
              return;
            }

            processMessage(raw);
          } catch (err) {
            logger.error('Failed to parse debug message', {
              templateId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });

        ws.on('close', () => {
          logger.info('Debug WebSocket disconnected', { templateId });
          if (agent) {
            agent.abort();
            agent.cleanup();
          }
        });

        ws.on('error', (error: Error) => {
          logger.error('Debug WebSocket error', { templateId, error: String(error) });
        });
      })
      .catch(() => {
        // Auth failed — socket already closed by waitForWsAuth
      });
  });

  logger.info('Debug WebSocket route initialized', {
    path: `${config.websocket.path}/custom-node-debug`,
  });
}
