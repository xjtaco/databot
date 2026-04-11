import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockListUsers = vi.fn();
const mockCountUsers = vi.fn();
const mockFindFirstAdmin = vi.fn();

vi.mock('../../src/user/userRepository', () => ({
  listUsers: (...args: unknown[]) => mockListUsers(...args),
  countUsers: (...args: unknown[]) => mockCountUsers(...args),
  findFirstAdmin: (...args: unknown[]) => mockFindFirstAdmin(...args),
}));

const mockCreateUserWithRandomPassword = vi.fn();
const mockDeleteUserById = vi.fn();

vi.mock('../../src/user/userService', () => ({
  createUserWithRandomPassword: (...args: unknown[]) => mockCreateUserWithRandomPassword(...args),
  deleteUserById: (...args: unknown[]) => mockDeleteUserById(...args),
}));

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    query: {},
    body: {},
    params: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response {
  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('listUsersHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated users with defaults', async () => {
    const { listUsersHandler } = await import('../../src/user/userController');

    const users = [{ id: 'u1', username: 'admin', name: 'Admin', role: 'admin' }];
    mockListUsers.mockResolvedValue(users);
    mockCountUsers.mockResolvedValue(1);

    const req = makeReq({ query: {} });
    const res = makeRes();

    await listUsersHandler(req, res);

    expect(mockListUsers).toHaveBeenCalledWith(1, 20, undefined);
    expect(mockCountUsers).toHaveBeenCalledWith(undefined);
    expect(res.json).toHaveBeenCalledWith({
      users,
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it('passes search and pagination parameters', async () => {
    const { listUsersHandler } = await import('../../src/user/userController');

    mockListUsers.mockResolvedValue([]);
    mockCountUsers.mockResolvedValue(0);

    const req = makeReq({
      query: { page: '2', pageSize: '10', search: 'alice' },
    });
    const res = makeRes();

    await listUsersHandler(req, res);

    expect(mockListUsers).toHaveBeenCalledWith(2, 10, 'alice');
    expect(mockCountUsers).toHaveBeenCalledWith('alice');
  });
});

describe('createUserHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a user and returns 201', async () => {
    const { createUserHandler } = await import('../../src/user/userController');

    const result = {
      user: { id: 'u2', username: 'newuser', email: 'new@test.com' },
      passwordSent: true,
    };
    mockCreateUserWithRandomPassword.mockResolvedValue(result);

    const req = makeReq({
      body: { username: 'newuser', email: 'new@test.com' },
    });
    const res = makeRes();

    await createUserHandler(req, res);

    expect(mockCreateUserWithRandomPassword).toHaveBeenCalledWith({
      username: 'newuser',
      email: 'new@test.com',
      name: undefined,
      gender: undefined,
      birthDate: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('throws ValidationError when username is missing', async () => {
    const { createUserHandler } = await import('../../src/user/userController');
    const { ValidationError } = await import('../../src/errors/types');

    const req = makeReq({
      body: { username: '', email: 'test@test.com' },
    });
    const res = makeRes();

    await expect(createUserHandler(req, res)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when email is missing', async () => {
    const { createUserHandler } = await import('../../src/user/userController');
    const { ValidationError } = await import('../../src/errors/types');

    const req = makeReq({
      body: { username: 'newuser', email: '' },
    });
    const res = makeRes();

    await expect(createUserHandler(req, res)).rejects.toBeInstanceOf(ValidationError);
  });
});
