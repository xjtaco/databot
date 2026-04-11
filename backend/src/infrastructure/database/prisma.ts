import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config } from '../../base/config';
import logger from '../../utils/logger';

let prismaClient: PrismaClient | null = null;
let pool: Pool | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    pool = new Pool({
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err: Error) => {
      logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
    });

    pool.on('connect', () => {
      logger.debug('New PostgreSQL client connected');
    });

    const adapter = new PrismaPg(pool);

    prismaClient = new PrismaClient({
      adapter,
    });
  }

  return prismaClient;
}

export async function initPrisma(): Promise<void> {
  const client = getPrismaClient();
  try {
    await client.$connect();
    logger.info('Prisma database connected successfully', {
      host: config.postgres.host,
      database: config.postgres.database,
    });
  } catch (error) {
    logger.error('Failed to connect to database via Prisma', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function closePrisma(): Promise<void> {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
    logger.info('Prisma database connection closed');
  }
  if (pool) {
    await pool.end();
    pool = null;
  }
}
