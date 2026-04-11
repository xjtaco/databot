import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/workflow/schedule.service');
vi.mock('../../src/utils/routeParams');

import * as service from '../../src/workflow/schedule.service';
import { getValidatedUuid } from '../../src/utils/routeParams';
import {
  createScheduleHandler,
  listSchedulesHandler,
  getScheduleHandler,
  updateScheduleHandler,
  deleteScheduleHandler,
} from '../../src/workflow/schedule.controller';
import type { ScheduleDetail, ScheduleListItem } from '../../src/workflow/schedule.types';

function mockResponse(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function mockRequest(body?: unknown, params?: Record<string, string>): Request {
  return { body: body ?? {}, params: params ?? {} } as unknown as Request;
}

function makeScheduleDetail(overrides: Partial<ScheduleDetail> = {}): ScheduleDetail {
  return {
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
    createdAt: new Date('2026-03-29T00:00:00Z'),
    params: {},
    updatedAt: new Date('2026-03-29T00:00:00Z'),
    creatorName: null,
    ...overrides,
  };
}

function makeScheduleListItem(overrides: Partial<ScheduleListItem> = {}): ScheduleListItem {
  return {
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
    createdAt: new Date('2026-03-29T00:00:00Z'),
    creatorName: null,
    ...overrides,
  };
}

describe('schedule.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createScheduleHandler', () => {
    it('should create schedule and return 201', async () => {
      const input = {
        name: 'Test',
        workflowId: 'wf-1',
        scheduleType: 'daily' as const,
        cronExpr: '0 8 * * *',
      };
      const detail = makeScheduleDetail({ name: 'Test' });
      vi.mocked(service.createSchedule).mockResolvedValue(detail);

      const req = mockRequest(input);
      const res = mockResponse();
      await createScheduleHandler(req, res);

      expect(service.createSchedule).toHaveBeenCalledWith(input);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(detail);
    });
  });

  describe('listSchedulesHandler', () => {
    it('should return schedules list', async () => {
      const schedules = [makeScheduleListItem()];
      vi.mocked(service.listSchedules).mockResolvedValue(schedules);

      const req = mockRequest();
      const res = mockResponse();
      await listSchedulesHandler(req, res);

      expect(service.listSchedules).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ schedules });
    });

    it('should return empty array when no schedules exist', async () => {
      vi.mocked(service.listSchedules).mockResolvedValue([]);

      const req = mockRequest();
      const res = mockResponse();
      await listSchedulesHandler(req, res);

      expect(res.json).toHaveBeenCalledWith({ schedules: [] });
    });
  });

  describe('getScheduleHandler', () => {
    it('should return schedule by id', async () => {
      const detail = makeScheduleDetail();
      vi.mocked(getValidatedUuid).mockReturnValue('sched-1');
      vi.mocked(service.getSchedule).mockResolvedValue(detail);

      const req = mockRequest();
      const res = mockResponse();
      await getScheduleHandler(req, res);

      expect(getValidatedUuid).toHaveBeenCalledWith(req, 'id');
      expect(service.getSchedule).toHaveBeenCalledWith('sched-1');
      expect(res.json).toHaveBeenCalledWith(detail);
    });
  });

  describe('updateScheduleHandler', () => {
    it('should update and return schedule', async () => {
      const input = { name: 'Updated' };
      const updated = makeScheduleDetail({ name: 'Updated' });
      vi.mocked(getValidatedUuid).mockReturnValue('sched-1');
      vi.mocked(service.updateSchedule).mockResolvedValue(updated);

      const req = mockRequest(input);
      const res = mockResponse();
      await updateScheduleHandler(req, res);

      expect(getValidatedUuid).toHaveBeenCalledWith(req, 'id');
      expect(service.updateSchedule).toHaveBeenCalledWith('sched-1', input);
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('should update enabled flag', async () => {
      const input = { enabled: false };
      const updated = makeScheduleDetail({ enabled: false });
      vi.mocked(getValidatedUuid).mockReturnValue('sched-1');
      vi.mocked(service.updateSchedule).mockResolvedValue(updated);

      const req = mockRequest(input);
      const res = mockResponse();
      await updateScheduleHandler(req, res);

      expect(service.updateSchedule).toHaveBeenCalledWith('sched-1', input);
      expect(res.json).toHaveBeenCalledWith(updated);
    });
  });

  describe('deleteScheduleHandler', () => {
    it('should delete and return 204', async () => {
      vi.mocked(getValidatedUuid).mockReturnValue('sched-1');
      vi.mocked(service.deleteSchedule).mockResolvedValue(undefined);

      const req = mockRequest();
      const res = mockResponse();
      await deleteScheduleHandler(req, res);

      expect(getValidatedUuid).toHaveBeenCalledWith(req, 'id');
      expect(service.deleteSchedule).toHaveBeenCalledWith('sched-1');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });
  });
});
