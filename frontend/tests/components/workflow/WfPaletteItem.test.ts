import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import WfPaletteItem from '@/components/workflow/WfPaletteItem.vue';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});

const mountOpts = {
  global: { plugins: [i18n, createPinia(), ElementPlus] },
};

describe('WfPaletteItem', () => {
  it('should render label text', () => {
    const wrapper = mount(WfPaletteItem, {
      ...mountOpts,
      props: { type: 'sql', label: 'SQL Query', color: '#3B82F6' },
    });
    expect(wrapper.text()).toContain('SQL Query');
  });

  it('should be draggable when not disabled', () => {
    const wrapper = mount(WfPaletteItem, {
      ...mountOpts,
      props: { type: 'sql', label: 'SQL Query', color: '#3B82F6' },
    });
    expect(wrapper.find('.wf-palette-item').attributes('draggable')).toBe('true');
  });

  it('should not be draggable when disabled', () => {
    const wrapper = mount(WfPaletteItem, {
      ...mountOpts,
      props: {
        type: 'llm',
        label: 'LLM Generate',
        color: '#A855F7',
        disabled: true,
        disabledReason: 'LLM not configured',
      },
    });
    expect(wrapper.find('.wf-palette-item').attributes('draggable')).toBe('false');
  });

  it('should have is-disabled class when disabled', () => {
    const wrapper = mount(WfPaletteItem, {
      ...mountOpts,
      props: {
        type: 'llm',
        label: 'LLM Generate',
        color: '#A855F7',
        disabled: true,
        disabledReason: 'LLM not configured',
      },
    });
    expect(wrapper.find('.wf-palette-item').classes()).toContain('is-disabled');
  });

  it('should not have is-disabled class when not disabled', () => {
    const wrapper = mount(WfPaletteItem, {
      ...mountOpts,
      props: { type: 'sql', label: 'SQL Query', color: '#3B82F6' },
    });
    expect(wrapper.find('.wf-palette-item').classes()).not.toContain('is-disabled');
  });
});
