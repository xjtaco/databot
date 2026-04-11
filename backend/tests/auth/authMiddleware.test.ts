import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockVerifyAccessToken = vi.fn();

vi.mock('../../src/auth/authService', () => ({
  verifyAccessToken: (...args: unknown[]) => mockVerifyAccessToken(...args),
}));

const mockFindUserById = vi.fn();

vi.mock('../../src/auth/authRepository', () => ({
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
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

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    user: undefined,
    path: '/api/some/path',
    ...overrides,
  } as unknown as Request;
}

const mockRes = {} as Response;
const mockNext = vi.fn() as NextFunction;

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets req.user and calls next for a valid Bearer token', async () => {
    const { authMiddleware } = await import('../../src/auth/authMiddleware');
    const payload = { userId: 'u1', username: 'alice', role: 'user', mustChangePassword: false };
    mockVerifyAccessToken.mockReturnValue(payload);

    const req = makeReq({ headers: { authorization: 'Bearer valid-token' } });
    await authMiddleware(req, mockRes, mockNext);

    expect(mockVerifyAccessToken).toHaveBeenCalledWith('valid-token');
    expect(req.user).toEqual(payload);
    expect(mockNext).toHaveBeenCalledOnce();
  });

  it('throws UnauthorizedError when Authorization header is missing', async () => {
    const { authMiddleware } = await import('../../src/auth/authMiddleware');
    const { UnauthorizedError } = await import('../../src/errors/types');

    const req = makeReq({ headers: {} });
    await expect(authMiddleware(req, mockRes, mockNext)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedError when Authorization header does not start with Bearer', async () => {
    const { authMiddleware } = await import('../../src/auth/authMiddleware');
    const { UnauthorizedError } = await import('../../src/errors/types');

    const req = makeReq({ headers: { authorization: 'Basic abc123' } });
    await expect(authMiddleware(req, mockRes, mockNext)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedError when verifyAccessToken throws', async () => {
    const { authMiddleware } = await import('../../src/auth/authMiddleware');
    const { UnauthorizedError } = await import('../../src/errors/types');

    mockVerifyAccessToken.mockImplementation(() => {
      throw new UnauthorizedError('Invalid access token');
    });

    const req = makeReq({ headers: { authorization: 'Bearer bad-token' } });
    await expect(authMiddleware(req, mockRes, mockNext)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(mockNext).not.toHaveBeenCalled();
  });
});

describe('adminOnly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next when req.user has role admin', async () => {
    const { adminOnly } = await import('../../src/auth/adminOnly');
    const req = makeReq({
      user: { userId: 'u1', username: 'admin', role: 'admin', mustChangePassword: false },
    });

    adminOnly(req, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledOnce();
  });

  it('throws ForbiddenError for a non-admin user', async () => {
    const { adminOnly } = await import('../../src/auth/adminOnly');
    const { ForbiddenError } = await import('../../src/errors/types');
    const req = makeReq({
      user: { userId: 'u2', username: 'alice', role: 'user', mustChangePassword: false },
    });

    expect(() => adminOnly(req, mockRes, mockNext)).toThrow(ForbiddenError);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('throws ForbiddenError when req.user is undefined', async () => {
    const { adminOnly } = await import('../../src/auth/adminOnly');
    const { ForbiddenError } = await import('../../src/errors/types');
    const req = makeReq({ user: undefined });

    expect(() => adminOnly(req, mockRes, mockNext)).toThrow(ForbiddenError);
    expect(mockNext).not.toHaveBeenCalled();
  });
});

describe('mustChangePasswordCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next immediately when req.user is not set', async () => {
    const { mustChangePasswordCheck } = await import('../../src/auth/mustChangePassword');
    const req = makeReq({ user: undefined });

    mustChangePasswordCheck(req, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledOnce();
  });

  it('calls next for exempt path /api/auth/change-password', async () => {
    const { mustChangePasswordCheck } = await import('../../src/auth/mustChangePassword');
    const req = makeReq({
      user: { userId: 'u1', username: 'alice', role: 'user', mustChangePassword: true },
      path: '/api/auth/change-password',
    });

    mustChangePasswordCheck(req, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledOnce();
  });

  it('calls next for exempt path /api/auth/logout', async () => {
    const { mustChangePasswordCheck } = await import('../../src/auth/mustChangePassword');
    const req = makeReq({
      user: { userId: 'u1', username: 'alice', role: 'user', mustChangePassword: true },
      path: '/api/auth/logout',
    });

    mustChangePasswordCheck(req, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledOnce();
  });

  it('calls next when user does not need to change password', async () => {
    const { mustChangePasswordCheck } = await import('../../src/auth/mustChangePassword');

    const req = makeReq({
      user: { userId: 'u1', username: 'alice', role: 'user', mustChangePassword: false },
      path: '/api/data',
    });

    mustChangePasswordCheck(req, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledOnce();
  });

  it('throws ForbiddenError when user must change password', async () => {
    const { mustChangePasswordCheck } = await import('../../src/auth/mustChangePassword');
    const { ForbiddenError } = await import('../../src/errors/types');

    const req = makeReq({
      user: { userId: 'u1', username: 'alice', role: 'user', mustChangePassword: true },
      path: '/api/data',
    });

    expect(() => mustChangePasswordCheck(req, mockRes, mockNext)).toThrow(ForbiddenError);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
