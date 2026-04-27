<template>
  <div class="desktop-layout">
    <DataSourceSidebar @nav-change="handleNavChange" @user-command="handleUserCommand" />
    <main class="desktop-layout__main">
      <SettingsPage v-if="showSettings" />
      <DataManagementPage v-else-if="showDataManagement" />
      <WorkflowPage v-else-if="showWorkflow" />
      <SchedulePage v-else-if="showSchedule" />
      <UserManagementPage v-else-if="showUsers" />
      <AuditLogPage v-else-if="showAuditLog" />
      <ChatContainer v-else />
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

const profileDialogVisible = ref(false);
const changePasswordDialogVisible = ref(false);

const showSettings = computed(() => navigationStore.activeNav === 'settings');
const showDataManagement = computed(() => navigationStore.activeNav === 'data');
const showWorkflow = computed(() => navigationStore.activeNav === 'workflow');
const showSchedule = computed(() => navigationStore.activeNav === 'schedule');
const showUsers = computed(() => navigationStore.activeNav === 'users');
const showAuditLog = computed(() => navigationStore.activeNav === 'auditLog');

function handleNavChange(nav: NavType): void {
  navigationStore.navigateTo(nav);
}

async function handleUserCommand(command: string): Promise<void> {
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

.desktop-layout {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--bg-console);

  &__main {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    background:
      radial-gradient(circle at 18% 0%, rgb(255 106 42 / 5%), transparent 26%), var(--bg-console);
  }
}
</style>
