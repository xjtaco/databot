import {
  encryptPassword,
  decryptPassword,
  isPasswordMask,
  PASSWORD_MASK,
} from '../utils/encryption';
import { ValidationError, ConfigTestError } from '../errors/types';
import logger from '../utils/logger';
import { getConfigsByCategory, upsertConfigs } from './globalConfig.repository';
import { LLM_DEFAULTS, WEB_SEARCH_DEFAULTS, DEFAULT_SMTP_CONFIG } from './globalConfig.types';
import type {
  LLMConfigData,
  WebSearchConfigData,
  SmtpConfigData,
  TestConnectionResult,
  ConfigStatusResponse,
} from './globalConfig.types';
import { DEFAULT_PASSWORD_POLICY } from '../auth/authService';
import type { PasswordPolicy } from '../auth/authService';

// ── LLM Config ──────────────────────────────────────────────────────────

let cachedLLMConfig: LLMConfigData | null = null;

export function invalidateLLMConfigCache(): void {
  cachedLLMConfig = null;
  logger.debug('LLM config cache invalidated');
}

export async function getLLMConfig(): Promise<LLMConfigData> {
  if (cachedLLMConfig) {
    return cachedLLMConfig;
  }

  const rows = await getConfigsByCategory('llm');
  const map = new Map(rows.map((r) => [r.configKey, r.configValue]));

  const type = map.get('llm_type') ?? LLM_DEFAULTS.type;
  const baseUrl = map.get('llm_base_url') ?? LLM_DEFAULTS.baseUrl;
  const model = map.get('llm_model') ?? LLM_DEFAULTS.model;
  const compressTokenLimitRaw = map.get('llm_compress_token_limit');
  const compressTokenLimit = compressTokenLimitRaw
    ? Number(compressTokenLimitRaw)
    : LLM_DEFAULTS.compressTokenLimit;

  const apiKeyRaw = map.get('llm_api_key');
  const apiKey = apiKeyRaw ? decryptPassword(apiKeyRaw) : LLM_DEFAULTS.apiKey;

  cachedLLMConfig = {
    type,
    baseUrl,
    apiKey,
    model,
    compressTokenLimit: Number.isNaN(compressTokenLimit)
      ? LLM_DEFAULTS.compressTokenLimit
      : compressTokenLimit,
  };

  return cachedLLMConfig;
}

export async function getLLMConfigResponse(): Promise<LLMConfigData> {
  const cfg = await getLLMConfig();
  return { ...cfg, apiKey: cfg.apiKey ? PASSWORD_MASK : '' };
}

export async function saveLLMConfig(data: LLMConfigData): Promise<void> {
  let apiKeyToStore: string;

  if (isPasswordMask(data.apiKey)) {
    // Preserve existing encrypted value
    const rows = await getConfigsByCategory('llm');
    const existing = rows.find((r) => r.configKey === 'llm_api_key');
    if (!existing) {
      throw new ValidationError('Cannot save masked API key without existing value');
    }
    apiKeyToStore = existing.configValue;
  } else {
    apiKeyToStore = encryptPassword(data.apiKey);
  }

  await upsertConfigs('llm', [
    { key: 'llm_type', value: data.type },
    { key: 'llm_base_url', value: data.baseUrl },
    { key: 'llm_api_key', value: apiKeyToStore },
    { key: 'llm_model', value: data.model },
    { key: 'llm_compress_token_limit', value: String(data.compressTokenLimit) },
  ]);

  invalidateLLMConfigCache();
  logger.info('LLM configuration saved');
}

