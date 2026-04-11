<template>
  <div class="config-card">
    <div class="config-card__header">
      <Bot :size="isMobile ? 16 : 18" class="config-card__header-icon" />
      <div class="config-card__header-text">
        <span class="config-card__title">{{ t('settings.llm.title') }}</span>
        <span v-if="!isMobile" class="config-card__desc">{{ t('settings.llm.description') }}</span>
      </div>
    </div>

    <div v-loading="isLoading" class="config-card__body">
      <div class="config-card__row">
        <div class="config-field">
          <label class="config-field__label">{{ t('settings.llm.type') }}</label>
          <el-select
            v-model="formData.type"
            :disabled="isSubmitting"
            class="config-field__select"
            popper-class="config-select-dropdown"
          >
            <el-option label="OpenAI Compatible" value="openai" />
          </el-select>
        </div>
        <div class="config-field">
          <label class="config-field__label">{{ t('settings.llm.baseUrl') }}</label>
          <div class="config-field__input-box">
            <input
              v-model="formData.baseUrl"
              type="text"
              class="config-field__input"
              :placeholder="t('settings.llm.baseUrlPlaceholder')"
              :disabled="isSubmitting"
            />
          </div>
        </div>
      </div>

      <div class="config-card__row">
        <div class="config-field">
          <label class="config-field__label">{{ t('settings.llm.apiKey') }}</label>
          <div class="config-field__input-box">
            <input
              v-model="formData.apiKey"
              :type="showApiKey ? 'text' : 'password'"
              class="config-field__input"
              :placeholder="t('settings.llm.apiKeyPlaceholder')"
              :disabled="isSubmitting"
            />
            <button class="config-field__toggle" @click="showApiKey = !showApiKey">
              <component :is="showApiKey ? EyeOff : Eye" :size="14" />
            </button>
          </div>
        </div>
        <div class="config-field">
          <label class="config-field__label">{{ t('settings.llm.compressTokenLimit') }}</label>
          <div class="config-field__input-box">
            <input
              v-model.number="formData.compressTokenLimit"
              type="number"
              class="config-field__input"
              :min="1000"
              :max="500000"
              :disabled="isSubmitting"
            />
          </div>
        </div>
      </div>

      <div class="config-card__row">
        <div class="config-field">
          <label class="config-field__label">{{ t('settings.llm.model') }}</label>
          <div class="config-field__input-box">
            <input
              v-model="formData.model"
              type="text"
              class="config-field__input"
              :placeholder="t('settings.llm.modelPlaceholder')"
              :disabled="isSubmitting"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="config-card__footer">
      <button class="config-btn config-btn--secondary" :disabled="isSubmitting" @click="handleTest">
        <Loader2 v-if="isTesting" :size="16" class="config-btn__spinner" />
        <Plug v-else :size="16" />
        <span>{{ testBtnLabel }}</span>
      </button>
      <button class="config-btn config-btn--primary" :disabled="isTesting" @click="handleSave">
        <Loader2 v-if="isSubmitting" :size="16" class="config-btn__spinner" />
        <Save v-else :size="16" />
        <span>{{ isSubmitting ? t('settings.llm.saving') : t('common.save') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Bot, Plug, Save, Eye, EyeOff, Loader2 } from 'lucide-vue-next';
import * as globalConfigApi from '@/api/globalConfig';
import { useGlobalConfigStore } from '@/stores';

const props = defineProps<{
  isMobile?: boolean;
}>();

const { t } = useI18n();
const store = useGlobalConfigStore();

const formData = reactive({
  type: 'openai',
  baseUrl: '',
  apiKey: '',
  model: '',
  compressTokenLimit: 90000,
});

const isTesting = ref(false);
const isSubmitting = ref(false);
const isLoading = ref(false);
const showApiKey = ref(false);

const testBtnLabel = computed(() => {
  if (isTesting.value) return t('settings.llm.testing');
  return props.isMobile ? t('settings.llm.testConnectionShort') : t('settings.llm.testConnection');
});

onMounted(async () => {
  isLoading.value = true;
  try {
    await store.fetchLLMConfig();
    if (store.llmConfig) {
      formData.type = store.llmConfig.type;
      formData.baseUrl = store.llmConfig.baseUrl;
      formData.apiKey = store.llmConfig.apiKey;
      formData.model = store.llmConfig.model;
      formData.compressTokenLimit = store.llmConfig.compressTokenLimit;
    }
  } catch {
    // Use defaults
  } finally {
    isLoading.value = false;
  }
});

async function handleTest(): Promise<void> {
  if (!formData.baseUrl.trim() || !formData.model.trim()) {
    ElMessage.warning(t('settings.validation.baseUrlRequired'));
    return;
  }

  isTesting.value = true;
  try {
    await globalConfigApi.testLLMConnection({ ...formData });
    ElMessage.success(t('settings.llm.testSuccess'));
  } catch (error) {
    const msg = error instanceof Error ? error.message : t('settings.llm.testFailed');
    ElMessage.error(msg);
  } finally {
    isTesting.value = false;
  }
}

async function handleSave(): Promise<void> {
  if (!formData.baseUrl.trim()) {
    ElMessage.warning(t('settings.validation.baseUrlRequired'));
    return;
  }
  if (!formData.model.trim()) {
    ElMessage.warning(t('settings.validation.modelRequired'));
    return;
  }

  isSubmitting.value = true;
  try {
    await store.saveLLMConfig({ ...formData });
    ElMessage.success(t('settings.llm.saveSuccess'));
  } catch (error) {
    const msg = error instanceof Error ? error.message : t('settings.llm.saveFailed');
    ElMessage.error(msg);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use './config-card';
</style>
