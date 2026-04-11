export type ScheduleType = 'daily' | 'weekly' | 'monthly' | 'cron';

export interface ScheduleListItem {
  id: string;
  name: string;
  description: string;
  workflowId: string;
  workflowName: string;
  scheduleType: ScheduleType;
  cronExpr: string;
  timezone: string;
  enabled: boolean;
  lastRunId: string | null;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  createdAt: string;
  creatorName: string | null;
}

export interface ScheduleDetail extends ScheduleListItem {
  params: Record<string, string>;
  updatedAt: string;
}

export interface CreateScheduleInput {
  name: string;
  description?: string;
  workflowId: string;
  scheduleType: ScheduleType;
  cronExpr: string;
  timezone?: string;
  params?: Record<string, string>;
  enabled?: boolean;
}

export interface UpdateScheduleInput {
  name?: string;
  description?: string;
  workflowId?: string;
  scheduleType?: ScheduleType;
  cronExpr?: string;
  timezone?: string;
  params?: Record<string, string>;
  enabled?: boolean;
}
