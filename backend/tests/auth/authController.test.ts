import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock authService
const mockLogin = vi.fn();
const mockRefresh = vi.fn();
const mockLogout = vi.fn();
const mockChangePassword = vi.fn();
const mockParseRefreshExpires = vi.fn(() => 7 * 24 * 60 * 60 * 1000);

vi.mock('../../src/auth/authService', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  refresh: (...args: unknown[]) => mockRefresh(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  changePassword: (...args: unknown[]) => mockChangePassword(...args),
  parseRefreshExpires: () => mockParseRefreshExpires(),
}));

// Mock authRepository
const mockFindUserById = vi.fn();
const mockUpdateUser = vi.fn();

vi.mock('../../src/auth/authRepository', () => ({
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
}));

// Mock rate limiter
const mockCheckRateLimit = vi.fn();
const mockRecordFailedAttempt = vi.fn();
const mockRecordSuccessfulLogin = vi.fn();

vi.mock('../../src/auth/loginRateLimiter', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  recordFailedAttempt: (...args: unknown[]) => mockRecordFailedAttempt(...args),
  recordSuccessfulLogin: (...args: unknown[]) => mockRecordSuccessfulLogin(...args),
}));

// Mock password policy helper
const mockGetPasswordPolicy = vi.fn();

vi.mock('../../src/auth/passwordPolicyHelper', () => ({
  getPasswordPolicy: () => mockGetPasswordPolicy(),
}));

vi.mock('../../src/errors/errorCode', () => ({
  ErrorCode: {
    UNAUTHORIZED: 'UNAUTHORIZED',
    REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
  },
}));

vi.mock('../../src/base/config', () => ({
  config: {
    jwt: {
      secret: 'test-secret',
      accessExpires: '2h',
      refreshExpires: '7d',
    },
    admin: { initialPassword: 'Admin@123', email: 'admin@localhost' },
    internal: { port: 3001 },
  },
}));

function makeRes(): Response {
  const res = {
    json: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    cookies: {},
    user: undefined,
    ...overrides,
  } as unknown as Request;
}

