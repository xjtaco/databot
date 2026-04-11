import { ApiError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';
import { HttpStatusCode } from '../base/types';
import logger from '../utils/logger';

interface AttemptRecord {
  count: number;
  lockedUntil: number | null;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const attempts = new Map<string, AttemptRecord>();

export function checkRateLimit(username: string): void {
  const record = attempts.get(username);
  if (!record) return;

  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const remainingMs = record.lockedUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    throw new ApiError(
      `Too many failed attempts. Try again in ${remainingMin} minutes.`,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      HttpStatusCode.TOO_MANY_REQUESTS
    );
  }

  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    attempts.delete(username);
  }
}

export function recordFailedAttempt(username: string): void {
  const record = attempts.get(username) ?? { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    logger.warn('Login rate limit triggered', { username, lockoutMinutes: 15 });
  }
  attempts.set(username, record);
}

export function recordSuccessfulLogin(username: string): void {
  attempts.delete(username);
}

export function resetAllLimits(): void {
  attempts.clear();
}
