import { Router } from 'express';
import {
  testConnectionHandler,
  createDatasourceHandler,
  updateDatasourceHandler,
  deleteDatasourceHandler,
} from './datasource.controller';
import { auditMiddleware, AuditAction, AuditCategory } from '../auditLog';

const router = Router();

router.post('/test-connection', testConnectionHandler);
router.post(
  '/',
  auditMiddleware(AuditAction.DATASOURCE_CREATED, AuditCategory.DATASOURCE),
  createDatasourceHandler
);
router.put(
  '/:id',
  auditMiddleware(AuditAction.DATASOURCE_UPDATED, AuditCategory.DATASOURCE),
  updateDatasourceHandler
);
router.delete(
  '/:id',
  auditMiddleware(AuditAction.DATASOURCE_DELETED, AuditCategory.DATASOURCE),
  deleteDatasourceHandler
);

export default router;
