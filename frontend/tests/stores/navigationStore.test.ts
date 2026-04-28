import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useNavigationStore } from '@/stores/navigationStore';

describe('navigationStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with chat as active nav', () => {
    const store = useNavigationStore();
    expect(store.activeNav).toBe('chat');
  });

  it('navigates to a different nav', () => {
    const store = useNavigationStore();
    store.navigateTo('data');
    expect(store.activeNav).toBe('data');
  });

  it('sets and clears pending intent', () => {
    const store = useNavigationStore();
    store.setPendingIntent({
      type: 'open_workflow_editor',
      workflowId: 'wf-123',
      copilotPrompt: 'Build a pipeline',
    });
    expect(store.pendingIntent).not.toBeNull();
    expect(store.pendingIntent!.type).toBe('open_workflow_editor');
    store.clearPendingIntent();
    expect(store.pendingIntent).toBeNull();
  });

  it('navigateTo preserves pending intent for consuming component', () => {
    const store = useNavigationStore();
    store.setPendingIntent({ type: 'open_schedule' });
    store.navigateTo('schedule');
    expect(store.pendingIntent).not.toBeNull();
    expect(store.pendingIntent!.type).toBe('open_schedule');
  });
});
