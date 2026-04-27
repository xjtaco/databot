import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatStore } from '@/stores/chatStore';
import type { UiActionCardPayload } from '@/types/actionCard';

function makePayload(overrides?: Partial<UiActionCardPayload>): UiActionCardPayload {
  return {
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
    ...overrides,
  };
}

describe('chatStore action card actions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('addActionCard attaches card to current or last assistant message', () => {
    const store = useChatStore();
    store.addAssistantMessage('Here is the card:');
    store.addActionCard(makePayload());
    const msg = store.messages[store.messages.length - 1];
    expect(msg.actionCards).toBeDefined();
    expect(msg.actionCards!.length).toBe(1);
    expect(msg.actionCards![0].payload.cardId).toBe('data.open');
    expect(msg.actionCards![0].status).toBe('proposed');
  });

  it('updateActionCardStatus updates card status', () => {
    const store = useChatStore();
    store.addAssistantMessage('Card:');
    store.addActionCard(makePayload());
    store.updateActionCardStatus('card-1', 'succeeded', { resultSummary: 'Opened' });
    const msg = store.messages[store.messages.length - 1];
    expect(msg.actionCards![0].status).toBe('succeeded');
    expect(msg.actionCards![0].resultSummary).toBe('Opened');
  });

  it('updateActionCardStatus does nothing for unknown card id', () => {
    const store = useChatStore();
    store.addAssistantMessage('Card:');
    store.addActionCard(makePayload());
    store.updateActionCardStatus('nonexistent', 'succeeded');
    const msg = store.messages[store.messages.length - 1];
    expect(msg.actionCards![0].status).toBe('proposed');
  });

  it('loadHistoricalMessages restores action cards from metadata', () => {
    const store = useChatStore();
    store.loadHistoricalMessages([
      { role: 'assistant', content: 'Here is the card:', createdAt: '2026-01-01T00:00:00Z' },
      {
        role: 'tool',
        content: '{"toolName":"show_ui_action_card"}',
        createdAt: '2026-01-01T00:00:01Z',
        metadata: {
          type: 'action_card',
          payload: makePayload(),
          status: 'succeeded',
        },
      },
    ]);
    const msg = store.messages[store.messages.length - 1];
    expect(msg.actionCards).toBeDefined();
    expect(msg.actionCards!.length).toBe(1);
    expect(msg.actionCards![0].status).toBe('succeeded');
  });
});
