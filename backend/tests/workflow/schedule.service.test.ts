import { describe, it, expect } from 'vitest';
import { ScheduleNotFoundError, ScheduleValidationError } from '../../src/errors/types';
import { ErrorCode } from '../../src/errors/errorCode';
import { isValidScheduleType, isValidCronExpr } from '../../src/workflow/schedule.types';

describe('schedule error types', () => {
  it('should create ScheduleNotFoundError with correct code and status', () => {
    const error = new ScheduleNotFoundError('Schedule not found');
    expect(error.code).toBe(ErrorCode.SCHEDULE_NOT_FOUND);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Schedule not found');
    expect(error).toBeInstanceOf(ScheduleNotFoundError);
  });

  it('should create ScheduleValidationError with correct code and status', () => {
    const error = new ScheduleValidationError('Invalid cron expression');
    expect(error.code).toBe(ErrorCode.SCHEDULE_VALIDATION_ERROR);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Invalid cron expression');
    expect(error).toBeInstanceOf(ScheduleValidationError);
  });
});

describe('schedule type validators', () => {
  it('should validate schedule types', () => {
    expect(isValidScheduleType('daily')).toBe(true);
    expect(isValidScheduleType('weekly')).toBe(true);
    expect(isValidScheduleType('monthly')).toBe(true);
    expect(isValidScheduleType('cron')).toBe(true);
    expect(isValidScheduleType('hourly')).toBe(false);
    expect(isValidScheduleType('')).toBe(false);
  });

  it('should validate cron expressions', () => {
    expect(isValidCronExpr('0 8 * * *')).toBe(true);
    expect(isValidCronExpr('0 9 * * 1')).toBe(true);
    expect(isValidCronExpr('invalid')).toBe(false);
    expect(isValidCronExpr('')).toBe(false);
  });
});

vi.mock('../../src/workflow/schedule.repository');
vi.mock('../../src/workflow/workflow.repository');
vi.mock('../../src/workflow/scheduleEngine');

import * as scheduleService from '../../src/workflow/schedule.service';
import * as scheduleRepo from '../../src/workflow/schedule.repository';
import * as scheduleEngine from '../../src/workflow/scheduleEngine';
import type { ScheduleDetail } from '../../src/workflow/schedule.types';

const makeScheduleDetail = (overrides: Partial<ScheduleDetail> = {}): ScheduleDetail => ({
  id: 'sched-1',
  name: 'Daily Sync',
  description: '',
  workflowId: 'wf-1',
  workflowName: 'My Workflow',
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

describe('schedule.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSchedule', () => {
    it('should validate cron expression and create schedule', async () => {
      const input = {
        name: 'Test',
        workflowId: 'wf-1',
        scheduleType: 'daily' as const,
        cronExpr: '0 8 * * *',
      };
      const detail = makeScheduleDetail();
      vi.mocked(scheduleRepo.createSchedule).mockResolvedValue(detail);

      const result = await scheduleService.createSchedule(input);

      expect(scheduleRepo.createSchedule).toHaveBeenCalledWith(input);
      expect(scheduleEngine.registerSchedule).toHaveBeenCalledWith(detail);
      expect(result).toEqual(detail);
    });

    it('should reject invalid cron expression', async () => {
      const input = {
        name: 'Test',
        workflowId: 'wf-1',
        scheduleType: 'cron' as const,
        cronExpr: 'invalid',
      };
      await expect(scheduleService.createSchedule(input)).rejects.toThrow(
        'Invalid cron expression'
      );
    });

    it('should reject empty name', async () => {
      const input = {
        name: '',
        workflowId: 'wf-1',
        scheduleType: 'daily' as const,
        cronExpr: '0 8 * * *',
      };
      await expect(scheduleService.createSchedule(input)).rejects.toThrow();
    });
  });

  describe('deleteSchedule', () => {
    it('should unregister engine and delete from DB', async () => {
      vi.mocked(scheduleRepo.getScheduleById).mockResolvedValue(makeScheduleDetail());
      vi.mocked(scheduleRepo.deleteSchedule).mockResolvedValue(undefined);

      await scheduleService.deleteSchedule('sched-1');

      expect(scheduleEngine.unregisterSchedule).toHaveBeenCalledWith('sched-1');
      expect(scheduleRepo.deleteSchedule).toHaveBeenCalledWith('sched-1');
    });

    it('should throw ScheduleNotFoundError for non-existent schedule', async () => {
      vi.mocked(scheduleRepo.getScheduleById).mockResolvedValue(null);
      await expect(scheduleService.deleteSchedule('bad-id')).rejects.toThrow('Schedule not found');
    });
  });

  describe('updateSchedule', () => {
    it('should re-register engine when cron or enabled changes', async () => {
      const updated = makeScheduleDetail({ cronExpr: '0 9 * * *' });
      vi.mocked(scheduleRepo.updateSchedule).mockResolvedValue(updated);
      vi.mocked(scheduleRepo.getScheduleById).mockResolvedValue(makeScheduleDetail());

      await scheduleService.updateSchedule('sched-1', { cronExpr: '0 9 * * *' });

      expect(scheduleEngine.unregisterSchedule).toHaveBeenCalledWith('sched-1');
      expect(scheduleEngine.registerSchedule).toHaveBeenCalledWith(updated);
    });

    it('should unregister when disabled', async () => {
      const updated = makeScheduleDetail({ enabled: false });
      vi.mocked(scheduleRepo.updateSchedule).mockResolvedValue(updated);
      vi.mocked(scheduleRepo.getScheduleById).mockResolvedValue(makeScheduleDetail());

      await scheduleService.updateSchedule('sched-1', { enabled: false });

      expect(scheduleEngine.unregisterSchedule).toHaveBeenCalledWith('sched-1');
      expect(scheduleEngine.registerSchedule).not.toHaveBeenCalled();
    });
  });
});
