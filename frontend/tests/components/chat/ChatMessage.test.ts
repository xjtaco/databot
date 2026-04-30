import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import ChatMessage from '@/components/chat/ChatMessage.vue';
import { useChatSessionStore } from '@/stores/chatSessionStore';
import { updateMessageMetadata } from '@/api/chatSession';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';
import type { ChatMessage as ChatMessageType } from '@/types';
import type { PropType } from 'vue';
import type { ChatActionCard } from '@/types/actionCard';

vi.mock('@/api/chatSession', () => ({
  updateMessageMetadata: vi.fn().mockResolvedValue(undefined),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

describe('ChatMessage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('persists action card status changes to chat message metadata', async () => {
    const chatSessionStore = useChatSessionStore();
    chatSessionStore.setActiveSessionId('session-1');
    const message: ChatMessageType = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Here is a card',
      timestamp: Date.now(),
      status: 'complete',
      actionCards: [
        {
          id: 'card-1',
          status: 'proposed',
          metadataMessageId: 'tool-message-1',
          payload: {
            id: 'card-1',
            cardId: 'data.open',
            domain: 'data',
            action: 'open',
            title: 'Open Data',
            summary: 'Open data management',
            params: {},
            riskLevel: 'low',
            confirmRequired: false,
            executionMode: 'frontend',
            presentationMode: 'resource_list',
          },
        },
      ],
    };

    const wrapper = mount(ChatMessage, {
      props: { message },
      global: {
        plugins: [i18n],
        stubs: {
          ActionCard: {
            template:
              "<button class=\"action-card-stub\" @click=\"$emit('status-change', 'card-1', 'succeeded', { resultSummary: 'Opened' })\">card</button>",
            props: {
              card: {
                type: Object as PropType<ChatActionCard>,
                required: true,
              },
            },
            emits: ['status-change'],
          },
          MessageToolCalls: true,
          IconButton: true,
          'el-icon': true,
        },
      },
    });

    await wrapper.find('.action-card-stub').trigger('click');

    expect(updateMessageMetadata).toHaveBeenCalledWith('session-1', 'tool-message-1', {
      type: 'action_card',
      payload: message.actionCards![0].payload,
      status: 'succeeded',
      resultSummary: 'Opened',
      error: undefined,
    });
  });
});
