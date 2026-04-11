import type { Request, Response, CookieOptions } from 'express';
import * as authService from './authService';
import * as authRepo from './authRepository';
import { checkRateLimit, recordFailedAttempt, recordSuccessfulLogin } from './loginRateLimiter';
import { getPasswordPolicy } from './passwordPolicyHelper';
import { UnauthorizedError, ValidationError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';
import { logAuditEvent, AuditAction, AuditCategory } from '../auditLog';
import { config } from '../base/config';

function getRefreshTokenCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: config.jwt.cookieSecure,
    sameSite: 'strict' as const,
    path: '/api/auth',
    maxAge: maxAgeMs,
  };
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body as { username: unknown; password: unknown };

  if (typeof username !== 'string' || username.trim() === '') {
    throw new ValidationError('Username is required');
  }
  if (typeof password !== 'string' || password === '') {
    throw new ValidationError('Password is required');
  }

  checkRateLimit(username);

  let result: Awaited<ReturnType<typeof authService.login>>;
  try {
    result = await authService.login(username, password);
  } catch (err) {
    recordFailedAttempt(username);
    void logAuditEvent({
      userId: null,
      username: String(username),
      action: AuditAction.LOGIN_FAILED,
      category: AuditCategory.AUTH,
      params: { reason: err instanceof Error ? err.message : 'unknown' },
      ipAddress: req.ip ?? null,
    });
    throw err;
  }

  recordSuccessfulLogin(username);
  void logAuditEvent({
    userId: result.user.id,
    username: result.user.username,
    action: AuditAction.LOGIN_SUCCESS,
    category: AuditCategory.AUTH,
    ipAddress: req.ip ?? null,
  });

  const maxAgeMs = authService.parseRefreshExpires();
  res.cookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions(maxAgeMs));

  res.json({ accessToken: result.accessToken, user: result.user });
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies['refreshToken'] as string | undefined;
  if (!refreshToken) {
    throw new UnauthorizedError('Missing refresh token', ErrorCode.REFRESH_TOKEN_INVALID);
  }

  const result = await authService.refresh(refreshToken);

  const maxAgeMs = authService.parseRefreshExpires();
  res.cookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions(maxAgeMs));

  res.json({ accessToken: result.accessToken });
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies['refreshToken'] as string | undefined;
  if (refreshToken) {
    await authService.logout(refreshToken);
  }

  if (req.user) {
    void logAuditEvent({
      userId: req.user.userId,
      username: req.user.username,
      action: AuditAction.LOGOUT,
      category: AuditCategory.AUTH,
      ipAddress: req.ip ?? null,
    });
  }

  res.clearCookie('refreshToken', getRefreshTokenCookieOptions(0));
  res.json({ success: true });
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required', ErrorCode.UNAUTHORIZED);
  }

  const { oldPassword, newPassword } = req.body as {
    oldPassword: unknown;
    newPassword: unknown;
  };

  if (typeof oldPassword !== 'string' || oldPassword === '') {
    throw new ValidationError('Old password is required');
  }
  if (typeof newPassword !== 'string' || newPassword === '') {
    throw new ValidationError('New password is required');
  }

  const policy = await getPasswordPolicy();
  await authService.changePassword(req.user.userId, oldPassword, newPassword, policy);

  void logAuditEvent({
    userId: req.user.userId,
    username: req.user.username,
    action: AuditAction.PASSWORD_CHANGED,
    category: AuditCategory.AUTH,
    ipAddress: req.ip ?? null,
  });

  res.json({ success: true });
}

export async function getProfileHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required', ErrorCode.UNAUTHORIZED);
  }

  const user = await authRepo.findUserById(req.user.userId);
  if (!user) {
    throw new UnauthorizedError('User not found', ErrorCode.UNAUTHORIZED);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _password, ...profile } = user;
  res.json(profile);
}

export async function updateProfileHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required', ErrorCode.UNAUTHORIZED);
  }

  const { name, gender, birthDate, email } = req.body as {
    name?: unknown;
    gender?: unknown;
    birthDate?: unknown;
    email?: unknown;
  };

  const updateData: { name?: string; gender?: string; birthDate?: Date | null; email?: string } =
    {};

  if (name !== undefined) {
    if (typeof name !== 'string') {
      throw new ValidationError('Name must be a string');
    }
    updateData.name = name;
  }

  if (gender !== undefined) {
    if (typeof gender !== 'string') {
      throw new ValidationError('Gender must be a string');
    }
    updateData.gender = gender;
  }

  if (birthDate !== undefined) {
    if (birthDate === null) {
      updateData.birthDate = null;
    } else if (typeof birthDate === 'string') {
      const parsed = new Date(birthDate);
      if (isNaN(parsed.getTime())) {
        throw new ValidationError('Invalid birthDate format');
      }
      updateData.birthDate = parsed;
    } else {
      throw new ValidationError('birthDate must be a string or null');
    }
  }

  if (email !== undefined) {
    if (typeof email !== 'string') {
      throw new ValidationError('Email must be a string');
    }
    updateData.email = email;
  }

  const updated = await authRepo.updateUser(req.user.userId, updateData);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _password, ...profile } = updated;
  res.json(profile);
}
