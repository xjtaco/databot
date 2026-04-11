import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatSessionStore } from '@/stores/chatSessionStore';
import * as chatSessionApi from '@/api/chatSession';
import type { ChatSessionItem, ChatSessionDetail } from '@/types/chatSession';

vi.mock('@/api/chatSession');

const NOW = new Date('2026-03-17T10:00:00Z');

function makeSession(overrides: Partial<ChatSessionItem> = {}): ChatSessionItem {
  return {
    id: 'session-1',
    title: 'Test Session',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    lastMessagePreview: 'Hello',
    lastMessageAt: NOW.toISOString(),
    ...overrides,
  };
}

function makeDetail(overrides: Partial<ChatSessionDetail> = {}): ChatSessionDetail {
  return {
    id: 'session-new',
    title: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('chatSessionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should start with empty state', () => {
    const store = useChatSessionStore();

    expect(store.sessions).toHaveLength(0);
    expect(store.activeSessionId).toBeNull();
    expect(store.isDrawerOpen).toBe(false);
    expect(store.searchQuery).toBe('');
    expect(store.isLoading).toBe(false);
    expect(store.fetchError).toBeNull();
  });

  describe('fetchSessions', () => {
    it('should set isLoading, populate sessions, and clear isLoading', async () => {
      const mockSessions = [makeSession({ id: 's1' }), makeSession({ id: 's2' })];
      vi.mocked(chatSessionApi.listSessions).mockResolvedValue(mockSessions);

      const store = useChatSessionStore();
      const promise = store.fetchSessions();

      expect(store.isLoading).toBe(true);

      await promise;

      expect(store.isLoading).toBe(false);
      expect(store.sessions).toEqual(mockSessions);
      expect(chatSessionApi.listSessions).toHaveBeenCalledOnce();
    });

    it('should set fetchError and clear isLoading on failure', async () => {
      vi.mocked(chatSessionApi.listSessions).mockRejectedValue(new Error('Network error'));

      const store = useChatSessionStore();

      await store.fetchSessions();

      expect(store.isLoading).toBe(false);
      expect(store.fetchError).toBe('Network error');
    });

    it('should clear fetchError on successful fetch', async () => {
      vi.mocked(chatSessionApi.listSessions).mockResolvedValue([]);

      const store = useChatSessionStore();
      store.fetchError = 'Previous error';

      await store.fetchSessions();

      expect(store.fetchError).toBeNull();
    });
  });

  describe('createNewSession', () => {
    it('should create session, set activeSessionId, and refresh list', async () => {
      const detail = makeDetail({ id: 'new-id' });
      vi.mocked(chatSessionApi.createSession).mockResolvedValue(detail);
      vi.mocked(chatSessionApi.listSessions).mockResolvedValue([makeSession({ id: 'new-id' })]);

      const store = useChatSessionStore();
      const id = await store.createNewSession();

      expect(id).toBe('new-id');
      expect(store.activeSessionId).toBe('new-id');
      expect(chatSessionApi.createSession).toHaveBeenCalledOnce();
      expect(chatSessionApi.listSessions).toHaveBeenCalledOnce();
    });
  });

  describe('switchSession', () => {
    it('should set activeSessionId and close drawer', async () => {
      const store = useChatSessionStore();
      store.isDrawerOpen = true;

      await store.switchSession('session-abc');

      expect(store.activeSessionId).toBe('session-abc');
      expect(store.isDrawerOpen).toBe(false);
    });
  });

  describe('removeSession', () => {
    it('should delete session, clear activeSessionId if deleted, and refresh list', async () => {
      vi.mocked(chatSessionApi.deleteSession).mockResolvedValue(undefined);
      vi.mocked(chatSessionApi.listSessions).mockResolvedValue([]);

      const store = useChatSessionStore();
      store.activeSessionId = 'to-delete';

      await store.removeSession('to-delete');

      expect(chatSessionApi.deleteSession).toHaveBeenCalledWith('to-delete');
      expect(store.activeSessionId).toBeNull();
      expect(chatSessionApi.listSessions).toHaveBeenCalledOnce();
    });

    it('should not clear activeSessionId if a different session is deleted', async () => {
      vi.mocked(chatSessionApi.deleteSession).mockResolvedValue(undefined);
      vi.mocked(chatSessionApi.listSessions).mockResolvedValue([makeSession({ id: 'keep' })]);

      const store = useChatSessionStore();
      store.activeSessionId = 'keep';

      await store.removeSession('other');

      expect(store.activeSessionId).toBe('keep');
    });
  });

  describe('updateTitle', () => {
    it('should call API and refresh list', async () => {
      vi.mocked(chatSessionApi.updateSessionTitle).mockResolvedValue(
        makeDetail({ id: 's1', title: 'New Title' })
      );
      vi.mocked(chatSessionApi.listSessions).mockResolvedValue([
        makeSession({ id: 's1', title: 'New Title' }),
      ]);

      const store = useChatSessionStore();
      await store.updateTitle('s1', 'New Title');

      expect(chatSessionApi.updateSessionTitle).toHaveBeenCalledWith('s1', 'New Title');
      expect(chatSessionApi.listSessions).toHaveBeenCalledOnce();
    });
  });

  describe('setActiveSessionId', () => {
    it('should set the activeSessionId', () => {
      const store = useChatSessionStore();

      store.setActiveSessionId('abc-123');

      expect(store.activeSessionId).toBe('abc-123');
    });
  });

  describe('toggleDrawer / openDrawer / closeDrawer', () => {
    it('toggleDrawer should open drawer and trigger fetch', async () => {
      vi.mocked(chatSessionApi.listSessions).mockResolvedValue([]);

      const store = useChatSessionStore();
      expect(store.isDrawerOpen).toBe(false);

      store.toggleDrawer();

      expect(store.isDrawerOpen).toBe(true);
      expect(chatSessionApi.listSessions).toHaveBeenCalledOnce();
    });

    it('toggleDrawer should close drawer without fetching', () => {
      const store = useChatSessionStore();
      store.isDrawerOpen = true;

      store.toggleDrawer();

      expect(store.isDrawerOpen).toBe(false);
      expect(chatSessionApi.listSessions).not.toHaveBeenCalled();
    });

    it('openDrawer should set drawer open and trigger fetch', () => {
      vi.mocked(chatSessionApi.listSessions).mockResolvedValue([]);

      const store = useChatSessionStore();
      store.openDrawer();

      expect(store.isDrawerOpen).toBe(true);
      expect(chatSessionApi.listSessions).toHaveBeenCalledOnce();
    });

    it('closeDrawer should set drawer closed', () => {
      const store = useChatSessionStore();
      store.isDrawerOpen = true;

      store.closeDrawer();

      expect(store.isDrawerOpen).toBe(false);
    });
  });

  describe('setSearchQuery', () => {
    it('should update searchQuery', () => {
      const store = useChatSessionStore();

      store.setSearchQuery('hello');

      expect(store.searchQuery).toBe('hello');
    });
  });

  describe('filteredSessions', () => {
    it('should return all sessions when searchQuery is empty', () => {
      const store = useChatSessionStore();
      const sessions = [makeSession({ id: 's1' }), makeSession({ id: 's2' })];
      store.sessions = sessions;

      expect(store.filteredSessions).toEqual(sessions);
    });

    it('should filter sessions by title', () => {
      const store = useChatSessionStore();
      store.sessions = [
        makeSession({ id: 's1', title: 'Alpha Report' }),
        makeSession({ id: 's2', title: 'Beta Analysis' }),
      ];

      store.setSearchQuery('alpha');

      expect(store.filteredSessions).toHaveLength(1);
      expect(store.filteredSessions[0].id).toBe('s1');
    });

    it('should filter sessions by lastMessagePreview', () => {
      const store = useChatSessionStore();
      store.sessions = [
        makeSession({ id: 's1', title: 'Session One', lastMessagePreview: 'Revenue data' }),
        makeSession({ id: 's2', title: 'Session Two', lastMessagePreview: 'User growth' }),
      ];

      store.setSearchQuery('revenue');

      expect(store.filteredSessions).toHaveLength(1);
      expect(store.filteredSessions[0].id).toBe('s1');
    });

    it('should be case-insensitive', () => {
      const store = useChatSessionStore();
      store.sessions = [makeSession({ id: 's1', title: 'Important Report' })];

      store.setSearchQuery('IMPORTANT');

      expect(store.filteredSessions).toHaveLength(1);
    });

    it('should handle sessions with null title and preview', () => {
      const store = useChatSessionStore();
      store.sessions = [
        makeSession({ id: 's1', title: null, lastMessagePreview: null }),
        makeSession({ id: 's2', title: 'Match Me' }),
      ];

      store.setSearchQuery('match');

      expect(store.filteredSessions).toHaveLength(1);
      expect(store.filteredSessions[0].id).toBe('s2');
    });
  });

  describe('groupedSessions', () => {
    it('should group sessions into today, yesterday, and earlier', () => {
      const store = useChatSessionStore();
      const todayISO = NOW.toISOString();
      const yesterdayISO = new Date(NOW.getTime() - 86400000 + 3600000).toISOString();
      const earlierISO = new Date('2026-03-10T10:00:00Z').toISOString();

      store.sessions = [
        makeSession({ id: 'today', updatedAt: todayISO }),
        makeSession({ id: 'yesterday', updatedAt: yesterdayISO }),
        makeSession({ id: 'earlier', updatedAt: earlierISO }),
      ];

      const groups = store.groupedSessions;

      expect(groups).toHaveLength(3);
      expect(groups[0].labelKey).toBe('chat.chatList.today');
      expect(groups[0].sessions).toHaveLength(1);
      expect(groups[0].sessions[0].id).toBe('today');

      expect(groups[1].labelKey).toBe('chat.chatList.yesterday');
      expect(groups[1].sessions).toHaveLength(1);
      expect(groups[1].sessions[0].id).toBe('yesterday');

      expect(groups[2].labelKey).toBe('chat.chatList.earlier');
      expect(groups[2].sessions).toHaveLength(1);
      expect(groups[2].sessions[0].id).toBe('earlier');
    });

    it('should omit empty groups', () => {
      const store = useChatSessionStore();
      store.sessions = [makeSession({ id: 'today', updatedAt: NOW.toISOString() })];

      const groups = store.groupedSessions;

      expect(groups).toHaveLength(1);
      expect(groups[0].labelKey).toBe('chat.chatList.today');
    });

    it('should respect filtered sessions', () => {
      const store = useChatSessionStore();
      store.sessions = [
        makeSession({ id: 's1', title: 'Match', updatedAt: NOW.toISOString() }),
        makeSession({ id: 's2', title: 'No Match', updatedAt: NOW.toISOString() }),
      ];

      store.setSearchQuery('Match');

      // "Match" matches both "Match" and "No Match"
      // Let's use a more specific query
      store.setSearchQuery('No Match');

      const groups = store.groupedSessions;
      expect(groups).toHaveLength(1);
      expect(groups[0].sessions).toHaveLength(1);
      expect(groups[0].sessions[0].id).toBe('s2');
    });
  });

  describe('activeSession', () => {
    it('should return the session matching activeSessionId', () => {
      const store = useChatSessionStore();
      const session = makeSession({ id: 'active-1', title: 'Active Session' });
      store.sessions = [makeSession({ id: 'other' }), session];
      store.activeSessionId = 'active-1';

      expect(store.activeSession).toEqual(session);
    });

    it('should return null when no activeSessionId is set', () => {
      const store = useChatSessionStore();
      store.sessions = [makeSession({ id: 's1' })];

      expect(store.activeSession).toBeNull();
    });

    it('should return null when activeSessionId does not match any session', () => {
      const store = useChatSessionStore();
      store.sessions = [makeSession({ id: 's1' })];
      store.activeSessionId = 'nonexistent';

      expect(store.activeSession).toBeNull();
    });
  });
});
