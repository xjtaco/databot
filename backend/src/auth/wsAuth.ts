import type { WebSocket } from 'ws';
import { verifyAccessToken, type TokenPayload } from './authService';
import logger from '../utils/logger';

const AUTH_TIMEOUT_MS = 5000;

interface AuthMessage {
  type: 'auth';
  token: string;
}

function isAuthMessage(data: unknown): data is AuthMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>).type === 'auth' &&
    typeof (data as Record<string, unknown>).token === 'string'
  );
}

/**
 * Wait for the first message on a WebSocket to be an auth handshake.
 * Resolves with the verified TokenPayload on success.
 * Closes the socket (code 1008) and rejects on failure or timeout.
 */
export function waitForWsAuth(ws: WebSocket): Promise<TokenPayload> {
  return new Promise<TokenPayload>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      logger.warn('WebSocket auth handshake timed out');
      ws.close(1008, 'Unauthorized');
      reject(new Error('Auth timeout'));
    }, AUTH_TIMEOUT_MS);

    const onMessage = (data: Buffer): void => {
      cleanup();

      try {
        const parsed: unknown = JSON.parse(data.toString());
        if (!isAuthMessage(parsed)) {
          logger.warn('WebSocket auth: first message is not an auth message');
          ws.close(1008, 'Unauthorized');
          reject(new Error('Invalid auth message'));
          return;
        }

        const payload = verifyAccessToken(parsed.token);
        ws.send(JSON.stringify({ type: 'auth_success' }));
        resolve(payload);
      } catch (err) {
        logger.warn('WebSocket auth failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        ws.close(1008, 'Unauthorized');
        reject(new Error('Auth failed'));
      }
    };

    const onClose = (): void => {
      cleanup();
      reject(new Error('WebSocket closed before auth'));
    };

    function cleanup(): void {
      clearTimeout(timer);
      ws.removeListener('message', onMessage);
      ws.removeListener('close', onClose);
    }

    ws.on('message', onMessage);
    ws.on('close', onClose);
  });
}
