import express, { Router } from 'express';
import scheduleRoutes from './schedule.routes';
import {
  createWorkflowHandler,
  listWorkflowsHandler,
  getWorkflowHandler,
  saveWorkflowHandler,
  deleteWorkflowHandler,
  cloneWorkflowHandler,
  exportWorkflowHandler,
  importWorkflowHandler,
  listRunsHandler,
  getRunDetailHandler,
  validateWorkflowHandler,
  runWorkflowHandler,
  runNodeHandler,
  retryRunHandler,
  filePreviewHandler,
  fileRawHandler,
} from './workflow.controller';
import { auditMiddleware, AuditAction, AuditCategory } from '../auditLog';

const router = Router();

router.post(
  '/',
  auditMiddleware(AuditAction.WORKFLOW_CREATED, AuditCategory.WORKFLOW),
  createWorkflowHandler
);
router.get('/', listWorkflowsHandler);
router.get('/file-preview', filePreviewHandler);
router.get('/file-raw', fileRawHandler);
router.use('/schedules', scheduleRoutes);
router.post('/import', express.json({ limit: '1mb' }), importWorkflowHandler);
router.get('/:id', getWorkflowHandler);
router.put(
  '/:id',
  auditMiddleware(AuditAction.WORKFLOW_UPDATED, AuditCategory.WORKFLOW),
  saveWorkflowHandler
);
router.delete(
  '/:id',
  auditMiddleware(AuditAction.WORKFLOW_DELETED, AuditCategory.WORKFLOW),
  deleteWorkflowHandler
);

router.post('/:id/clone', cloneWorkflowHandler);
router.get('/:id/export', exportWorkflowHandler);
router.post('/:id/validate', validateWorkflowHandler);
router.post(
  '/:id/run',
  auditMiddleware(AuditAction.WORKFLOW_EXECUTED, AuditCategory.WORKFLOW),
  runWorkflowHandler
);
router.get('/:id/runs', listRunsHandler);
router.get('/:workflowId/runs/:runId', getRunDetailHandler);
router.post('/:workflowId/runs/:runId/retry', retryRunHandler);
router.post('/:workflowId/nodes/:nodeId/run', runNodeHandler);

export default router;
