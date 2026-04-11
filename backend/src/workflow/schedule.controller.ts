import type { Request, Response } from 'express';
import { getValidatedUuid } from '../utils/routeParams';
import { HttpStatusCode } from '../base/types';
import * as service from './schedule.service';
import type { CreateScheduleInput, UpdateScheduleInput } from './schedule.types';

export async function createScheduleHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateScheduleInput;
  const result = await service.createSchedule({ ...input, createdBy: req.user?.userId });
  res.status(HttpStatusCode.CREATED).json(result);
}

export async function listSchedulesHandler(_req: Request, res: Response): Promise<void> {
  const schedules = await service.listSchedules();
  res.json({ schedules });
}

export async function getScheduleHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const schedule = await service.getSchedule(id);
  res.json(schedule);
}

export async function updateScheduleHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const input = req.body as UpdateScheduleInput;
  const result = await service.updateSchedule(id, input);
  res.json(result);
}

export async function deleteScheduleHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  await service.deleteSchedule(id);
  res.status(HttpStatusCode.NO_CONTENT).send();
}
