import type { Request, Response } from 'express';
import { ValidationError } from '../errors/types';
import { isPasswordMask } from '../utils/encryption';
import { LLMProviderFactory } from '../infrastructure/llm';
import {
  getLLMConfig,
  getLLMConfigResponse,
  saveLLMConfig,
  testLLMConnection,
  getWebSearchConfigResponse,
  saveWebSearchConfig,
  testWebSearchConnection,
  getSmtpConfigResponse,
  saveSmtpConfig,
  testSmtpConnection,
  getConfigStatus,
  getPasswordPolicyConfig,
  savePasswordPolicyConfig,
} from './globalConfig.service';
import type { LLMConfigData, WebSearchConfigData, SmtpConfigData } from './globalConfig.types';

// ── Validation helpers ──────────────────────────────────────────────────

function validateLLMConfig(body: unknown): LLMConfigData {
  const data = body as Record<string, unknown>;

  if (typeof data.type !== 'string' || data.type.trim() === '') {
    throw new ValidationError('Provider type is required');
  }

  if (typeof data.baseUrl !== 'string' || data.baseUrl.trim() === '') {
    throw new ValidationError('Base URL is required');
  }

  if (typeof data.apiKey !== 'string') {
    throw new ValidationError('API Key is required');
  }

  if (!isPasswordMask(data.apiKey) && data.apiKey.trim() === '') {
    throw new ValidationError('API Key cannot be empty');
  }

  if (typeof data.model !== 'string' || data.model.trim() === '') {
    throw new ValidationError('Model is required');
  }

  const compressTokenLimit = Number(data.compressTokenLimit);
  if (isNaN(compressTokenLimit) || compressTokenLimit < 1000 || compressTokenLimit > 500000) {
    throw new ValidationError('Compress token limit must be between 1000 and 500000');
  }

  return {
    type: data.type.trim(),
    baseUrl: data.baseUrl.trim(),
    apiKey: data.apiKey,
    model: data.model.trim(),
    compressTokenLimit,
  };
}

function validateWebSearchConfig(body: unknown): WebSearchConfigData {
  const data = body as Record<string, unknown>;

  if (typeof data.type !== 'string' || data.type.trim() === '') {
    throw new ValidationError('Search provider type is required');
  }

  const validTypes = ['ali_iqs', 'baidu', 'google'];
  if (!validTypes.includes(data.type.trim().toLowerCase())) {
    throw new ValidationError(`Search provider type must be one of: ${validTypes.join(', ')}`);
  }

  if (typeof data.apiKey !== 'string') {
    throw new ValidationError('API Key is required');
  }

  if (!isPasswordMask(data.apiKey) && data.apiKey.trim() === '') {
    throw new ValidationError('API Key cannot be empty');
  }

  const numResults = Number(data.numResults);
  if (isNaN(numResults) || numResults < 1 || numResults > 20) {
    throw new ValidationError('Number of results must be between 1 and 20');
  }

  const timeout = Number(data.timeout);
  if (isNaN(timeout) || timeout < 5 || timeout > 120) {
    throw new ValidationError('Timeout must be between 5 and 120 seconds');
  }

  const type = data.type.trim().toLowerCase();

  let cx: string | undefined;
  if (type === 'google') {
    if (typeof data.cx !== 'string' || data.cx.trim() === '') {
      throw new ValidationError('Search Engine ID (CX) is required for Google search');
    }
    cx = data.cx.trim();
  }

  return {
    type,
    apiKey: data.apiKey,
    ...(cx ? { cx } : {}),
    numResults,
    timeout,
  };
}

// ── LLM handlers ────────────────────────────────────────────────────────

export async function getLLMConfigHandler(_req: Request, res: Response): Promise<void> {
  const cfg = await getLLMConfigResponse();
  res.json(cfg);
}

export async function saveLLMConfigHandler(req: Request, res: Response): Promise<void> {
  const data = validateLLMConfig(req.body);
  await saveLLMConfig(data);
  // Reload LLM provider with updated config
  const freshConfig = await getLLMConfig();
  LLMProviderFactory.setConfig(freshConfig);
  const cfg = await getLLMConfigResponse();
  if (req.auditContext) {
    req.auditContext.params = { configKey: 'llm' };
  }
  res.json(cfg);
}

