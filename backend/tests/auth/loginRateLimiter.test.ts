import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('loginRateLimiter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset state between tests
    const { resetAllLimits } = await import('../../src/auth/loginRateLimiter');
    resetAllLimits();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows login on first attempt (no record)', async () => {
    const { checkRateLimit } = await import('../../src/auth/loginRateLimiter');
    expect(() => checkRateLimit('alice')).not.toThrow();
  });

  it('allows up to 4 failed attempts (under limit)', async () => {
    const { checkRateLimit, recordFailedAttempt } = await import('../../src/auth/loginRateLimiter');

    for (let i = 0; i < 4; i++) {
      recordFailedAttempt('alice');
    }

    // Should not throw – still under the 5-attempt limit
    expect(() => checkRateLimit('alice')).not.toThrow();
  });

  it('blocks after 5 failed attempts', async () => {
    const { checkRateLimit, recordFailedAttempt } = await import('../../src/auth/loginRateLimiter');
    const { ApiError } = await import('../../src/errors/types');
    const { ErrorCode } = await import('../../src/errors/errorCode');

    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('bob');
    }

    let caughtCode: string | undefined;
    let caughtStatus: number | undefined;
    let isApiError = false;
    try {
      checkRateLimit('bob');
    } catch (err) {
      if (err instanceof ApiError) {
        isApiError = true;
        caughtCode = err.code;
        caughtStatus = err.statusCode;
      }
    }

    expect(isApiError).toBe(true);
    expect(caughtCode).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
    expect(caughtStatus).toBe(429);
  });

  it('resets counter after a successful login', async () => {
    const { checkRateLimit, recordFailedAttempt, recordSuccessfulLogin } =
      await import('../../src/auth/loginRateLimiter');

    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('carol');
    }

    recordSuccessfulLogin('carol');

    // Should no longer be locked
    expect(() => checkRateLimit('carol')).not.toThrow();
  });

  it('clears lockout after the lockout period expires', async () => {
    vi.useFakeTimers();

    const { checkRateLimit, recordFailedAttempt } = await import('../../src/auth/loginRateLimiter');

    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('dave');
    }

    // Advance time past the 15-minute lockout
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    // The lockout has expired – checkRateLimit should clean up and not throw
    expect(() => checkRateLimit('dave')).not.toThrow();
  });

  it('logs a warning when the lockout is triggered', async () => {
    const logger = (await import('../../src/utils/logger')).default;
    const { recordFailedAttempt } = await import('../../src/auth/loginRateLimiter');

    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('eve');
    }

    expect(logger.warn).toHaveBeenCalledWith('Login rate limit triggered', {
      username: 'eve',
      lockoutMinutes: 15,
    });
  });
});
