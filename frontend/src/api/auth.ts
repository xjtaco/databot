import { http } from '@/utils';
import type {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  UserProfile,
  UpdateProfileRequest,
  ChangePasswordRequest,
  PasswordPolicy,
} from '@/types/auth';

export async function login(data: LoginRequest): Promise<LoginResponse> {
  return http.post<LoginResponse>('/auth/login', data);
}

export async function refresh(): Promise<RefreshResponse> {
  return http.post<RefreshResponse>('/auth/refresh');
}

export async function logout(): Promise<void> {
  await http.post<{ success: boolean }>('/auth/logout');
}

export async function changePassword(data: ChangePasswordRequest): Promise<void> {
  await http.put<{ success: boolean }>('/auth/change-password', data);
}

export async function getProfile(): Promise<UserProfile> {
  return http.get<UserProfile>('/auth/profile');
}

export async function updateProfile(data: UpdateProfileRequest): Promise<UserProfile> {
  return http.put<UserProfile>('/auth/profile', data);
}

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  return http.get<PasswordPolicy>('/global-config/password-policy');
}

export async function savePasswordPolicy(data: PasswordPolicy): Promise<PasswordPolicy> {
  return http.put<PasswordPolicy>('/global-config/password-policy', data);
}
