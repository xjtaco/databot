import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ElementPlus from 'element-plus';
import CopilotInput from '@/components/workflow/copilot/CopilotInput.vue';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});

describe('CopilotInput', () => {
  const mountOpts = {
    global: { plugins: [i18n, ElementPlus] },
  };

  it('renders textarea', () => {
    const wrapper = mount(CopilotInput, {
      ...mountOpts,
      props: { disabled: false, isThinking: false },
    });
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('shows send button when not thinking', () => {
    const wrapper = mount(CopilotInput, {
      ...mountOpts,
      props: { disabled: false, isThinking: false },
    });
    expect(wrapper.find('.copilot-input__send-btn').exists()).toBe(true);
    expect(wrapper.find('.copilot-input__abort-btn').exists()).toBe(false);
  });

  it('shows abort button when thinking', () => {
    const wrapper = mount(CopilotInput, {
      ...mountOpts,
      props: { disabled: false, isThinking: true },
    });
    expect(wrapper.find('.copilot-input__abort-btn').exists()).toBe(true);
    expect(wrapper.find('.copilot-input__send-btn').exists()).toBe(false);
  });
});
