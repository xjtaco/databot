import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { withSetup } from '../setup';
import { useChat } from '@/composables/useChat';
import { useChatStore } from '@/stores/chatStore';
import type { UiActionCardPayload } from '@/types/actionCard';

function createMockWebSocket() {
  const handlers: Array<(msg: unknown) => void> = [];
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    onMessage: vi.fn((handler: (msg: unknown) => void) => handlers.push(handler)),
    offMessage: vi.fn(),
    setToken: vi.fn(),
    reconnectWithUrl: vi.fn(),
    simulateMessage(msg: unknown) {
      handlers.forEach((h) => h(msg));
    },
  };
}

describe('useChat action_card handling', () => {
  let mockWs: ReturnType<typeof createMockWebSocket>;
  let unmount: () => void;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockWs = createMockWebSocket();
  });

  afterEach(() => {
    unmount?.();
  });

  it('adds action card to chat store when action_card message received', () => {
    const result = withSetup(() => useChat({ websocket: mockWs as never }));
    unmount = result.unmount;
    const chatStore = useChatStore();
    chatStore.startAssistantMessage();

    const payload: UiActionCardPayload = {
      id: 'card-1',
      cardId: 'data.open',
      domain: 'data',
      action: 'open',
      title: 'Open Data Management',
      summary: 'Navigate to data management',
      params: {},
      riskLevel: 'low',
      confirmRequired: false,
      executionMode: 'frontend',
      targetNav: 'data',
    };

    mockWs.simulateMessage({
      type: 'action_card',
      timestamp: Date.now(),
      data: payload,
    });

    const msg = chatStore.messages[chatStore.messages.length - 1];
    expect(msg.actionCards).toBeDefined();
    expect(msg.actionCards!.length).toBe(1);
    expect(msg.actionCards![0].payload.id).toBe('card-1');
  });
});
