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
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto minmax(160px, 1fr);
  gap: $spacing-md;
  align-items: center;
  min-height: 64px;
  padding: 0 28px;
  background: rgb(8 10 13 / 82%);
  border-bottom: 1px solid var(--border-primary);
  backdrop-filter: blur(18px);

  @media (max-width: $breakpoint-md) {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: $spacing-sm;
    min-height: 56px;
    padding: 0 $spacing-sm;
  }

  &__left {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    min-width: 0;
  }

  &__menu-btn {
    display: flex;
  }

  &__title {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;

    h1 {
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: $font-family-sans;
      font-size: $font-size-lg;
      font-weight: $font-weight-semibold;
      line-height: 1.2;
      color: var(--text-primary);
      white-space: nowrap;
    }
  }

  &__subtitle {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-xs;
    line-height: 1.2;
    color: var(--text-tertiary);
    white-space: nowrap;

    @media (max-width: $breakpoint-md) {
      display: none;
    }
  }

  &__center {
    display: flex;
    gap: $spacing-lg;
    align-items: center;
    justify-content: center;
    min-width: 0;

    @media (max-width: $breakpoint-md) {
      display: none;
    }
  }

  &__right {
    display: flex;
    gap: $spacing-lg;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
  }

  &__new-chat-btn {
    color: var(--accent);
  }
}
</style>