export async function testLLMConnectionHandler(req: Request, res: Response): Promise<void> {
  const data = validateLLMConfig(req.body);
  const result = await testLLMConnection(data);
  res.json(result);
}

// ── WebSearch handlers ──────────────────────────────────────────────────

export async function getWebSearchConfigHandler(_req: Request, res: Response): Promise<void> {
  const cfg = await getWebSearchConfigResponse();
  res.json(cfg);
}

export async function saveWebSearchConfigHandler(req: Request, res: Response): Promise<void> {
  const data = validateWebSearchConfig(req.body);
  await saveWebSearchConfig(data);
  const cfg = await getWebSearchConfigResponse();
  if (req.auditContext) {
    req.auditContext.params = { configKey: 'web-search' };
  }
  res.json(cfg);
}

export async function testWebSearchConnectionHandler(req: Request, res: Response): Promise<void> {
  const data = validateWebSearchConfig(req.body);
  const result = await testWebSearchConnection(data);
  res.json(result);
}

// ── SMTP Validation ─────────────────────────────────────────────────────

export function validateSmtpConfig(body: unknown): SmtpConfigData {
  const data = body as Record<string, unknown>;

  if (typeof data.host !== 'string' || data.host.trim() === '') {
    throw new ValidationError('SMTP host is required');
  }

  const port = Number(data.port);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new ValidationError('SMTP port must be between 1 and 65535');
  }

  if (typeof data.user !== 'string' || data.user.trim() === '') {
    throw new ValidationError('SMTP user is required');
  }

  if (typeof data.pass !== 'string') {
    throw new ValidationError('SMTP password is required');
  }

  if (!isPasswordMask(data.pass) && data.pass.trim() === '') {
    throw new ValidationError('SMTP password cannot be empty');
  }

  const fromName = typeof data.fromName === 'string' ? data.fromName : undefined;

  return {
    type: 'smtp',
    host: data.host.trim(),
    port,
    secure: Boolean(data.secure),
    user: data.user.trim(),
    pass: data.pass,
    ...(fromName !== undefined ? { fromName } : {}),
  };
}

// ── SMTP handlers ───────────────────────────────────────────────────────

export async function getSmtpConfigHandler(_req: Request, res: Response): Promise<void> {
  const cfg = await getSmtpConfigResponse();
  res.json(cfg);
}

export async function saveSmtpConfigHandler(req: Request, res: Response): Promise<void> {
  const data = validateSmtpConfig(req.body);
  await saveSmtpConfig(data);
  const cfg = await getSmtpConfigResponse();
  if (req.auditContext) {
    req.auditContext.params = { configKey: 'smtp' };
  }
  res.json(cfg);
}

export async function testSmtpConnectionHandler(req: Request, res: Response): Promise<void> {
  const data = validateSmtpConfig(req.body);
  const result = await testSmtpConnection(data);
  res.json(result);
}

// ── Password Policy handlers ──────────────────────────────────────────

export async function getPasswordPolicyHandler(_req: Request, res: Response): Promise<void> {
  const policy = await getPasswordPolicyConfig();
  res.json(policy);
}

export async function savePasswordPolicyHandler(req: Request, res: Response): Promise<void> {
  const data = req.body as Record<string, unknown>;

  const minLength = Number(data.minLength);
  if (isNaN(minLength) || minLength < 4 || minLength > 128) {
    throw new ValidationError('Minimum length must be between 4 and 128');
  }

  const policy = {
    minLength,
    requireUppercase: Boolean(data.requireUppercase),
    requireLowercase: Boolean(data.requireLowercase),
    requireNumbers: Boolean(data.requireNumbers),
    requireSpecialChars: Boolean(data.requireSpecialChars),
  };

  await savePasswordPolicyConfig(policy);
  if (req.auditContext) {
    req.auditContext.params = { configKey: 'password-policy' };
  }
  res.json(policy);
}

// ── Config status handler ──────────────────────────────────────────────

export async function getConfigStatusHandler(_req: Request, res: Response): Promise<void> {
  const status = await getConfigStatus();
  res.json(status);
}
