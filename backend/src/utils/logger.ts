import path from 'path';
import winston from 'winston';
import { config } from '../base/config';

const { combine, timestamp, printf, colorize } = winston.format;

// Maximum log message length (4KB)
const MAX_LOG_LENGTH = 4096;

// Truncate log message if it exceeds max length
function truncateLog(log: string): string {
  if (log.length <= MAX_LOG_LENGTH) {
    return log;
  }
  return log.slice(0, MAX_LOG_LENGTH - 3) + '...';
}

// Get caller file and line number from stack trace
function getCallerInfo(): string {
  const originalPrepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = (_, stack) => stack;
  const err = new Error();
  const stack = err.stack as unknown as NodeJS.CallSite[];
  Error.prepareStackTrace = originalPrepareStackTrace;

  if (!stack) return 'unknown';

  const thisFile = stack[0]?.getFileName() ?? '';

  // Walk up the stack to find the first frame outside this logger file
  for (let i = 1; i < stack.length; i++) {
    const fileName = stack[i].getFileName();
    if (fileName && fileName !== thisFile && !fileName.startsWith('node:')) {
      const relativePath = path.relative(process.cwd(), fileName);
      const lineNumber = stack[i].getLineNumber();
      return `${relativePath}:${lineNumber}`;
    }
  }
  return 'unknown';
}

// Custom log format
const logFormat = printf(({ level, message, timestamp, caller, ...meta }) => {
  const callerStr = caller ? ` [${caller}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const logLine = `[${timestamp}]${callerStr} ${level}: ${message}${metaStr}`;
  return truncateLog(logLine);
});

// Create logger instance
const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
  transports: [
    // Console transport
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
    }),
    // File transport
    new winston.transports.File({
      filename: `${config.log.dir}/${config.log.file}`,
      maxFiles: config.log.maxFiles,
      maxsize: parseMaxSize(config.log.maxSize),
    }),
  ],
});

// Parse max size string to bytes
function parseMaxSize(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+)([kmg]?)$/i);
  if (!match) return 20 * 1024 * 1024; // Default 20MB

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'k':
      return value * 1024;
    case 'm':
      return value * 1024 * 1024;
    case 'g':
      return value * 1024 * 1024 * 1024;
    default:
      return value;
  }
}

// Wrapper type for logger methods - supports both string and object as second parameter
type LogMeta = string | number | boolean | Record<string, unknown> | undefined;
type LogMethod = (message: string, meta?: LogMeta) => void;

interface Logger {
  error: LogMethod;
  warn: LogMethod;
  info: LogMethod;
  http: LogMethod;
  verbose: LogMethod;
  debug: LogMethod;
  silly: LogMethod;
}

// Helper to serialize Error objects to a plain object
function serializeError(error: Error): Record<string, unknown> {
  return {
    message: error.message,
    name: error.name,
    stack: error.stack,
  };
}

// Helper to normalize meta parameter
function normalizeMeta(meta: LogMeta): Record<string, unknown> {
  if (meta === undefined) {
    return {};
  }
  if (typeof meta === 'object' && meta !== null) {
    // Process each property, serializing Error objects
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (value instanceof Error) {
        result[key] = serializeError(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return { detail: meta };
}

// Create wrapped logger that auto-injects caller info
const wrappedLogger: Logger = {
  error: (message: string, meta?: LogMeta) => {
    logger.error(message, { caller: getCallerInfo(), ...normalizeMeta(meta) });
  },
  warn: (message: string, meta?: LogMeta) => {
    logger.warn(message, { caller: getCallerInfo(), ...normalizeMeta(meta) });
  },
  info: (message: string, meta?: LogMeta) => {
    logger.info(message, { caller: getCallerInfo(), ...normalizeMeta(meta) });
  },
  http: (message: string, meta?: LogMeta) => {
    logger.http(message, { caller: getCallerInfo(), ...normalizeMeta(meta) });
  },
  verbose: (message: string, meta?: LogMeta) => {
    logger.verbose(message, { caller: getCallerInfo(), ...normalizeMeta(meta) });
  },
  debug: (message: string, meta?: LogMeta) => {
    logger.debug(message, { caller: getCallerInfo(), ...normalizeMeta(meta) });
  },
  silly: (message: string, meta?: LogMeta) => {
    logger.silly(message, { caller: getCallerInfo(), ...normalizeMeta(meta) });
  },
};

export default wrappedLogger;
