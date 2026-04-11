import { CronExpressionParser } from 'cron-parser';
import logger from '../utils/logger';
import { WorkflowExecutionError } from '../errors/types';
import type { ScheduleDetail } from './schedule.types';
import * as repository from './schedule.repository';

/** Registered schedule with its pre-parsed cron and last-fired minute. */
interface ActiveSchedule {
  detail: ScheduleDetail;
  /** Tracks the last minute (epoch ms floored to minute) we fired, to avoid double-fires. */
  lastFiredMinute: number;
}

const activeSchedules = new Map<string, ActiveSchedule>();
let tickInterval: ReturnType<typeof setInterval> | null = null;

const TICK_INTERVAL_MS = 30_000; // check every 30 seconds

const DATE_VAR_REGEX = /\{\{today(?:\s*([+-])\s*(\d+)d)?\}\}/g;

export function resolveDateVariables(params: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = {};
  const now = new Date();

  for (const [key, value] of Object.entries(params)) {
    resolved[key] = value.replace(DATE_VAR_REGEX, (_match, op?: string, days?: string) => {
      const date = new Date(now);
      if (op && days) {
        const offset = parseInt(days, 10) * (op === '-' ? -1 : 1);
        date.setDate(date.getDate() + offset);
      }
      return date.toISOString().slice(0, 10);
    });
  }

  return resolved;
}

/** Floor a Date to the start of its minute (seconds and ms zeroed). */
function floorToMinute(date: Date): number {
  return Math.floor(date.getTime() / 60_000) * 60_000;
}

/** Check if `now` falls within a cron-matching minute. */
export function matchesCron(cronExpr: string, timezone: string, now: Date): boolean {
  try {
    const currentMinute = floorToMinute(now);
    // Use prev() from the end of the current minute to find the most recent match.
    // If that match falls within the current minute, we have a hit.
    const endOfMinute = new Date(currentMinute + 60_000 - 1);
    const prev = CronExpressionParser.parse(cronExpr, {
      tz: timezone,
      currentDate: endOfMinute,
    }).prev();
    return floorToMinute(prev.toDate()) === currentMinute;
  } catch {
    return false;
  }
}

export function registerSchedule(schedule: ScheduleDetail): void {
  unregisterSchedule(schedule.id);

  activeSchedules.set(schedule.id, {
    detail: schedule,
    lastFiredMinute: 0,
  });

  logger.info('Registered schedule', {
    scheduleId: schedule.id,
    name: schedule.name,
    cronExpr: schedule.cronExpr,
  });
}

export function unregisterSchedule(id: string): void {
  if (activeSchedules.has(id)) {
    activeSchedules.delete(id);
    logger.info('Unregistered schedule', { scheduleId: id });
  }
}

function tick(): void {
  const now = new Date();
  const currentMinute = floorToMinute(now);

  for (const [, entry] of activeSchedules) {
    // Skip if already fired this minute
    if (entry.lastFiredMinute === currentMinute) continue;

    if (matchesCron(entry.detail.cronExpr, entry.detail.timezone, now)) {
      entry.lastFiredMinute = currentMinute;
      executeScheduledWorkflow(entry.detail).catch(() => {
        // errors are already logged inside executeScheduledWorkflow
      });
    }
  }
}

export async function initScheduleEngine(): Promise<void> {
  const schedules = await repository.listEnabledSchedules();
  for (const schedule of schedules) {
    registerSchedule(schedule);
  }

  // Start the interval-based tick
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(tick, TICK_INTERVAL_MS);

  logger.info('Schedule engine initialized', { count: schedules.length });
}

export function stopAllSchedules(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  for (const [id] of activeSchedules) {
    logger.info('Stopped schedule', { scheduleId: id });
  }
  activeSchedules.clear();
}

async function executeScheduledWorkflow(schedule: ScheduleDetail): Promise<void> {
  const { executeWorkflow } = await import('./executionEngine');

  try {
    const resolvedParams = resolveDateVariables(schedule.params);
    const { runId, promise } = await executeWorkflow(schedule.workflowId, resolvedParams);
    const runAt = new Date();

    await repository.updateLastRun(schedule.id, runId, 'running', runAt);
    logger.info('Schedule triggered workflow', {
      scheduleId: schedule.id,
      workflowId: schedule.workflowId,
      runId,
    });

    promise
      .then(async () => {
        try {
          await repository.updateLastRunStatus(schedule.id, 'completed');
        } catch {
          // Schedule may have been deleted during execution
        }
      })
      .catch(async (err: unknown) => {
        logger.error('Scheduled workflow execution failed', {
          scheduleId: schedule.id,
          runId,
          error: err instanceof Error ? err.message : String(err),
        });
        try {
          await repository.updateLastRunStatus(schedule.id, 'failed');
        } catch {
          // Schedule may have been deleted during execution
        }
      });
  } catch (err: unknown) {
    if (err instanceof WorkflowExecutionError && /already executing/i.test(err.message)) {
      logger.warn('Schedule skipped: workflow already executing', {
        scheduleId: schedule.id,
        workflowId: schedule.workflowId,
      });
      return;
    }
    logger.error('Schedule execution error', {
      scheduleId: schedule.id,
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      await repository.updateLastRunStatus(schedule.id, 'failed');
    } catch {
      // Schedule may have been deleted
    }
  }
}
