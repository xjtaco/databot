import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock('../../src/infrastructure/database', () => ({
  getPrismaClient: () => ({
    auditLog: {
      create: mockCreate,
      findMany: mockFindMany,
      count: mockCount,
      deleteMany: mockDeleteMany,
    },
  }),
}));

import {
  createAuditLog,
  queryAuditLogs,
  countAuditLogs,
  deleteAuditLogsBefore,
} from '../../src/auditLog/auditLogRepository';

describe('auditLogRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAuditLog', () => {
    it('should create a log entry', async () => {
      const data = {
        userId: 'user-1',
        username: 'admin',
        action: 'USER_CREATED',
        category: 'user_management',
        params: { targetUsername: 'alice' },
        ipAddress: '127.0.0.1',
      };
      mockCreate.mockResolvedValue({ id: 'log-1', ...data });

      const result = await createAuditLog(data);

      expect(mockCreate).toHaveBeenCalledWith({ data });
      expect(result.id).toBe('log-1');
    });
  });

  describe('queryAuditLogs', () => {
    it('should query with pagination and filters', async () => {
      mockFindMany.mockResolvedValue([]);

      await queryAuditLogs({
        page: 1,
        pageSize: 20,
        category: 'auth',
      });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'auth' }),
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should apply keyword search on username and params', async () => {
      mockFindMany.mockResolvedValue([]);

      await queryAuditLogs({
        page: 1,
        pageSize: 20,
        keyword: 'alice',
      });

      const call = mockFindMany.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toEqual(
        expect.arrayContaining([{ username: { contains: 'alice', mode: 'insensitive' } }])
      );
    });
  });

  describe('countAuditLogs', () => {
    it('should count with filters', async () => {
      mockCount.mockResolvedValue(42);

      const result = await countAuditLogs({ action: 'LOGIN_SUCCESS' });

      expect(result).toBe(42);
      expect(mockCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: 'LOGIN_SUCCESS' }),
        })
      );
    });
  });

  describe('deleteAuditLogsBefore', () => {
    it('should delete logs older than given date', async () => {
      mockDeleteMany.mockResolvedValue({ count: 10 });
      const cutoff = new Date('2026-01-01');

      const result = await deleteAuditLogsBefore(cutoff);

      expect(result).toBe(10);
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: cutoff } },
      });
    });
  });
});
