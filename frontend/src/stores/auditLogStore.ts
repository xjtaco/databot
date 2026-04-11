import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AuditLogEntry, AuditActionItem } from '@/types/auditLog';
import * as auditLogApi from '@/api/auditLog';
import { useAsyncAction } from '@/composables/useAsyncAction';

export const useAuditLogStore = defineStore('auditLog', () => {
  const logs = ref<AuditLogEntry[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(20);
  const actionTypes = ref<AuditActionItem[]>([]);

  // Filters
  const startDate = ref<string>('');
  const endDate = ref<string>('');
  const selectedUserId = ref<string>('');
  const selectedCategory = ref<string>('');
  const selectedAction = ref<string>('');
  const keyword = ref<string>('');

  const { isLoading, error, wrapAction } = useAsyncAction();

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

  const fetchLogs = wrapAction(async (): Promise<void> => {
    const result = await auditLogApi.fetchAuditLogs({
      page: page.value,
      pageSize: pageSize.value,
      startDate: startDate.value || undefined,
      endDate: endDate.value || undefined,
      userId: selectedUserId.value || undefined,
      category: selectedCategory.value || undefined,
      action: selectedAction.value || undefined,
      keyword: keyword.value || undefined,
    });
    logs.value = result.logs;
    total.value = result.total;
  });

  const fetchActions = wrapAction(async (): Promise<void> => {
    const result = await auditLogApi.fetchAuditActions();
    actionTypes.value = result.actions;
  });

  const doExport = wrapAction(async (): Promise<void> => {
    const blob = await auditLogApi.exportAuditLogs({
      startDate: startDate.value || undefined,
      endDate: endDate.value || undefined,
      userId: selectedUserId.value || undefined,
      category: selectedCategory.value || undefined,
      action: selectedAction.value || undefined,
      keyword: keyword.value || undefined,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  function setPage(newPage: number): void {
    page.value = newPage;
  }

  function setCategory(cat: string): void {
    selectedCategory.value = cat;
    selectedAction.value = '';
    page.value = 1;
  }

  function setAction(act: string): void {
    selectedAction.value = act;
    page.value = 1;
  }

  function setKeyword(kw: string): void {
    keyword.value = kw;
    page.value = 1;
  }

  function setDateRange(start: string, end: string): void {
    startDate.value = start;
    endDate.value = end;
    page.value = 1;
  }

  function setUserId(uid: string): void {
    selectedUserId.value = uid;
    page.value = 1;
  }

  function resetFilters(): void {
    startDate.value = '';
    endDate.value = '';
    selectedUserId.value = '';
    selectedCategory.value = '';
    selectedAction.value = '';
    keyword.value = '';
    page.value = 1;
  }

  return {
    logs,
    total,
    page,
    pageSize,
    totalPages,
    actionTypes,
    startDate,
    endDate,
    selectedUserId,
    selectedCategory,
    selectedAction,
    keyword,
    isLoading,
    error,
    fetchLogs,
    fetchActions,
    doExport,
    setPage,
    setCategory,
    setAction,
    setKeyword,
    setDateRange,
    setUserId,
    resetFilters,
  };
});
