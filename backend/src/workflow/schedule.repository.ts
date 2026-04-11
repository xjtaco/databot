import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../infrastructure/database';
import type {
  ScheduleListItem,
  ScheduleDetail,
  CreateScheduleInput,
  UpdateScheduleInput,
} from './schedule.types';

type PrismaScheduleWithWorkflow = Prisma.WorkflowScheduleGetPayload<{
  include: {
    workflow: { select: { name: true } };
    creator: { select: { username: true } };
  };
}>;

function mapScheduleListItem(row: PrismaScheduleWithWorkflow): ScheduleListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workflowId: row.workflowId,
    workflowName: row.workflow.name,
    scheduleType: row.scheduleType as ScheduleListItem['scheduleType'],
    cronExpr: row.cronExpr,
    timezone: row.timezone,
    enabled: row.enabled,
    lastRunId: row.lastRunId,
    lastRunStatus: row.lastRunStatus,
    lastRunAt: row.lastRunAt,
    createdAt: row.createdAt,
    creatorName: row.creator?.username ?? null,
  };
}

function mapScheduleDetail(row: PrismaScheduleWithWorkflow): ScheduleDetail {
  return {
    ...mapScheduleListItem(row),
    params: JSON.parse(row.params) as Record<string, string>,
    updatedAt: row.updatedAt,
  };
}

const includeRelations = {
  workflow: { select: { name: true } },
  creator: { select: { username: true } },
} as const;

export async function createSchedule(input: CreateScheduleInput): Promise<ScheduleDetail> {
  const prisma = getPrismaClient();
  const row = await prisma.workflowSchedule.create({
    data: {
      name: input.name,
      description: input.description ?? '',
      workflowId: input.workflowId,
      scheduleType: input.scheduleType,
      cronExpr: input.cronExpr,
      timezone: input.timezone ?? 'Asia/Shanghai',
      params: JSON.stringify(input.params ?? {}),
      enabled: input.enabled ?? true,
      createdBy: input.createdBy ?? null,
    },
    include: includeRelations,
  });
  return mapScheduleDetail(row);
}

export async function listSchedules(): Promise<ScheduleListItem[]> {
  const prisma = getPrismaClient();
  const rows = await prisma.workflowSchedule.findMany({
    include: includeRelations,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mapScheduleListItem);
}

export async function getScheduleById(id: string): Promise<ScheduleDetail | null> {
  const prisma = getPrismaClient();
  const row = await prisma.workflowSchedule.findUnique({
    where: { id },
    include: includeRelations,
  });
  return row ? mapScheduleDetail(row) : null;
}

export async function updateSchedule(
  id: string,
  input: UpdateScheduleInput
): Promise<ScheduleDetail> {
  const prisma = getPrismaClient();
  const data: Prisma.WorkflowScheduleUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.workflowId !== undefined) data.workflow = { connect: { id: input.workflowId } };
  if (input.scheduleType !== undefined) data.scheduleType = input.scheduleType;
  if (input.cronExpr !== undefined) data.cronExpr = input.cronExpr;
  if (input.timezone !== undefined) data.timezone = input.timezone;
  if (input.params !== undefined) data.params = JSON.stringify(input.params);
  if (input.enabled !== undefined) data.enabled = input.enabled;

  const row = await prisma.workflowSchedule.update({
    where: { id },
    data,
    include: includeRelations,
  });
  return mapScheduleDetail(row);
}

export async function deleteSchedule(id: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.workflowSchedule.delete({ where: { id } });
}

export async function updateLastRun(
  id: string,
  runId: string,
  status: string,
  runAt: Date
): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.workflowSchedule.update({
    where: { id },
    data: { lastRunId: runId, lastRunStatus: status, lastRunAt: runAt },
  });
}

export async function updateLastRunStatus(id: string, status: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.workflowSchedule.update({
    where: { id },
    data: { lastRunStatus: status },
  });
}

export async function listEnabledSchedules(): Promise<ScheduleDetail[]> {
  const prisma = getPrismaClient();
  const rows = await prisma.workflowSchedule.findMany({
    where: { enabled: true },
    include: includeRelations,
  });
  return rows.map(mapScheduleDetail);
}
