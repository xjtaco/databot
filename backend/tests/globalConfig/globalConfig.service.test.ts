import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock encryption
vi.mock('../../src/utils/encryption', () => ({
  encryptPassword: vi.fn((v: string) => `enc:${v}`),
  decryptPassword: vi.fn((v: string) => v.replace('enc:', '')),
  isPasswordMask: vi.fn((v: string) => v === '********'),
  PASSWORD_MASK: '********',
}));

// Mock repository
const mockGetConfigsByCategory = vi.fn();
const mockUpsertConfigs = vi.fn();

vi.mock('../../src/globalConfig/globalConfig.repository', () => ({
  getConfigsByCategory: (...args: unknown[]) => mockGetConfigsByCategory(...args),
  upsertConfigs: (...args: unknown[]) => mockUpsertConfigs(...args),
}));

import {
  getLLMConfig,
  getLLMConfigResponse,
  saveLLMConfig,
  getWebSearchConfig,
  getWebSearchConfigResponse,
  saveWebSearchConfig,
  invalidateLLMConfigCache,
  invalidateWebSearchConfigCache,
  getConfigStatus,
  invalidateSmtpConfigCache,
} from '../../src/globalConfig/globalConfig.service';
import {
  LLM_DEFAULTS,
  WEB_SEARCH_DEFAULTS,
  DEFAULT_SMTP_CONFIG,
} from '../../src/globalConfig/globalConfig.types';

