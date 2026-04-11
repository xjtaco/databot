import { getPrismaClient, initPrisma, closePrisma } from './prisma';

export { getPrismaClient, initPrisma, closePrisma };

export async function initDatabase(): Promise<void> {
  await initPrisma();
}

export async function closeDatabase(): Promise<void> {
  await closePrisma();
}
