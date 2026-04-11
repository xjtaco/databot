<template>
  <header class="chat-header">
    <div class="chat-header__left">
      <IconButton
        v-if="showMenuButton"
        :title="t('sidebar.expand')"
        class="chat-header__menu-btn"
        @click="$emit('toggle-sidebar')"
      >
        <el-icon><Menu /></el-icon>
      </IconButton>
      <div class="chat-header__title">
        <h1>{{ t('chat.title') }}</h1>
        <span class="chat-header__subtitle">{{ t('chat.subtitle') }}</span>
      </div>
    </div>

    <div class="chat-header__center">
      <slot name="status"></slot>
    </div>

    <div class="chat-header__right">
      <ConnectionStatus />
      <IconButton
        :title="t('chat.chatList.title')"
        class="chat-header__chat-list-btn"
        @click="$emit('toggle-chat-list')"
      >
        <MessageSquare :size="18" />
      </IconButton>
      <IconButton
        :title="t('chat.newChat')"
        class="chat-header__new-chat-btn"
        @click="$emit('new-chat')"
      >
        <el-icon><Plus /></el-icon>
      </IconButton>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Menu, Plus } from '@element-plus/icons-vue';
import { MessageSquare } from 'lucide-vue-next';
import IconButton from '@/components/common/IconButton.vue';
import ConnectionStatus from './ConnectionStatus.vue';

defineProps<{
  showMenuButton?: boolean;
}>();

defineEmits<{
  'toggle-sidebar': [];
  'toggle-chat-list': [];
  'new-chat': [];
}>();

const { t } = useI18n();
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px $spacing-lg;
  border-bottom: 1px solid var(--border-primary);

  &__left {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
  }

  &__menu-btn {
    display: flex;
  }

  &__title {
    display: flex;
    flex-direction: column;
    gap: 2px;

    h1 {
      font-family: $font-family-serif;
      font-size: $font-size-xl;
      font-weight: $font-weight-normal;
      line-height: 1.2;
      color: var(--text-primary);
      letter-spacing: -0.5px;
    }
  }

  &__subtitle {
    font-size: $font-size-xs;
    color: var(--text-tertiary);
  }

  &__center {
    display: flex;
    flex: 1;
    gap: $spacing-lg;
    align-items: center;
    justify-content: center;
  }

  &__right {
    display: flex;
    gap: $spacing-lg;
    align-items: center;
  }

  &__new-chat-btn {
    :deep(.el-icon) {
      color: var(--accent);
    }
  }
}
</style>
