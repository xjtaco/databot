import { defineComponent, h } from 'vue';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import InlineScheduleForm from '@/components/chat/actionCards/forms/InlineScheduleForm.vue';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';
import type { UiActionCardPayload } from '@/types/actionCard';
import type { ScheduleFormInitialValues } from '@/components/schedule/ScheduleForm.vue';
import type { CreateScheduleInput, ScheduleDetail } from '@/types/schedule';

const scheduleFormState = vi.hoisted(() => ({
  lastInitial: undefined as ScheduleFormInitialValues | undefined,
  submitInput: {
    name: 'Cron Sales',
    workflowId: 'wf-1',
    scheduleType: 'cron' as const,
    cronExpr: '*/15 * * * *',
    enabled: false,
  } satisfies CreateScheduleInput,
}));

vi.mock('@/components/schedule/ScheduleForm.vue', () => ({
  default: defineComponent({
    name: 'ScheduleForm',
    props: {
      editing: {
        type: Object,
        default: null,
      },
      initial: {
        type: Object,
        default: undefined,
      },
    },
    setup(props, { expose }) {
      scheduleFormState.lastInitial = props.initial as ScheduleFormInitialValues | undefined;
      expose({
        getSubmitInput: () => scheduleFormState.submitInput,
      });
      return () => h('div', { class: 'schedule-form-stub' });
    },
  }),
}));

vi.mock('@/api/workflow', () => ({
  listWorkflows: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/api/schedule', () => ({
  createSchedule: vi.fn().mockResolvedValue({
    id: 'sched-1',
    name: 'Cron Sales',
    description: '',
    workflowId: 'wf-1',
    workflowName: 'Sales Report',
    scheduleType: 'cron',
    cronExpr: '*/15 * * * *',
    timezone: 'Asia/Shanghai',
    enabled: false,
    lastRunId: null,
    lastRunStatus: null,
    lastRunAt: null,
    createdAt: '2026-03-29T00:00:00Z',
    updatedAt: '2026-03-29T00:00:00Z',
    creatorName: null,
    params: {},
  } satisfies ScheduleDetail),
  listSchedules: vi.fn().mockResolvedValue([]),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  getSchedule: vi.fn(),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

const globalStubs = {
  'el-button': {
    template: '<button :disabled="loading" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'loading'],
    emits: ['click'],
  },
  'el-icon': {
    template: '<span><slot /></span>',
  },
  'el-alert': {
    template: '<div />',
    props: ['type', 'closable', 'showIcon', 'description'],
  },
  Loading: {
    template: '<span />',
  },
};

function makePayload(params: Record<string, unknown> = {}): UiActionCardPayload {
  return {
    id: 'payload-1',
    cardId: 'card-1',
    domain: 'schedule',
    action: 'create',
    title: 'Create schedule',
    summary: 'Create schedule',
    params,
    riskLevel: 'low',
    confirmRequired: false,
    executionMode: 'frontend',
    presentationMode: 'inline_form',
    confirmationMode: 'none',
  };
}

describe('InlineScheduleForm', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    scheduleFormState.lastInitial = undefined;
  });

  it('passes typed schedule defaults from action card params', async () => {
    mount(InlineScheduleForm, {
      props: {
        payload: makePayload({
          workflowName: 'Sales',
          workflowQuery: 'report',
          scheduleType: 'cron',
          cronExpression: '*/15 * * * *',
          time: '10:30',
          timezone: 'UTC',
          enabled: false,
          name: 'Cron Sales',
          description: 'Run often',
        }),
      },
      global: {
        plugins: [i18n],
        stubs: globalStubs,
      },
    });

    expect(scheduleFormState.lastInitial).toEqual({
      workflowName: 'Sales',
      workflowQuery: 'report',
      scheduleType: 'cron',
      cronExpr: '*/15 * * * *',
      time: '10:30',
      timezone: 'UTC',
      enabled: false,
      name: 'Cron Sales',
      description: 'Run often',
    });
  });

  it('ignores invalid action card param types and prefers cronExpr over cronExpression', async () => {
    mount(InlineScheduleForm, {
      props: {
        payload: makePayload({
          workflowName: 42,
          scheduleType: 'hourly',
          cronExpr: '0 8 * * *',
          cronExpression: '*/15 * * * *',
          enabled: 'false',
          name: 'Daily Sales',
        }),
      },
      global: {
        plugins: [i18n],
        stubs: globalStubs,
      },
    });

    expect(scheduleFormState.lastInitial).toEqual({
      cronExpr: '0 8 * * *',
      name: 'Daily Sales',
    });
  });
});
