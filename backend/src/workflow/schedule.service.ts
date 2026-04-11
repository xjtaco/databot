import logger from '../utils/logger';
import { ScheduleNotFoundError, ScheduleValidationError } from '../errors/types';
import { isValidCronExpr, isValidScheduleType } from './schedule.types';
import type {
  CreateScheduleInput,
  UpdateScheduleInput,
  ScheduleDetail,
  ScheduleListItem,
} from './schedule.types';
import * as repository from './schedule.repository';
import { registerSchedule, unregisterSchedule } from './scheduleEngine';

function validateCreateInput(input: CreateScheduleInput): void {
  if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
    throw new ScheduleValidationError('Schedule name is required');
  }
  if (!input.workflowId) {
    throw new ScheduleValidationError('Workflow ID is required');
  }
  if (!isValidScheduleType(input.scheduleType)) {
    throw new ScheduleValidationError(`Invalid schedule type: ${input.scheduleType}`);
  }
  if (!isValidCronExpr(input.cronExpr)) {
    throw new ScheduleValidationError('Invalid cron expression');
  }
}

export async function createSchedule(input: CreateScheduleInput): Promise<ScheduleDetail> {
  validateCreateInput(input);
  const detail = await repository.createSchedule(input);
  if (detail.enabled) {
    registerSchedule(detail);
  }
  logger.info('Created schedule', { scheduleId: detail.id, name: detail.name });
  return detail;
}

export async function listSchedules(): Promise<ScheduleListItem[]> {
  return repository.listSchedules();
}

export async function getSchedule(id: string): Promise<ScheduleDetail> {
  const detail = await repository.getScheduleById(id);
  if (!detail) {
    throw new ScheduleNotFoundError('Schedule not found');
  }
  return detail;
}

export async function updateSchedule(
  id: string,
  input: UpdateScheduleInput
): Promise<ScheduleDetail> {
  const existing = await repository.getScheduleById(id);
  if (!existing) {
    throw new ScheduleNotFoundError('Schedule not found');
  }
  if (input.scheduleType !== undefined && !isValidScheduleType(input.scheduleType)) {
    throw new ScheduleValidationError(`Invalid schedule type: ${input.scheduleType}`);
  }
  if (input.cronExpr !== undefined && !isValidCronExpr(input.cronExpr)) {
    throw new ScheduleValidationError('Invalid cron expression');
  }

  const updated = await repository.updateSchedule(id, input);

  unregisterSchedule(id);
  if (updated.enabled) {
    registerSchedule(updated);
  }

  logger.info('Updated schedule', { scheduleId: id });
  return updated;
}

export async function deleteSchedule(id: string): Promise<void> {
  const existing = await repository.getScheduleById(id);
  if (!existing) {
    throw new ScheduleNotFoundError('Schedule not found');
  }
  unregisterSchedule(id);
  await repository.deleteSchedule(id);
  logger.info('Deleted schedule', { scheduleId: id });
}
