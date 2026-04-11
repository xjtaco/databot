import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/infrastructure/database', () => ({
  getPrismaClient: vi.fn(),
}));

vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { metaHasUniqueField } from '../../src/table/table.repository';

describe('metaHasUniqueField', () => {
  it('should return false for undefined meta', () => {
    expect(metaHasUniqueField(undefined, 'name')).toBe(false);
  });

  it('should return false for empty meta', () => {
    expect(metaHasUniqueField({}, 'name')).toBe(false);
  });

  // Prisma v5 format: meta.target as string[]
  it('should match field in Prisma v5 array target', () => {
    expect(metaHasUniqueField({ target: ['name'] }, 'name')).toBe(true);
  });

  it('should not match missing field in Prisma v5 array target', () => {
    expect(metaHasUniqueField({ target: ['email'] }, 'name')).toBe(false);
  });

  // Prisma v5 format: meta.target as string
  it('should match field in Prisma v5 string target', () => {
    expect(metaHasUniqueField({ target: 'datasources_name_key' }, 'name')).toBe(true);
  });

  it('should not match missing field in Prisma v5 string target', () => {
    expect(metaHasUniqueField({ target: 'datasources_email_key' }, 'name')).toBe(false);
  });

  // Prisma v7 with driver adapter format
  it('should match field in Prisma v7 driverAdapterError format', () => {
    const meta = {
      modelName: 'Datasource',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23505',
          originalMessage: 'duplicate key value violates unique constraint',
          kind: 'UniqueConstraintViolation',
          constraint: { fields: ['name'] },
        },
      },
    };
    expect(metaHasUniqueField(meta, 'name')).toBe(true);
  });

  it('should not match missing field in Prisma v7 driverAdapterError format', () => {
    const meta = {
      modelName: 'Datasource',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23505',
          originalMessage: 'duplicate key value violates unique constraint',
          kind: 'UniqueConstraintViolation',
          constraint: { fields: ['email'] },
        },
      },
    };
    expect(metaHasUniqueField(meta, 'name')).toBe(false);
  });

  it('should handle malformed driverAdapterError gracefully', () => {
    expect(metaHasUniqueField({ driverAdapterError: 'invalid' }, 'name')).toBe(false);
    expect(metaHasUniqueField({ driverAdapterError: { cause: null } }, 'name')).toBe(false);
    expect(
      metaHasUniqueField({ driverAdapterError: { cause: { constraint: null } } }, 'name')
    ).toBe(false);
  });
});
