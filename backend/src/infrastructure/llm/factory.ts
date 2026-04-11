/**
 * Factory for creating LLM provider instances
 */

import { LLMProvider } from './base';
import { LLMConfig } from './types';
import { OpenAIProvider } from './openai';
import { LLM_DEFAULTS } from '../../globalConfig/globalConfig.types';

/**
 * Factory class for creating and managing LLM provider instances
 * Implements singleton pattern per provider type
 */
class LLMProviderFactoryClass {
  private providers: Map<string, LLMProvider> = new Map();
  private cachedConfig: LLMConfig | null = null;

  /**
   * Create a new LLM provider instance
   * @param type - Provider type ('openai', 'anthropic', etc.)
   * @param llmConfig - LLM configuration
   * @returns LLMProvider instance
   * @throws Error if provider type is unknown or not implemented
   */
  createProvider(type: string, llmConfig: LLMConfig): LLMProvider {
    switch (type) {
      case 'openai':
        return new OpenAIProvider(llmConfig);
      case 'anthropic':
        throw new Error('Anthropic provider is not yet implemented');
      default:
        throw new Error(`Unknown LLM provider type: ${type}`);
    }
  }

  /**
   * Set config directly and clear provider cache.
   * Should be called at startup and after config changes.
   */
  setConfig(llmConfig: LLMConfig): void {
    this.cachedConfig = llmConfig;
    this.providers.clear();
  }

  /**
   * Get the resolved LLM config (cached or defaults)
   */
  getConfig(): LLMConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }
    return LLM_DEFAULTS;
  }

  /**
   * Get or create a provider instance based on global config
   * Implements singleton pattern - caches provider instances per type
   * @returns LLMProvider instance
   */
  getProvider(): LLMProvider {
    const llmConfig = this.getConfig();
    const type = llmConfig.type;

    if (!this.providers.has(type)) {
      const provider = this.createProvider(type, llmConfig);
      this.providers.set(type, provider);
    }

    return this.providers.get(type)!;
  }

  /**
   * Clear all cached provider instances and config
   * Useful for testing or configuration changes
   */
  clearCache(): void {
    this.providers.clear();
    this.cachedConfig = null;
  }

  /**
   * Check if a provider type is cached
   * @param type - Provider type
   * @returns true if provider is cached
   */
  hasCachedProvider(type: string): boolean {
    return this.providers.has(type);
  }
}

// Export singleton instance
export const LLMProviderFactory = new LLMProviderFactoryClass();
