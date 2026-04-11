import logger from '../utils/logger';
import { getRetentionDays, logAuditEvent } from './auditLogService';
import { deleteAuditLogsBefore } from './auditLogRepository';
import { AuditAction, AuditCategory } from './auditActions';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export async function runCleanup(): Promise<void> {
  try {
    const retentionDays = await getRetentionDays();
    const cutoff = new Date(Date.now() - retentionDays * ONE_DAY_MS);
    const deletedCount = await deleteAuditLogsBefore(cutoff);

    if (deletedCount > 0) {
      logger.info('Audit log cleanup completed', { deletedCount, retentionDays });
      await logAuditEvent({
        userId: null,
        username: 'system',
        action: AuditAction.AUDIT_LOGS_CLEANED,
        category: AuditCategory.SYSTEM_CONFIG,
        params: { deletedCount, retentionDays },
      });
    }
  } catch (err) {
    logger.error('Audit log cleanup failed', { error: err });
  }
}

export function startCleanupJob(): void {
  if (cleanupInterval) clearInterval(cleanupInterval);
  cleanupInterval = setInterval(() => {
    const now = new Date();
    // Run at 02:00 daily — check if current hour is 2 and within the interval window
    if (now.getHours() === 2 && now.getMinutes() < 1) {
      void runCleanup();
    }
  }, 60_000); // Check every minute
  logger.info('Audit log cleanup job started');
}

export function stopCleanupJob(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
