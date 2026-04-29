import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { defineComponent, h, nextTick } from 'vue';
import ResourceActionCard from '@/components/chat/actionCards/ResourceActionCard.vue';
import type { UiActionCardPayload } from '@/types/actionCard';
import type {
  ResourceActionResult,
  ResourceAdapter,
  ResourceRow,
} from '@/components/chat/actionCards/resourceAdapters';
import enUS from '@/locales/en-US';
import zhCN from '@/locales/zh-CN';

const { fetchRowsMock, executeActionMock, getResourceAdapterMock, getDefaultAllowedActionsMock } =
  vi.hoisted(() => ({
    fetchRowsMock: vi.fn(),
    executeActionMock: vi.fn(),
    getResourceAdapterMock: vi.fn(),
    getDefaultAllowedActionsMock: vi.fn(),
  }));

vi.mock('@/components/chat/actionCards/resourceAdapters', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/components/chat/actionCards/resourceAdapters')>();
  return {
    ...actual,
    getResourceAdapter: getResourceAdapterMock,
    getDefaultAllowedActions: getDefaultAllowedActionsMock,
  };
});

vi.mock('@/components/chat/actionCards/forms/InlineScheduleForm.vue', () => ({
  default: defineComponent({
    name: 'InlineScheduleForm',
    props: {
      payload: {
        type: Object,
        required: true,
      },
    },
    emits: ['submit', 'cancel'],
    setup(props, { emit }) {
      return () =>
        h('div', { class: 'inline-schedule-form-stub' }, [
          h('span', `schedule:${String(props.payload.params.scheduleId)}`),
          h(
            'button',
            {
              class: 'inline-schedule-submit',
              onClick: () =>
                emit('submit', 'succeeded', {
                  resultSummary: 'Updated schedule',
                }),
            },
            'submit'
          ),
        ]);
    },
  }),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: enUS, 'zh-CN': zhCN },
});

function makePayload(overrides?: Partial<UiActionCardPayload>): UiActionCardPayload {
  return {
    id: 'card-1',
    cardId: 'workflow.list',
    domain: 'workflow',
    action: 'list',
    title: 'Workflow list',
    summary: 'Pick a workflow',
    params: {},
    riskLevel: 'low',
    confirmRequired: false,
    executionMode: 'frontend',
    presentationMode: 'resource_list',
    resourceType: 'workflow',
    ...overrides,
  };
}

function makeRow(overrides?: Partial<ResourceRow>): ResourceRow {
  return {
    id: 'workflow-1',
    title: 'Daily Report',
    subtitle: 'Runs every day',
    meta: [{ label: 'chat.actionCards.resource.meta.nodeCount', value: '4' }],
    statusLabel: 'chat.actionCards.resource.status.workflow.neverRun',
    actions: [
      {
        key: 'execute',
        labelKey: 'chat.actionCards.resource.actions.execute',
        icon: 'VideoPlay',
      },
      {
        key: 'delete',
        labelKey: 'chat.actionCards.resource.actions.delete',
        icon: 'Delete',
        riskLevel: 'danger',
        confirmationMode: 'modal',
      },
    ],
    rawType: 'workflow',
    data: {
      kind: 'workflow',
      workflow: {
        id: 'workflow-1',
        name: 'Daily Report',
        description: 'Runs every day',
        nodeCount: 4,
        lastRunAt: null,
        lastRunStatus: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        creatorName: null,
      },
    },
    ...overrides,
  };
}

function mountCard(payload = makePayload()) {
  return mount(ResourceActionCard, {
    props: { payload },
    global: {
      plugins: [i18n],
      stubs: {
        teleport: true,
        'el-input': {
          template:
            '<input class="el-input-stub" :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup.enter="$emit(\'keyup\', $event)" />',
          props: ['modelValue', 'placeholder', 'clearable', 'size'],
          emits: ['update:modelValue', 'keyup'],
        },
        'el-button': {
          template:
            '<button class="el-button-stub" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
          props: ['size', 'type', 'loading', 'disabled', 'circle', 'title'],
          emits: ['click'],
        },
        'el-icon': {
          template: '<span><slot /></span>',
        },
        'el-tag': {
          template: '<span class="el-tag-stub"><slot /></span>',
          props: ['size', 'type', 'effect'],
        },
        ConfirmDialog: {
          template: `
            <div v-if="visible" class="confirm-dialog-stub">
              <p>{{ message }}</p>
              <button class="confirm-dialog-cancel" @click="$emit('cancel')">{{ cancelText }}</button>
              <button class="confirm-dialog-confirm" @click="$emit('confirm')">{{ confirmText }}</button>
            </div>
          `,
          props: ['visible', 'title', 'message', 'confirmText', 'cancelText', 'type', 'loading'],
          emits: ['confirm', 'cancel', 'update:visible'],
        },
      },
    },
  });
}

