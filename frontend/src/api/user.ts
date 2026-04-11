import { http } from '@/utils';
import type {
  UserListResponse,
  CreateUserRequest,
  CreateUserResult,
  UserRecord,
  UpdateUserRequest,
} from '@/types/user';

export async function listUsers(
  page: number = 1,
  pageSize: number = 20,
  search?: string
): Promise<UserListResponse> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  if (search) {
    params.set('search', search);
  }
  return http.get<UserListResponse>(`/users?${params.toString()}`);
}

export async function createUser(data: CreateUserRequest): Promise<CreateUserResult> {
  return http.post<CreateUserResult>('/users', data);
}

export async function getUser(id: string): Promise<UserRecord> {
  return http.get<UserRecord>(`/users/${id}`);
}

export async function updateUser(id: string, data: UpdateUserRequest): Promise<UserRecord> {
  return http.put<UserRecord>(`/users/${id}`, data);
}

export async function lockUser(id: string): Promise<void> {
  await http.put<{ success: boolean }>(`/users/${id}/lock`, {});
}

export async function unlockUser(id: string): Promise<void> {
  await http.put<{ success: boolean }>(`/users/${id}/unlock`, {});
}

export async function deleteUser(id: string): Promise<void> {
  await http.delete(`/users/${id}`);
}
