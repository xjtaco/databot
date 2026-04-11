import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';

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

// Mock service
const mockGetLLMConfig = vi.fn();
const mockGetLLMConfigResponse = vi.fn();
const mockSaveLLMConfig = vi.fn();
const mockTestLLMConnection = vi.fn();
const mockGetWebSearchConfigResponse = vi.fn();
const mockSaveWebSearchConfig = vi.fn();
const mockTestWebSearchConnection = vi.fn();

vi.mock('../../src/globalConfig/globalConfig.service', () => ({
  getLLMConfig: (...args: unknown[]) => mockGetLLMConfig(...args),
  getLLMConfigResponse: (...args: unknown[]) => mockGetLLMConfigResponse(...args),
  saveLLMConfig: (...args: unknown[]) => mockSaveLLMConfig(...args),
  testLLMConnection: (...args: unknown[]) => mockTestLLMConnection(...args),
  getWebSearchConfigResponse: (...args: unknown[]) => mockGetWebSearchConfigResponse(...args),
  saveWebSearchConfig: (...args: unknown[]) => mockSaveWebSearchConfig(...args),
  testWebSearchConnection: (...args: unknown[]) => mockTestWebSearchConnection(...args),
}));

// Mock LLM factory
const mockSetConfig = vi.fn();
vi.mock('../../src/infrastructure/llm', () => ({
  LLMProviderFactory: {
    setConfig: (...args: unknown[]) => mockSetConfig(...args),
  },
}));

import {
  getLLMConfigHandler,
  saveLLMConfigHandler,
  testLLMConnectionHandler,
  getWebSearchConfigHandler,
  saveWebSearchConfigHandler,
  testWebSearchConnectionHandler,
} from '../../src/globalConfig/globalConfig.controller';

