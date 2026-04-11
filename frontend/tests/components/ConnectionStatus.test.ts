import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import ConnectionStatus from '@/components/chat/ConnectionStatus.vue';
import { useConnectionStore } from '@/stores';
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

describe('ConnectionStatus', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function createWrapper() {
    return mount(ConnectionStatus, {
      global: {
        plugins: [i18n],
      },
    });
  }

  it('should render with disconnected state by default', () => {
    const wrapper = createWrapper();

    expect(wrapper.classes()).toContain('connection-status--disconnected');
    expect(wrapper.text()).toContain('已断开');
  });

  it('should show connecting state', async () => {
    const connectionStore = useConnectionStore();
    connectionStore.setConnecting();

    const wrapper = createWrapper();

    expect(wrapper.classes()).toContain('connection-status--connecting');
    expect(wrapper.text()).toContain('正在连接');
  });

  it('should show connected state', async () => {
    const connectionStore = useConnectionStore();
    connectionStore.setConnected();

    const wrapper = createWrapper();

    expect(wrapper.classes()).toContain('connection-status--connected');
    expect(wrapper.text()).toContain('已连接');
  });

  it('should show error state', async () => {
    const connectionStore = useConnectionStore();
    connectionStore.setError('Connection failed');

    const wrapper = createWrapper();

    expect(wrapper.classes()).toContain('connection-status--error');
    expect(wrapper.text()).toContain('连接错误');
  });

  it('should have status dot element', () => {
    const wrapper = createWrapper();

    const dot = wrapper.find('.connection-status__dot');
    expect(dot.exists()).toBe(true);
  });

  it('should have title attribute for accessibility', () => {
    const wrapper = createWrapper();

    expect(wrapper.attributes('title')).toBe('已断开');
  });
});
