<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-card__header">
        <img src="/icon-192.png" alt="DataBot" class="login-card__logo" />
        <h1 class="login-card__title">DataBot</h1>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        class="login-card__form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            :placeholder="t('auth.usernamePlaceholder')"
            :prefix-icon="UserIcon"
            size="large"
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            :placeholder="t('auth.passwordPlaceholder')"
            :prefix-icon="LockIcon"
            show-password
            size="large"
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <div v-if="errorMessage" class="login-card__error">
          {{ errorMessage }}
        </div>

        <el-button
          type="primary"
          size="large"
          class="login-card__submit"
          :loading="loading"
          @click="handleLogin"
        >
          {{ t('auth.loginButton') }}
        </el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { User as UserIcon, Lock as LockIcon } from 'lucide-vue-next';
import type { FormInstance, FormRules } from 'element-plus';
import { useAuthStore } from '@/stores';

const router = useRouter();
const { t } = useI18n();
const authStore = useAuthStore();

const formRef = ref<FormInstance>();
const loading = ref(false);
const errorMessage = ref('');

const form = reactive({
  username: '',
  password: '',
});

const rules: FormRules = {
  username: [
    { required: true, message: () => t('auth.validation.usernameRequired'), trigger: 'blur' },
  ],
  password: [
    { required: true, message: () => t('auth.validation.passwordRequired'), trigger: 'blur' },
  ],
};

async function handleLogin(): Promise<void> {
  if (!formRef.value) return;

  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  errorMessage.value = '';

  try {
    await authStore.login(form.username, form.password);

    if (authStore.mustChangePassword) {
      await router.push({ name: 'changePassword' });
    } else {
      await router.push({ name: 'main' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('locked') || message.includes('Locked')) {
      errorMessage.value = t('auth.accountLocked');
    } else {
      errorMessage.value = t('auth.invalidCredentials');
    }
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: $spacing-md;
  background-color: $bg-page;
}

.login-card {
  width: 100%;
  max-width: 400px;
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
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
    align-items: center;
    margin-bottom: $spacing-xl;
  }

  &__logo {
    width: 56px;
    height: 56px;
    object-fit: contain;
  }

  &__title {
    margin: 0;
    font-size: $font-size-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary-color;
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

  &__submit {
    width: 100%;
    margin-top: $spacing-sm;
  }
}
</style>
