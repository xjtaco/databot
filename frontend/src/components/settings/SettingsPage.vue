<template>
  <div class="settings-page">
    <div class="settings-page__header">
      <button v-if="isMobile" class="settings-page__back" @click="$emit('back')">
        <ArrowLeft :size="18" />
      </button>
      <Settings v-if="!isMobile" :size="22" class="settings-page__header-icon" />
      <span class="settings-page__header-title">{{ t('settings.globalTitle') }}</span>
    </div>

    <div class="settings-page__body">
      <LLMConfigCard :is-mobile="isMobile" />
      <WebSearchConfigCard :is-mobile="isMobile" />
      <SmtpConfigCard :is-mobile="isMobile" />
      <PasswordPolicyConfig v-if="authStore.isAdmin" :is-mobile="isMobile" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Settings, ArrowLeft } from 'lucide-vue-next';
import LLMConfigCard from './LLMConfigCard.vue';
import WebSearchConfigCard from './WebSearchConfigCard.vue';
import SmtpConfigCard from './SmtpConfigCard.vue';
import PasswordPolicyConfig from './PasswordPolicyConfig.vue';
import { useAuthStore } from '@/stores';

defineProps<{
  isMobile?: boolean;
}>();

defineEmits<{
  back: [];
}>();

const { t } = useI18n();
const authStore = useAuthStore();
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: $bg-page;

  &__header {
    display: flex;
    flex-shrink: 0;
    gap: 12px;
    align-items: center;
    padding: 20px 32px;
    border-bottom: 1px solid $border-dark;

    @media (max-width: $breakpoint-md) {
      gap: 10px;
      padding: 12px 16px;
    }
  }

  &__back {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    color: $text-muted;
    cursor: pointer;
    background: none;
    border: none;
    border-radius: $radius-md;
    transition: all $transition-fast;

    &:hover {
      color: $text-secondary-color;
      background-color: $bg-elevated;
    }
  }

  &__header-icon {
    flex-shrink: 0;
    color: $accent;
  }

  &__header-title {
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;

    @media (max-width: $breakpoint-md) {
      font-size: $font-size-md;
    }
  }

  &__body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 32px;
    padding: 32px 40px;
    overflow-y: auto;

    @media (max-width: $breakpoint-md) {
      gap: 20px;
      padding: 16px;
    }
  }
}
</style>
