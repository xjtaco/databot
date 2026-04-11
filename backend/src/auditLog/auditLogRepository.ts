import { getPrismaClient } from '../infrastructure/database';
import type { AuditLog, Prisma } from '@prisma/client';

export interface CreateAuditLogData {
  userId: string | null;
  username: string;
  action: string;
  category: string;
  params?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

export interface AuditLogQueryFilters {
  page: number;
  pageSize: number;
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  category?: string;
  action?: string;
  keyword?: string;
}

function buildWhere(
  filters: Omit<AuditLogQueryFilters, 'page' | 'pageSize'>
): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }
  if (filters.userId) where.userId = filters.userId;
  if (filters.category) where.category = filters.category;
  if (filters.action) where.action = filters.action;
  if (filters.keyword) {
    where.OR = [
      { username: { contains: filters.keyword, mode: 'insensitive' } },
      { params: { path: [], string_contains: filters.keyword } },
    ];
  }

  return where;
}

export async function createAuditLog(data: CreateAuditLogData): Promise<AuditLog> {
  const prisma = getPrismaClient();
  return prisma.auditLog.create({ data });
}

export async function queryAuditLogs(filters: AuditLogQueryFilters): Promise<AuditLog[]> {
  const prisma = getPrismaClient();
  const where = buildWhere(filters);
  return prisma.auditLog.findMany({
    where,
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
    orderBy: { createdAt: 'desc' },
  });
}

export async function countAuditLogs(
  filters: Omit<AuditLogQueryFilters, 'page' | 'pageSize'>
): Promise<number> {
  const prisma = getPrismaClient();
  const where = buildWhere(filters);
  return prisma.auditLog.count({ where });
}

export async function deleteAuditLogsBefore(cutoff: Date): Promise<number> {
  const prisma = getPrismaClient();
  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
