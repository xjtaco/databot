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
@use '@/styles/console' as console;

.settings-page {
  @include console.console-scroll-page;

  &__header {
    @include console.console-mobile-header;

    min-height: 64px;
    padding: 0 28px;

    @media (max-width: $breakpoint-md) {
      min-height: 52px;
      padding: 0 $spacing-sm;
    }
  }

  &__back {
    @include console.console-icon-button;
  }

  &__header-icon {
    flex-shrink: 0;
    color: $accent;
  }

  &__header-title {
    @include console.console-title;

    font-size: $font-size-lg;

    @media (max-width: $breakpoint-md) {
      font-size: $font-size-md;
    }
  }

  &__body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 22px;
    padding: 28px;
    overflow-y: auto;

    @media (max-width: $breakpoint-md) {
      gap: $spacing-md;
      padding: $spacing-md;
    }
  }
}
</style>
