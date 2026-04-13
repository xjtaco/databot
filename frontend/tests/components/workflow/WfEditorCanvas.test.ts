/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PropType, defineComponent, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import ElementPlus from 'element-plus';
import WfEditorCanvas from '@/components/workflow/WfEditorCanvas.vue';
import { useWorkflowStore } from '@/stores/workflowStore';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

vi.mock('@vue-flow/core', () => ({
  VueFlow: defineComponent({
    name: 'VueFlow',
    props: {
      nodes: {
        type: Array as PropType<unknown[]>,
        default: () => [],
      },
      edges: {
        type: Array as PropType<unknown[]>,
        default: () => [],
      },
    },
    emits: ['nodes-change'],
    setup(_props, { slots }) {
      return () => h('div', { class: 'vue-flow-stub' }, slots.default?.());
    },
  }),
  Position: {
    Bottom: 'bottom',
    Top: 'top',
  },
  MarkerType: {
    ArrowClosed: 'arrowclosed',
  },
  useVueFlow: () => ({
    screenToFlowCoordinate: ({ x, y }: { x: number; y: number }) => ({ x, y }),
    findNode: vi.fn(),
    viewport: { value: { x: 0, y: 0, zoom: 1 } },
  }),
}));

vi.mock('@vue-flow/background', () => ({
  Background: defineComponent({ name: 'Background', setup: () => () => h('div') }),
}));

vi.mock('@vue-flow/controls', () => ({
  Controls: defineComponent({ name: 'Controls', setup: () => () => h('div') }),
}));

vi.mock('@/components/workflow/WfCanvasNode.vue', () => ({
  default: defineComponent({
    name: 'WfCanvasNode',
    setup: () => () => h('div'),
  }),
}));

vi.mock('@/components/common', () => ({
  ConfirmDialog: defineComponent({
    name: 'ConfirmDialog',
    setup: () => () => h('div'),
  }),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});

describe('WfEditorCanvas', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('marks manual layout edits only while dragging', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useWorkflowStore();
    store.editorWorkflow = {
      id: 'wf-1',
      name: 'Workflow',
      description: null,
      nodes: [
        {
          id: 'node-1',
          workflowId: 'wf-1',
          name: 'Node 1',
          description: null,
          type: 'sql',
          config: {
            nodeType: 'sql',
            datasourceId: 'ds-1',
            params: {},
            sql: 'select 1',
            outputVariable: 'result',
          },
          positionX: 0,
          positionY: 0,
        },
      ],
      edges: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const updateSpy = vi.spyOn(store, 'updateNodePosition');

    const wrapper = mount(WfEditorCanvas, {
      global: {
        plugins: [i18n, pinia, ElementPlus],
      },
    });

    await wrapper.findComponent({ name: 'VueFlow' }).vm.$emit('nodes-change', [
      {
        id: 'node-1',
        type: 'position',
        position: { x: 100, y: 120 },
        from: { x: 0, y: 0 },
        dragging: false,
      },
    ]);
    await nextTick();

    expect(updateSpy).toHaveBeenCalledWith('node-1', 100, 120, { source: 'system' });

    updateSpy.mockClear();

    await wrapper.findComponent({ name: 'VueFlow' }).vm.$emit('nodes-change', [
      {
        id: 'node-1',
        type: 'position',
        position: { x: 140, y: 180 },
        from: { x: 100, y: 120 },
        dragging: true,
      },
    ]);
    await nextTick();

    expect(updateSpy).toHaveBeenCalledWith('node-1', 140, 180, { source: 'user-drag' });
  });
});
