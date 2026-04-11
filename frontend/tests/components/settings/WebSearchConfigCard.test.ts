import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import ElementPlus from 'element-plus';
import WebSearchConfigCard from '@/components/settings/WebSearchConfigCard.vue';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

vi.mock('@/api/globalConfig', () => ({
  getWebSearchConfig: vi.fn().mockResolvedValue({
    type: 'ali_iqs',
    apiKey: '********',
    numResults: 3,
    timeout: 60,
  }),
  saveWebSearchConfig: vi.fn(),
  testWebSearchConnection: vi.fn(),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});

function mountCard() {
  return mount(WebSearchConfigCard, {
    global: { plugins: [i18n, createPinia(), ElementPlus] },
    attachTo: document.body,
  });
}

describe('WebSearchConfigCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('accepts google as a valid search type selection', async () => {
    const wrapper = mountCard();
    const vm = wrapper.vm as unknown as { formData: { type: string } };
    // Setting type to 'google' should be accepted and trigger CX field
    vm.formData.type = 'google';
    await wrapper.vm.$nextTick();
    // Verify the value persists (google is a valid option)
    expect(vm.formData.type).toBe('google');
    // And the CX field appears, confirming the google option is handled
    expect(wrapper.text()).toContain('Search Engine ID (CX)');
  });

  it('does not show CX field when type is ali_iqs', () => {
    const wrapper = mountCard();
    expect(wrapper.text()).not.toContain('Search Engine ID (CX)');
  });

  it('shows CX field when type is google', async () => {
    const wrapper = mountCard();
    const vm = wrapper.vm as unknown as { formData: { type: string } };
    vm.formData.type = 'google';
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Search Engine ID (CX)');
  });

  it('shows numResults hint when type is google', async () => {
    const wrapper = mountCard();
    const vm = wrapper.vm as unknown as { formData: { type: string } };
    vm.formData.type = 'google';
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Google Search returns a maximum of 10 results');
  });
});
