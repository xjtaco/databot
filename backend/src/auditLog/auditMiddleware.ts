import type { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import { logAuditEvent } from './auditLogService';

export function auditMiddleware(
  action: string,
  category: string
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    req.auditContext = { action, category, params: {} };

    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = req.user?.userId ?? null;
        const username = req.user?.username ?? 'unknown';
        const ipAddress = req.ip ?? null;
        const params = req.auditContext?.params ?? {};

        void logAuditEvent({
          userId,
          username,
          action,
          category,
          params: Object.keys(params).length > 0 ? (params as Prisma.InputJsonValue) : undefined,
          ipAddress,
        });
      }
    });

    next();
  };
}
