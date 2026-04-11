import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  base_url: process.env.BASE_URL || '/api',
  data_dictionary_folder: process.env.DATA_DICTIONARY_FOLDER || '/app/databot/dictionary',
  work_folder: process.env.WORK_FOLDER || '/app/databot/workfolder',
  knowledge_folder: process.env.KNOWLEDGE_FOLDER || '/app/databot/knowledge',
  context_compress_ratio: Math.max(
    0,
    Math.min(1, parseFloat(process.env.CONTEXT_COMPRESS_RATIO || '0.7') || 0.7)
  ),
  log: {
    dir: process.env.LOG_DIR || '/app/databot/logs',
    file: process.env.LOG_FILE || 'app.log',
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10),
    maxSize: process.env.LOG_MAX_SIZE || '20m',
  },
  websocket: {
    enabled: process.env.WS_ENABLED !== 'false',
    path: process.env.WS_PATH || '/ws',
    heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),
    heartbeatTimeout: parseInt(process.env.WS_HEARTBEAT_TIMEOUT || '30000', 10),
    maxMissedHeartbeats: parseInt(process.env.WS_MAX_MISSED_HEARTBEATS || '3', 10),
  },
  sandbox: {
    containerName: process.env.SANDBOX_CONTAINER_NAME || 'databot-sandbox-worker',
    defaultWorkDir: process.env.SANDBOX_DEFAULT_WORKDIR || '/app/databot/workfolder',
    user: process.env.SANDBOX_USER || 'agent',
    timeout: parseInt(process.env.SANDBOX_TIMEOUT || '120000', 10),
  },
  upload: {
    directory: process.env.UPLOAD_DIR || '/app/databot/uploads',
    maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE || '52428800', 10), // 50MB
  },
  workspaceCleanup: {
    intervalMs: parseInt(process.env.WORKSPACE_CLEANUP_INTERVAL_MS || '21600000', 10), // 6 hours
    maxAgeMs: parseInt(process.env.WORKSPACE_CLEANUP_MAX_AGE_MS || '86400000', 10), // 1 day
  },
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'databot',
    user: process.env.POSTGRES_USER || 'databot',
    password: process.env.POSTGRES_PASSWORD || 'databot',
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY || '',
  },
  datasource: {
    defaultQueryTimeout: parseInt(process.env.DATASOURCE_QUERY_TIMEOUT || '120000', 10), // 2 minutes
  },
  llm: {
    requestTimeout: parseInt(process.env.LLM_REQUEST_TIMEOUT || '180000', 10), // 3 minutes
  },
  bridge: {
    url: process.env.BRIDGE_URL || 'http://localhost:8080',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-dev-secret-change-in-production',
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '2h',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
    cookieSecure: process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production',
  },
  admin: {
    initialPassword: process.env.ADMIN_INITIAL_PASSWORD || 'Admin@123',
    email: process.env.ADMIN_EMAIL || 'admin@localhost',
  },
  internal: {
    port: parseInt(process.env.INTERNAL_PORT || '3001', 10),
  },
};

/**
 * Validate critical configuration values at startup.
 * Uses console.warn to avoid circular dependency with logger.
 */
export function validateConfig(): void {
  const warnings: string[] = [];

  if (!config.encryption.key) {
    warnings.push('ENCRYPTION_KEY is not set — database password encryption will fail');
  } else if (config.encryption.key.length !== 64 || !/^[0-9a-fA-F]+$/.test(config.encryption.key)) {
    warnings.push('ENCRYPTION_KEY must be a 64-character hex string (AES-256)');
  }

  if (
    config.jwt.secret === 'fallback-dev-secret-change-in-production' &&
    config.env === 'production'
  ) {
    console.warn(
      'WARNING: JWT_SECRET is using fallback value in production. Set JWT_SECRET env var.'
    );
  }

  for (const warning of warnings) {
    console.warn(`[config] WARNING: ${warning}`);
  }
}
