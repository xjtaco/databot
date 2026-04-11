import { HttpStatusCode } from '../base/types';
import { Router, Request, Response } from 'express';
import datafileRoutes from '../datafile/datafile.routes';
import sqliteRoutes from '../sqlite/sqlite.routes';
import datasourceRoutes from '../datasource/datasource.routes';
import tableRoutes from '../table/table.routes';
import knowledgeRoutes from '../knowledge/knowledge.routes';
import { globalConfigRoutes } from '../globalConfig';
import { chatSessionRoutes } from '../chatSession';
import { workflowRoutes, customNodeTemplateRoutes } from '../workflow';
import authRoutes from '../auth/authRoutes';
import userRoutes from '../user/userRoutes';
import { authMiddleware } from '../auth/authMiddleware';
import { mustChangePasswordCheck } from '../auth/mustChangePassword';
import { adminOnly } from '../auth/adminOnly';
import { auditLogRoutes } from '../auditLog';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  return res.status(HttpStatusCode.OK).json({ message: 'API is running' });
});

router.get('/health', (_req: Request, res: Response) => {
  return res.status(HttpStatusCode.OK).json({ status: 'ok' });
});

// Public routes (no auth required)
router.use('/auth', authRoutes);

// All routes below require authentication
router.use(authMiddleware);
router.use(mustChangePasswordCheck);

// Admin-only routes
router.use('/users', adminOnly, userRoutes);
router.use('/audit-logs', adminOnly, auditLogRoutes);

// Routes with per-route adminOnly (password-policy GET is not admin-only)
router.use('/global-config', globalConfigRoutes);

// Authenticated routes
router.use(datafileRoutes);
router.use('/sqlite', sqliteRoutes);
router.use('/datasource', datasourceRoutes);
router.use('/tables', tableRoutes);
router.use('/knowledge', knowledgeRoutes);
router.use('/chat-sessions', chatSessionRoutes);
router.use('/workflows', workflowRoutes);
router.use('/custom-node-templates', customNodeTemplateRoutes);

export default router;
