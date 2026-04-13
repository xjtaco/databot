import type { Application } from 'express';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import logger from '../utils/logger';
import { config } from '../base/config';
import { CopilotAgent } from './copilotAgent';
import type { CopilotClientMessage, CopilotServerMessage } from './copilot.types';
import { waitForWsAuth } from '../auth/wsAuth';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Initialize Copilot WebSocket route using express-ws (same pattern as agent websockets).
 * Must be called AFTER express-ws has been initialized on the app.
 */
export function initCopilotWebSocket(app: Application): void {
  const wsApp = app as Application & {
    ws(route: string, handler: (ws: WebSocket, req: IncomingMessage) => void): void;
  };

  wsApp.ws(`${config.websocket.path}/copilot`, (ws: WebSocket, req: IncomingMessage) => {
    // Require auth handshake before proceeding
    waitForWsAuth(ws)
      .then(() => {
        const url = new globalThis.URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
        const workflowId = url.searchParams.get('workflowId');

        if (!workflowId) {
          ws.close(4000, 'workflowId query parameter is required');
          return;
        }

        if (!UUID_REGEX.test(workflowId)) {
          ws.close(4001, 'workflowId must be a valid UUID');
          return;
        }

        const locale = url.searchParams.get('locale') ?? 'zh-CN';
        logger.info('Copilot WebSocket connected', { workflowId, locale });

        // Create agent instance with sendEvent callback
        const sendEvent = (event: CopilotServerMessage): void => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(event));
          }
        };
        const agent = new CopilotAgent(workflowId, sendEvent, locale);

        // Handle incoming messages
        ws.on('message', (data: Buffer) => {
          try {
            const raw = data.toString();

            // Handle plain string ping
            if (raw === 'ping') {
              ws.send(JSON.stringify({ type: 'pong' }));
              return;
            }

            const message = JSON.parse(raw) as CopilotClientMessage;

            switch (message.type) {
              case 'user_message':
                agent.handleUserMessage(message.content).catch((err: unknown) => {
                  logger.error('Copilot handleUserMessage error', {
                    workflowId,
                    error: err instanceof Error ? err.message : String(err),
                  });
                });
                break;

              case 'abort':
                agent.abort();
                break;

              case 'ping':
                sendEvent({ type: 'pong' });
                break;

              case 'layout_session':
                agent.setHasManualLayoutEdits(message.hasManualLayoutEdits);
                break;

              default:
                logger.warn('Unknown copilot message type', { raw });
            }
          } catch (err) {
            logger.error('Failed to parse copilot message', {
              workflowId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });

        ws.on('close', () => {
          agent.abort();
          agent.dispose();
          logger.info('Copilot WebSocket disconnected', { workflowId });
        });

        ws.on('error', (error: Error) => {
          logger.error('Copilot WebSocket error', { workflowId, error: String(error) });
        });
      })
      .catch(() => {
        // Auth failed — socket already closed by waitForWsAuth
      });
  });

  logger.info('Copilot WebSocket route initialized', { path: `${config.websocket.path}/copilot` });
}
