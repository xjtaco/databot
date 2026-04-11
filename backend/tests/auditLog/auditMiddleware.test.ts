import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockLogAuditEvent = vi.fn();

vi.mock('../../src/auditLog/auditLogService', () => ({
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}));

import { auditMiddleware } from '../../src/auditLog/auditMiddleware';

function createMockReqRes() {
  const req = {
    user: { userId: 'user-1', username: 'admin', role: 'admin', mustChangePassword: false },
    ip: '127.0.0.1',
    auditContext: undefined,
  } as unknown as Request;

  const jsonFn = vi.fn();
  const res = {
    statusCode: 200,
    json: jsonFn,
    on: vi.fn(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next, jsonFn };
}

describe('auditMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should attach auditContext to request', () => {
    const { req, res, next } = createMockReqRes();
    const mw = auditMiddleware('USER_CREATED', 'user_management');

    mw(req, res, next);

    expect(req.auditContext).toBeDefined();
    expect(req.auditContext!.action).toBe('USER_CREATED');
    expect(req.auditContext!.category).toBe('user_management');
    expect(next).toHaveBeenCalled();
  });

  it('should log audit event on successful response via res.on finish', () => {
    const { req, res, next } = createMockReqRes();
    const mw = auditMiddleware('USER_CREATED', 'user_management');

    // Capture the 'finish' listener
    let finishCallback: (() => void) | undefined;
    (res.on as ReturnType<typeof vi.fn>).mockImplementation((event: string, cb: () => void) => {
      if (event === 'finish') finishCallback = cb;
      return res;
    });

    mw(req, res, next);

    // Simulate controller setting params
    req.auditContext!.params = { targetUsername: 'alice' };

    // Simulate response finishing with 2xx status
    res.statusCode = 201;
    finishCallback!();

    expect(mockLogAuditEvent).toHaveBeenCalledWith({
      userId: 'user-1',
      username: 'admin',
      action: 'USER_CREATED',
      category: 'user_management',
      params: { targetUsername: 'alice' },
      ipAddress: '127.0.0.1',
    });
  });

  it('should NOT log audit event on error response', () => {
    const { req, res, next } = createMockReqRes();
    const mw = auditMiddleware('USER_CREATED', 'user_management');

    let finishCallback: (() => void) | undefined;
    (res.on as ReturnType<typeof vi.fn>).mockImplementation((event: string, cb: () => void) => {
      if (event === 'finish') finishCallback = cb;
      return res;
    });

    mw(req, res, next);
    res.statusCode = 400;
    finishCallback!();

    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });
});
