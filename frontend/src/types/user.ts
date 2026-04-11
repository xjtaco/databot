export interface UserRecord {
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

export interface UserListResponse {
  users: UserRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  name?: string;
  gender?: string;
  birthDate?: string;
}

export interface CreateUserResult {
  user: UserRecord;
  passwordSent: boolean;
  tempPassword?: string;
}

export interface UpdateUserRequest {
  name?: string;
  gender?: string;
  birthDate?: string | null;
  email?: string;
  role?: string;
}
