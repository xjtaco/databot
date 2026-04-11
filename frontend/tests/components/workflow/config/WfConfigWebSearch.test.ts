import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import WfConfigWebSearch from '@/components/workflow/config/WfConfigWebSearch.vue';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';
import type { WorkflowNodeInfo, WebSearchNodeConfig } from '@/types/workflow';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});

const mountOpts = {
  global: { plugins: [i18n, createPinia(), ElementPlus] },
};

function makeWebSearchNode(overrides: Partial<WebSearchNodeConfig> = {}): WorkflowNodeInfo {
  const config: WebSearchNodeConfig = {
    nodeType: 'web_search',
    params: {},
    keywords: 'vue typescript testing',
    outputVariable: 'search_result',
    ...overrides,
  };
  return {
    id: 'n1',
    workflowId: 'wf1',
    name: 'Web Search Node',
    description: null,
    type: 'web_search',
    config,
    positionX: 200,
    positionY: 200,
  };
}

describe('WfConfigWebSearch', () => {
  it('renders keywords input field', () => {
    const wrapper = mount(WfConfigWebSearch, {
      ...mountOpts,
      props: { node: makeWebSearchNode() },
    });

    // Should have el-input elements for nodeName, keywords, and outputVariable
    const inputs = wrapper.findAll('.el-input');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('renders output variable input', () => {
    const wrapper = mount(WfConfigWebSearch, {
      ...mountOpts,
      props: { node: makeWebSearchNode({ outputVariable: 'my_search' }) },
    });

    // nodeName, keywords, and outputVariable inputs are all rendered
    const inputs = wrapper.findAll('.el-input');
    expect(inputs.length).toBe(3);
  });

  it('displays the keywords value in the input', () => {
    const wrapper = mount(WfConfigWebSearch, {
      ...mountOpts,
      props: { node: makeWebSearchNode({ keywords: 'climate change news' }) },
    });

    // inputs: nodeName, keywords, outputVar
    const inputs = wrapper.findAll('input');
    const keywordsInput = inputs[1].element as HTMLInputElement;
    expect(keywordsInput.value).toBe('climate change news');
  });

  it('displays the output variable value in the input', () => {
    const wrapper = mount(WfConfigWebSearch, {
      ...mountOpts,
      props: { node: makeWebSearchNode({ outputVariable: 'web_results' }) },
    });

    // inputs: nodeName, keywords, outputVar
    const inputs = wrapper.findAll('input');
    const outputVarInput = inputs[2].element as HTMLInputElement;
    expect(outputVarInput.value).toBe('web_results');
  });
});
