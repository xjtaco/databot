import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';

export function adminOnly(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    throw new ForbiddenError('Admin access required', ErrorCode.FORBIDDEN);
  }
  next();
}
