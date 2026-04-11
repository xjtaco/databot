import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import TodosStatusBar from '@/components/chat/TodosStatusBar.vue';
import { useTodosStore } from '@/stores';
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

describe('TodosStatusBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function createWrapper() {
    return mount(TodosStatusBar, {
      global: {
        plugins: [i18n],
        stubs: {
          'el-icon': {
            template: '<span class="el-icon-stub"><slot /></span>',
          },
          'el-drawer': {
            template: '<div class="el-drawer-stub" v-if="modelValue"><slot /></div>',
            props: ['modelValue', 'title', 'direction', 'size'],
          },
        },
      },
    });
  }

  it('should not render when no todos', () => {
    const wrapper = createWrapper();

    expect(wrapper.find('.todos-status').exists()).toBe(false);
  });

  it('should render when todos exist', () => {
    const todosStore = useTodosStore();
    todosStore.updateTodos([{ content: 'Task 1', activeForm: 'Task 1', status: 'pending' }], {
      count: 1,
      completed: 0,
      inProgress: 0,
      pending: 1,
      cancelled: 0,
    });

    const wrapper = createWrapper();

    expect(wrapper.find('.todos-status').exists()).toBe(true);
  });

  it('should display current task description when in_progress', () => {
    const todosStore = useTodosStore();
    todosStore.updateTodos(
      [
        { content: 'Completed task', activeForm: 'Completed task', status: 'completed' },
        {
          content: 'Current running task',
          activeForm: 'Current running task',
          status: 'in_progress',
        },
        { content: 'Pending task', activeForm: 'Pending task', status: 'pending' },
      ],
      { count: 3, completed: 1, inProgress: 1, pending: 1, cancelled: 0 }
    );

    const wrapper = createWrapper();

    expect(wrapper.find('.todos-status__summary').exists()).toBe(true);
  });

  it('should display progress text in summary', () => {
    const todosStore = useTodosStore();
    todosStore.updateTodos([{ content: 'A task', activeForm: 'A task', status: 'in_progress' }], {
      count: 1,
      completed: 0,
      inProgress: 1,
      pending: 0,
      cancelled: 0,
    });

    const wrapper = createWrapper();

    expect(wrapper.find('.todos-status__progress').exists()).toBe(true);
  });

  it('should display progress count', () => {
    const todosStore = useTodosStore();
    todosStore.updateTodos(
      [
        { content: 'Task 1', activeForm: 'Task 1', status: 'completed' },
        { content: 'Task 2', activeForm: 'Task 2', status: 'completed' },
        { content: 'Task 3', activeForm: 'Task 3', status: 'in_progress' },
        { content: 'Task 4', activeForm: 'Task 4', status: 'pending' },
        { content: 'Task 5', activeForm: 'Task 5', status: 'pending' },
      ],
      { count: 5, completed: 2, inProgress: 1, pending: 2, cancelled: 0 }
    );

    const wrapper = createWrapper();

    expect(wrapper.find('.todos-status__progress').text()).toBe('2/5');
  });

  it('should toggle drawer on click', async () => {
    const todosStore = useTodosStore();
    todosStore.updateTodos([{ content: 'Task 1', activeForm: 'Task 1', status: 'pending' }], {
      count: 1,
      completed: 0,
      inProgress: 0,
      pending: 1,
      cancelled: 0,
    });

    const wrapper = createWrapper();

    expect(todosStore.isExpanded).toBe(false);

    await wrapper.find('.todos-status').trigger('click');

    expect(todosStore.isExpanded).toBe(true);
  });

  it('should show spinning icon when task is in progress', () => {
    const todosStore = useTodosStore();
    todosStore.updateTodos([{ content: 'Task 1', activeForm: 'Task 1', status: 'in_progress' }], {
      count: 1,
      completed: 0,
      inProgress: 1,
      pending: 0,
      cancelled: 0,
    });

    const wrapper = createWrapper();

    expect(wrapper.find('.todos-status__icon.spinning').exists()).toBe(true);
  });

  it('should not show spinning icon when no task in progress', () => {
    const todosStore = useTodosStore();
    todosStore.updateTodos(
      [
        { content: 'Task 1', activeForm: 'Task 1', status: 'completed' },
        { content: 'Task 2', activeForm: 'Task 2', status: 'pending' },
      ],
      { count: 2, completed: 1, inProgress: 0, pending: 1, cancelled: 0 }
    );

    const wrapper = createWrapper();

    expect(wrapper.find('.todos-status__icon.spinning').exists()).toBe(false);
  });
});
