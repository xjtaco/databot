import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  LLMConfigForm,
  WebSearchConfigForm,
  SmtpConfigForm,
  ConfigStatusResponse,
} from '@/types/globalConfig';
import * as globalConfigApi from '@/api/globalConfig';
import { useAsyncAction } from '@/composables/useAsyncAction';

export const useGlobalConfigStore = defineStore('globalConfig', () => {
  const llmConfig = ref<LLMConfigForm | null>(null);
  const webSearchConfig = ref<WebSearchConfigForm | null>(null);
  const smtpConfig = ref<SmtpConfigForm | null>(null);
  const configStatus = ref<ConfigStatusResponse | null>(null);

  const { isLoading: llmLoading, error: llmError, wrapAction: wrapLLMAction } = useAsyncAction();
  const {
    isLoading: webSearchLoading,
    error: webSearchError,
    wrapAction: wrapWebSearchAction,
  } = useAsyncAction();
  const { isLoading: smtpLoading, error: smtpError, wrapAction: wrapSmtpAction } = useAsyncAction();

  async function fetchConfigStatus(): Promise<void> {
    try {
      configStatus.value = await globalConfigApi.getConfigStatus();
    } catch {
      // Config status unavailable — computeds default to false
    }
  }

  const isLLMConfigured = computed(() => configStatus.value?.llm ?? false);
  const isWebSearchConfigured = computed(() => configStatus.value?.webSearch ?? false);
  const isSmtpConfigured = computed(() => configStatus.value?.smtp ?? false);

  const fetchLLMConfig = wrapLLMAction(async (): Promise<void> => {
    llmConfig.value = await globalConfigApi.getLLMConfig();
  });

  const saveLLMConfig = wrapLLMAction(async (config: LLMConfigForm): Promise<void> => {
    llmConfig.value = await globalConfigApi.saveLLMConfig(config);
    await fetchConfigStatus();
  });

  const fetchWebSearchConfig = wrapWebSearchAction(async (): Promise<void> => {
    webSearchConfig.value = await globalConfigApi.getWebSearchConfig();
  });

  const saveWebSearchConfig = wrapWebSearchAction(
    async (config: WebSearchConfigForm): Promise<void> => {
      webSearchConfig.value = await globalConfigApi.saveWebSearchConfig(config);
      await fetchConfigStatus();
    }
  );

  const fetchSmtpConfig = wrapSmtpAction(async (): Promise<void> => {
    smtpConfig.value = await globalConfigApi.getSmtpConfig();
  });

  const saveSmtpConfig = wrapSmtpAction(async (config: SmtpConfigForm): Promise<void> => {
    smtpConfig.value = await globalConfigApi.saveSmtpConfig(config);
    await fetchConfigStatus();
  });

  return {
    llmConfig,
    webSearchConfig,
    smtpConfig,
    configStatus,
    llmLoading,
    llmError,
    webSearchLoading,
    webSearchError,
    smtpLoading,
    smtpError,
    fetchLLMConfig,
    saveLLMConfig,
    fetchWebSearchConfig,
    saveWebSearchConfig,
    fetchSmtpConfig,
    saveSmtpConfig,
    fetchConfigStatus,
    isLLMConfigured,
    isWebSearchConfigured,
    isSmtpConfigured,
  };
});
