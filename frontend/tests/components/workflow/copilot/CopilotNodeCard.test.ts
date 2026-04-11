import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import CopilotNodeCard from '@/components/workflow/copilot/CopilotNodeCard.vue';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});

describe('CopilotNodeCard', () => {
  const defaultProps = {
    nodeId: 'n1',
    nodeName: 'Query Users',
    nodeType: 'sql',
    config: {
      nodeType: 'sql' as const,
      datasourceId: 'ds1',
      params: {},
      sql: 'SELECT * FROM users WHERE active = true',
      outputVariable: 'users',
    },
  };

  const mountOpts = {
    global: { plugins: [i18n, createPinia(), ElementPlus] },
  };

  it('renders collapsed by default', () => {
    const wrapper = mount(CopilotNodeCard, { ...mountOpts, props: defaultProps });
    expect(wrapper.find('.copilot-node-card__summary').exists()).toBe(true);
    expect(wrapper.find('.copilot-node-card__expanded').exists()).toBe(false);
  });

  it('shows node name', () => {
    const wrapper = mount(CopilotNodeCard, { ...mountOpts, props: defaultProps });
    expect(wrapper.text()).toContain('Query Users');
  });

  it('shows config summary in collapsed state', () => {
    const wrapper = mount(CopilotNodeCard, { ...mountOpts, props: defaultProps });
    expect(wrapper.text()).toContain('SELECT * FROM users');
  });

  it('expands on header click', async () => {
    const wrapper = mount(CopilotNodeCard, { ...mountOpts, props: defaultProps });
    await wrapper.find('.copilot-node-card__header').trigger('click');
    expect(wrapper.find('.copilot-node-card__expanded').exists()).toBe(true);
  });
});
