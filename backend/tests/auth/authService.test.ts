import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockFindUserByUsername = vi.fn();
const mockFindUserById = vi.fn();
const mockCreateRefreshToken = vi.fn();
const mockFindRefreshToken = vi.fn();
const mockDeleteRefreshToken = vi.fn();
const mockDeleteUserRefreshTokens = vi.fn();
const mockUpdateUserPassword = vi.fn();
const mockUpdateUser = vi.fn();

vi.mock('../../src/auth/authRepository', () => ({
  findUserByUsername: (...args: unknown[]) => mockFindUserByUsername(...args),
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
  createRefreshToken: (...args: unknown[]) => mockCreateRefreshToken(...args),
  findRefreshToken: (...args: unknown[]) => mockFindRefreshToken(...args),
  deleteRefreshToken: (...args: unknown[]) => mockDeleteRefreshToken(...args),
  deleteUserRefreshTokens: (...args: unknown[]) => mockDeleteUserRefreshTokens(...args),
  updateUserPassword: (...args: unknown[]) => mockUpdateUserPassword(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
}));

vi.mock('../../src/base/config', () => ({
  config: {
    jwt: {
      secret: 'test-secret-key-minimum-32-chars!!',
      accessExpires: '2h',
      refreshExpires: '7d',
    },
  },
}));

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashPassword / comparePassword', () => {
    it('should hash and verify a password', async () => {
      const { hashPassword, comparePassword } = await import('../../src/auth/authService');
      const hash = await hashPassword('MyPassword123!');
      expect(hash).not.toBe('MyPassword123!');
      expect(await comparePassword('MyPassword123!', hash)).toBe(true);
      expect(await comparePassword('wrong', hash)).toBe(false);
    });
  });

  describe('generateAccessToken / verifyAccessToken', () => {
    it('should generate and verify a valid access token', async () => {
      const { generateAccessToken, verifyAccessToken } = await import('../../src/auth/authService');
      const token = generateAccessToken({
        userId: 'u1',
        username: 'admin',
        role: 'admin',
        mustChangePassword: false,
      });
      expect(typeof token).toBe('string');
      const payload = verifyAccessToken(token);
      expect(payload.userId).toBe('u1');
      expect(payload.username).toBe('admin');
      expect(payload.role).toBe('admin');
    });

    it('should reject an invalid token', async () => {
      const { verifyAccessToken } = await import('../../src/auth/authService');
      expect(() => verifyAccessToken('invalid-token')).toThrow();
    });
  });

  describe('validatePasswordPolicy', () => {
    it('should reject password shorter than minLength', async () => {
      const { validatePasswordPolicy } = await import('../../src/auth/authService');
      const policy = {
        minLength: 8,
        requireUppercase: false,
        requireLowercase: false,
        requireNumbers: false,
        requireSpecialChars: false,
      };
      expect(() => validatePasswordPolicy('short', policy)).toThrow();
    });

    it('should reject missing uppercase when required', async () => {
      const { validatePasswordPolicy } = await import('../../src/auth/authService');
      const policy = {
        minLength: 1,
        requireUppercase: true,
        requireLowercase: false,
        requireNumbers: false,
        requireSpecialChars: false,
      };
      expect(() => validatePasswordPolicy('nouppercase', policy)).toThrow();
    });

    it('should accept a valid password', async () => {
      const { validatePasswordPolicy } = await import('../../src/auth/authService');
      const policy = {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
      };
      expect(() => validatePasswordPolicy('MyPass123!', policy)).not.toThrow();
    });
  });

  describe('generateRandomPassword', () => {
    it('should generate a password meeting default policy', async () => {
      const { generateRandomPassword } = await import('../../src/auth/authService');
      const pwd = generateRandomPassword();
      expect(pwd.length).toBeGreaterThanOrEqual(12);
      expect(/[A-Z]/.test(pwd)).toBe(true);
      expect(/[a-z]/.test(pwd)).toBe(true);
      expect(/[0-9]/.test(pwd)).toBe(true);
      expect(/[!@#$%^&*]/.test(pwd)).toBe(true);
    });
  });

  describe('changePassword', () => {
    it('revokes all refresh tokens after changing password', async () => {
      const { changePassword } = await import('../../src/auth/authService');

      const passwordHash = await (
        await import('../../src/auth/authService')
      ).hashPassword('OldPass@1');
      mockFindUserById.mockResolvedValue({
        id: 'u1',
        username: 'admin',
        password: passwordHash,
      });
      mockUpdateUserPassword.mockResolvedValue(undefined);
      mockDeleteUserRefreshTokens.mockResolvedValue(undefined);

      const policy = {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
      };

      await changePassword('u1', 'OldPass@1', 'NewPass@1', policy);

      expect(mockUpdateUserPassword).toHaveBeenCalledWith(
        'u1',
        expect.any(String),
        false
      );
      expect(mockDeleteUserRefreshTokens).toHaveBeenCalledWith('u1');
    });
  });
});
