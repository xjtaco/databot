export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface AuthUser {
  id: string;
  username: string;
  name: string | null;
  role: string;
  mustChangePassword: boolean;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface UserProfile {
  id: string;
  username: string;
  name: string | null;
  email: string;
  gender: string | null;
  birthDate: string | null;
  role: string;
  locked: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileRequest {
  name?: string;
  gender?: string;
  birthDate?: string | null;
  email?: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}
