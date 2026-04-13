import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';

describe('@prisma/client generation', () => {
  it('uses the stable prisma generate install hook', () => {
    const packageJson = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
      scripts?: { postinstall?: string };
    };

    expect(packageJson.scripts?.postinstall).toBe('prisma generate');
  });

  it('exports PrismaClient and Prisma', () => {
    expect(PrismaClient).toBeTypeOf('function');
    expect(Prisma).toBeDefined();
  });
});
