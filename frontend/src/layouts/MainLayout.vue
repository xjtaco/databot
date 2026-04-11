<template>
  <DesktopLayout v-if="isDesktop" />
  <MobileLayout v-else />
</template>

<script setup lang="ts">
import { useResponsive } from '@/composables';
import { DesktopLayout, MobileLayout } from '@/layouts';
import { useGlobalConfigStore } from '@/stores';

const { isDesktop } = useResponsive();

const globalConfigStore = useGlobalConfigStore();
globalConfigStore.fetchConfigStatus();
</script>
