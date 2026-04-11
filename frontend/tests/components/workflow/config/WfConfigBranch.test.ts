import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import WfConfigBranch from '@/components/workflow/config/WfConfigBranch.vue';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';
import type { WorkflowNodeInfo, BranchNodeConfig } from '@/types/workflow';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});

const mountOpts = {
  global: { plugins: [i18n, createPinia(), ElementPlus] },
};

function makeBranchNode(overrides: Partial<BranchNodeConfig> = {}): WorkflowNodeInfo {
  const config: BranchNodeConfig = {
    nodeType: 'branch',
    field: '{{sql.totalRows}}',
    outputVariable: 'branch_result',
    ...overrides,
  };
  return {
    id: 'n1',
    workflowId: 'wf1',
    name: 'Branch Node',
    description: null,
    type: 'branch',
    config,
    positionX: 200,
    positionY: 200,
  };
}

describe('WfConfigBranch', () => {
  it('renders three inputs: nodeName, field, and outputVariable', () => {
    const wrapper = mount(WfConfigBranch, {
      ...mountOpts,
      props: { node: makeBranchNode() },
    });

    const inputs = wrapper.findAll('.el-input');
    // nodeName input, field input, outputVar input
    expect(inputs.length).toBe(3);
  });

  it('does not render an operator selector', () => {
    const wrapper = mount(WfConfigBranch, {
      ...mountOpts,
      props: { node: makeBranchNode() },
    });

    const selects = wrapper.findAll('.el-select');
    expect(selects.length).toBe(0);
  });

  it('shows the truthy/falsy hint', () => {
    const wrapper = mount(WfConfigBranch, {
      ...mountOpts,
      props: { node: makeBranchNode() },
    });

    const hint = wrapper.find('.wf-config-branch__hint');
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain('Truthy/Falsy evaluation');
  });
});