async function flush(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

describe('ResourceActionCard.vue', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getDefaultAllowedActionsMock.mockReturnValue([
      { key: 'execute' },
      { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
    ]);
    getResourceAdapterMock.mockReturnValue({
      fetchRows: fetchRowsMock,
      executeAction: executeActionMock,
    } satisfies ResourceAdapter);
    fetchRowsMock.mockResolvedValue([makeRow()]);
    executeActionMock.mockResolvedValue({
      summaryKey: 'chat.actionCards.resource.summary.workflow.execute',
      summaryParams: { name: 'Daily Report' },
    } satisfies ResourceActionResult);
  });

  it('loads rows immediately without a view click', async () => {
    const wrapper = mountCard(makePayload({ defaultQuery: 'daily' }));
    await flush();

    expect(fetchRowsMock).toHaveBeenCalledWith({
      query: 'daily',
      limit: 10,
      allowedActions: [
        { key: 'execute' },
        { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
      ],
    });
    expect(wrapper.text()).toContain('Daily Report');
    expect(executeActionMock).not.toHaveBeenCalled();
  });

  it('uses search input changes to reload rows', async () => {
    const wrapper = mountCard();
    await flush();

    fetchRowsMock.mockResolvedValueOnce([makeRow({ id: 'workflow-2', title: 'Revenue Flow' })]);
    await wrapper.find('input.el-input-stub').setValue('revenue');
    await wrapper.find('.resource-action-card__search-button').trigger('click');
    await flush();

    expect(fetchRowsMock).toHaveBeenLastCalledWith({
      query: 'revenue',
      limit: 10,
      allowedActions: expect.any(Array) as unknown[],
    });
    expect(wrapper.text()).toContain('Revenue Flow');
  });

  it('confirms delete actions and refreshes rows after success', async () => {
    const wrapper = mountCard();
    await flush();

    fetchRowsMock.mockResolvedValueOnce([makeRow({ id: 'workflow-2', title: 'Weekly Report' })]);
    executeActionMock.mockResolvedValueOnce({
      summaryKey: 'chat.actionCards.resource.summary.workflow.delete',
      summaryParams: { name: 'Daily Report' },
      refresh: true,
    } satisfies ResourceActionResult);

    await wrapper.find('[data-action-key="delete"]').trigger('click');
    expect(wrapper.find('.confirm-dialog-stub').exists()).toBe(true);
    expect(wrapper.text()).toContain('Daily Report');
    expect(executeActionMock).not.toHaveBeenCalled();

    await wrapper.find('.confirm-dialog-confirm').trigger('click');
    await flush();

    expect(executeActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'workflow-1' }),
      'delete'
    );
    expect(fetchRowsMock).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('Weekly Report');
  });

  it('executes workflow actions and shows the result inside the card', async () => {
    const wrapper = mountCard();
    await flush();

    await wrapper.find('[data-action-key="execute"]').trigger('click');
    await flush();

    expect(executeActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'workflow-1' }),
      'execute'
    );
    expect(wrapper.text()).toContain('chat.actionCards.resource.summary.workflow.execute');
  });

  it('embeds schedule edit form and refreshes after successful update', async () => {
    fetchRowsMock.mockResolvedValue([makeRow({ rawType: 'schedule' })]);
    executeActionMock.mockResolvedValueOnce({
      summaryKey: 'chat.actionCards.resource.summary.schedule.edit',
      inlineForm: { kind: 'schedule_edit', scheduleId: 'workflow-1' },
    } satisfies ResourceActionResult);
    const wrapper = mountCard(makePayload({ domain: 'schedule', resourceType: 'schedule' }));
    await flush();

    await wrapper.find('[data-action-key="execute"]').trigger('click');
    await flush();

    expect(wrapper.find('.inline-schedule-form-stub').exists()).toBe(true);
    expect(wrapper.text()).toContain('schedule:workflow-1');

    await wrapper.find('.inline-schedule-submit').trigger('click');
    await flush();

    expect(wrapper.find('.inline-schedule-form-stub').exists()).toBe(false);
    expect(fetchRowsMock).toHaveBeenCalledTimes(2);
  });
});
