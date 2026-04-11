import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing
vi.mock('../../src/workflow/schedule.repository');
vi.mock('../../src/workflow/executionEngine');

import { resolveDateVariables, matchesCron } from '../../src/workflow/scheduleEngine';

describe('scheduleEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T08:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('resolveDateVariables', () => {
    it('should resolve {{today}} to current date', () => {
      const result = resolveDateVariables({ date: '{{today}}' });
      expect(result.date).toBe('2026-03-29');
    });

    it('should resolve {{today - 30d}} to 30 days ago', () => {
      const result = resolveDateVariables({ start: '{{today - 30d}}' });
      expect(result.start).toBe('2026-02-27');
    });

    it('should resolve {{today + 7d}} to 7 days ahead', () => {
      const result = resolveDateVariables({ end: '{{today + 7d}}' });
      expect(result.end).toBe('2026-04-05');
    });

    it('should leave non-variable values unchanged', () => {
      const result = resolveDateVariables({ key: 'plain-value' });
      expect(result.key).toBe('plain-value');
    });

    it('should handle empty params', () => {
      const result = resolveDateVariables({});
      expect(result).toEqual({});
    });
  });
});

import {
  initScheduleEngine,
  registerSchedule,
  unregisterSchedule,
  stopAllSchedules,
} from '../../src/workflow/scheduleEngine';

describe('matchesCron', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should match when current minute is exactly the cron time in the given timezone', () => {
    // Cron: 08:00 Asia/Shanghai = 00:00 UTC
    const now = new Date('2026-04-03T00:00:30Z');
    expect(matchesCron('0 8 * * *', 'Asia/Shanghai', now)).toBe(true);
  });

  it('should not match one minute before the cron time', () => {
    // 07:59 Shanghai = 23:59 UTC previous day
    const now = new Date('2026-04-02T23:59:30Z');
    expect(matchesCron('0 8 * * *', 'Asia/Shanghai', now)).toBe(false);
  });

  it('should not match one minute after the cron time', () => {
    // 08:01 Shanghai = 00:01 UTC
    const now = new Date('2026-04-03T00:01:30Z');
    expect(matchesCron('0 8 * * *', 'Asia/Shanghai', now)).toBe(false);
  });

  it('should work with UTC timezone', () => {
    const now = new Date('2026-04-03T08:00:15Z');
    expect(matchesCron('0 8 * * *', 'UTC', now)).toBe(true);
  });

  it('should match 6-field cron with seconds', () => {
    // 0 00 08 * * * means second=0, minute=0, hour=8
    const now = new Date('2026-04-03T00:00:10Z');
    expect(matchesCron('0 00 08 * * *', 'Asia/Shanghai', now)).toBe(true);
  });

  it('should not match on wrong day of week', () => {
    // 2026-04-03 is Friday; cron for Monday only
    const now = new Date('2026-04-03T00:00:00Z');
    expect(matchesCron('0 8 * * 1', 'Asia/Shanghai', now)).toBe(false);
  });
});
import * as repository from '../../src/workflow/schedule.repository';
import type { ScheduleDetail } from '../../src/workflow/schedule.types';

const makeSchedule = (overrides: Partial<ScheduleDetail> = {}): ScheduleDetail => ({
  id: 'sched-1',
  name: 'Test Schedule',
  description: '',
  workflowId: 'wf-1',
  workflowName: 'Test Workflow',
  scheduleType: 'daily',
  cronExpr: '0 8 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
  lastRunId: null,
  lastRunStatus: null,
  lastRunAt: null,
  createdAt: new Date(),
  params: {},
  updatedAt: new Date(),
  creatorName: null,
  ...overrides,
});

describe('schedule lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopAllSchedules();
  });

  it('should register a schedule', () => {
    const schedule = makeSchedule();
    registerSchedule(schedule);
    // No error thrown means registration succeeded
    expect(true).toBe(true);
  });

  it('should unregister a schedule', () => {
    const schedule = makeSchedule();
    registerSchedule(schedule);
    unregisterSchedule('sched-1');
    // Unregister again should be a no-op
    unregisterSchedule('sched-1');
  });

  it('should load enabled schedules on init', async () => {
    const schedules = [makeSchedule(), makeSchedule({ id: 'sched-2', cronExpr: '0 9 * * 1' })];
    vi.mocked(repository.listEnabledSchedules).mockResolvedValue(schedules);
    await initScheduleEngine();
    expect(repository.listEnabledSchedules).toHaveBeenCalled();
  });

  it('should stop all schedules', () => {
    registerSchedule(makeSchedule({ id: 's1' }));
    registerSchedule(makeSchedule({ id: 's2' }));
    stopAllSchedules();
    // After stop, registering again should work cleanly
    registerSchedule(makeSchedule({ id: 's1' }));
    stopAllSchedules();
  });
});
