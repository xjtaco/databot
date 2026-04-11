import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/base/config', () => ({
  config: {
    admin: {
      initialPassword: 'Admin@123',
      email: 'admin@localhost',
    },
  },
}));

// Mock hashPassword
const mockHashPassword = vi.fn(async (p: string) => `hashed:${p}`);

vi.mock('../../src/auth/authService', () => ({
  hashPassword: (...args: unknown[]) => mockHashPassword(...(args as [string])),
}));

// Mock prisma methods
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdateMany = vi.fn();

const mockPrisma = {
  user: {
    findFirst: (...args: unknown[]) => mockFindFirst(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
  datasource: { updateMany: (...args: unknown[]) => mockUpdateMany(...args) },
  workflow: { updateMany: (...args: unknown[]) => mockUpdateMany(...args) },
  customNodeTemplate: { updateMany: (...args: unknown[]) => mockUpdateMany(...args) },
  workflowSchedule: { updateMany: (...args: unknown[]) => mockUpdateMany(...args) },
  chatSession: { updateMany: (...args: unknown[]) => mockUpdateMany(...args) },
};

vi.mock('../../src/infrastructure/database', () => ({
  getPrismaClient: () => mockPrisma,
}));

describe('initializeAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: updateMany returns count 0
    mockUpdateMany.mockResolvedValue({ count: 0 });
  });

  it('creates admin user when none exists', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'admin-id-1' });

    const { initializeAdmin } = await import('../../src/auth/adminInit');
    await initializeAdmin();

    expect(mockFindFirst).toHaveBeenCalledWith({ where: { role: 'admin' } });
    expect(mockHashPassword).toHaveBeenCalledWith('Admin@123');
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: 'admin',
        email: 'admin@localhost',
        role: 'admin',
        mustChangePassword: true,
      }),
    });
  });

  it('skips creation when admin already exists', async () => {
    mockFindFirst.mockResolvedValue({ id: 'existing-admin-id' });

    const { initializeAdmin } = await import('../../src/auth/adminInit');
    await initializeAdmin();

    expect(mockFindFirst).toHaveBeenCalledWith({ where: { role: 'admin' } });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockHashPassword).not.toHaveBeenCalled();
  });

  it('calls backfillCreatedBy with the existing admin ID when admin already exists', async () => {
    mockFindFirst.mockResolvedValue({ id: 'existing-admin-id' });

    const { initializeAdmin } = await import('../../src/auth/adminInit');
    await initializeAdmin();

    // updateMany should be called 5 times (datasource, workflow, customNodeTemplate,
    // workflowSchedule, chatSession) with the existing admin id
    expect(mockUpdateMany).toHaveBeenCalledTimes(5);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { createdBy: null },
      data: { createdBy: 'existing-admin-id' },
    });
  });

  it('calls backfillCreatedBy with new admin ID after creation', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: 'new-admin-id' });

    const { initializeAdmin } = await import('../../src/auth/adminInit');
    await initializeAdmin();

    expect(mockUpdateMany).toHaveBeenCalledTimes(5);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { createdBy: null },
      data: { createdBy: 'new-admin-id' },
    });
  });

  it('logs backfill info when records are updated', async () => {
    const logger = (await import('../../src/utils/logger')).default;
    mockFindFirst.mockResolvedValue({ id: 'existing-admin-id' });
    // Simulate some records were backfilled
    mockUpdateMany.mockResolvedValue({ count: 3 });

    const { initializeAdmin } = await import('../../src/auth/adminInit');
    await initializeAdmin();

    expect(logger.info).toHaveBeenCalledWith(
      'Backfilled createdBy/userId for existing records',
      expect.objectContaining({ total: 15 }) // 5 * 3
    );
  });

  it('does not log backfill info when no records needed updating', async () => {
    const logger = (await import('../../src/utils/logger')).default;
    mockFindFirst.mockResolvedValue({ id: 'existing-admin-id' });
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const { initializeAdmin } = await import('../../src/auth/adminInit');
    await initializeAdmin();

    const logInfoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const backfillCall = logInfoCalls.find(
      (call) => call[0] === 'Backfilled createdBy/userId for existing records'
    );
    expect(backfillCall).toBeUndefined();
  });
});