function createMockRes(): Response {
  const res = {
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function createMockReq(body: Record<string, unknown> = {}): Request {
  return { body } as Request;
}

describe('globalConfig.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getLLMConfigHandler', () => {
    it('should return LLM config response', async () => {
      const cfg = {
        type: 'openai',
        baseUrl: 'url',
        apiKey: '********',
        model: 'gpt-4o',
        compressTokenLimit: 90000,
      };
      mockGetLLMConfigResponse.mockResolvedValue(cfg);

      const res = createMockRes();
      await getLLMConfigHandler(createMockReq(), res);

      expect(res.json).toHaveBeenCalledWith(cfg);
    });
  });

  describe('saveLLMConfigHandler', () => {
    it('should validate, save, reload factory, and return config', async () => {
      const body = {
        type: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'key',
        model: 'gpt-4o',
        compressTokenLimit: 90000,
      };
      const savedConfig = { ...body, apiKey: 'key' };
      const responseConfig = { ...body, apiKey: '********' };

      mockSaveLLMConfig.mockResolvedValue(undefined);
      mockGetLLMConfig.mockResolvedValue(savedConfig);
      mockGetLLMConfigResponse.mockResolvedValue(responseConfig);

      const res = createMockRes();
      await saveLLMConfigHandler(createMockReq(body), res);

      expect(mockSaveLLMConfig).toHaveBeenCalled();
      expect(mockGetLLMConfig).toHaveBeenCalled();
      expect(mockSetConfig).toHaveBeenCalledWith(savedConfig);
      expect(res.json).toHaveBeenCalledWith(responseConfig);
    });

    it('should throw ValidationError for missing type', async () => {
      const body = { baseUrl: 'url', apiKey: 'key', model: 'model', compressTokenLimit: 90000 };

      await expect(saveLLMConfigHandler(createMockReq(body), createMockRes())).rejects.toThrow(
        'Provider type is required'
      );
    });

    it('should throw ValidationError for invalid compressTokenLimit', async () => {
      const body = {
        type: 'openai',
        baseUrl: 'url',
        apiKey: 'key',
        model: 'model',
        compressTokenLimit: 500,
      };

      await expect(saveLLMConfigHandler(createMockReq(body), createMockRes())).rejects.toThrow(
        'Compress token limit must be between 1000 and 500000'
      );
    });
  });

  describe('testLLMConnectionHandler', () => {
    it('should validate and test connection', async () => {
      const body = {
        type: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'key',
        model: 'gpt-4o',
        compressTokenLimit: 90000,
      };
      const result = { success: true, message: 'ok' };
      mockTestLLMConnection.mockResolvedValue(result);

      const res = createMockRes();
      await testLLMConnectionHandler(createMockReq(body), res);

      expect(res.json).toHaveBeenCalledWith(result);
    });
  });

  describe('getWebSearchConfigHandler', () => {
    it('should return web search config response', async () => {
      const cfg = { type: 'ali_iqs', apiKey: '********', numResults: 3, timeout: 60 };
      mockGetWebSearchConfigResponse.mockResolvedValue(cfg);

      const res = createMockRes();
      await getWebSearchConfigHandler(createMockReq(), res);

      expect(res.json).toHaveBeenCalledWith(cfg);
    });
  });

  describe('saveWebSearchConfigHandler', () => {
    it('should validate and save web search config', async () => {
      const body = { type: 'ali_iqs', apiKey: 'key', numResults: 3, timeout: 60 };
      const responseConfig = { ...body, apiKey: '********' };

      mockSaveWebSearchConfig.mockResolvedValue(undefined);
      mockGetWebSearchConfigResponse.mockResolvedValue(responseConfig);

      const res = createMockRes();
      await saveWebSearchConfigHandler(createMockReq(body), res);

      expect(mockSaveWebSearchConfig).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(responseConfig);
    });

    it('should throw ValidationError for invalid search type', async () => {
      const body = { type: 'bing', apiKey: 'key', numResults: 3, timeout: 60 };

      await expect(
        saveWebSearchConfigHandler(createMockReq(body), createMockRes())
      ).rejects.toThrow('Search provider type must be one of');
    });

    it('should validate and save google config with cx', async () => {
      const body = { type: 'google', apiKey: 'key', cx: 'my-cx-id', numResults: 3, timeout: 60 };
      const responseConfig = { ...body, apiKey: '********' };

      mockSaveWebSearchConfig.mockResolvedValue(undefined);
      mockGetWebSearchConfigResponse.mockResolvedValue(responseConfig);

      const res = createMockRes();
      await saveWebSearchConfigHandler(createMockReq(body), res);

      expect(mockSaveWebSearchConfig).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'google', cx: 'my-cx-id' })
      );
      expect(res.json).toHaveBeenCalledWith(responseConfig);
    });

    it('should throw ValidationError for google type without cx', async () => {
      const body = { type: 'google', apiKey: 'key', numResults: 3, timeout: 60 };

      await expect(
        saveWebSearchConfigHandler(createMockReq(body), createMockRes())
      ).rejects.toThrow('Search Engine ID (CX) is required');
    });

    it('should strip cx when type is not google', async () => {
      const body = { type: 'ali_iqs', apiKey: 'key', cx: 'stale-cx', numResults: 3, timeout: 60 };
      const responseConfig = { type: 'ali_iqs', apiKey: '********', numResults: 3, timeout: 60 };

      mockSaveWebSearchConfig.mockResolvedValue(undefined);
      mockGetWebSearchConfigResponse.mockResolvedValue(responseConfig);

      const res = createMockRes();
      await saveWebSearchConfigHandler(createMockReq(body), res);

      expect(mockSaveWebSearchConfig).toHaveBeenCalledWith(
        expect.not.objectContaining({ cx: 'stale-cx' })
      );
    });
  });

  describe('testWebSearchConnectionHandler', () => {
    it('should validate and test web search connection', async () => {
      const body = { type: 'baidu', apiKey: 'key', numResults: 3, timeout: 60 };
      const result = { success: true, message: 'ok' };
      mockTestWebSearchConnection.mockResolvedValue(result);

      const res = createMockRes();
      await testWebSearchConnectionHandler(createMockReq(body), res);

      expect(res.json).toHaveBeenCalledWith(result);
    });
  });
});
