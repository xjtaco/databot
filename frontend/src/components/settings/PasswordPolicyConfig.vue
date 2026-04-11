<template>
  <div class="config-card">
    <div class="config-card__header">
      <KeyRound :size="isMobile ? 16 : 18" class="config-card__header-icon" />
      <div class="config-card__header-text">
        <span class="config-card__title">{{ t('passwordPolicyConfig.title') }}</span>
        <span v-if="!isMobile" class="config-card__desc">
          {{ t('passwordPolicyConfig.description') }}
        </span>
      </div>
    </div>

    <div v-loading="isLoading" class="config-card__body">
      <div class="config-card__row">
        <div class="config-field">
          <label class="config-field__label">{{ t('passwordPolicyConfig.minLength') }}</label>
          <div class="config-field__input-box">
            <input
              v-model.number="formData.minLength"
              type="number"
              class="config-field__input"
              min="4"
              max="128"
              :disabled="isSubmitting"
            />
          </div>
        </div>
      </div>

      <div class="policy-switches">
        <div class="policy-switches__item">
          <label class="config-field__label">{{
            t('passwordPolicyConfig.requireUppercase')
          }}</label>
          <el-switch v-model="formData.requireUppercase" :disabled="isSubmitting" />
        </div>
        <div class="policy-switches__item">
          <label class="config-field__label">{{
            t('passwordPolicyConfig.requireLowercase')
          }}</label>
          <el-switch v-model="formData.requireLowercase" :disabled="isSubmitting" />
        </div>
        <div class="policy-switches__item">
          <label class="config-field__label">{{ t('passwordPolicyConfig.requireNumbers') }}</label>
          <el-switch v-model="formData.requireNumbers" :disabled="isSubmitting" />
        </div>
        <div class="policy-switches__item">
          <label class="config-field__label">{{
            t('passwordPolicyConfig.requireSpecialChars')
          }}</label>
          <el-switch v-model="formData.requireSpecialChars" :disabled="isSubmitting" />
        </div>
      </div>
    </div>

    <div class="config-card__footer">
      <button class="config-btn config-btn--primary" :disabled="isSubmitting" @click="handleSave">
        <Loader2 v-if="isSubmitting" :size="16" class="config-btn__spinner" />
        <Save v-else :size="16" />
        <span>{{ isSubmitting ? t('passwordPolicyConfig.saving') : t('common.save') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { KeyRound, Save, Loader2 } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import * as authApi from '@/api/auth';

defineProps<{
  isMobile?: boolean;
}>();

const { t } = useI18n();

const isLoading = ref(false);
const isSubmitting = ref(false);
const formData = reactive({
  minLength: 8,
  requireUppercase: false,
  requireLowercase: false,
  requireNumbers: false,
  requireSpecialChars: false,
});

onMounted(async () => {
  isLoading.value = true;
  try {
    const policy = await authApi.getPasswordPolicy();
    formData.minLength = policy.minLength;
    formData.requireUppercase = policy.requireUppercase;
    formData.requireLowercase = policy.requireLowercase;
    formData.requireNumbers = policy.requireNumbers;
    formData.requireSpecialChars = policy.requireSpecialChars;
  } catch {
    // Use defaults
  } finally {
    isLoading.value = false;
  }
});

async function handleSave(): Promise<void> {
  isSubmitting.value = true;
  try {
    await authApi.savePasswordPolicy({
      minLength: formData.minLength,
      requireUppercase: formData.requireUppercase,
      requireLowercase: formData.requireLowercase,
      requireNumbers: formData.requireNumbers,
      requireSpecialChars: formData.requireSpecialChars,
    });
    ElMessage.success(t('passwordPolicyConfig.saveSuccess'));
  } catch {
    ElMessage.error(t('passwordPolicyConfig.saveFailed'));
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use './config-card';

.policy-switches {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $spacing-md $spacing-xl;

  @media (max-width: $breakpoint-md) {
    grid-template-columns: 1fr;
  }

  &__item {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    justify-content: space-between;

    .config-field__label {
      margin-bottom: 0;
      white-space: nowrap;
    }
  }
}
</style>
