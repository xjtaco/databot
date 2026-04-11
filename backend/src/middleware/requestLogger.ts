import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Record start time
  const startTime = Date.now();

  // Hook into response finish event
  res.on('finish', () => {
    const duration = Date.now() - (startTime || 0);
    const durationInSeconds = (duration / 1000).toFixed(3);

    logger.info(
      `${req.method} ${req.path} - Status: ${res.statusCode} - Duration: ${durationInSeconds}s`
    );

    // Log query parameters
    const query = req.query && Object.keys(req.query).length > 0 ? JSON.stringify(req.query) : '';
    if (query) {
      logger.info(`Query: ${query}`);
    }

    // Log request body
    const body = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '';
    if (body) {
      logger.info(`Body: ${body}`);
    }
  });

  next();
}