export async function testLLMConnection(data: LLMConfigData): Promise<TestConnectionResult> {
  const resolvedConfig = await resolveLLMTestConfig(data);

  if (!resolvedConfig.apiKey) {
    throw new ValidationError('API Key is required for LLM connection test');
  }

  try {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({
      apiKey: resolvedConfig.apiKey,
      baseURL: resolvedConfig.baseUrl,
    });

    await client.chat.completions.create({
      model: resolvedConfig.model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
    });

    logger.info('LLM connection test succeeded');
    return { success: true, message: 'Connection successful' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigTestError(`LLM connection test failed: ${message}`);
  }
}

async function resolveLLMTestConfig(data: LLMConfigData): Promise<LLMConfigData> {
  let apiKey = data.apiKey;

  if (!apiKey || isPasswordMask(apiKey)) {
    try {
      const saved = await getLLMConfig();
      apiKey = saved.apiKey;
    } catch {
      // No saved config
    }
  }

  return { ...data, apiKey };
}

// ── WebSearch Config ────────────────────────────────────────────────────

let cachedWebSearchConfig: WebSearchConfigData | null = null;

export function invalidateWebSearchConfigCache(): void {
  cachedWebSearchConfig = null;
  logger.debug('Web search config cache invalidated');
}

export async function getWebSearchConfig(): Promise<WebSearchConfigData> {
  if (cachedWebSearchConfig) {
    return cachedWebSearchConfig;
  }

  const rows = await getConfigsByCategory('web_search');
  const map = new Map(rows.map((r) => [r.configKey, r.configValue]));

  const type = map.get('web_search_type') ?? WEB_SEARCH_DEFAULTS.type;
  const numResultsRaw = map.get('web_search_num_results');
  const timeoutRaw = map.get('web_search_timeout');

  const numResults = numResultsRaw ? Number(numResultsRaw) : WEB_SEARCH_DEFAULTS.numResults;
  const timeout = timeoutRaw ? Number(timeoutRaw) : WEB_SEARCH_DEFAULTS.timeout;

  const apiKeyRaw = map.get('web_search_api_key');
  const apiKey = apiKeyRaw ? decryptPassword(apiKeyRaw) : WEB_SEARCH_DEFAULTS.apiKey;
  const cx = map.get('web_search_cx') ?? undefined;

  cachedWebSearchConfig = {
    type,
    apiKey,
    ...(cx ? { cx } : {}),
    numResults: Number.isNaN(numResults) ? WEB_SEARCH_DEFAULTS.numResults : numResults,
    timeout: Number.isNaN(timeout) ? WEB_SEARCH_DEFAULTS.timeout : timeout,
  };

  return cachedWebSearchConfig;
}

export async function getWebSearchConfigResponse(): Promise<WebSearchConfigData> {
  const cfg = await getWebSearchConfig();
  return { ...cfg, apiKey: cfg.apiKey ? PASSWORD_MASK : '' };
}

export async function saveWebSearchConfig(data: WebSearchConfigData): Promise<void> {
  let apiKeyToStore: string;

  if (isPasswordMask(data.apiKey)) {
    const rows = await getConfigsByCategory('web_search');
    const existing = rows.find((r) => r.configKey === 'web_search_api_key');
    if (!existing) {
      throw new ValidationError('Cannot save masked API key without existing value');
    }
    apiKeyToStore = existing.configValue;
  } else {
    apiKeyToStore = encryptPassword(data.apiKey);
  }

  await upsertConfigs('web_search', [
    { key: 'web_search_type', value: data.type },
    { key: 'web_search_api_key', value: apiKeyToStore },
    { key: 'web_search_cx', value: data.cx ?? '' },
    { key: 'web_search_num_results', value: String(data.numResults) },
    { key: 'web_search_timeout', value: String(data.timeout) },
  ]);

  invalidateWebSearchConfigCache();
  logger.info('Web search configuration saved');
}

export async function testWebSearchConnection(
  data: WebSearchConfigData
): Promise<TestConnectionResult> {
  const resolvedConfig = await resolveWebSearchTestConfig(data);

  if (!resolvedConfig.apiKey) {
    throw new ValidationError('API Key is required for web search connection test');
  }

  try {
    const { createWebSearchProviderFromConfig } = await import('../infrastructure/tools/webSearch');
    const provider = createWebSearchProviderFromConfig(resolvedConfig);
    const results = await provider.search('test');
    logger.info(`Web search test succeeded, got ${results.length} results`);
    return { success: true, message: 'Connection successful' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigTestError(`Web search connection test failed: ${message}`);
  }
}

async function resolveWebSearchTestConfig(data: WebSearchConfigData): Promise<WebSearchConfigData> {
  let apiKey = data.apiKey;

  if (!apiKey || isPasswordMask(apiKey)) {
    try {
      const saved = await getWebSearchConfig();
      apiKey = saved.apiKey;
    } catch {
      // No saved config
    }
  }

  return { ...data, apiKey };
}

// ── SMTP Config ─────────────────────────────────────────────────────────

let cachedSmtpConfig: SmtpConfigData | null = null;

export function invalidateSmtpConfigCache(): void {
  cachedSmtpConfig = null;
  logger.debug('SMTP config cache invalidated');
}

export async function getSmtpConfig(): Promise<SmtpConfigData> {
  if (cachedSmtpConfig) {
    return cachedSmtpConfig;
  }

  const rows = await getConfigsByCategory('smtp');
  const map = new Map(rows.map((r) => [r.configKey, r.configValue]));

  const host = map.get('smtp_host') ?? DEFAULT_SMTP_CONFIG.host;
  const portRaw = map.get('smtp_port');
  const port = portRaw ? Number(portRaw) : DEFAULT_SMTP_CONFIG.port;
  const secureRaw = map.get('smtp_secure');
  const secure = secureRaw !== undefined ? secureRaw === 'true' : DEFAULT_SMTP_CONFIG.secure;
  const user = map.get('smtp_user') ?? DEFAULT_SMTP_CONFIG.user;
  const fromName = map.get('smtp_from_name') ?? DEFAULT_SMTP_CONFIG.fromName;

  const passRaw = map.get('smtp_pass');
  const pass = passRaw ? decryptPassword(passRaw) : DEFAULT_SMTP_CONFIG.pass;

  cachedSmtpConfig = {
    type: 'smtp',
    host,
    port: Number.isNaN(port) ? DEFAULT_SMTP_CONFIG.port : port,
    secure,
    user,
    pass,
    fromName,
  };

  return cachedSmtpConfig;
}

export async function getSmtpConfigResponse(): Promise<SmtpConfigData> {
  const cfg = await getSmtpConfig();
  return { ...cfg, pass: cfg.pass ? PASSWORD_MASK : '' };
}

export async function saveSmtpConfig(data: SmtpConfigData): Promise<void> {
  let passToStore: string;

  if (isPasswordMask(data.pass)) {
    const rows = await getConfigsByCategory('smtp');
    const existing = rows.find((r) => r.configKey === 'smtp_pass');
    if (!existing) {
      throw new ValidationError('Cannot save masked password without existing value');
    }
    passToStore = existing.configValue;
  } else {
    passToStore = encryptPassword(data.pass);
  }

  await upsertConfigs('smtp', [
    { key: 'smtp_host', value: data.host },
    { key: 'smtp_port', value: String(data.port) },
    { key: 'smtp_secure', value: String(data.secure) },
    { key: 'smtp_user', value: data.user },
    { key: 'smtp_pass', value: passToStore },
    { key: 'smtp_from_name', value: data.fromName ?? '' },
  ]);

  invalidateSmtpConfigCache();
  logger.info('SMTP configuration saved');
}

export async function testSmtpConnection(data: SmtpConfigData): Promise<TestConnectionResult> {
  const resolvedConfig = await resolveSmtpTestConfig(data);

  if (!resolvedConfig.host) {
    throw new ValidationError('SMTP host is required for connection test');
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: resolvedConfig.host,
      port: resolvedConfig.port,
      secure: resolvedConfig.secure,
      auth: {
        user: resolvedConfig.user,
        pass: resolvedConfig.pass,
      },
    });

    await transporter.verify();

    logger.info('SMTP connection test succeeded');
    return { success: true, message: 'SMTP connection successful' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigTestError(`SMTP connection test failed: ${message}`);
  }
}

async function resolveSmtpTestConfig(data: SmtpConfigData): Promise<SmtpConfigData> {
  let pass = data.pass;

  if (!pass || isPasswordMask(pass)) {
    try {
      const saved = await getSmtpConfig();
      pass = saved.pass;
    } catch {
      // No saved config
    }
  }

  return { ...data, pass };
}

// ── Password Policy Config ─────────────────────────────────────────────

export async function getPasswordPolicyConfig(): Promise<PasswordPolicy> {
  const rows = await getConfigsByCategory('password_policy');
  if (rows.length === 0) return { ...DEFAULT_PASSWORD_POLICY };

  const configMap = new Map(rows.map((r) => [r.configKey, r.configValue]));
  return {
    minLength: parseInt(
      configMap.get('minLength') || String(DEFAULT_PASSWORD_POLICY.minLength),
      10
    ),
    requireUppercase: configMap.get('requireUppercase') !== 'false',
    requireLowercase: configMap.get('requireLowercase') !== 'false',
    requireNumbers: configMap.get('requireNumbers') !== 'false',
    requireSpecialChars: configMap.get('requireSpecialChars') !== 'false',
  };
}

export async function savePasswordPolicyConfig(policy: PasswordPolicy): Promise<void> {
  await upsertConfigs('password_policy', [
    { key: 'minLength', value: String(policy.minLength) },
    { key: 'requireUppercase', value: String(policy.requireUppercase) },
    { key: 'requireLowercase', value: String(policy.requireLowercase) },
    { key: 'requireNumbers', value: String(policy.requireNumbers) },
    { key: 'requireSpecialChars', value: String(policy.requireSpecialChars) },
  ]);
}

// ── Config Status ──────────────────────────────────────────────────────

export async function getConfigStatus(): Promise<ConfigStatusResponse> {
  const llmConfig = await getLLMConfig();
  const wsConfig = await getWebSearchConfig();
  const smtpConfig = await getSmtpConfig();
  return {
    llm: !!llmConfig.apiKey,
    webSearch: !!wsConfig.apiKey,
    smtp: !!(smtpConfig.host && smtpConfig.user && smtpConfig.pass),
  };
}
