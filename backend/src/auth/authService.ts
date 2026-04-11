import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import crypto from 'crypto';
import { config } from '../base/config';
import {
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  PasswordPolicyError,
} from '../errors/types';
import { ErrorCode } from '../errors/errorCode';
import logger from '../utils/logger';
import * as authRepo from './authRepository';

const SALT_ROUNDS = 12;

export interface TokenPayload {
  userId: string;
  username: string;
  role: string;
  mustChangePassword: boolean;
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateAccessToken(payload: TokenPayload): string {
  const options: SignOptions = { expiresIn: config.jwt.accessExpires as StringValue };
  return jwt.sign(payload, config.jwt.secret, options);
}

export function verifyAccessToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, config.jwt.secret) as TokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Access token expired', ErrorCode.TOKEN_EXPIRED);
    }
    throw new UnauthorizedError('Invalid access token', ErrorCode.TOKEN_INVALID);
  }
}

export function generateRefreshTokenString(): string {
  return crypto.randomBytes(40).toString('hex');
}

export function parseRefreshExpires(): number {
  const match = config.jwt.refreshExpires.match(/^(\d+)([dhms])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
  return num * (multipliers[unit] ?? 86400000);
}

export async function login(
  username: string,
  password: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    name: string | null;
    role: string;
    mustChangePassword: boolean;
  };
}> {
  const user = await authRepo.findUserByUsername(username);
  if (!user) {
    throw new UnauthorizedError('Invalid credentials', ErrorCode.INVALID_CREDENTIALS);
  }
  if (user.locked) {
    throw new ForbiddenError('Account is locked', ErrorCode.ACCOUNT_LOCKED);
  }
  const valid = await comparePassword(password, user.password);
  if (!valid) {
    throw new UnauthorizedError('Invalid credentials', ErrorCode.INVALID_CREDENTIALS);
  }

  const accessToken = generateAccessToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });
  const refreshTokenStr = generateRefreshTokenString();
  const expiresAt = new Date(Date.now() + parseRefreshExpires());
  await authRepo.createRefreshToken(user.id, refreshTokenStr, expiresAt);

  logger.info('User logged in', { userId: user.id, username: user.username });

  return {
    accessToken,
    refreshToken: refreshTokenStr,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  };
}

export async function refresh(
  oldToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const record = await authRepo.findRefreshToken(oldToken);
  if (!record || record.expiresAt < new Date()) {
    throw new UnauthorizedError(
      'Invalid or expired refresh token',
      ErrorCode.REFRESH_TOKEN_INVALID
    );
  }
  if (record.user.locked) {
    await authRepo.deleteRefreshToken(oldToken);
    throw new ForbiddenError('Account is locked', ErrorCode.ACCOUNT_LOCKED);
  }

  await authRepo.deleteRefreshToken(oldToken);
  const newTokenStr = generateRefreshTokenString();
  const expiresAt = new Date(Date.now() + parseRefreshExpires());
  await authRepo.createRefreshToken(record.userId, newTokenStr, expiresAt);

  const accessToken = generateAccessToken({
    userId: record.user.id,
    username: record.user.username,
    role: record.user.role,
    mustChangePassword: record.user.mustChangePassword,
  });

  return { accessToken, refreshToken: newTokenStr };
}

export async function logout(refreshToken: string): Promise<void> {
  await authRepo.deleteRefreshToken(refreshToken);
}

export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
  policy: PasswordPolicy
): Promise<void> {
  const user = await authRepo.findUserById(userId);
  if (!user) {
    throw new UnauthorizedError('User not found', ErrorCode.INVALID_CREDENTIALS);
  }
  const valid = await comparePassword(oldPassword, user.password);
  if (!valid) {
    throw new ValidationError('Old password is incorrect');
  }
  validatePasswordPolicy(newPassword, policy);
  const hash = await hashPassword(newPassword);
  await authRepo.updateUserPassword(userId, hash, false);
  logger.info('User changed password', { userId });
}

export function validatePasswordPolicy(password: string, policy: PasswordPolicy): void {
  const errors: string[] = [];
  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (policy.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  if (errors.length > 0) {
    throw new PasswordPolicyError(errors.join('; '));
  }
}

export function generateRandomPassword(length: number = 16): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;

  let password = '';
  password += upper[crypto.randomInt(upper.length)];
  password += lower[crypto.randomInt(lower.length)];
  password += digits[crypto.randomInt(digits.length)];
  password += special[crypto.randomInt(special.length)];

  for (let i = password.length; i < length; i++) {
    password += all[crypto.randomInt(all.length)];
  }

  return password
    .split('')
    .sort(() => crypto.randomInt(3) - 1)
    .join('');
}
