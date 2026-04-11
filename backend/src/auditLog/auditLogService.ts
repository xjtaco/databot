import logger from '../utils/logger';
import * as auditLogRepo from './auditLogRepository';
import type { CreateAuditLogData, AuditLogQueryFilters } from './auditLogRepository';
import { getConfigsByCategory } from '../globalConfig/globalConfig.repository';
import type { AuditLog } from '@prisma/client';

const DEFAULT_RETENTION_DAYS = 180;
const MAX_EXPORT_ROWS = 10000;

export async function logAuditEvent(data: CreateAuditLogData): Promise<void> {
  try {
    await auditLogRepo.createAuditLog(data);
  } catch (err) {
    logger.error('Failed to write audit log', { action: data.action, error: err });
  }
}

export async function queryLogs(filters: AuditLogQueryFilters): Promise<AuditLog[]> {
  return auditLogRepo.queryAuditLogs(filters);
}

export async function countLogs(
  filters: Omit<AuditLogQueryFilters, 'page' | 'pageSize'>
): Promise<number> {
  return auditLogRepo.countAuditLogs(filters);
}

export async function getRetentionDays(): Promise<number> {
  const rows = await getConfigsByCategory('audit');
  const row = rows.find((r) => r.configKey === 'audit_log_retention_days');
  if (!row) return DEFAULT_RETENTION_DAYS;
  const parsed = parseInt(row.configValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function exportLogsCsv(
  filters: Omit<AuditLogQueryFilters, 'page' | 'pageSize'>
): Promise<string> {
  const total = await auditLogRepo.countAuditLogs(filters);
  const logs = await auditLogRepo.queryAuditLogs({
    ...filters,
    page: 1,
    pageSize: MAX_EXPORT_ROWS,
  });

  const header = 'Time,Username,Category,Action,Params,IP Address';
  const rows = logs.map((log) =>
    [
      log.createdAt.toISOString(),
      escapeCSV(log.username),
      escapeCSV(log.category),
      escapeCSV(log.action),
      escapeCSV(log.params ? JSON.stringify(log.params) : ''),
      escapeCSV(log.ipAddress ?? ''),
    ].join(',')
  );

  const lines: string[] = [];
  if (total > MAX_EXPORT_ROWS) {
    lines.push(`# WARNING: Export limited to ${MAX_EXPORT_ROWS} of ${total} total records`);
  }
  lines.push(header, ...rows);

  return lines.join('\n');
}
