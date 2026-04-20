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
  gap: 7px;
  align-items: center;
  width: $icon-bar-width;
  min-width: $icon-bar-width;
  height: 100%;
  padding: 12px 8px;
  background: linear-gradient(180deg, var(--bg-sidebar) 0%, var(--surface-sunken) 100%);
  border-right: 1px solid var(--border-primary);

  &--mobile {
    gap: 6px;
    width: $icon-bar-width-mobile;
    min-width: $icon-bar-width-mobile;
    padding: 10px 6px;
  }

  &__logo {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    background: var(--bg-panel);
    border: 1px solid var(--border-primary);
    border-radius: $radius-lg;

    .icon-bar--mobile & {
      width: 30px;
      height: 30px;
    }
  }

  &__logo-img {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  &__separator {
    flex-shrink: 0;
    width: 22px;
    height: 1px;
    margin: 4px 0;
    background-color: var(--border-primary);
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
    color: var(--text-tertiary);
    cursor: pointer;
    background: transparent;
    border: 1px solid transparent;
    border-radius: $radius-md;
    transition:
      color $transition-fast,
      background-color $transition-fast,
      border-color $transition-fast,
      transform $transition-fast;

    .icon-bar--mobile & {
      width: 36px;
      height: 36px;
    }

    &:hover:not(.is-disabled) {
      color: var(--text-primary);
      background-color: var(--bg-control);
      border-color: var(--border-primary);
    }

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }

    &:active:not(.is-disabled) {
      transform: translateY(1px);
    }

    &.is-active {
      color: var(--accent);
      background-color: var(--accent-tint10);
      border-color: rgb(255 106 42 / 28%);

      .icon-bar__indicator {
        opacity: 1;
        transform: translateY(-50%) scaleY(1);
      }
    }

    &.is-disabled {
      color: var(--border-secondary);
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  &__indicator {
    position: absolute;
    top: 50%;
    left: -8px;
    width: 3px;
    height: 20px;
    background-color: var(--accent);
    border-radius: 0 3px 3px 0;
    opacity: 0;
    transform: translateY(-50%) scaleY(0.6);
    transition:
      opacity $transition-fast,
      transform $transition-fast;

    .icon-bar--mobile & {
      left: -6px;
      height: 16px;
    }
  }

  &__spacer {
    flex: 1;
  }

  &__lang {
    font-size: 12px;
    font-weight: $font-weight-semibold;
    color: var(--text-secondary);
    letter-spacing: 0;
  }

  &__user {
    color: var(--text-secondary);
  }

  &__username {
    font-weight: $font-weight-semibold;
    color: var(--text-primary);
  }

  &__dropdown-icon {
    margin-right: $spacing-sm;
  }
}
</style>
