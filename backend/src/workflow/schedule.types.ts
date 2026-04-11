import { CronExpressionParser } from 'cron-parser';

export const ScheduleType = {
  Daily: 'daily',
  Weekly: 'weekly',
  Monthly: 'monthly',
  Cron: 'cron',
} as const;

export type ScheduleTypeValue = (typeof ScheduleType)[keyof typeof ScheduleType];

const validScheduleTypes = new Set<string>(Object.values(ScheduleType));

export function isValidScheduleType(type: string): type is ScheduleTypeValue {
  return validScheduleTypes.has(type);
}

export function isValidCronExpr(expr: string): boolean {
  if (!expr) return false;
  try {
    CronExpressionParser.parse(expr);
    return true;
  } catch {
    return false;
  }
}

export interface CreateScheduleInput {
  name: string;
  description?: string;
  workflowId: string;
  scheduleType: ScheduleTypeValue;
  cronExpr: string;
  timezone?: string;
  params?: Record<string, string>;
  enabled?: boolean;
  createdBy?: string;
}

export interface UpdateScheduleInput {
  name?: string;
  description?: string;
  workflowId?: string;
  scheduleType?: ScheduleTypeValue;
  cronExpr?: string;
  timezone?: string;
  params?: Record<string, string>;
  enabled?: boolean;
}

export interface ScheduleListItem {
  id: string;
  name: string;
  description: string;
  workflowId: string;
  workflowName: string;
  scheduleType: ScheduleTypeValue;
  cronExpr: string;
  timezone: string;
  enabled: boolean;
  lastRunId: string | null;
  lastRunStatus: string | null;
  lastRunAt: Date | null;
  createdAt: Date;
  creatorName: string | null;
}

export interface ScheduleDetail extends ScheduleListItem {
  params: Record<string, string>;
  updatedAt: Date;
}
