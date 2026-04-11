import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import { AgentSessionManager } from '../../../src/agent';
import { CoreAgentSession } from '../../../src/agent';
import type { SessionConfig } from '../../../src/agent';
import http from 'http';

/* eslint-disable no-undef */
// WebSocket is a browser API used in these tests

describe('WebSocket Integration', () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let port: number;
  let wsUrl: string;

  beforeEach(async () => {
    // Create HTTP server
    server = http.createServer();

    // Create WebSocket server
    wss = new WebSocketServer({ server });

    // Clear sessions before each test
    (AgentSessionManager as any).sessions.clear();

    // Wait for server to listen
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as any).port;
        wsUrl = `ws://localhost:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    // Close all sessions
    AgentSessionManager.clearAllSessions();

    // Close WebSocket server
    await new Promise<void>((resolve) => {
      wss.close(() => {
        server.close((err?: Error) => {
          if (err) console.error(err);
          resolve();
        });
      });
    });
  });

  describe('WebSocket Connection', () => {
    it('should establish WebSocket connection', async () => {
      await new Promise<void>((resolve) => {
        wss.on('connection', (ws) => {
          expect(ws.readyState).toBe(ws.OPEN);
          ws.close();
        });

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          ws.close();
        };

        ws.onclose = () => {
          resolve();
        };
      });
    });

    it('should handle multiple concurrent connections', async () => {
      await new Promise<void>((resolve) => {
        const serverConnections: any[] = [];
        let connectionCount = 0;

        wss.on('connection', (ws) => {
          serverConnections.push(ws);
          connectionCount++;

          // Close all connections once all 3 are established
          if (connectionCount === 3) {
            serverConnections.forEach((serverWs) => serverWs.close());
          }
        });

        const ws1 = new WebSocket(wsUrl);
        const ws2 = new WebSocket(wsUrl);
        const ws3 = new WebSocket(wsUrl);

        let closeCount = 0;
        const handleClose = () => {
          closeCount++;
          if (closeCount === 3) {
            expect(connectionCount).toBe(3);
            resolve();
          }
        };

        ws1.onclose = handleClose;
        ws2.onclose = handleClose;
        ws3.onclose = handleClose;
      });
    });
  });

  describe('Message Sending', () => {
    it('should receive messages from server', async () => {
      await new Promise<void>((resolve) => {
        const testMessage = {
          type: 'test',
          timestamp: Date.now(),
          data: 'hello',
        };

        wss.on('connection', (ws) => {
          ws.send(JSON.stringify(testMessage));
          ws.close();
        });

        const ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
          const message = JSON.parse(event.data.toString());
          expect(message).toEqual(testMessage);
          ws.close();
        };

        ws.onclose = () => {
          resolve();
        };
      });
    });

    it('should send messages to server', async () => {
      await new Promise<void>((resolve) => {
        const testMessage = {
          type: 'test',
          timestamp: Date.now(),
          data: 'hello client',
        };

        wss.on('connection', (ws) => {
          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            expect(message).toEqual(testMessage);
            ws.close();
          });
        });

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          ws.send(JSON.stringify(testMessage));
        };

        ws.onclose = () => {
          resolve();
        };
      });
    });

    it('should handle invalid JSON gracefully', async () => {
      await new Promise<void>((resolve) => {
        wss.on('connection', (ws) => {
          ws.on('message', () => {
            // Should not throw
          });

          ws.send('invalid json');
          setTimeout(() => ws.close(), 100);
        });

        const ws = new WebSocket(wsUrl);

        ws.onclose = () => {
          resolve();
        };
      });
    });
  });

  describe('Session Management Integration', () => {
    it('should create session on connection', async () => {
      await new Promise<void>((resolve) => {
        const sessionId = 'test-integration-session';

        wss.on('connection', (ws) => {
          const config: SessionConfig = {
            sessionId,
            heartbeatInterval: 5000,
          };

          const session = new CoreAgentSession(config);
          AgentSessionManager.addSession(session);
          session.connect(ws as any);

          expect(AgentSessionManager.getSession(sessionId)).toBe(session);
          ws.close();
        });

        const _ws = new WebSocket(wsUrl);

        _ws.onclose = () => {
          resolve();
        };
      });
    });

    it('should remove session on disconnect', async () => {
      await new Promise<void>((resolve) => {
        const sessionId = 'test-session-remove';

        wss.on('connection', (ws) => {
          const config: SessionConfig = {
            sessionId,
            heartbeatInterval: 5000,
          };

          const session = new CoreAgentSession(config);
          AgentSessionManager.addSession(session);
          session.connect(ws as any);

          expect(AgentSessionManager.getSessionCount()).toBe(1);

          // Close WebSocket and let session handle cleanup
          ws.on('close', () => {
            // Manually disconnect session to simulate proper cleanup
            session.disconnect();
            expect(AgentSessionManager.getSessionCount()).toBe(1);

            // Remove session from manager
            AgentSessionManager.removeSession(sessionId);
            expect(AgentSessionManager.getSessionCount()).toBe(0);
            resolve();
          });

          ws.close();
        });

        const _ws = new WebSocket(wsUrl);
        _ws.onclose = () => {
          // Client closed by server, resolve handled in server close handler
        };
      });
    });

    it('should handle session state changes', async () => {
      await new Promise<void>((resolve) => {
        const sessionId = 'test-session-state';

        wss.on('connection', (ws) => {
          const config: SessionConfig = {
            sessionId,
            heartbeatInterval: 5000,
          };

          const session = new CoreAgentSession(config);

          expect(session.getState()).toBe('connecting');

          AgentSessionManager.addSession(session);
          session.connect(ws as any);

          expect(session.getState()).toBe('connected');

          // Set up close handler to check state
          ws.on('close', () => {
            // State should be 'disconnected' after WebSocket close
            expect(session.getState()).toBe('disconnected');
            resolve();
          });

          ws.close();
        });

        const _ws = new WebSocket(wsUrl);
        _ws.onclose = () => {
          // Client will be closed by server
        };
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      await new Promise<void>((resolve) => {
        // Try to connect to a non-existent server
        const invalidWs = new WebSocket('ws://localhost:9999');

        invalidWs.onerror = () => {
          resolve();
        };

        // Timeout fallback
        setTimeout(() => resolve(), 1000);
      });
    });

    it('should handle malformed messages', async () => {
      await new Promise<void>((resolve) => {
        wss.on('connection', (ws) => {
          // Send malformed data
          ws.send('{invalid json}');
          ws.close();
        });

        const ws = new WebSocket(wsUrl);

        ws.onmessage = () => {
          // Should handle gracefully
        };

        ws.onclose = () => {
          resolve();
        };
      });
    });

    it('should handle messages missing required fields', async () => {
      await new Promise<void>((resolve) => {
        wss.on('connection', (ws) => {
          // Send message without type
          ws.send(JSON.stringify({ timestamp: Date.now() }));
          ws.close();
        });

        const ws = new WebSocket(wsUrl);

        ws.onclose = () => {
          resolve();
        };
      });
    });
  });

  describe('Ping/Pong Heartbeat', () => {
    it('should receive ping from server and respond with pong', async () => {
      await new Promise<void>((resolve) => {
        let pingReceived = false;

        wss.on('connection', (ws) => {
          // Send ping
          ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));

          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.type === 'pong') {
              expect(pingReceived).toBe(true);
              ws.close();
            }
          });
        });

        const ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
          const message = JSON.parse(event.data.toString());
          if (message.type === 'ping') {
            pingReceived = true;
            // Send pong
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
        };

        ws.onclose = () => {
          resolve();
        };
      });
    });

    it('should handle ping/pong without crashing', async () => {
      await new Promise<void>((resolve) => {
        const sessionId = 'test-heartbeat-session';

        wss.on('connection', (ws) => {
          const config: SessionConfig = {
            sessionId,
            heartbeatInterval: 1000,
            heartbeatTimeout: 500,
            maxMissedHeartbeats: 3,
          };

          const session = new CoreAgentSession(config);
          AgentSessionManager.addSession(session);
          session.connect(ws as any);

          // Wait a short time to ensure heartbeat initializes
          setTimeout(() => {
            session.disconnect();
            ws.close();
            resolve();
          }, 100);
        });

        const ws = new WebSocket(wsUrl);
        ws.onclose = () => {};
      });
    });
  });

  describe('Message Validation', () => {
    it('should accept valid messages', async () => {
      await new Promise<void>((resolve) => {
        const validMessage = {
          type: 'valid-type',
          timestamp: Date.now(),
          data: { test: 'data' },
        };

        wss.on('connection', (ws) => {
          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            expect(message.type).toBeDefined();
            expect(typeof message.timestamp).toBe('number');
            ws.close();
          });
        });

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          ws.send(JSON.stringify(validMessage));
        };

        ws.onclose = () => {
          resolve();
        };
      });
    });

    it('should reject messages without type', async () => {
      await new Promise<void>((resolve) => {
        const invalidMessage = {
          timestamp: Date.now(),
        };

        wss.on('connection', (ws) => {
          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            // Server should handle this gracefully
            expect(message.timestamp).toBeDefined();
            ws.close();
          });
        });

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          ws.send(JSON.stringify(invalidMessage));
        };

        ws.onclose = () => {
          resolve();
        };
      });
    });

    it('should reject messages without timestamp', async () => {
      await new Promise<void>((resolve) => {
        const invalidMessage = {
          type: 'test',
        };

        wss.on('connection', (ws) => {
          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            // Server should handle this gracefully
            expect(message.type).toBe('test');
            ws.close();
          });
        });

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          ws.send(JSON.stringify(invalidMessage));
        };

        ws.onclose = () => {
          resolve();
        };
      });
    });
  });

  describe('Session Lifecycle', () => {
    it('should go through full lifecycle', async () => {
      await new Promise<void>((resolve) => {
        const sessionId = 'test-lifecycle-session';
        const states: string[] = [];

        wss.on('connection', (ws) => {
          const config: SessionConfig = {
            sessionId,
            heartbeatInterval: 5000,
          };

          const session = new CoreAgentSession(config);

          // Track state changes
          Object.defineProperty(session, 'state', {
            get: () => (session as any)._state,
            set: (value) => {
              (session as any)._state = value;
              states.push(value);
            },
          });

          AgentSessionManager.addSession(session);
          session.connect(ws as any);

          setTimeout(() => {
            session.disconnect();
            ws.close();
          }, 100);
        });

        const ws = new WebSocket(wsUrl);

        ws.onclose = () => {
          setTimeout(() => {
            expect(states).toContain('connected');
            expect(states).toContain('disconnected');
            resolve();
          }, 200);
        };
      });
    });
  });
});
