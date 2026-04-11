export type ConfigCategory = 'llm' | 'web_search' | 'smtp' | 'password_policy' | 'audit';

export interface LLMConfigData {
  type: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  compressTokenLimit: number;
}

export interface WebSearchConfigData {
  type: string;
  apiKey: string;
  cx?: string;
  numResults: number;
  timeout: number;
}

export interface SmtpConfigData {
  type: 'smtp';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName?: string;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
}

// ── Defaults (single source of truth) ────────────────────────────────

export const LLM_DEFAULTS: LLMConfigData = {
  type: 'openai',
  apiKey: '',
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.openai.com/v1',
  compressTokenLimit: 90000,
};

export const WEB_SEARCH_DEFAULTS: WebSearchConfigData = {
  type: 'ali_iqs',
  apiKey: '',
  numResults: 3,
  timeout: 60,
};

export const DEFAULT_SMTP_CONFIG: SmtpConfigData = {
  type: 'smtp',
  host: '',
  port: 465,
  secure: true,
  user: '',
  pass: '',
  fromName: '',
};

export interface ConfigStatusResponse {
  llm: boolean;
  webSearch: boolean;
  smtp: boolean;
}
