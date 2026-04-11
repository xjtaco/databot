<template>
  <div class="icon-bar" :class="{ 'icon-bar--mobile': isMobile }">
    <div class="icon-bar__logo">
      <img src="/icon-192.png" alt="DataBot" class="icon-bar__logo-img" />
    </div>

    <div class="icon-bar__separator"></div>

    <button
      v-for="item in topNavItems"
      :key="item.nav"
      class="icon-bar__item"
      :class="{
        'is-active': activeNav === item.nav,
        'is-disabled': item.disabled,
      }"
      :title="item.label"
      @click="handleItemClick(item)"
    >
      <div class="icon-bar__indicator"></div>
      <component :is="item.icon" :size="isMobile ? 18 : 20" />
    </button>

    <div class="icon-bar__spacer"></div>

    <button class="icon-bar__item icon-bar__lang" :title="langLabel" @click="toggleLocale">
      {{ langShort }}
    </button>

    <button
      v-if="authStore.isAdmin"
      class="icon-bar__item"
      :class="{ 'is-active': activeNav === 'users' }"
      :title="t('user.management')"
      @click="handleItemClick({ nav: 'users', disabled: false })"
    >
      <div class="icon-bar__indicator"></div>
      <LucideUsers :size="isMobile ? 18 : 20" />
    </button>

    <button
      v-if="authStore.isAdmin"
      class="icon-bar__item"
      :class="{ 'is-active': activeNav === 'auditLog' }"
      :title="t('sidebar.auditLog')"
      @click="handleItemClick({ nav: 'auditLog', disabled: false })"
    >
      <div class="icon-bar__indicator"></div>
      <LucideScrollText :size="isMobile ? 18 : 20" />
    </button>

    <button
      v-if="authStore.isAdmin"
      class="icon-bar__item"
      :class="{ 'is-active': activeNav === 'settings' }"
      :title="t('settings.title')"
      @click="handleItemClick({ nav: 'settings', disabled: false })"
    >
      <div class="icon-bar__indicator"></div>
      <LucideSettings :size="isMobile ? 18 : 20" />
    </button>

    <div class="icon-bar__separator"></div>

    <el-dropdown trigger="click" @command="handleUserCommand">
      <button class="icon-bar__item icon-bar__user" :title="displayName">
        <LucideCircleUserRound :size="isMobile ? 18 : 20" />
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item disabled>
            <span class="icon-bar__username">{{ displayName }}</span>
          </el-dropdown-item>
          <el-dropdown-item divided command="profile">
            <LucideUserPen :size="14" class="icon-bar__dropdown-icon" />
            {{ t('auth.profile') }}
          </el-dropdown-item>
          <el-dropdown-item command="changePassword">
            <LucideKeyRound :size="14" class="icon-bar__dropdown-icon" />
            {{ t('auth.changePassword') }}
          </el-dropdown-item>
          <el-dropdown-item divided command="logout">
            <LucideLogOut :size="14" class="icon-bar__dropdown-icon" />
            {{ t('auth.logout') }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Database,
  MessageSquare,
  Workflow,
  Timer,
  Settings as LucideSettings,
  Users as LucideUsers,
  ScrollText as LucideScrollText,
  CircleUserRound as LucideCircleUserRound,
  UserPen as LucideUserPen,
  KeyRound as LucideKeyRound,
  LogOut as LucideLogOut,
} from 'lucide-vue-next';
import type { NavType } from '@/types/sidebar';
import { setLocale, type LocaleKey } from '@/locales';
import { useAuthStore } from '@/stores';

defineProps<{
  activeNav: NavType;
  isMobile?: boolean;
}>();

const emit = defineEmits<{
  'update:activeNav': [nav: NavType];
  toggle: [nav: NavType];
  userCommand: [command: string];
}>();

const { t, locale } = useI18n();
const authStore = useAuthStore();

const displayName = computed(() => authStore.user?.name || authStore.user?.username || '');

const topNavItems = computed(() => [
  {
    nav: 'data' as NavType,
    icon: Database,
    label: t('sidebar.dataManagement'),
    disabled: false,
  },
  {
    nav: 'chat' as NavType,
    icon: MessageSquare,
    label: t('sidebar.chat'),
    disabled: false,
  },
  {
    nav: 'workflow' as NavType,
    icon: Workflow,
    label: t('sidebar.workflow'),
    disabled: false,
  },
  {
    nav: 'schedule' as NavType,
    icon: Timer,
    label: t('sidebar.schedule'),
    disabled: false,
  },
]);

function handleItemClick(item: { nav: NavType; disabled: boolean }): void {
  if (item.disabled) return;
  emit('toggle', item.nav);
}

function handleUserCommand(command: string | number | object): void {
  emit('userCommand', String(command));
}

const langShort = computed(() => (locale.value === 'zh-CN' ? '中' : 'En'));
const langLabel = computed(() => (locale.value === 'zh-CN' ? 'Switch to English' : '切换到中文'));

function toggleLocale(): void {
  const next: LocaleKey = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN';
  setLocale(next);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.icon-bar {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  align-items: center;
  width: $icon-bar-width;
  min-width: $icon-bar-width;
  height: 100%;
  padding: $spacing-md $spacing-sm;
  background-color: $bg-deeper;
  border-right: 1px solid $border-dark;

  &--mobile {
    gap: $spacing-xs;
    width: $icon-bar-width-mobile;
    min-width: $icon-bar-width-mobile;
    padding: $spacing-sm $spacing-xs;
  }

  &__logo {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;

    .icon-bar--mobile & {
      width: 28px;
      height: 28px;
    }
  }

  &__logo-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  &__separator {
    flex-shrink: 0;
    width: 24px;
    height: 1px;
    background-color: $border-dark;

    .icon-bar--mobile & {
      width: 20px;
    }
  }

  &__item {
    position: relative;
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    color: $text-muted;
    cursor: pointer;
    background: none;
    border: none;
    border-radius: $radius-sm;
    transition: all $transition-fast;

    .icon-bar--mobile & {
      width: 36px;
      height: 36px;
    }

    &:hover:not(.is-disabled) {
      color: $text-secondary-color;
      background-color: $bg-elevated;
    }

    &.is-active {
      color: $accent;
      background-color: $accent-tint10;

      .icon-bar__indicator {
        opacity: 1;
      }
    }

    &.is-disabled {
      color: $border-elevated;
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  &__indicator {
    position: absolute;
    top: 50%;
    left: 0;
    width: 3px;
    height: 20px;
    background-color: $accent;
    border-radius: 0 2px 2px 0;
    opacity: 0;
    transform: translateY(-50%);
    transition: opacity $transition-fast;

    .icon-bar--mobile & {
      height: 16px;
    }
  }

  &__spacer {
    flex: 1;
  }

  &__lang {
    font-size: 12px;
    font-weight: 600;
    color: $text-muted;
    letter-spacing: 0;

    .icon-bar--mobile & {
      font-size: 11px;
    }
  }

  &__user {
    color: $text-muted;
  }

  &__username {
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
  }

  &__dropdown-icon {
    margin-right: $spacing-sm;
  }
}
</style>
