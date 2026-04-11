import { getPrismaClient } from '../infrastructure/database';
import { hashPassword } from './authService';
import { config } from '../base/config';
import logger from '../utils/logger';

export async function initializeAdmin(): Promise<void> {
  const prisma = getPrismaClient();

  const existing = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (existing) {
    logger.info('Admin user already exists, skipping initialization');
    await backfillCreatedBy(existing.id);
    return;
  }

  const passwordHash = await hashPassword(config.admin.initialPassword);
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      password: passwordHash,
      email: config.admin.email,
      role: 'admin',
      mustChangePassword: true,
    },
  });

  logger.info('Admin user created', { userId: admin.id });
  await backfillCreatedBy(admin.id);
}

async function backfillCreatedBy(adminId: string): Promise<void> {
  const prisma = getPrismaClient();

  const results = await Promise.all([
    prisma.datasource.updateMany({ where: { createdBy: null }, data: { createdBy: adminId } }),
    prisma.workflow.updateMany({ where: { createdBy: null }, data: { createdBy: adminId } }),
    prisma.customNodeTemplate.updateMany({
      where: { createdBy: null },
      data: { createdBy: adminId },
    }),
    prisma.workflowSchedule.updateMany({
      where: { createdBy: null },
      data: { createdBy: adminId },
    }),
    prisma.chatSession.updateMany({ where: { userId: null }, data: { userId: adminId } }),
  ]);

  const total = results.reduce((sum, r) => sum + r.count, 0);
  if (total > 0) {
    logger.info('Backfilled createdBy/userId for existing records', { total });
  }
}
