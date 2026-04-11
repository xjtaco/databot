import express from 'express';
import { getPrismaClient } from '../infrastructure/database';
import { hashPassword } from '../auth/authService';
import { config } from '../base/config';
import logger from '../utils/logger';

export function startInternalServer(): void {
  const app = express();
  app.use(express.json());

  app.post('/internal/reset-admin', async (_req, res) => {
    try {
      const prisma = getPrismaClient();
      const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
      if (!admin) {
        res.status(404).json({ error: 'Admin user not found' });
        return;
      }

      const passwordHash = await hashPassword(config.admin.initialPassword);
      await prisma.user.update({
        where: { id: admin.id },
        data: { password: passwordHash, mustChangePassword: true },
      });
      await prisma.refreshToken.deleteMany({ where: { userId: admin.id } });

      logger.info('Admin password reset via internal endpoint', { userId: admin.id });
      res.json({ success: true, message: 'Admin password has been reset' });
    } catch (err) {
      logger.error('Failed to reset admin password', { error: err });
      res.status(500).json({ error: 'Internal error' });
    }
  });

  app.listen(config.internal.port, '127.0.0.1', () => {
    logger.info(`Internal server listening on 127.0.0.1:${config.internal.port}`);
  });
}
