<template>
  <div class="config-card">
    <div class="config-card__header">
      <Mail :size="isMobile ? 16 : 18" class="config-card__header-icon" />
      <div class="config-card__header-text">
        <span class="config-card__title">{{ t('settings.smtp.title') }}</span>
        <span v-if="!isMobile" class="config-card__desc">{{ t('settings.smtp.description') }}</span>
      </div>
    </div>

    <div v-loading="isLoading" class="config-card__body">
      <div class="config-card__row">
        <div class="config-field">
          <label class="config-field__label">{{ t('settings.smtp.host') }}</label>
          <div class="config-field__input-box">
            <input
              v-model="formData.host"
              type="text"
              class="config-field__input"
              :placeholder="t('settings.smtp.hostPlaceholder')"
              :disabled="isSubmitting"
            />
          </div>
        </div>
        <div class="config-field">
          <label class="config-field__label">{{ t('settings.smtp.port') }}</label>
          <div class="config-field__input-box">
            <input
              v-model.number="formData.port"
              type="number"
              class="config-field__input"
              :min="1"
              :max="65535"
              :disabled="isSubmitting"
            />
          </div>
        </div>
      </div>

      <div class="config-card__row">
        <div class="config-field">
          <label class="config-field__label">{{ t('settings.smtp.user') }}</label>
          <div class="config-field__input-box">
            <input
              v-model="formData.user"
              type="text"
              class="config-field__input"
              :placeholder="t('settings.smtp.userPlaceholder')"
              :disabled="isSubmitting"
            />
          </div>
        </div>
        <div class="config-field">
          <label class="config-field__label">{{ t('settings.smtp.pass') }}</label>
          <div class="config-field__input-box">
            <input
              v-model="formData.pass"
              :type="showPass ? 'text' : 'password'"
              class="config-field__input"
              :placeholder="t('settings.smtp.passPlaceholder')"
              :disabled="isSubmitting"
            />
            <button class="config-field__toggle" @click="showPass = !showPass">
              <component :is="showPass ? EyeOff : Eye" :size="14" />
            </button>
          </div>
        </div>
      </div>

      <div class="config-card__row">
        <div class="config-field">
          <label class="config-field__label">{{ t('settings.smtp.fromName') }}</label>
          <div class="config-field__input-box">
            <input
              v-model="formData.fromName"
              type="text"
              class="config-field__input"
              :placeholder="t('settings.smtp.fromNamePlaceholder')"
              :disabled="isSubmitting"
            />
          </div>
        </div>
        <div class="config-field config-field--inline">
          <label class="config-field__label">{{ t('settings.smtp.secure') }}</label>
          <el-switch v-model="formData.secure" :disabled="isSubmitting" />
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
        <span>{{ isSubmitting ? t('settings.smtp.saving') : t('common.save') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Mail, Plug, Save, Eye, EyeOff, Loader2 } from 'lucide-vue-next';
import * as globalConfigApi from '@/api/globalConfig';
import { useGlobalConfigStore } from '@/stores';

const props = defineProps<{
  isMobile?: boolean;
}>();

const { t } = useI18n();
const store = useGlobalConfigStore();

const formData = reactive({
  type: 'smtp' as const,
  host: '',
  port: 465,
  secure: true,
  user: '',
  pass: '',
  fromName: '',
});

const isTesting = ref(false);
const isSubmitting = ref(false);
const isLoading = ref(false);
const showPass = ref(false);

const testBtnLabel = computed(() => {
  if (isTesting.value) return t('settings.smtp.testing');
  return props.isMobile
    ? t('settings.smtp.testConnectionShort')
    : t('settings.smtp.testConnection');
});

onMounted(async () => {
  isLoading.value = true;
  try {
    await store.fetchSmtpConfig();
    if (store.smtpConfig) {
      formData.type = store.smtpConfig.type;
      formData.host = store.smtpConfig.host;
      formData.port = store.smtpConfig.port;
      formData.secure = store.smtpConfig.secure;
      formData.user = store.smtpConfig.user;
      formData.pass = store.smtpConfig.pass;
      formData.fromName = store.smtpConfig.fromName;
    }
  } catch {
    // Use defaults
  } finally {
    isLoading.value = false;
  }
});

async function handleTest(): Promise<void> {
  if (!formData.host.trim() || !formData.user.trim()) {
    ElMessage.warning(t('settings.validation.smtpHostRequired'));
    return;
  }

  isTesting.value = true;
  try {
    await globalConfigApi.testSmtpConnection({ ...formData });
    ElMessage.success(t('settings.smtp.testSuccess'));
  } catch (error) {
    const msg = error instanceof Error ? error.message : t('settings.smtp.testFailed');
    ElMessage.error(msg);
  } finally {
    isTesting.value = false;
  }
}

async function handleSave(): Promise<void> {
  if (!formData.host.trim()) {
    ElMessage.warning(t('settings.validation.smtpHostRequired'));
    return;
  }

  isSubmitting.value = true;
  try {
    await store.saveSmtpConfig({ ...formData });
    ElMessage.success(t('settings.smtp.saveSuccess'));
  } catch (error) {
    const msg = error instanceof Error ? error.message : t('settings.smtp.saveFailed');
    ElMessage.error(msg);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use './config-card';

.config-field.config-field--inline {
  flex-direction: row;
  gap: 12px;
  align-items: center;

  .config-field__label {
    margin-bottom: 0;
    white-space: nowrap;
  }
}
</style>
