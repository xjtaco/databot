import { http } from '@/utils';
import type {
  LLMConfigForm,
  WebSearchConfigForm,
  SmtpConfigForm,
  TestConnectionResult,
  ConfigStatusResponse,
} from '@/types/globalConfig';

// LLM config
export async function getLLMConfig(): Promise<LLMConfigForm> {
  return http.get<LLMConfigForm>('/global-config/llm');
}

export async function saveLLMConfig(config: LLMConfigForm): Promise<LLMConfigForm> {
  return http.put<LLMConfigForm>('/global-config/llm', config);
}

export async function testLLMConnection(config: LLMConfigForm): Promise<TestConnectionResult> {
  return http.post<TestConnectionResult>('/global-config/llm/test', config);
}

// Web search config
export async function getWebSearchConfig(): Promise<WebSearchConfigForm> {
  return http.get<WebSearchConfigForm>('/global-config/web-search');
}

export async function saveWebSearchConfig(
  config: WebSearchConfigForm
): Promise<WebSearchConfigForm> {
  return http.put<WebSearchConfigForm>('/global-config/web-search', config);
}

export async function testWebSearchConnection(
  config: WebSearchConfigForm
): Promise<TestConnectionResult> {
  return http.post<TestConnectionResult>('/global-config/web-search/test', config);
}

// SMTP config
export async function getSmtpConfig(): Promise<SmtpConfigForm> {
  return http.get<SmtpConfigForm>('/global-config/smtp');
}

export async function saveSmtpConfig(config: SmtpConfigForm): Promise<SmtpConfigForm> {
  return http.put<SmtpConfigForm>('/global-config/smtp', config);
}

export async function testSmtpConnection(config: SmtpConfigForm): Promise<TestConnectionResult> {
  return http.post<TestConnectionResult>('/global-config/smtp/test', config);
}

// Config status
export async function getConfigStatus(): Promise<ConfigStatusResponse> {
  return http.get<ConfigStatusResponse>('/global-config/status');
}
