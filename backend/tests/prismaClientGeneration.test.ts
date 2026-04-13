import { describe, expect, it } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';

describe('@prisma/client generation', () => {
  it('exports PrismaClient and Prisma', () => {
    expect(PrismaClient).toBeTypeOf('function');
    expect(Prisma).toBeDefined();
  });
});
