import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockFindUserByUsername = vi.fn();
const mockFindUserByEmail = vi.fn();
const mockFindUserById = vi.fn();
const mockCreateUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockDeleteUser = vi.fn();
const mockReassignUserResources = vi.fn();
const mockDeleteUserChatSessions = vi.fn();

vi.mock('../../src/user/userRepository', () => ({
  findUserByUsername: (...args: unknown[]) => mockFindUserByUsername(...args),
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
  reassignUserResources: (...args: unknown[]) => mockReassignUserResources(...args),
  deleteUserChatSessions: (...args: unknown[]) => mockDeleteUserChatSessions(...args),
}));

const mockGenerateRandomPassword = vi.fn(() => 'TempPass123!');
const mockHashPassword = vi.fn((p: string) => Promise.resolve(`hashed_${p}`));

vi.mock('../../src/auth/authService', () => ({
  generateRandomPassword: (...args: Parameters<typeof mockGenerateRandomPassword>) =>
    mockGenerateRandomPassword(...args),
  hashPassword: (...args: Parameters<typeof mockHashPassword>) => mockHashPassword(...args),
}));

const mockDeleteUserRefreshTokens = vi.fn();
vi.mock('../../src/auth/authRepository', () => ({
  deleteUserRefreshTokens: (...args: unknown[]) => mockDeleteUserRefreshTokens(...args),
}));

const mockSendWelcomeEmail = vi.fn(() => Promise.resolve(true));
vi.mock('../../src/email/emailService', () => ({
  sendWelcomeEmail: (...args: Parameters<typeof mockSendWelcomeEmail>) =>
    mockSendWelcomeEmail(...args),
}));

describe('userService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createUserWithRandomPassword', () => {
    it('should create a user with a random password and send welcome email', async () => {
      mockFindUserByUsername.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue({
        id: 'user-1',
        username: 'newuser',
        email: 'new@example.com',
        password: 'hashed_TempPass123!',
        name: null,
        gender: null,
        birthDate: null,
        role: 'user',
        locked: false,
        mustChangePassword: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockSendWelcomeEmail.mockResolvedValue(true);

      const { createUserWithRandomPassword } = await import('../../src/user/userService');
      const result = await createUserWithRandomPassword({
        username: 'newuser',
        email: 'new@example.com',
      });

      expect(mockGenerateRandomPassword).toHaveBeenCalledOnce();
      expect(mockHashPassword).toHaveBeenCalledWith('TempPass123!');
      expect(mockCreateUser).toHaveBeenCalledOnce();
      expect(mockSendWelcomeEmail).toHaveBeenCalledWith(
        'new@example.com',
        'newuser',
        'TempPass123!'
      );
      expect(result.user.username).toBe('newuser');
      expect(result.passwordSent).toBe(true);
      expect(result.tempPassword).toBeUndefined();
    });

    it('should include tempPassword in result when email could not be sent', async () => {
      mockFindUserByUsername.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue(null);
      mockCreateUser.mockResolvedValue({
        id: 'user-2',
        username: 'anotheruser',
        email: 'another@example.com',
        password: 'hashed_TempPass123!',
        name: null,
        gender: null,
        birthDate: null,
        role: 'user',
        locked: false,
        mustChangePassword: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockSendWelcomeEmail.mockResolvedValue(false);

      const { createUserWithRandomPassword } = await import('../../src/user/userService');
      const result = await createUserWithRandomPassword({
        username: 'anotheruser',
        email: 'another@example.com',
      });

      expect(result.passwordSent).toBe(false);
      expect(result.tempPassword).toBe('TempPass123!');
    });

    it('should reject duplicate username', async () => {
      mockFindUserByUsername.mockResolvedValue({
        id: 'existing-1',
        username: 'existinguser',
        email: 'existing@example.com',
      });

      const { createUserWithRandomPassword } = await import('../../src/user/userService');

      await expect(
        createUserWithRandomPassword({
          username: 'existinguser',
          email: 'new@example.com',
        })
      ).rejects.toMatchObject({ code: 'E00049' }); // USERNAME_TAKEN
    });

    it('should reject duplicate email', async () => {
      mockFindUserByUsername.mockResolvedValue(null);
      mockFindUserByEmail.mockResolvedValue({
        id: 'existing-2',
        username: 'otheruser',
        email: 'taken@example.com',
      });

      const { createUserWithRandomPassword } = await import('../../src/user/userService');

      await expect(
        createUserWithRandomPassword({
          username: 'newuser',
          email: 'taken@example.com',
        })
      ).rejects.toMatchObject({ code: 'E00050' }); // EMAIL_TAKEN
    });
  });

  describe('lockUser', () => {
    it('should lock a non-admin user and delete their refresh tokens', async () => {
      mockFindUserById.mockResolvedValue({
        id: 'user-1',
        username: 'regularuser',
        role: 'user',
      });
      mockUpdateUser.mockResolvedValue({});
      mockDeleteUserRefreshTokens.mockResolvedValue(undefined);

      const { lockUser } = await import('../../src/user/userService');
      await lockUser('user-1');

      expect(mockUpdateUser).toHaveBeenCalledWith('user-1', { locked: true });
      expect(mockDeleteUserRefreshTokens).toHaveBeenCalledWith('user-1');
    });

    it('should throw ForbiddenError when trying to lock an admin', async () => {
      mockFindUserById.mockResolvedValue({
        id: 'admin-1',
        username: 'admin',
        role: 'admin',
      });

      const { lockUser } = await import('../../src/user/userService');

      await expect(lockUser('admin-1')).rejects.toMatchObject({ code: 'E00053' }); // CANNOT_LOCK_ADMIN
    });
  });

  describe('deleteUserById', () => {
    it('should reassign resources, delete sessions, then delete non-admin user', async () => {
      mockFindUserById.mockResolvedValue({
        id: 'user-1',
        username: 'regularuser',
        role: 'user',
      });
      mockReassignUserResources.mockResolvedValue(undefined);
      mockDeleteUserChatSessions.mockResolvedValue(undefined);
      mockDeleteUser.mockResolvedValue(undefined);

      const { deleteUserById } = await import('../../src/user/userService');
      await deleteUserById('user-1', 'admin-1');

      expect(mockReassignUserResources).toHaveBeenCalledWith('user-1', 'admin-1');
      expect(mockDeleteUserChatSessions).toHaveBeenCalledWith('user-1');
      expect(mockDeleteUser).toHaveBeenCalledWith('user-1');
    });

    it('should throw ForbiddenError when trying to delete an admin', async () => {
      mockFindUserById.mockResolvedValue({
        id: 'admin-1',
        username: 'admin',
        role: 'admin',
      });

      const { deleteUserById } = await import('../../src/user/userService');

      await expect(deleteUserById('admin-1', 'admin-1')).rejects.toMatchObject({
        code: 'E00052', // CANNOT_DELETE_ADMIN
      });
    });
  });
});
