import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ToolCallIndicator from '@/components/chat/ToolCallIndicator.vue';
import { useToolCallStore } from '@/stores';

describe('ToolCallIndicator', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function createWrapper() {
    return mount(ToolCallIndicator, {
      global: {
        stubs: {
          'el-icon': {
            template: '<span class="el-icon-stub"><slot /></span>',
          },
        },
      },
    });
  }

  it('should not render when no tool calls', () => {
    const wrapper = createWrapper();

    expect(wrapper.find('.tool-indicator').exists()).toBe(false);
  });

  it('should not render when agent is not running even with tool calls', () => {
    const toolCallStore = useToolCallStore();
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'sql',
      timestamp: Date.now(),
      status: 'completed',
    });
    // isAgentRunning is false by default

    const wrapper = createWrapper();

    expect(wrapper.find('.tool-indicator').exists()).toBe(false);
  });

  it('should render when tool calls exist and agent is running', () => {
    const toolCallStore = useToolCallStore();
    toolCallStore.setAgentRunning(true);
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'sql',
      timestamp: Date.now(),
      status: 'completed',
    });

    const wrapper = createWrapper();

    expect(wrapper.find('.tool-indicator').exists()).toBe(true);
  });

  it('should display tool names', () => {
    const toolCallStore = useToolCallStore();
    toolCallStore.setAgentRunning(true);
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'sql',
      timestamp: Date.now(),
      status: 'completed',
    });
    toolCallStore.addToolCall({
      id: 'tc-2',
      name: 'grep',
      timestamp: Date.now(),
      status: 'completed',
    });

    const wrapper = createWrapper();
    const toolNames = wrapper.findAll('.tool-indicator__name');

    expect(toolNames.length).toBeGreaterThan(0);
  });

  it('should highlight running tool calls', () => {
    const toolCallStore = useToolCallStore();
    toolCallStore.setAgentRunning(true);
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'sql',
      timestamp: Date.now(),
      status: 'running',
    });

    const wrapper = createWrapper();

    expect(wrapper.find('.tool-indicator__name--running').exists()).toBe(true);
  });

  it('should have loading spinner icon', () => {
    const toolCallStore = useToolCallStore();
    toolCallStore.setAgentRunning(true);
    toolCallStore.addToolCall({
      id: 'tc-1',
      name: 'sql',
      timestamp: Date.now(),
      status: 'completed',
    });

    const wrapper = createWrapper();

    expect(wrapper.find('.tool-indicator__icon.spinning').exists()).toBe(true);
  });

  it('should show recent calls in scroll area', () => {
    const toolCallStore = useToolCallStore();
    toolCallStore.setAgentRunning(true);

    for (let i = 0; i < 10; i++) {
      toolCallStore.addToolCall({
        id: `tc-${i}`,
        name: `tool-${i}`,
        timestamp: Date.now(),
        status: 'completed',
      });
    }

    const wrapper = createWrapper();
    const scrollArea = wrapper.find('.tool-indicator__scroll');

    expect(scrollArea.exists()).toBe(true);
    // Should show recent calls (last 5)
    const toolNames = scrollArea.findAll('.tool-indicator__name');
    expect(toolNames.length).toBe(5);
  });
});
