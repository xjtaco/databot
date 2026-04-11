import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import * as api from '@/api/schedule';
import type {
  ScheduleListItem,
  ScheduleDetail,
  CreateScheduleInput,
  UpdateScheduleInput,
} from '@/types/schedule';

export const useScheduleStore = defineStore('schedule', () => {
  const schedules = ref<ScheduleListItem[]>([]);
  const searchQuery = ref('');
  const formVisible = ref(false);
  const editingSchedule = ref<ScheduleDetail | null>(null);
  const loading = ref(false);

  const filteredSchedules = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return schedules.value;
    return schedules.value.filter((s) => s.name.toLowerCase().includes(q));
  });

  async function fetchSchedules(): Promise<void> {
    loading.value = true;
    try {
      schedules.value = await api.listSchedules();
    } finally {
      loading.value = false;
    }
  }

  async function createSchedule(input: CreateScheduleInput): Promise<ScheduleDetail> {
    const result = await api.createSchedule(input);
    await fetchSchedules();
    return result;
  }

  async function updateSchedule(id: string, input: UpdateScheduleInput): Promise<ScheduleDetail> {
    const result = await api.updateSchedule(id, input);
    await fetchSchedules();
    return result;
  }

  async function deleteSchedule(id: string): Promise<void> {
    await api.deleteSchedule(id);
    await fetchSchedules();
  }

  async function toggleEnabled(id: string): Promise<void> {
    const schedule = schedules.value.find((s) => s.id === id);
    if (!schedule) return;
    await updateSchedule(id, { enabled: !schedule.enabled });
  }

  async function loadEditingSchedule(id: string): Promise<void> {
    editingSchedule.value = await api.getSchedule(id);
  }

  function openCreateForm(): void {
    editingSchedule.value = null;
    formVisible.value = true;
  }

  async function openEditForm(id: string): Promise<void> {
    await loadEditingSchedule(id);
    formVisible.value = true;
  }

  function closeForm(): void {
    formVisible.value = false;
    editingSchedule.value = null;
  }

  return {
    schedules,
    searchQuery,
    filteredSchedules,
    formVisible,
    editingSchedule,
    loading,
    fetchSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    toggleEnabled,
    loadEditingSchedule,
    openCreateForm,
    openEditForm,
    closeForm,
  };
});
