import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import * as chatSessionApi from '@/api/chatSession';
import type { ChatSessionItem } from '@/types/chatSession';

interface SessionGroup {
  label: string;
  labelKey: string;
  sessions: ChatSessionItem[];
}

export const useChatSessionStore = defineStore('chatSession', () => {
  const sessions = ref<ChatSessionItem[]>([]);
  const activeSessionId = ref<string | null>(null);
  const isDrawerOpen = ref(false);
  const searchQuery = ref('');
  const isLoading = ref(false);
  const fetchError = ref<string | null>(null);

  const activeSession = computed(
    () => sessions.value.find((s) => s.id === activeSessionId.value) ?? null
  );

  const filteredSessions = computed(() => {
    if (!searchQuery.value.trim()) return sessions.value;
    const q = searchQuery.value.toLowerCase();
    return sessions.value.filter(
      (s) =>
        (s.title && s.title.toLowerCase().includes(q)) ||
        (s.lastMessagePreview && s.lastMessagePreview.toLowerCase().includes(q))
    );
  });

  const groupedSessions = computed((): SessionGroup[] => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);

    const groups: {
      today: ChatSessionItem[];
      yesterday: ChatSessionItem[];
      earlier: ChatSessionItem[];
    } = {
      today: [],
      yesterday: [],
      earlier: [],
    };

    for (const session of filteredSessions.value) {
      const sessionDate = new Date(session.updatedAt);
      if (sessionDate >= today) {
        groups.today.push(session);
      } else if (sessionDate >= yesterday) {
        groups.yesterday.push(session);
      } else {
        groups.earlier.push(session);
      }
    }

    const result: SessionGroup[] = [];
    if (groups.today.length > 0)
      result.push({ label: 'Today', labelKey: 'chat.chatList.today', sessions: groups.today });
    if (groups.yesterday.length > 0)
      result.push({
        label: 'Yesterday',
        labelKey: 'chat.chatList.yesterday',
        sessions: groups.yesterday,
      });
    if (groups.earlier.length > 0)
      result.push({
        label: 'Earlier',
        labelKey: 'chat.chatList.earlier',
        sessions: groups.earlier,
      });
    return result;
  });

  async function fetchSessions(): Promise<void> {
    isLoading.value = true;
    fetchError.value = null;
    try {
      sessions.value = await chatSessionApi.listSessions();
    } catch (error: unknown) {
      fetchError.value = error instanceof Error ? error.message : String(error);
    } finally {
      isLoading.value = false;
    }
  }

  async function createNewSession(): Promise<string> {
    const session = await chatSessionApi.createSession();
    activeSessionId.value = session.id;
    await fetchSessions();
    return session.id;
  }

  async function switchSession(id: string): Promise<void> {
    activeSessionId.value = id;
    closeDrawer();
  }

  async function removeSession(id: string): Promise<void> {
    await chatSessionApi.deleteSession(id);
    if (activeSessionId.value === id) {
      activeSessionId.value = null;
    }
    await fetchSessions();
  }

  async function updateTitle(id: string, title: string): Promise<void> {
    await chatSessionApi.updateSessionTitle(id, title);
    await fetchSessions();
  }

  function setActiveSessionId(id: string): void {
    activeSessionId.value = id;
  }

  function toggleDrawer(): void {
    isDrawerOpen.value = !isDrawerOpen.value;
    if (isDrawerOpen.value) {
      fetchSessions();
    }
  }

  function openDrawer(): void {
    isDrawerOpen.value = true;
    fetchSessions();
  }

  function closeDrawer(): void {
    isDrawerOpen.value = false;
  }

  function setSearchQuery(query: string): void {
    searchQuery.value = query;
  }

  return {
    sessions,
    activeSessionId,
    isDrawerOpen,
    searchQuery,
    isLoading,
    fetchError,
    activeSession,
    filteredSessions,
    groupedSessions,
    fetchSessions,
    createNewSession,
    switchSession,
    removeSession,
    updateTitle,
    setActiveSessionId,
    toggleDrawer,
    openDrawer,
    closeDrawer,
    setSearchQuery,
  };
});
