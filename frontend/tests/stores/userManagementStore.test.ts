import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUserManagementStore } from '@/stores/userManagementStore';

vi.mock('@/api/user', () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  lockUser: vi.fn(),
  unlockUser: vi.fn(),
  deleteUser: vi.fn(),
}));

describe('userManagementStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should have correct initial state', () => {
    const store = useUserManagementStore();

    expect(store.users).toEqual([]);
    expect(store.total).toBe(0);
    expect(store.page).toBe(1);
    expect(store.pageSize).toBe(20);
    expect(store.searchQuery).toBe('');
    expect(store.isLoading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.totalPages).toBe(1);
  });

  it('should fetch users and update state', async () => {
    const { listUsers } = await import('@/api/user');
    const mockListUsers = vi.mocked(listUsers);
    mockListUsers.mockResolvedValue({
      users: [
        {
          id: '1',
          username: 'admin',
          name: 'Admin',
          email: 'admin@test.com',
          gender: null,
          birthDate: null,
          role: 'admin',
          locked: false,
          mustChangePassword: false,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const store = useUserManagementStore();
    await store.fetchUsers();

    expect(mockListUsers).toHaveBeenCalledWith(1, 20, undefined);
    expect(store.users).toHaveLength(1);
    expect(store.users[0].username).toBe('admin');
    expect(store.total).toBe(1);
  });

  it('should compute totalPages from total and pageSize', async () => {
    const { listUsers } = await import('@/api/user');
    const mockListUsers = vi.mocked(listUsers);
    mockListUsers.mockResolvedValue({
      users: [],
      total: 45,
      page: 1,
      pageSize: 20,
    });

    const store = useUserManagementStore();
    await store.fetchUsers();

    expect(store.totalPages).toBe(3);
  });

  it('should update searchQuery and reset page via setSearch', () => {
    const store = useUserManagementStore();
    store.setPage(3);
    expect(store.page).toBe(3);

    store.setSearch('alice');
    expect(store.searchQuery).toBe('alice');
    expect(store.page).toBe(1);
  });
});
