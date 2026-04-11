import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useScheduleStore } from '@/stores/scheduleStore';
import * as scheduleApi from '@/api/schedule';
import type { ScheduleListItem, ScheduleDetail } from '@/types/schedule';

vi.mock('@/api/schedule');

const makeListItem = (overrides: Partial<ScheduleListItem> = {}): ScheduleListItem => ({
  id: 'sched-1',
  name: 'Daily Sync',
  description: 'Sync data daily',
  workflowId: 'wf-1',
  workflowName: 'Sales Report',
  scheduleType: 'daily',
  cronExpr: '0 8 * * *',
  timezone: 'Asia/Shanghai',
  enabled: true,
  lastRunId: null,
  lastRunStatus: null,
  lastRunAt: null,
  createdAt: '2026-03-29T00:00:00Z',
  creatorName: null,
  ...overrides,
});

describe('scheduleStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start with empty state', () => {
    const store = useScheduleStore();
    expect(store.schedules).toEqual([]);
    expect(store.formVisible).toBe(false);
    expect(store.editingSchedule).toBeNull();
  });

  it('should fetch schedules', async () => {
    const items = [makeListItem(), makeListItem({ id: 'sched-2', name: 'Weekly Report' })];
    vi.mocked(scheduleApi.listSchedules).mockResolvedValue(items);

    const store = useScheduleStore();
    await store.fetchSchedules();

    expect(store.schedules).toEqual(items);
    expect(scheduleApi.listSchedules).toHaveBeenCalledOnce();
  });

  it('should create schedule and refresh list', async () => {
    const detail: ScheduleDetail = {
      ...makeListItem(),
      params: {},
      updatedAt: '2026-03-29T00:00:00Z',
    };
    vi.mocked(scheduleApi.createSchedule).mockResolvedValue(detail);
    vi.mocked(scheduleApi.listSchedules).mockResolvedValue([makeListItem()]);

    const store = useScheduleStore();
    const input = {
      name: 'Test',
      workflowId: 'wf-1',
      scheduleType: 'daily' as const,
      cronExpr: '0 8 * * *',
    };
    await store.createSchedule(input);

    expect(scheduleApi.createSchedule).toHaveBeenCalledWith(input);
    expect(scheduleApi.listSchedules).toHaveBeenCalled();
  });

  it('should delete schedule and refresh list', async () => {
    vi.mocked(scheduleApi.deleteSchedule).mockResolvedValue(undefined);
    vi.mocked(scheduleApi.listSchedules).mockResolvedValue([]);

    const store = useScheduleStore();
    store.schedules = [makeListItem()];
    await store.deleteSchedule('sched-1');

    expect(scheduleApi.deleteSchedule).toHaveBeenCalledWith('sched-1');
    expect(scheduleApi.listSchedules).toHaveBeenCalled();
  });

  it('should toggle enabled via updateSchedule', async () => {
    const updated: ScheduleDetail = {
      ...makeListItem({ enabled: false }),
      params: {},
      updatedAt: '2026-03-29T00:00:00Z',
    };
    vi.mocked(scheduleApi.updateSchedule).mockResolvedValue(updated);
    vi.mocked(scheduleApi.listSchedules).mockResolvedValue([makeListItem({ enabled: false })]);

    const store = useScheduleStore();
    store.schedules = [makeListItem()];
    await store.toggleEnabled('sched-1');

    expect(scheduleApi.updateSchedule).toHaveBeenCalledWith('sched-1', { enabled: false });
  });
});
