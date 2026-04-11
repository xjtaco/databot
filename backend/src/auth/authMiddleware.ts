import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from './authService';
import { UnauthorizedError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header', ErrorCode.UNAUTHORIZED);
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);
  req.user = payload;
  next();
}
