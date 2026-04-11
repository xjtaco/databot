import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import UsageReportBadge from '@/components/chat/UsageReportBadge.vue';
import { useChatStore } from '@/stores';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

describe('UsageReportBadge', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function createWrapper() {
    return mount(UsageReportBadge, {
      global: {
        plugins: [i18n],
        stubs: {
          'el-tooltip': {
            template: '<div class="el-tooltip-stub"><slot /></div>',
            props: ['content'],
          },
          'el-icon': {
            template: '<span class="el-icon-stub"><slot /></span>',
          },
        },
      },
    });
  }

  it('should not render when tokenUsage is null', () => {
    const wrapper = createWrapper();

    expect(wrapper.find('.usage-badge').exists()).toBe(false);
  });

  it('should render when tokenUsage is set', () => {
    const chatStore = useChatStore();
    chatStore.setTokenUsage({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });

    const wrapper = createWrapper();

    expect(wrapper.find('.usage-badge').exists()).toBe(true);
  });

  it('should display total tokens in compact format', () => {
    const chatStore = useChatStore();
    chatStore.setTokenUsage({
      promptTokens: 500,
      completionTokens: 300,
      totalTokens: 800,
    });

    const wrapper = createWrapper();

    expect(wrapper.find('.usage-badge__text').text()).toBe('800 tokens');
  });

  it('should format large numbers with k suffix', () => {
    const chatStore = useChatStore();
    chatStore.setTokenUsage({
      promptTokens: 1500,
      completionTokens: 1000,
      totalTokens: 2500,
    });

    const wrapper = createWrapper();

    expect(wrapper.find('.usage-badge__text').text()).toBe('2.5k tokens');
  });

  it('should format very large numbers correctly', () => {
    const chatStore = useChatStore();
    chatStore.setTokenUsage({
      promptTokens: 8000,
      completionTokens: 4500,
      totalTokens: 12500,
    });

    const wrapper = createWrapper();

    expect(wrapper.find('.usage-badge__text').text()).toBe('12.5k tokens');
  });

  it('should have icon element', () => {
    const chatStore = useChatStore();
    chatStore.setTokenUsage({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });

    const wrapper = createWrapper();

    expect(wrapper.find('.usage-badge__icon').exists()).toBe(true);
  });
});
