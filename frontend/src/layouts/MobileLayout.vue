<template>
  <div class="mobile-layout">
    <transition name="slide">
      <div v-if="sidebarOpen" class="mobile-layout__overlay" @click="sidebarOpen = false"></div>
    </transition>

    <transition name="slide">
      <DataSourceSidebar
        v-if="sidebarOpen"
        class="mobile-layout__sidebar"
        is-mobile
        @collapse="sidebarOpen = false"
        @nav-change="handleNavChange"
        @user-command="handleUserCommand"
      />
    </transition>

    <main class="mobile-layout__main">
      <SettingsPage v-if="showSettings" is-mobile @back="handleBack" />
      <DataManagementPage v-else-if="showDataManagement" is-mobile @back="handleBack" />
      <WorkflowPage v-else-if="showWorkflow" is-mobile @back="handleBack" />
      <SchedulePage v-else-if="showSchedule" is-mobile @back="handleBack" />
      <UserManagementPage v-else-if="showUsers" is-mobile @back="handleBack" />
      <AuditLogPage v-else-if="showAuditLog" is-mobile @back="handleBack" />
      <ChatContainer v-else show-menu-button @toggle-sidebar="toggleSidebar" />
    </main>

    <UserProfileDialog v-model:visible="profileDialogVisible" />
    <ChangePasswordDialog v-model:visible="changePasswordDialogVisible" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from 'vue';
import { useRouter } from 'vue-router';
import { DataSourceSidebar } from '@/components/sidebar';
import { ChatContainer } from '@/components/chat';
import { useAuthStore, useNavigationStore } from '@/stores';
import type { NavType } from '@/types/sidebar';

const SettingsPage = defineAsyncComponent(() => import('@/components/settings/SettingsPage.vue'));
const DataManagementPage = defineAsyncComponent(
  () => import('@/components/data-management/DataManagementPage.vue')
);
const WorkflowPage = defineAsyncComponent(() => import('@/components/workflow/WorkflowPage.vue'));
const SchedulePage = defineAsyncComponent(() => import('@/components/schedule/SchedulePage.vue'));
const UserManagementPage = defineAsyncComponent(
  () => import('@/components/user/UserManagementPage.vue')
);
const AuditLogPage = defineAsyncComponent(() => import('@/components/audit/AuditLogPage.vue'));
const UserProfileDialog = defineAsyncComponent(
  () => import('@/components/user/UserProfileDialog.vue')
);
const ChangePasswordDialog = defineAsyncComponent(
  () => import('@/components/user/ChangePasswordDialog.vue')
);

const router = useRouter();
const authStore = useAuthStore();
const navigationStore = useNavigationStore();

const sidebarOpen = ref(false);
const profileDialogVisible = ref(false);
const changePasswordDialogVisible = ref(false);

const showSettings = computed(() => navigationStore.activeNav === 'settings');
const showDataManagement = computed(() => navigationStore.activeNav === 'data');
const showWorkflow = computed(() => navigationStore.activeNav === 'workflow');
const showSchedule = computed(() => navigationStore.activeNav === 'schedule');
const showUsers = computed(() => navigationStore.activeNav === 'users');
const showAuditLog = computed(() => navigationStore.activeNav === 'auditLog');

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}

function handleNavChange(nav: NavType): void {
  navigationStore.navigateTo(nav);
  sidebarOpen.value = false;
}

function handleBack(): void {
  navigationStore.navigateTo('chat');
}

async function handleUserCommand(command: string): Promise<void> {
  sidebarOpen.value = false;
  switch (command) {
    case 'profile':
      profileDialogVisible.value = true;
      break;
    case 'changePassword':
      changePasswordDialogVisible.value = true;
      break;
    case 'logout':
      await authStore.logout();
      await router.push({ name: 'login' });
      break;
  }
}

// Watch for pending navigation intents — page components resolve them on mount
watch(
  () => navigationStore.pendingIntent,
  (intent) => {
    if (!intent) return;
    // Allow the target page component to mount and consume the intent,
    // then clear it after a short delay to avoid stale intents
    setTimeout(() => {
      if (navigationStore.pendingIntent) {
        navigationStore.clearPendingIntent();
      }
    }, 150);
  }
);
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.mobile-layout {
  position: relative;
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--bg-console);

  &__overlay {
    position: fixed;
    inset: 0;
    z-index: $z-index-modal - 1;
    background-color: var(--dialog-overlay);
    backdrop-filter: blur(8px);
  }

  &__sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: $z-index-modal;
    box-shadow: var(--shadow-lg);
  }

  &__main {
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }
}

.slide-enter-active,
.slide-leave-active {
  transition:
    opacity $transition-normal,
    transform $transition-normal;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;

  &.mobile-layout__sidebar {
    transform: translateX(-100%);
  }
}
</style>
