import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { NavType } from '@/types/sidebar';

export type NavigationIntent =
  | { type: 'open_data_management'; tab?: 'data' | 'knowledge' }
  | { type: 'open_schedule' }
  | { type: 'open_workflow_editor'; workflowId: string; copilotPrompt?: string }
  | { type: 'open_template_editor'; templateId: string; copilotPrompt?: string };

export const useNavigationStore = defineStore('navigation', () => {
  const activeNav = ref<NavType>('chat');
  const pendingIntent = ref<NavigationIntent | null>(null);

  function navigateTo(nav: NavType): void {
    activeNav.value = nav;
    // Don't clear pendingIntent here — page components read and resolve it on mount
  }

  function setPendingIntent(intent: NavigationIntent): void {
    pendingIntent.value = intent;
  }

  function clearPendingIntent(): void {
    pendingIntent.value = null;
  }

  return { activeNav, pendingIntent, navigateTo, setPendingIntent, clearPendingIntent };
});
