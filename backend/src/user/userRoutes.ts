import { Router } from 'express';
import {
  listUsersHandler,
  createUserHandler,
  getUserHandler,
  updateUserHandler,
  lockUserHandler,
  unlockUserHandler,
  deleteUserHandler,
} from './userController';
import { auditMiddleware, AuditAction, AuditCategory } from '../auditLog';

const router = Router();

router.get('/', listUsersHandler);
router.post(
  '/',
  auditMiddleware(AuditAction.USER_CREATED, AuditCategory.USER_MANAGEMENT),
  createUserHandler
);
router.get('/:id', getUserHandler);
router.put(
  '/:id',
  auditMiddleware(AuditAction.USER_UPDATED, AuditCategory.USER_MANAGEMENT),
  updateUserHandler
);
router.put(
  '/:id/lock',
  auditMiddleware(AuditAction.USER_LOCKED, AuditCategory.USER_MANAGEMENT),
  lockUserHandler
);
router.put(
  '/:id/unlock',
  auditMiddleware(AuditAction.USER_UNLOCKED, AuditCategory.USER_MANAGEMENT),
  unlockUserHandler
);
router.delete(
  '/:id',
  auditMiddleware(AuditAction.USER_DELETED, AuditCategory.USER_MANAGEMENT),
  deleteUserHandler
);

export default router;
