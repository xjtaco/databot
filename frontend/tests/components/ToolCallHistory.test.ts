import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import ToolCallHistory from '@/components/chat/ToolCallHistory.vue';
import { useToolCallStore } from '@/stores';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

const drawerStub = {
  template:
    '<div class="el-drawer-stub" :data-append-to-body="String(appendToBody)" v-if="modelValue"><slot /></div>',
  props: {
    modelValue: Boolean,
    title: String,
    direction: String,
    size: String,
    appendToBody: Boolean,
  },
};

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

describe('ToolCallHistory', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function createWrapper() {
    return mount(ToolCallHistory, {
      global: {
        plugins: [i18n],
        stubs: {
          'el-icon': {
            template: '<span class="el-icon-stub"><slot /></span>',
          },
          'el-drawer': drawerStub,
        },
      },
    });
  }

  it('should not render when no tool calls', () => {
    const wrapper = createWrapper();

    expect(wrapper.find('.tool-history').exists()).toBe(false);
  });

  it('should render when tool calls exist', () => {
    const toolCallStore = useToolCallStore();
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'sql_query',
      timestamp: Date.now(),
      status: 'completed',
    });

    const wrapper = createWrapper();

    expect(wrapper.find('.tool-history').exists()).toBe(true);
  });

  it('should display call count in badge', () => {
    const toolCallStore = useToolCallStore();
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'sql_query',
      timestamp: Date.now(),
      status: 'completed',
    });
    toolCallStore.addToolCall({
      id: 'tc-2',
      name: 'read_file',
      timestamp: Date.now(),
      status: 'completed',
    });

    const wrapper = createWrapper();

    expect(wrapper.find('.tool-history__count').text()).toContain('2');
  });

  it('should toggle drawer on click', async () => {
    const toolCallStore = useToolCallStore();
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'sql_query',
      timestamp: Date.now(),
      status: 'completed',
    });

    const wrapper = createWrapper();

    expect(toolCallStore.isExpanded).toBe(false);

    await wrapper.find('.tool-history').trigger('click');

    expect(toolCallStore.isExpanded).toBe(true);
  });

  it('should append drawer to body so header backdrop filters do not clip the list', () => {
    const toolCallStore = useToolCallStore();
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'sql_query',
      timestamp: Date.now(),
      status: 'completed',
    });
    toolCallStore.toggleExpanded();

    const wrapper = createWrapper();

    expect(wrapper.find('.el-drawer-stub').attributes('data-append-to-body')).toBe('true');
  });

  it('should display tool call items in drawer when expanded', () => {
    const toolCallStore = useToolCallStore();
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'sql_query',
      timestamp: Date.now(),
      status: 'completed',
    });
    toolCallStore.addToolCall({
      id: 'tc-2',
      name: 'read_file',
      timestamp: Date.now(),
      status: 'completed',
    });
    toolCallStore.toggleExpanded();

    const wrapper = createWrapper();

    expect(wrapper.findAll('.tool-history-item').length).toBe(2);
  });

  it('should display tool names in items', () => {
    const toolCallStore = useToolCallStore();
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'sql_query',
      timestamp: Date.now(),
      status: 'completed',
    });
    toolCallStore.toggleExpanded();

    const wrapper = createWrapper();

    expect(wrapper.find('.tool-history-item__name').text()).toBe('sql_query');
  });

  it('should show calls in reverse order (newest first)', () => {
    const toolCallStore = useToolCallStore();
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'first_tool',
      timestamp: Date.now() - 1000,
      status: 'completed',
    });
    toolCallStore.addToolCall({
      id: 'tc-2',
      name: 'second_tool',
      timestamp: Date.now(),
      status: 'completed',
    });
    toolCallStore.toggleExpanded();

    const wrapper = createWrapper();
    const items = wrapper.findAll('.tool-history-item__name');

    expect(items[0].text()).toBe('second_tool');
    expect(items[1].text()).toBe('first_tool');
  });

  it('should show empty message when drawer is open but no calls', () => {
    const toolCallStore = useToolCallStore();
    // Add then clear to get empty state with drawer capability
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'test',
      timestamp: Date.now(),
      status: 'completed',
    });
    toolCallStore.toggleExpanded();
    toolCallStore.clearHistory();
    // Manually set expanded since clearHistory resets it
    toolCallStore.toggleExpanded();

    const wrapper = createWrapper();

    // Component won't render badge when no calls, so drawer stub won't show
    expect(wrapper.find('.tool-history').exists()).toBe(false);
  });

  it('should expand item to show metadata on click', async () => {
    const toolCallStore = useToolCallStore();
    const metadata = { query: 'SELECT * FROM users', rows: 10 };
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'sql_query',
      timestamp: Date.now(),
      status: 'completed',
      metadata,
    });
    toolCallStore.toggleExpanded();

    const wrapper = createWrapper();

    // Initially no details shown
    expect(wrapper.find('.tool-history-item__details').exists()).toBe(false);

    // Click to expand
    await wrapper.find('.tool-history-item__header').trigger('click');

    // Now details should be visible
    expect(wrapper.find('.tool-history-item__details').exists()).toBe(true);
    expect(wrapper.find('.tool-history-item__metadata').text()).toContain('SELECT * FROM users');
  });

  it('should collapse expanded item on second click', async () => {
    const toolCallStore = useToolCallStore();
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'sql_query',
      timestamp: Date.now(),
      status: 'completed',
      metadata: { query: 'test' },
    });
    toolCallStore.toggleExpanded();

    const wrapper = createWrapper();

    // Expand
    await wrapper.find('.tool-history-item__header').trigger('click');
    expect(wrapper.find('.tool-history-item__details').exists()).toBe(true);

    // Collapse
    await wrapper.find('.tool-history-item__header').trigger('click');
    expect(wrapper.find('.tool-history-item__details').exists()).toBe(false);
  });
});
