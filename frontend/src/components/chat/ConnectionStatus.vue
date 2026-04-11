<template>
  <div class="connection-status" :class="`connection-status--${state}`" :title="statusText">
    <span class="connection-status__dot"></span>
    <span class="connection-status__text">{{ statusText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConnectionStore } from '@/stores';

const { t } = useI18n();
const connectionStore = useConnectionStore();

const state = computed(() => connectionStore.state);

const statusText = computed(() => {
  switch (connectionStore.state) {
    case 'connecting':
      return t('connection.connecting');
    case 'connected':
      return t('connection.connected');
    case 'disconnected':
      return t('connection.disconnected');
    case 'error':
      return t('connection.error');
    default:
      return t('connection.disconnected');
  }
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.connection-status {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 10px;

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }

  &__text {
    font-weight: $font-weight-medium;
  }

  &--connected {
    .connection-status__dot {
      background-color: var(--success);
    }

    .connection-status__text {
      color: var(--success);
    }
  }

  &--connecting {
    .connection-status__dot {
      background-color: var(--warning);
      animation: blink 1s ease-in-out infinite;
    }

    .connection-status__text {
      color: var(--warning);
    }
  }

  &--disconnected {
    .connection-status__dot {
      background-color: var(--text-tertiary);
      animation: none;
    }

    .connection-status__text {
      color: var(--text-tertiary);
    }
  }

  &--error {
    .connection-status__dot {
      background-color: var(--error);
    }

    .connection-status__text {
      color: var(--error);
    }
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.6;
  }
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.3;
  }
}
</style>
