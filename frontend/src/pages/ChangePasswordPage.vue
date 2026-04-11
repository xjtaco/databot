<template>
  <div class="change-password-page">
    <div class="change-password-card">
      <div class="change-password-card__header">
        <img src="/icon-192.png" alt="DataBot" class="change-password-card__logo" />
        <h1 class="change-password-card__title">
          {{ t('auth.forcedChangePasswordTitle') }}
        </h1>
        <p class="change-password-card__desc">
          {{ t('auth.forcedChangePasswordDesc') }}
        </p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        class="change-password-card__form"
        @submit.prevent="handleSubmit"
      >
        <el-form-item prop="oldPassword">
          <el-input
            v-model="form.oldPassword"
            type="password"
            :placeholder="t('auth.oldPasswordPlaceholder')"
            show-password
            size="large"
          />
        </el-form-item>

        <el-form-item prop="newPassword">
          <el-popover :visible="newPasswordFocused && policyLoaded" placement="top" :width="280">
            <div class="change-password-card__policy">
              <span class="change-password-card__policy-tag">
                {{ t('auth.passwordPolicy.minLength', { n: policy.minLength }) }}
              </span>
              <span v-if="policy.requireUppercase" class="change-password-card__policy-tag">
                {{ t('auth.passwordPolicy.requireUppercase') }}
              </span>
              <span v-if="policy.requireLowercase" class="change-password-card__policy-tag">
                {{ t('auth.passwordPolicy.requireLowercase') }}
              </span>
              <span v-if="policy.requireNumbers" class="change-password-card__policy-tag">
                {{ t('auth.passwordPolicy.requireNumbers') }}
              </span>
              <span v-if="policy.requireSpecialChars" class="change-password-card__policy-tag">
                {{ t('auth.passwordPolicy.requireSpecialChars') }}
              </span>
            </div>
            <template #reference>
              <el-input
                v-model="form.newPassword"
                type="password"
                :placeholder="t('auth.newPasswordPlaceholder')"
                show-password
                size="large"
                @focus="newPasswordFocused = true"
                @blur="newPasswordFocused = false"
              />
            </template>
          </el-popover>
        </el-form-item>

        <el-form-item prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            :placeholder="t('auth.confirmPasswordPlaceholder')"
            show-password
            size="large"
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <div v-if="errorMessage" class="change-password-card__error">
          {{ errorMessage }}
        </div>

        <div class="change-password-card__actions">
          <el-button size="large" @click="handleLogout">
            {{ t('auth.logout') }}
          </el-button>
          <el-button type="primary" size="large" :loading="loading" @click="handleSubmit">
            {{ t('common.confirm') }}
          </el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { FormInstance, FormRules } from 'element-plus';
import { useAuthStore } from '@/stores';
import * as authApi from '@/api/auth';
import type { PasswordPolicy } from '@/types/auth';

const router = useRouter();
const { t } = useI18n();
const authStore = useAuthStore();

const formRef = ref<FormInstance>();
const loading = ref(false);
const errorMessage = ref('');
const policyLoaded = ref(false);
const newPasswordFocused = ref(false);
const policy = ref<PasswordPolicy>({
  minLength: 8,
  requireUppercase: false,
  requireLowercase: false,
  requireNumbers: false,
  requireSpecialChars: false,
});

const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const rules: FormRules = {
  oldPassword: [
    { required: true, message: () => t('auth.validation.oldPasswordRequired'), trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: () => t('auth.validation.newPasswordRequired'), trigger: 'blur' },
  ],
  confirmPassword: [
    {
      required: true,
      message: () => t('auth.validation.confirmPasswordRequired'),
      trigger: 'blur',
    },
    {
      validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
        if (value !== form.newPassword) {
          callback(new Error(t('auth.passwordMismatch')));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
};

onMounted(async () => {
  try {
    policy.value = await authApi.getPasswordPolicy();
    policyLoaded.value = true;
  } catch {
    // Use defaults if we can't fetch
    policyLoaded.value = true;
  }
});

async function handleSubmit(): Promise<void> {
  if (!formRef.value) return;

  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  errorMessage.value = '';

  try {
    await authApi.changePassword({
      oldPassword: form.oldPassword,
      newPassword: form.newPassword,
    });

    // Refresh token to get new JWT with mustChangePassword=false,
    // then fetch profile to update store with latest user data
    await authStore.refreshAccessToken();
    await authStore.fetchProfile();
    await router.push({ name: 'main' });
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : t('auth.changePasswordFailed');
  } finally {
    loading.value = false;
  }
}

async function handleLogout(): Promise<void> {
  await authStore.logout();
  await router.push({ name: 'login' });
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.change-password-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: $spacing-md;
  background-color: $bg-page;
}

.change-password-card {
  width: 100%;
  max-width: 440px;
  padding: $spacing-xl;
  background-color: $bg-card;
  border: 1px solid $border-dark;
  border-radius: $radius-lg;

  @media (max-width: $breakpoint-sm) {
    max-width: 100%;
    padding: $spacing-lg;
    border: none;
    border-radius: 0;
  }

  &__header {
    margin-bottom: $spacing-lg;
    text-align: center;
  }

  &__logo {
    width: 48px;
    height: 48px;
    margin-bottom: $spacing-md;
    object-fit: contain;
  }

  &__title {
    margin: 0 0 $spacing-sm;
    font-size: $font-size-xl;
    font-weight: $font-weight-bold;
    color: $text-primary-color;
  }

  &__desc {
    margin: 0;
    font-size: $font-size-sm;
    color: $text-muted;
  }

  &__policy {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }

  &__policy-tag {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    font-size: $font-size-xs;
    color: $text-muted;
    white-space: nowrap;
    background-color: $bg-elevated;
    border: 1px solid $border-dark;
    border-radius: $radius-full;
  }

  &__form {
    display: flex;
    flex-direction: column;
  }

  &__error {
    margin-bottom: $spacing-md;
    font-size: $font-size-sm;
    color: $error;
    text-align: center;
  }

  &__actions {
    display: flex;
    gap: $spacing-md;
    margin-top: $spacing-sm;

    .el-button {
      flex: 1;
    }
  }
}
</style>