describe('globalConfig.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateLLMConfigCache();
    invalidateWebSearchConfigCache();
    invalidateSmtpConfigCache();
  });

  describe('getLLMConfig', () => {
    it('should return defaults when no DB rows exist', async () => {
      mockGetConfigsByCategory.mockResolvedValue([]);

      const config = await getLLMConfig();

      expect(config).toEqual(LLM_DEFAULTS);
      expect(mockGetConfigsByCategory).toHaveBeenCalledWith('llm');
    });

    it('should return DB values when rows exist', async () => {
      mockGetConfigsByCategory.mockResolvedValue([
        { configKey: 'llm_type', configValue: 'openai' },
        { configKey: 'llm_base_url', configValue: 'https://custom.api/v1' },
        { configKey: 'llm_api_key', configValue: 'enc:my-key' },
        { configKey: 'llm_model', configValue: 'gpt-4o' },
        { configKey: 'llm_compress_token_limit', configValue: '50000' },
      ]);

      const config = await getLLMConfig();

      expect(config.type).toBe('openai');
      expect(config.baseUrl).toBe('https://custom.api/v1');
      expect(config.apiKey).toBe('my-key');
      expect(config.model).toBe('gpt-4o');
      expect(config.compressTokenLimit).toBe(50000);
    });

    it('should cache config on second call', async () => {
      mockGetConfigsByCategory.mockResolvedValue([]);

      await getLLMConfig();
      await getLLMConfig();

      expect(mockGetConfigsByCategory).toHaveBeenCalledTimes(1);
    });

    it('should refetch after cache invalidation', async () => {
      mockGetConfigsByCategory.mockResolvedValue([]);

      await getLLMConfig();
      invalidateLLMConfigCache();
      await getLLMConfig();

      expect(mockGetConfigsByCategory).toHaveBeenCalledTimes(2);
    });
  });

  describe('getLLMConfigResponse', () => {
    it('should mask API key when present', async () => {
      mockGetConfigsByCategory.mockResolvedValue([
        { configKey: 'llm_api_key', configValue: 'enc:my-key' },
      ]);

      const response = await getLLMConfigResponse();

      expect(response.apiKey).toBe('********');
    });

    it('should return empty string when no API key', async () => {
      mockGetConfigsByCategory.mockResolvedValue([]);

      const response = await getLLMConfigResponse();

      expect(response.apiKey).toBe('');
    });
  });

  describe('saveLLMConfig', () => {
    it('should encrypt and upsert config values', async () => {
      mockUpsertConfigs.mockResolvedValue(undefined);

      await saveLLMConfig({
        type: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'new-key',
        model: 'gpt-4o',
        compressTokenLimit: 90000,
      });

      expect(mockUpsertConfigs).toHaveBeenCalledWith('llm', [
        { key: 'llm_type', value: 'openai' },
        { key: 'llm_base_url', value: 'https://api.openai.com/v1' },
        { key: 'llm_api_key', value: 'enc:new-key' },
        { key: 'llm_model', value: 'gpt-4o' },
        { key: 'llm_compress_token_limit', value: '90000' },
      ]);
    });

    it('should preserve existing encrypted key when masked', async () => {
      mockGetConfigsByCategory.mockResolvedValue([
        { configKey: 'llm_api_key', configValue: 'enc:existing-key' },
      ]);
      mockUpsertConfigs.mockResolvedValue(undefined);

      await saveLLMConfig({
        type: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '********',
        model: 'gpt-4o',
        compressTokenLimit: 90000,
      });

      expect(mockUpsertConfigs).toHaveBeenCalledWith(
        'llm',
        expect.arrayContaining([{ key: 'llm_api_key', value: 'enc:existing-key' }])
      );
    });

    it('should throw when masked key has no existing value', async () => {
      mockGetConfigsByCategory.mockResolvedValue([]);

      await expect(
        saveLLMConfig({
          type: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: '********',
          model: 'gpt-4o',
          compressTokenLimit: 90000,
        })
      ).rejects.toThrow('Cannot save masked API key without existing value');
    });

    it('should invalidate cache after save', async () => {
      mockGetConfigsByCategory.mockResolvedValue([]);
      mockUpsertConfigs.mockResolvedValue(undefined);

      // Populate cache
      await getLLMConfig();
      expect(mockGetConfigsByCategory).toHaveBeenCalledTimes(1);

      // Save should invalidate
      await saveLLMConfig({
        type: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'key',
        model: 'gpt-4o',
        compressTokenLimit: 90000,
      });

      // Next call should hit DB again
      await getLLMConfig();
      expect(mockGetConfigsByCategory).toHaveBeenCalledTimes(2);
    });
  });

  describe('getWebSearchConfig', () => {
    it('should return defaults when no DB rows exist', async () => {
      mockGetConfigsByCategory.mockResolvedValue([]);

      const config = await getWebSearchConfig();

      expect(config).toEqual(WEB_SEARCH_DEFAULTS);
    });

    it('should return DB values when rows exist', async () => {
      mockGetConfigsByCategory.mockResolvedValue([
        { configKey: 'web_search_type', configValue: 'baidu' },
        { configKey: 'web_search_api_key', configValue: 'enc:search-key' },
        { configKey: 'web_search_num_results', configValue: '5' },
        { configKey: 'web_search_timeout', configValue: '30' },
      ]);

      const config = await getWebSearchConfig();

      expect(config.type).toBe('baidu');
      expect(config.apiKey).toBe('search-key');
      expect(config.numResults).toBe(5);
      expect(config.timeout).toBe(30);
    });

    it('should return cx when web_search_cx exists in DB', async () => {
      mockGetConfigsByCategory.mockResolvedValue([
        { configKey: 'web_search_type', configValue: 'google' },
        { configKey: 'web_search_api_key', configValue: 'enc:google-key' },
        { configKey: 'web_search_cx', configValue: 'my-cx-id' },
        { configKey: 'web_search_num_results', configValue: '5' },
        { configKey: 'web_search_timeout', configValue: '30' },
      ]);

      const config = await getWebSearchConfig();

      expect(config.type).toBe('google');
      expect(config.cx).toBe('my-cx-id');
    });

    it('should not include cx when web_search_cx is absent', async () => {
      mockGetConfigsByCategory.mockResolvedValue([
        { configKey: 'web_search_type', configValue: 'ali_iqs' },
        { configKey: 'web_search_api_key', configValue: 'enc:key' },
      ]);

      const config = await getWebSearchConfig();

      expect(config.cx).toBeUndefined();
    });
  });

  describe('getWebSearchConfigResponse', () => {
    it('should mask API key when present', async () => {
      mockGetConfigsByCategory.mockResolvedValue([
        { configKey: 'web_search_api_key', configValue: 'enc:key' },
      ]);

      const response = await getWebSearchConfigResponse();

      expect(response.apiKey).toBe('********');
    });
  });

  describe('saveWebSearchConfig', () => {
    it('should encrypt and upsert config values', async () => {
      mockUpsertConfigs.mockResolvedValue(undefined);

      await saveWebSearchConfig({
        type: 'ali_iqs',
        apiKey: 'new-key',
        numResults: 5,
        timeout: 30,
      });

      expect(mockUpsertConfigs).toHaveBeenCalledWith('web_search', [
        { key: 'web_search_type', value: 'ali_iqs' },
        { key: 'web_search_api_key', value: 'enc:new-key' },
        { key: 'web_search_cx', value: '' },
        { key: 'web_search_num_results', value: '5' },
        { key: 'web_search_timeout', value: '30' },
      ]);
    });

    it('should persist cx when provided', async () => {
      mockUpsertConfigs.mockResolvedValue(undefined);

      await saveWebSearchConfig({
        type: 'google',
        apiKey: 'key',
        cx: 'my-cx-id',
        numResults: 5,
        timeout: 30,
      });

      expect(mockUpsertConfigs).toHaveBeenCalledWith(
        'web_search',
        expect.arrayContaining([{ key: 'web_search_cx', value: 'my-cx-id' }])
      );
    });

    it('should persist empty cx when not provided', async () => {
      mockUpsertConfigs.mockResolvedValue(undefined);

      await saveWebSearchConfig({
        type: 'ali_iqs',
        apiKey: 'key',
        numResults: 5,
        timeout: 30,
      });

      expect(mockUpsertConfigs).toHaveBeenCalledWith(
        'web_search',
        expect.arrayContaining([{ key: 'web_search_cx', value: '' }])
      );
    });
  });

  describe('getConfigStatus', () => {
    it('should return all false when no config is set', async () => {
      mockGetConfigsByCategory.mockResolvedValue([]);

      const status = await getConfigStatus();

      // Verify defaults produce false for all fields
      expect(!!DEFAULT_SMTP_CONFIG.host).toBe(false);
      expect(status).toEqual({ llm: false, webSearch: false, smtp: false });
    });

    it('should return llm true when API key exists', async () => {
      mockGetConfigsByCategory.mockImplementation((category: string) => {
        if (category === 'llm') {
          return Promise.resolve([{ configKey: 'llm_api_key', configValue: 'enc:my-key' }]);
        }
        return Promise.resolve([]);
      });

      const status = await getConfigStatus();

      expect(status.llm).toBe(true);
      expect(status.webSearch).toBe(false);
      expect(status.smtp).toBe(false);
    });

    it('should return webSearch true when API key exists', async () => {
      mockGetConfigsByCategory.mockImplementation((category: string) => {
        if (category === 'web_search') {
          return Promise.resolve([
            { configKey: 'web_search_api_key', configValue: 'enc:search-key' },
          ]);
        }
        return Promise.resolve([]);
      });

      const status = await getConfigStatus();

      expect(status.llm).toBe(false);
      expect(status.webSearch).toBe(true);
      expect(status.smtp).toBe(false);
    });

    it('should return smtp true when host, user, and pass are all set', async () => {
      mockGetConfigsByCategory.mockImplementation((category: string) => {
        if (category === 'smtp') {
          return Promise.resolve([
            { configKey: 'smtp_host', configValue: 'smtp.example.com' },
            { configKey: 'smtp_user', configValue: 'user@example.com' },
            { configKey: 'smtp_pass', configValue: 'enc:secret' },
          ]);
        }
        return Promise.resolve([]);
      });

      const status = await getConfigStatus();

      expect(status.llm).toBe(false);
      expect(status.webSearch).toBe(false);
      expect(status.smtp).toBe(true);
    });

    it('should return smtp false when host is missing', async () => {
      mockGetConfigsByCategory.mockImplementation((category: string) => {
        if (category === 'smtp') {
          return Promise.resolve([
            { configKey: 'smtp_user', configValue: 'user@example.com' },
            { configKey: 'smtp_pass', configValue: 'enc:secret' },
          ]);
        }
        return Promise.resolve([]);
      });

      const status = await getConfigStatus();

      expect(status.smtp).toBe(false);
    });
  });
});
