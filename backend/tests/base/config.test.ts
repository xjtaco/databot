import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadConfigWithEnv(env: Record<string, string | undefined>) {
  vi.resetModules();

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return import('../../src/base/config');
}

describe('validateConfig', () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
    delete process.env.ADMIN_INITIAL_PASSWORD;
    delete process.env.ENCRYPTION_KEY;
    delete process.env.WORKSPACE_CLEANUP_MAX_AGE_MS;
  });

  it('throws in production when JWT_SECRET uses fallback value', async () => {
    const { validateConfig } = await loadConfigWithEnv({
      NODE_ENV: 'production',
      JWT_SECRET: undefined,
      ADMIN_INITIAL_PASSWORD: 'StrongAdmin@123',
      ENCRYPTION_KEY: 'a'.repeat(64),
    });

    expect(() => validateConfig()).toThrow(/JWT_SECRET/i);
  });

  it('throws in production when admin password uses default value', async () => {
    const { validateConfig } = await loadConfigWithEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'custom-prod-secret',
      ADMIN_INITIAL_PASSWORD: undefined,
      ENCRYPTION_KEY: 'a'.repeat(64),
    });

    expect(() => validateConfig()).toThrow(/ADMIN_INITIAL_PASSWORD/i);
  });

  it('throws in production when ENCRYPTION_KEY is missing', async () => {
    const { validateConfig } = await loadConfigWithEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'custom-prod-secret',
      ADMIN_INITIAL_PASSWORD: 'StrongAdmin@123',
      ENCRYPTION_KEY: '',
    });

    expect(() => validateConfig()).toThrow(/ENCRYPTION_KEY/i);
  });

  it('defaults workspace cleanup retention to 30 days when unset', async () => {
    const { config } = await loadConfigWithEnv({
      WORKSPACE_CLEANUP_MAX_AGE_MS: undefined,
    });

    expect(config.workspaceCleanup.maxAgeMs).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
