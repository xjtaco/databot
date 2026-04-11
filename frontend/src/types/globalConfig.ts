export interface LLMConfigForm {
  type: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  compressTokenLimit: number;
}

export interface WebSearchConfigForm {
  type: string;
  apiKey: string;
  cx?: string;
  numResults: number;
  timeout: number;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
}

export interface SmtpConfigForm {
  type: 'smtp';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
}

export interface ConfigStatusResponse {
  llm: boolean;
  webSearch: boolean;
  smtp: boolean;
}
