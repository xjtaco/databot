import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';

const EXEMPT_PATHS = ['/api/auth/change-password', '/api/auth/logout'];

export function mustChangePasswordCheck(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next();
    return;
  }

  if (EXEMPT_PATHS.includes(req.path)) {
    next();
    return;
  }

  if (req.user.mustChangePassword) {
    throw new ForbiddenError('Password change required', ErrorCode.MUST_CHANGE_PASSWORD);
  }

  next();
}
