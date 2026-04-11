import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockQueryLogs = vi.fn();
const mockCountLogs = vi.fn();
const mockExportLogsCsv = vi.fn();

vi.mock('../../src/auditLog/auditLogService', () => ({
  queryLogs: (...args: unknown[]) => mockQueryLogs(...args),
  countLogs: (...args: unknown[]) => mockCountLogs(...args),
  exportLogsCsv: (...args: unknown[]) => mockExportLogsCsv(...args),
  logAuditEvent: vi.fn(),
}));

import {
  listAuditLogsHandler,
  exportAuditLogsHandler,
  listActionsHandler,
} from '../../src/auditLog/auditLogController';

function createMockReqRes(query: Record<string, string> = {}) {
  const req = { query } as unknown as Request;
  const json = vi.fn();
  const setHeader = vi.fn();
  const send = vi.fn();
  const status = vi.fn().mockReturnThis();
  const res = { json, setHeader, send, status } as unknown as Response;
  return { req, res };
}

describe('auditLogController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listAuditLogsHandler', () => {
    it('should return paginated logs', async () => {
      const logs = [{ id: 'log-1', action: 'LOGIN_SUCCESS' }];
      mockQueryLogs.mockResolvedValue(logs);
      mockCountLogs.mockResolvedValue(1);
      const { req, res } = createMockReqRes({ page: '1', pageSize: '20' });

      await listAuditLogsHandler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        logs,
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('should parse date filters', async () => {
      mockQueryLogs.mockResolvedValue([]);
      mockCountLogs.mockResolvedValue(0);
      const { req, res } = createMockReqRes({
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-04-04T23:59:59Z',
      });

      await listAuditLogsHandler(req, res);

      expect(mockQueryLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        })
      );
    });
  });

  describe('exportAuditLogsHandler', () => {
    it('should return CSV with correct headers', async () => {
      mockExportLogsCsv.mockResolvedValue('Time,Username\n2026-04-04,admin');
      const { req, res } = createMockReqRes();

      await exportAuditLogsHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('audit-logs-')
      );
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Time,Username'));
    });
  });

  describe('listActionsHandler', () => {
    it('should return all action types', async () => {
      const { req, res } = createMockReqRes();

      await listActionsHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          actions: expect.arrayContaining([
            expect.objectContaining({ action: 'LOGIN_SUCCESS', category: 'auth' }),
          ]),
        })
      );
    });
  });
});
