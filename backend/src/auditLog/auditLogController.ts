import type { Request, Response } from 'express';
import * as auditLogService from './auditLogService';
import { AuditAction, ACTION_CATEGORY_MAP } from './auditActions';
import type { AuditLogQueryFilters } from './auditLogRepository';

function parseFilters(query: Request['query']): AuditLogQueryFilters {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(query.pageSize ?? '20'), 10) || 20));

  const filters: AuditLogQueryFilters = { page, pageSize };

  if (query.startDate) filters.startDate = new Date(String(query.startDate));
  if (query.endDate) filters.endDate = new Date(String(query.endDate));
  if (query.userId) filters.userId = String(query.userId);
  if (query.category) filters.category = String(query.category);
  if (query.action) filters.action = String(query.action);
  if (query.keyword) filters.keyword = String(query.keyword);

  return filters;
}

export async function listAuditLogsHandler(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req.query);
  const { page, pageSize, ...countFilters } = filters;
  const [logs, total] = await Promise.all([
    auditLogService.queryLogs(filters),
    auditLogService.countLogs(countFilters),
  ]);
  res.json({ logs, total, page, pageSize });
}

export async function exportAuditLogsHandler(req: Request, res: Response): Promise<void> {
  const filters = parseFilters(req.query);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { page: _page, pageSize: _pageSize, ...exportFilters } = filters;
  const csv = await auditLogService.exportLogsCsv(exportFilters);
  const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csv);
}

export async function listActionsHandler(_req: Request, res: Response): Promise<void> {
  const actions = Object.entries(AuditAction).map(([_key, action]) => ({
    action,
    category: ACTION_CATEGORY_MAP[action],
  }));
  res.json({ actions });
}
