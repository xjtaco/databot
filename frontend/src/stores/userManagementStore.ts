import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { UserRecord, CreateUserRequest, CreateUserResult, UpdateUserRequest } from '@/types';
import * as userApi from '@/api/user';
import { useAsyncAction } from '@/composables/useAsyncAction';

export const useUserManagementStore = defineStore('userManagement', () => {
  const users = ref<UserRecord[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(20);
  const searchQuery = ref('');

  const { isLoading, error, wrapAction } = useAsyncAction();

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

  const fetchUsers = wrapAction(async (): Promise<void> => {
    const result = await userApi.listUsers(
      page.value,
      pageSize.value,
      searchQuery.value || undefined
    );
    users.value = result.users;
    total.value = result.total;
    page.value = result.page;
    pageSize.value = result.pageSize;
  });

  const createUser = wrapAction(async (data: CreateUserRequest): Promise<CreateUserResult> => {
    const result = await userApi.createUser(data);
    await fetchUsers();
    return result;
  });

  const updateUser = wrapAction(async (id: string, data: UpdateUserRequest): Promise<void> => {
    await userApi.updateUser(id, data);
    await fetchUsers();
  });

  const lockUser = wrapAction(async (id: string): Promise<void> => {
    await userApi.lockUser(id);
    await fetchUsers();
  });

  const unlockUser = wrapAction(async (id: string): Promise<void> => {
    await userApi.unlockUser(id);
    await fetchUsers();
  });

  const deleteUser = wrapAction(async (id: string): Promise<void> => {
    await userApi.deleteUser(id);
    await fetchUsers();
  });

  function setPage(newPage: number): void {
    page.value = newPage;
  }

  function setSearch(query: string): void {
    searchQuery.value = query;
    page.value = 1;
  }

  return {
    users,
    total,
    page,
    pageSize,
    searchQuery,
    totalPages,
    isLoading,
    error,
    fetchUsers,
    createUser,
    updateUser,
    lockUser,
    unlockUser,
    deleteUser,
    setPage,
    setSearch,
  };
});
