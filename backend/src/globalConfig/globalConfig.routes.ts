import { Router } from 'express';
import { adminOnly } from '../auth/adminOnly';
import {
  getLLMConfigHandler,
  saveLLMConfigHandler,
  testLLMConnectionHandler,
  getWebSearchConfigHandler,
  saveWebSearchConfigHandler,
  testWebSearchConnectionHandler,
  getSmtpConfigHandler,
  saveSmtpConfigHandler,
  testSmtpConnectionHandler,
  getConfigStatusHandler,
  getPasswordPolicyHandler,
  savePasswordPolicyHandler,
} from './globalConfig.controller';
import { auditMiddleware, AuditAction, AuditCategory } from '../auditLog';

const router = Router();

// Password policy - GET is open to all authenticated users (not adminOnly)
router.get('/password-policy', getPasswordPolicyHandler);
router.put(
  '/password-policy',
  adminOnly,
  auditMiddleware(AuditAction.GLOBAL_CONFIG_UPDATED, AuditCategory.SYSTEM_CONFIG),
  savePasswordPolicyHandler
);

// LLM configuration (admin only)
router.get('/llm', adminOnly, getLLMConfigHandler);
router.put(
  '/llm',
  adminOnly,
  auditMiddleware(AuditAction.GLOBAL_CONFIG_UPDATED, AuditCategory.SYSTEM_CONFIG),
  saveLLMConfigHandler
);
router.post('/llm/test', adminOnly, testLLMConnectionHandler);

// Web search configuration (admin only)
router.get('/web-search', adminOnly, getWebSearchConfigHandler);
router.put(
  '/web-search',
  adminOnly,
  auditMiddleware(AuditAction.GLOBAL_CONFIG_UPDATED, AuditCategory.SYSTEM_CONFIG),
  saveWebSearchConfigHandler
);
router.post('/web-search/test', adminOnly, testWebSearchConnectionHandler);

// SMTP configuration (admin only)
router.get('/smtp', adminOnly, getSmtpConfigHandler);
router.put(
  '/smtp',
  adminOnly,
  auditMiddleware(AuditAction.GLOBAL_CONFIG_UPDATED, AuditCategory.SYSTEM_CONFIG),
  saveSmtpConfigHandler
);
router.post('/smtp/test', adminOnly, testSmtpConnectionHandler);

// Config status (admin only)
router.get('/status', adminOnly, getConfigStatusHandler);

export default router;
