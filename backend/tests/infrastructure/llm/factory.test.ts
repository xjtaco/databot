import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMProviderFactory } from '../../../src/infrastructure/llm/factory';
import { LLMConfig } from '../../../src/infrastructure/llm/types';
import { OpenAIProvider } from '../../../src/infrastructure/llm/openai';

// Mock logger module
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the OpenAI provider module
vi.mock('../../../src/infrastructure/llm/openai', () => ({
  OpenAIProvider: vi.fn().mockImplementation((config: LLMConfig) => ({
    config,
    chat: vi.fn(),
    streamChat: vi.fn(),
  })),
}));

// Mock config module
vi.mock('../../../src/base/config', () => ({
  config: {
    llm: {
      type: 'openai',
      apiKey: 'test-api-key',
      model: 'gpt-4.5-mini',
      baseUrl: 'https://api.openai.com/v1',
    },
  },
}));

describe('LLMProviderFactory', () => {
  beforeEach(() => {
    // Clear factory cache before each test
    LLMProviderFactory.clearCache();
  });

  describe('createProvider()', () => {
    it('should create OpenAI provider for type "openai"', () => {
      // Arrange
      const llmConfig: LLMConfig = {
        type: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        baseUrl: 'https://api.openai.com/v1',
      };

      // Act
      const provider = LLMProviderFactory.createProvider('openai', llmConfig);

      // Assert
      expect(provider).toBeDefined();
      expect(OpenAIProvider).toHaveBeenCalledWith(llmConfig);
    });

    it('should throw error for unknown provider type', () => {
      // Arrange
      const llmConfig: LLMConfig = {
        type: 'unknown',
        apiKey: 'test-key',
        model: 'test-model',
        baseUrl: 'https://api.example.com',
      };

      // Act & Assert
      expect(() => {
        LLMProviderFactory.createProvider('unknown', llmConfig);
      }).toThrow('Unknown LLM provider type: unknown');
    });

    it('should throw error for anthropic provider (not implemented)', () => {
      // Arrange
      const llmConfig: LLMConfig = {
        type: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3',
        baseUrl: 'https://api.anthropic.com',
      };

      // Act & Assert
      expect(() => {
        LLMProviderFactory.createProvider('anthropic', llmConfig);
      }).toThrow('Anthropic provider is not yet implemented');
    });

    it('should create new provider instance on each call', () => {
      // Arrange
      const llmConfig: LLMConfig = {
        type: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        baseUrl: 'https://api.openai.com/v1',
      };

      // Act
      const provider1 = LLMProviderFactory.createProvider('openai', llmConfig);
      const provider2 = LLMProviderFactory.createProvider('openai', llmConfig);

      // Assert
      expect(provider1).not.toBe(provider2);
    });
  });

  describe('getProvider()', () => {
    it('should return provider instance from global config', () => {
      // Act
      const provider = LLMProviderFactory.getProvider();

      // Assert
      expect(provider).toBeDefined();
    });

    it('should cache and return same provider instance for same type', () => {
      // Act
      const provider1 = LLMProviderFactory.getProvider();
      const provider2 = LLMProviderFactory.getProvider();

      // Assert
      expect(provider1).toBe(provider2);
    });

    it('should create new instance after cache clear', () => {
      // Arrange
      const provider1 = LLMProviderFactory.getProvider();

      // Act
      LLMProviderFactory.clearCache();
      const provider2 = LLMProviderFactory.getProvider();

      // Assert
      expect(provider1).not.toBe(provider2);
    });

    it('should report cached provider correctly', () => {
      // Arrange & Act
      LLMProviderFactory.getProvider();

      // Assert
      expect(LLMProviderFactory.hasCachedProvider('openai')).toBe(true);
      expect(LLMProviderFactory.hasCachedProvider('anthropic')).toBe(false);
    });

    it('should not report uncached provider', () => {
      // Act & Assert
      expect(LLMProviderFactory.hasCachedProvider('openai')).toBe(false);
    });
  });

  describe('clearCache()', () => {
    it('should clear all cached providers', () => {
      // Arrange
      LLMProviderFactory.getProvider();
      expect(LLMProviderFactory.hasCachedProvider('openai')).toBe(true);

      // Act
      LLMProviderFactory.clearCache();

      // Assert
      expect(LLMProviderFactory.hasCachedProvider('openai')).toBe(false);
    });

    it('should allow creating new provider after cache clear', () => {
      // Arrange
      const provider1 = LLMProviderFactory.getProvider();

      // Act
      LLMProviderFactory.clearCache();
      const provider2 = LLMProviderFactory.getProvider();

      // Assert
      expect(provider1).not.toBe(provider2);
      expect(provider2).toBeDefined();
    });
  });
});
