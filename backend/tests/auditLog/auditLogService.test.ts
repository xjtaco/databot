import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockCreateAuditLog = vi.fn();
const mockQueryAuditLogs = vi.fn();
const mockCountAuditLogs = vi.fn();
const mockDeleteAuditLogsBefore = vi.fn();

vi.mock('../../src/auditLog/auditLogRepository', () => ({
  createAuditLog: (...args: unknown[]) => mockCreateAuditLog(...args),
  queryAuditLogs: (...args: unknown[]) => mockQueryAuditLogs(...args),
  countAuditLogs: (...args: unknown[]) => mockCountAuditLogs(...args),
  deleteAuditLogsBefore: (...args: unknown[]) => mockDeleteAuditLogsBefore(...args),
}));

const mockGetConfigsByCategory = vi.fn();

vi.mock('../../src/globalConfig/globalConfig.repository', () => ({
  getConfigsByCategory: (...args: unknown[]) => mockGetConfigsByCategory(...args),
}));

import {
  logAuditEvent,
  queryLogs,
  countLogs,
  exportLogsCsv,
  getRetentionDays,
} from '../../src/auditLog/auditLogService';

describe('auditLogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logAuditEvent', () => {
    it('should create an audit log entry', async () => {
      mockCreateAuditLog.mockResolvedValue({ id: 'log-1' });

      await logAuditEvent({
        userId: 'user-1',
        username: 'admin',
        action: 'USER_CREATED',
        category: 'user_management',
        params: { targetUsername: 'alice' },
        ipAddress: '127.0.0.1',
      });

      expect(mockCreateAuditLog).toHaveBeenCalledWith({
        userId: 'user-1',
        username: 'admin',
        action: 'USER_CREATED',
        category: 'user_management',
        params: { targetUsername: 'alice' },
        ipAddress: '127.0.0.1',
      });
    });

    it('should not throw when logging fails', async () => {
      mockCreateAuditLog.mockRejectedValue(new Error('DB down'));

      await expect(
        logAuditEvent({
          userId: null,
          username: 'unknown',
          action: 'LOGIN_FAILED',
          category: 'auth',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('queryLogs', () => {
    it('should delegate to repository', async () => {
      const logs = [{ id: 'log-1' }];
      mockQueryAuditLogs.mockResolvedValue(logs);

      const result = await queryLogs({ page: 1, pageSize: 20 });

      expect(result).toBe(logs);
    });
  });

  describe('countLogs', () => {
    it('should delegate to repository', async () => {
      mockCountAuditLogs.mockResolvedValue(42);

      const result = await countLogs({});

      expect(result).toBe(42);
    });
  });

  describe('getRetentionDays', () => {
    it('should return configured retention days', async () => {
      mockGetConfigsByCategory.mockResolvedValue([
        { configKey: 'audit_log_retention_days', configValue: '90' },
      ]);

      const result = await getRetentionDays();

      expect(result).toBe(90);
    });

    it('should return 180 as default when not configured', async () => {
      mockGetConfigsByCategory.mockResolvedValue([]);

      const result = await getRetentionDays();

      expect(result).toBe(180);
    });
  });

  describe('exportLogsCsv', () => {
    it('should generate CSV string from logs', async () => {
      mockQueryAuditLogs.mockResolvedValue([
        {
          id: 'log-1',
          username: 'admin',
          action: 'USER_CREATED',
          category: 'user_management',
          params: { targetUsername: 'alice' },
          ipAddress: '127.0.0.1',
          createdAt: new Date('2026-04-04T14:00:00Z'),
        },
      ]);
      mockCountAuditLogs.mockResolvedValue(1);

      const csv = await exportLogsCsv({});

      expect(csv).toContain('admin');
      expect(csv).toContain('USER_CREATED');
      expect(csv).toContain('user_management');
    });
  });
});
