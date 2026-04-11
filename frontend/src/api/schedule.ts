import { http } from '@/utils/http';
import type {
  ScheduleListItem,
  ScheduleDetail,
  CreateScheduleInput,
  UpdateScheduleInput,
} from '@/types/schedule';

interface ListSchedulesResponse {
  schedules: ScheduleListItem[];
}

export async function listSchedules(): Promise<ScheduleListItem[]> {
  const res = await http.get<ListSchedulesResponse>('/workflows/schedules');
  return res.schedules;
}

export async function getSchedule(id: string): Promise<ScheduleDetail> {
  return http.get<ScheduleDetail>(`/workflows/schedules/${id}`);
}

export async function createSchedule(input: CreateScheduleInput): Promise<ScheduleDetail> {
  return http.post<ScheduleDetail>('/workflows/schedules', input);
}

export async function updateSchedule(
  id: string,
  input: UpdateScheduleInput
): Promise<ScheduleDetail> {
  return http.put<ScheduleDetail>(`/workflows/schedules/${id}`, input);
}

export async function deleteSchedule(id: string): Promise<void> {
  await http.delete(`/workflows/schedules/${id}`);
}
