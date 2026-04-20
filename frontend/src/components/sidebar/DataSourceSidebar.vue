<template>
  <aside class="data-source-sidebar">
    <IconBar
      :active-nav="activeNav"
      :is-mobile="isMobile"
      @toggle="handleNavToggle"
      @user-command="handleUserCommand"
    />
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import IconBar from './IconBar.vue';
import type { NavType } from '@/types/sidebar';

const props = defineProps<{
  isMobile?: boolean;
}>();

const emit = defineEmits<{
  collapse: [];
  navChange: [nav: NavType];
  userCommand: [command: string];
}>();

// Navigation state
const activeNav = ref<NavType>('chat');

function handleNavToggle(nav: NavType): void {
  activeNav.value = nav;
  if (props.isMobile) {
    emit('collapse');
  }
  emit('navChange', nav);
}

function handleUserCommand(command: string): void {
  emit('userCommand', command);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.data-source-sidebar {
  display: flex;
  flex-direction: row;
  width: $sidebar-width-collapsed;
  height: 100%;
  overflow: hidden;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-primary);
}
</style>
