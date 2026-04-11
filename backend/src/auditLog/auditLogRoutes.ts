import { Router } from 'express';
import {
  listAuditLogsHandler,
  exportAuditLogsHandler,
  listActionsHandler,
} from './auditLogController';

const router = Router();

router.get('/', listAuditLogsHandler);
router.get('/export', exportAuditLogsHandler);
router.get('/actions', listActionsHandler);

export default router;
