<template>
  <div class="config-card">
    <div class="config-card__header">
      <Globe :size="isMobile ? 16 : 18" class="config-card__header-icon" />
      <div class="config-card__header-text">
        <span class="config-card__title">{{ t('settings.webSearch.title') }}</span>
        <span v-if="!isMobile" class="config-card__desc">{{
          t('settings.webSearch.description')
        }}</span>
      </div>
    </div>

    <div v-loading="isLoading" class="config-card__body">
      <div class="config-card__row">
        <div class="config-field">
          <label class="config-field__label">{{ t('settings.webSearch.type') }}</label>
          <el-select
            v-model="formData.type"
            :disabled="isSubmitting"
            class="config-field__select"
            popper-class="config-select-dropdown"
          >
            <el-option :label="t('settings.webSearch.typeAliIQS')" value="ali_iqs" />
            <el-option :label="t('settings.webSearch.typeBaidu')" value="baidu" />
            <el-option :label="t('settings.webSearch.typeGoogle')" value="google" />
          </el-select>
        </div>
        <div class="config-field">
          <label class="config-field__label">{{ t('settings.webSearch.apiKey') }}</label>
          <div class="config-field__input-box">
            <input
              v-model="formData.apiKey"
              :type="showApiKey ? 'text' : 'password'"
              class="config-field__input"
              :placeholder="t('settings.webSearch.apiKeyPlaceholder')"
              :disabled="isSubmitting"
            />
            <button class="config-field__toggle" @click="showApiKey = !showApiKey">
              <component :is="showApiKey ? EyeOff : Eye" :size="14" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="formData.type === 'google'" class="config-card__row">
        <div class="config-field" style="flex: 1">
          <label class="config-field__label">{{ t('settings.webSearch.cx') }}</label>
          <div class="config-field__input-box">
            <input
              v-model="formData.cx"
              type="text"
              class="config-field__input"
              :placeholder="t('settings.webSearch.cxPlaceholder')"
              :disabled="isSubmitting"
            />
          </div>
        </div>
      </div>

      <div class="config-card__row">
        <div class="config-field">
          <label class="config-field__label">{{ t('settings.webSearch.numResults') }}</label>
          <div class="config-field__input-box">
            <input
              v-model.number="formData.numResults"
              type="number"
              class="config-field__input"
              :min="1"
              :max="20"
              :disabled="isSubmitting"
            />
          </div>
          <span v-if="formData.type === 'google'" class="config-field__hint">
            {{ t('settings.webSearch.googleNumResultsHint') }}
          </span>
        </div>
        <div class="config-field">
          <label class="config-field__label">{{ t('settings.webSearch.timeout') }}</label>
          <div class="config-field__input-box">
            <input
              v-model.number="formData.timeout"
              type="number"
              class="config-field__input"
              :min="5"
              :max="120"
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
        <span>{{ isSubmitting ? t('settings.webSearch.saving') : t('common.save') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Globe, Plug, Save, Eye, EyeOff, Loader2 } from 'lucide-vue-next';
import * as globalConfigApi from '@/api/globalConfig';
import { useGlobalConfigStore } from '@/stores';

const props = defineProps<{
  isMobile?: boolean;
}>();

const { t } = useI18n();
const store = useGlobalConfigStore();

const formData = reactive({
  type: 'ali_iqs',
  apiKey: '',
  cx: '',
  numResults: 3,
  timeout: 60,
});

const isTesting = ref(false);
const isSubmitting = ref(false);
const isLoading = ref(false);
const showApiKey = ref(false);

const testBtnLabel = computed(() => {
  if (isTesting.value) return t('settings.webSearch.testing');
  return props.isMobile
    ? t('settings.webSearch.testConnectionShort')
    : t('settings.webSearch.testConnection');
});

onMounted(async () => {
  isLoading.value = true;
  try {
    await store.fetchWebSearchConfig();
    if (store.webSearchConfig) {
      formData.type = store.webSearchConfig.type;
      formData.apiKey = store.webSearchConfig.apiKey;
      formData.cx = store.webSearchConfig.cx ?? '';
      formData.numResults = store.webSearchConfig.numResults;
      formData.timeout = store.webSearchConfig.timeout;
    }
  } catch {
    // Use defaults
  } finally {
    isLoading.value = false;
  }
});

async function handleTest(): Promise<void> {
  isTesting.value = true;
  try {
    await globalConfigApi.testWebSearchConnection({ ...formData });
    ElMessage.success(t('settings.webSearch.testSuccess'));
  } catch (error) {
    const msg = error instanceof Error ? error.message : t('settings.webSearch.testFailed');
    ElMessage.error(msg);
  } finally {
    isTesting.value = false;
  }
}

async function handleSave(): Promise<void> {
  isSubmitting.value = true;
  try {
    await store.saveWebSearchConfig({ ...formData });
    ElMessage.success(t('settings.webSearch.saveSuccess'));
  } catch (error) {
    const msg = error instanceof Error ? error.message : t('settings.webSearch.saveFailed');
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
