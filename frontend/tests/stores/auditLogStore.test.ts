import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('@/api/auditLog', () => ({
  fetchAuditLogs: vi.fn(),
  fetchAuditActions: vi.fn(),
  exportAuditLogs: vi.fn(),
}));

import { fetchAuditLogs, fetchAuditActions } from '@/api/auditLog';
import { useAuditLogStore } from '@/stores/auditLogStore';

const mockedFetchLogs = vi.mocked(fetchAuditLogs);
const mockedFetchActions = vi.mocked(fetchAuditActions);

describe('auditLogStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('should fetch logs with pagination', async () => {
    mockedFetchLogs.mockResolvedValue({
      logs: [
        {
          id: 'log-1',
          username: 'admin',
          action: 'LOGIN_SUCCESS',
          category: 'auth',
          params: null,
          userId: 'u1',
          ipAddress: null,
          createdAt: '2026-04-04T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const store = useAuditLogStore();
    await store.fetchLogs();

    expect(store.logs).toHaveLength(1);
    expect(store.total).toBe(1);
    expect(mockedFetchLogs).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 })
    );
  });

  it('should fetch action types', async () => {
    mockedFetchActions.mockResolvedValue({
      actions: [{ action: 'LOGIN_SUCCESS', category: 'auth' }],
    });

    const store = useAuditLogStore();
    await store.fetchActions();

    expect(store.actionTypes).toHaveLength(1);
  });

  it('should reset page to 1 when filters change', async () => {
    mockedFetchLogs.mockResolvedValue({ logs: [], total: 0, page: 1, pageSize: 20 });

    const store = useAuditLogStore();
    store.page = 3;
    store.setCategory('auth');

    expect(store.page).toBe(1);
  });

  it('should reset action when category changes', async () => {
    const store = useAuditLogStore();
    store.selectedAction = 'LOGIN_SUCCESS';
    store.setCategory('user_management');

    expect(store.selectedAction).toBe('');
    expect(store.selectedCategory).toBe('user_management');
  });

  it('should reset all filters', () => {
    const store = useAuditLogStore();
    store.startDate = '2026-01-01';
    store.endDate = '2026-04-04';
    store.selectedUserId = 'u1';
    store.selectedCategory = 'auth';
    store.selectedAction = 'LOGIN_SUCCESS';
    store.keyword = 'test';
    store.page = 5;

    store.resetFilters();

    expect(store.startDate).toBe('');
    expect(store.endDate).toBe('');
    expect(store.selectedUserId).toBe('');
    expect(store.selectedCategory).toBe('');
    expect(store.selectedAction).toBe('');
    expect(store.keyword).toBe('');
    expect(store.page).toBe(1);
  });
});
