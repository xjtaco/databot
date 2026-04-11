import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockGetRetentionDays = vi.fn();
const mockLogAuditEvent = vi.fn();

vi.mock('../../src/auditLog/auditLogService', () => ({
  getRetentionDays: (...args: unknown[]) => mockGetRetentionDays(...args),
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}));

const mockDeleteAuditLogsBefore = vi.fn();

vi.mock('../../src/auditLog/auditLogRepository', () => ({
  deleteAuditLogsBefore: (...args: unknown[]) => mockDeleteAuditLogsBefore(...args),
}));

import { runCleanup, startCleanupJob, stopCleanupJob } from '../../src/auditLog/auditCleanupJob';

describe('auditCleanupJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopCleanupJob();
    vi.useRealTimers();
  });

  describe('runCleanup', () => {
    it('should delete logs older than retention period', async () => {
      mockGetRetentionDays.mockResolvedValue(90);
      mockDeleteAuditLogsBefore.mockResolvedValue(10);

      await runCleanup();

      expect(mockDeleteAuditLogsBefore).toHaveBeenCalledWith(expect.any(Date));
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUDIT_LOGS_CLEANED',
          category: 'system_config',
          params: expect.objectContaining({ deletedCount: 10, retentionDays: 90 }),
        })
      );
    });

    it('should not log cleanup event when no records deleted', async () => {
      mockGetRetentionDays.mockResolvedValue(180);
      mockDeleteAuditLogsBefore.mockResolvedValue(0);

      await runCleanup();

      expect(mockLogAuditEvent).not.toHaveBeenCalled();
    });
  });

  describe('startCleanupJob / stopCleanupJob', () => {
    it('should start and stop interval', () => {
      startCleanupJob();
      // The interval is set — stopping should work without error
      stopCleanupJob();
    });
  });
});
