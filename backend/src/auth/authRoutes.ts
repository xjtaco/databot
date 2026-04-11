import { Router } from 'express';
import { authMiddleware } from './authMiddleware';
import {
  loginHandler,
  refreshHandler,
  logoutHandler,
  changePasswordHandler,
  getProfileHandler,
  updateProfileHandler,
} from './authController';

const router = Router();

// Public routes
router.post('/login', loginHandler);
router.post('/refresh', refreshHandler);

// Authenticated routes
router.post('/logout', authMiddleware, logoutHandler);
router.put('/change-password', authMiddleware, changePasswordHandler);
router.get('/profile', authMiddleware, getProfileHandler);
router.put('/profile', authMiddleware, updateProfileHandler);

export default router;
