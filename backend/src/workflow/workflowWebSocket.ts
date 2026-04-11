import type { Application } from 'express';
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import logger from '../utils/logger';
import { config } from '../base/config';
import { registerProgressCallback, unregisterProgressCallback } from './executionEngine';
import type { WsWorkflowEvent } from './workflow.types';
import { waitForWsAuth } from '../auth/wsAuth';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Initialize workflow execution WebSocket route using express-ws.
 * Must be called AFTER express-ws has been initialized on the app.
 * Sends real-time node execution progress events to connected clients.
 */
export function initWorkflowWebSocket(app: Application): void {
  const wsApp = app as Application & {
    ws(route: string, handler: (ws: WebSocket, req: IncomingMessage) => void): void;
  };

  wsApp.ws(`${config.websocket.path}/workflow`, (ws: WebSocket, req: IncomingMessage) => {
    // Require auth handshake before proceeding
    waitForWsAuth(ws)
      .then(() => {
        const url = new globalThis.URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
        const runId = url.searchParams.get('runId');

        if (!runId) {
          ws.close(4000, 'runId query parameter is required');
          return;
        }

        if (!UUID_REGEX.test(runId)) {
          ws.close(4001, 'runId must be a valid UUID');
          return;
        }

        logger.info('Workflow WebSocket connected', { runId });

        // Register progress callback for this run
        const callback = (event: WsWorkflowEvent): void => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(event));
          }
        };
        registerProgressCallback(runId, callback);

        // Handle ping/pong for keep-alive
        ws.on('message', (data: Buffer) => {
          const message = data.toString();
          if (message === 'ping') {
            ws.send('pong');
          }
        });

        ws.on('close', () => {
          unregisterProgressCallback(runId);
          logger.info('Workflow WebSocket disconnected', { runId });
        });

        ws.on('error', (error: Error) => {
          logger.error('Workflow WebSocket error', { runId, error: String(error) });
          unregisterProgressCallback(runId);
        });
      })
      .catch(() => {
        // Auth failed — socket already closed by waitForWsAuth
      });
  });

  logger.info('Workflow WebSocket route initialized', {
    path: `${config.websocket.path}/workflow`,
  });
}
