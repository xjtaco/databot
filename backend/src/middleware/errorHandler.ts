import { NextFunction, Request, Response } from 'express';
import { ErrorFactory } from '../errors/errorFactory';
import { ApiError } from '../errors/types';
import logger from '../utils/logger';

// 404 处理器
export const notFoundHandler = (req: Request, res: Response) => {
  const error = ErrorFactory.createNotFoundError(`Not found path:${req.method}: ${req.path}`);
  return res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
};

export const errorHandler = (error: Error, req: Request, res: Response, _next: NextFunction) => {
  // 如果是已定义的业务异常
  if (error instanceof ApiError) {
    // Log 5xx errors with stack trace
    if (error.statusCode >= 500) {
      logger.error('Server error', {
        statusCode: error.statusCode,
        message: error.message,
        path: req.path,
        method: req.method,
        stack: error.stack,
      });
    }
    return res
      .status(error.statusCode)
      .json({ error: { code: error.code, message: error.message } });
  }
  // 未知异常 - always log with stack trace
  logger.error('Unhandled error', {
    message: error.message,
    path: req.path,
    method: req.method,
    stack: error.stack,
  });
  const unknownError = ErrorFactory.createUnknownError(error.message || 'Unknown error.');
  return res
    .status(unknownError.statusCode)
    .json({ error: { code: unknownError.code, message: unknownError.message } });
};
