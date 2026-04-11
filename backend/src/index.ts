import express, { Application } from 'express';
import cookieParser from 'cookie-parser';
import logger from './utils/logger';
import { requestLogger } from './middleware/requestLogger';

// Routes
import apiRoutes from './routes/api';
import initWebsockets from './agent/websockets';
import { config, validateConfig } from './base/config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { initDatabase, closeDatabase } from './infrastructure/database';
import { LLMProviderFactory } from './infrastructure/llm';
import { getLLMConfig } from './globalConfig';
import {
  initWorkflowWebSocket,
  startWorkspaceCleanup,
  stopWorkspaceCleanup,
  initScheduleEngine,
  stopAllSchedules,
} from './workflow';
import { initCopilotWebSocket, initDebugWebSocket } from './copilot';
import { initializeAdmin } from './auth/adminInit';
import { startInternalServer } from './internal/internalServer';
import { startCleanupJob, stopCleanupJob } from './auditLog';

const app: Application = express();
const PORT = config.port || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(requestLogger);

// Initialize WebSocket routes (must be before other middleware)
// express-ws must be initialized first (via initWebsockets), then other ws routes can use it
initWebsockets(app);
initCopilotWebSocket(app);
initDebugWebSocket(app);
initWorkflowWebSocket(app);

app.use(config.base_url, apiRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Graceful shutdown handler
function setupGracefulShutdown(server: ReturnType<Application['listen']>): void {
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    stopWorkspaceCleanup();
    stopAllSchedules();
    stopCleanupJob();

    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        await closeDatabase();
        logger.info('Database connection closed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start server with database initialization
async function startServer(): Promise<void> {
  try {
    validateConfig();

    // Initialize database connection (Prisma manages migrations via CLI)
    await initDatabase();
    logger.info('Database connection established');

    // Initialize admin user (creates default admin if none exists)
    await initializeAdmin();

    // Pre-load LLM config from database (falls back to defaults if not configured)
    try {
      const llmConfig = await getLLMConfig();
      LLMProviderFactory.setConfig(llmConfig);
    } catch (err: unknown) {
      logger.warn('Failed to load LLM config from DB, using defaults', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`Server is running on http://localhost:${PORT}`);
      logger.info(`WebSocket endpoint: ws://localhost:${PORT}${config.websocket.path}/agent`);
    });

    // Start internal server (admin reset endpoint)
    startInternalServer();

    // Start periodic workspace cleanup
    startWorkspaceCleanup();
    await initScheduleEngine();
    startCleanupJob();

    setupGracefulShutdown(server);
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

startServer();