describe('loginHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns accessToken and user, sets cookie on successful login', async () => {
    const { loginHandler } = await import('../../src/auth/authController');

    const loginResult = {
      accessToken: 'access-token-123',
      refreshToken: 'refresh-token-abc',
      user: { id: 'u1', username: 'admin', name: null, role: 'admin', mustChangePassword: false },
    };
    mockLogin.mockResolvedValue(loginResult);

    const req = makeReq({ body: { username: 'admin', password: 'Admin@123' } });
    const res = makeRes();

    await loginHandler(req, res);

    expect(mockCheckRateLimit).toHaveBeenCalledWith('admin');
    expect(mockLogin).toHaveBeenCalledWith('admin', 'Admin@123');
    expect(mockRecordSuccessfulLogin).toHaveBeenCalledWith('admin');
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token-abc',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/api/auth',
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      accessToken: 'access-token-123',
      user: loginResult.user,
    });
  });

  it('records failed attempt and rethrows when login fails', async () => {
    const { loginHandler } = await import('../../src/auth/authController');

    const { UnauthorizedError } = await import('../../src/errors/types');
    mockLogin.mockRejectedValue(new UnauthorizedError('Invalid credentials'));

    const req = makeReq({ body: { username: 'admin', password: 'wrong' } });
    const res = makeRes();

    await expect(loginHandler(req, res)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(mockRecordFailedAttempt).toHaveBeenCalledWith('admin');
    expect(mockRecordSuccessfulLogin).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('throws ValidationError when username is missing', async () => {
    const { loginHandler } = await import('../../src/auth/authController');
    const { ValidationError } = await import('../../src/errors/types');

    const req = makeReq({ body: { username: '', password: 'Admin@123' } });
    const res = makeRes();

    await expect(loginHandler(req, res)).rejects.toBeInstanceOf(ValidationError);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('throws ValidationError when password is missing', async () => {
    const { loginHandler } = await import('../../src/auth/authController');
    const { ValidationError } = await import('../../src/errors/types');

    const req = makeReq({ body: { username: 'admin', password: '' } });
    const res = makeRes();

    await expect(loginHandler(req, res)).rejects.toBeInstanceOf(ValidationError);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('calls checkRateLimit before login attempt', async () => {
    const { loginHandler } = await import('../../src/auth/authController');
    const { ApiError } = await import('../../src/errors/types');

    mockCheckRateLimit.mockImplementation(() => {
      throw new ApiError('Too many attempts', 'RATE_LIMIT_EXCEEDED', 429);
    });

    const req = makeReq({ body: { username: 'admin', password: 'Admin@123' } });
    const res = makeRes();

    await expect(loginHandler(req, res)).rejects.toThrow('Too many attempts');
    expect(mockLogin).not.toHaveBeenCalled();
  });
});

describe('refreshHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns new accessToken and sets new cookie', async () => {
    const { refreshHandler } = await import('../../src/auth/authController');

    mockRefresh.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    const req = makeReq({ cookies: { refreshToken: 'old-refresh-token' } });
    const res = makeRes();

    await refreshHandler(req, res);

    expect(mockRefresh).toHaveBeenCalledWith('old-refresh-token');
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'new-refresh-token',
      expect.objectContaining({ httpOnly: true, path: '/api/auth' })
    );
    expect(res.json).toHaveBeenCalledWith({ accessToken: 'new-access-token' });
  });

  it('throws UnauthorizedError when no refresh token cookie', async () => {
    const { refreshHandler } = await import('../../src/auth/authController');
    const { UnauthorizedError } = await import('../../src/errors/types');

    const req = makeReq({ cookies: {} });
    const res = makeRes();

    await expect(refreshHandler(req, res)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe('logoutHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls logout and clears cookie', async () => {
    const { logoutHandler } = await import('../../src/auth/authController');

    const req = makeReq({
      user: { userId: 'u1', username: 'admin', role: 'admin', mustChangePassword: false },
      cookies: { refreshToken: 'some-refresh-token' },
    });
    const res = makeRes();

    await logoutHandler(req, res);

    expect(mockLogout).toHaveBeenCalledWith('some-refresh-token');
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refreshToken',
      expect.objectContaining({ path: '/api/auth' })
    );
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('still clears cookie even if no refresh token present', async () => {
    const { logoutHandler } = await import('../../src/auth/authController');

    const req = makeReq({
      user: { userId: 'u1', username: 'admin', role: 'admin', mustChangePassword: false },
      cookies: {},
    });
    const res = makeRes();

    await logoutHandler(req, res);

    expect(mockLogout).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});

describe('changePasswordHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls changePassword with policy and returns success', async () => {
    const { changePasswordHandler } = await import('../../src/auth/authController');

    const policy = {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
    };
    mockGetPasswordPolicy.mockResolvedValue(policy);

    const req = makeReq({
      user: { userId: 'u1', username: 'admin', role: 'admin', mustChangePassword: false },
      body: { oldPassword: 'OldPass@1', newPassword: 'NewPass@1' },
    });
    const res = makeRes();

    await changePasswordHandler(req, res);

    expect(mockGetPasswordPolicy).toHaveBeenCalled();
    expect(mockChangePassword).toHaveBeenCalledWith('u1', 'OldPass@1', 'NewPass@1', policy);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('throws UnauthorizedError when user not authenticated', async () => {
    const { changePasswordHandler } = await import('../../src/auth/authController');
    const { UnauthorizedError } = await import('../../src/errors/types');

    const req = makeReq({ user: undefined, body: { oldPassword: 'old', newPassword: 'new' } });
    const res = makeRes();

    await expect(changePasswordHandler(req, res)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws ValidationError when oldPassword is missing', async () => {
    const { changePasswordHandler } = await import('../../src/auth/authController');
    const { ValidationError } = await import('../../src/errors/types');

    const req = makeReq({
      user: { userId: 'u1', username: 'admin', role: 'admin', mustChangePassword: false },
      body: { oldPassword: '', newPassword: 'NewPass@1' },
    });
    const res = makeRes();

    await expect(changePasswordHandler(req, res)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('getProfileHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user profile without password', async () => {
    const { getProfileHandler } = await import('../../src/auth/authController');

    const user = {
      id: 'u1',
      username: 'admin',
      password: 'hashed-secret',
      name: 'Admin User',
      email: 'admin@localhost',
      role: 'admin',
      mustChangePassword: false,
      locked: false,
      gender: null,
      birthDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockFindUserById.mockResolvedValue(user);

    const req = makeReq({
      user: { userId: 'u1', username: 'admin', role: 'admin', mustChangePassword: false },
    });
    const res = makeRes();

    await getProfileHandler(req, res);

    expect(mockFindUserById).toHaveBeenCalledWith('u1');
    const jsonArg = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(jsonArg.password).toBeUndefined();
    expect(jsonArg.id).toBe('u1');
    expect(jsonArg.username).toBe('admin');
  });

  it('throws UnauthorizedError when user not authenticated', async () => {
    const { getProfileHandler } = await import('../../src/auth/authController');
    const { UnauthorizedError } = await import('../../src/errors/types');

    const req = makeReq({ user: undefined });
    const res = makeRes();

    await expect(getProfileHandler(req, res)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('updateProfileHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates user profile and returns updated data without password', async () => {
    const { updateProfileHandler } = await import('../../src/auth/authController');

    const updatedUser = {
      id: 'u1',
      username: 'admin',
      password: 'hashed-secret',
      name: 'New Name',
      email: 'new@localhost',
      role: 'admin',
      mustChangePassword: false,
      locked: false,
      gender: null,
      birthDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockUpdateUser.mockResolvedValue(updatedUser);

    const req = makeReq({
      user: { userId: 'u1', username: 'admin', role: 'admin', mustChangePassword: false },
      body: { name: 'New Name', email: 'new@localhost' },
    });
    const res = makeRes();

    await updateProfileHandler(req, res);

    expect(mockUpdateUser).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ name: 'New Name', email: 'new@localhost' })
    );
    const jsonArg = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(jsonArg.password).toBeUndefined();
    expect(jsonArg.name).toBe('New Name');
  });

  it('throws UnauthorizedError when user not authenticated', async () => {
    const { updateProfileHandler } = await import('../../src/auth/authController');
    const { UnauthorizedError } = await import('../../src/errors/types');

    const req = makeReq({ user: undefined, body: { name: 'test' } });
    const res = makeRes();

    await expect(updateProfileHandler(req, res)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws ValidationError for invalid birthDate', async () => {
    const { updateProfileHandler } = await import('../../src/auth/authController');
    const { ValidationError } = await import('../../src/errors/types');

    const req = makeReq({
      user: { userId: 'u1', username: 'admin', role: 'admin', mustChangePassword: false },
      body: { birthDate: 'not-a-date' },
    });
    const res = makeRes();

    await expect(updateProfileHandler(req, res)).rejects.toBeInstanceOf(ValidationError);
  });
});
