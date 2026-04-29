import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import ScheduleForm from '@/components/schedule/ScheduleForm.vue';
import { useWorkflowStore } from '@/stores/workflowStore';
import { getWorkflow } from '@/api/workflow';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';
import type { ScheduleDetail } from '@/types/schedule';
import type { WorkflowDetail, WorkflowListItem } from '@/types/workflow';

vi.mock('@/api/workflow');
vi.mock('@/api/schedule');

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

// Stub Element Plus components that are hard to render in jsdom
const globalStubs = {
  'el-form': {
    template: '<form class="el-form"><slot /></form>',
  },
  'el-form-item': {
    template: '<div class="el-form-item"><slot /></div>',
    props: ['label', 'required'],
  },
  'el-input': {
    template:
      '<input class="el-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'type', 'rows', 'placeholder', 'size'],
    emits: ['update:modelValue'],
  },
  'el-select': {
    template:
      '<select class="el-select" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value); $emit(\'change\', $event.target.value)"><slot /></select>',
    props: ['modelValue', 'placeholder', 'class'],
    emits: ['update:modelValue', 'change'],
  },
  'el-option': {
    template: '<option :value="value">{{ label }}</option>',
    props: ['value', 'label'],
  },
  'el-time-picker': {
    template:
      '<input class="el-time-picker" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ['modelValue', 'format', 'valueFormat', 'class'],
    emits: ['update:modelValue'],
  },
  CronPreview: {
    template: '<div class="cron-preview-stub"></div>',
    props: ['cronExpr', 'timezone'],
  },
};

function makeScheduleDetail(overrides: Partial<ScheduleDetail> = {}): ScheduleDetail {
  return {
    id: 'sched-1',
    name: 'Daily Sync',
    description: 'Some description',
    workflowId: 'wf-1',
    workflowName: 'Sales Report',
    scheduleType: 'daily',
    cronExpr: '0 8 * * *',
    timezone: 'Asia/Shanghai',
    enabled: true,
    lastRunId: null,
    lastRunStatus: null,
    lastRunAt: null,
    createdAt: '2026-03-29T00:00:00Z',
    params: {},
    updatedAt: '2026-03-29T00:00:00Z',
    creatorName: null,
    ...overrides,
  };
}

function makeWorkflow(overrides: Partial<WorkflowListItem> = {}): WorkflowListItem {
  return {
    id: 'wf-1',
    name: 'Sales Report',
    description: null,
    nodeCount: 1,
    lastRunAt: null,
    lastRunStatus: null,
    createdAt: '2026-03-29T00:00:00Z',
    updatedAt: '2026-03-29T00:00:00Z',
    creatorName: null,
    ...overrides,
  };
}

function makeWorkflowDetail(id: string, paramName: string): WorkflowDetail {
  return {
    id,
    name: id,
    description: null,
    createdAt: '2026-03-29T00:00:00Z',
    updatedAt: '2026-03-29T00:00:00Z',
    edges: [],
    nodes: [
      {
        id: `${id}-node`,
        workflowId: id,
        name: 'SQL',
        description: null,
        type: 'sql',
        config: {
          nodeType: 'sql',
          datasourceId: 'ds-1',
          params: {},
          sql: `select {{params.${paramName}}}`,
          outputVariable: 'result',
        },
        positionX: 0,
        positionY: 0,
      },
    ],
  };
}

describe('ScheduleForm', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  function createWrapper(props: InstanceType<typeof ScheduleForm>['$props'] = {}) {
    return mount(ScheduleForm, {
      props,
      global: {
        plugins: [i18n],
        stubs: globalStubs,
      },
    });
  }

  describe('cron expression building', () => {
    it('should build daily cron expression from time', async () => {
      const wrapper = createWrapper();
      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;

      // Default state: daily, 08:00
      const result = vm.getSubmitInput();
      // name is empty so null is expected without a name set
      // We need to set a name and workflowId to get a result
      expect(result).toBeNull();
    });

    it('should build daily cron expression when form is filled', async () => {
      const wrapper = createWrapper();
      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;

      // Access internal reactive state via the component instance
      // We use the editing prop watcher to populate form
      await wrapper.setProps({
        editing: makeScheduleDetail({
          scheduleType: 'daily',
          cronExpr: '30 8 * * *',
        }),
      });
      await wrapper.vm.$nextTick();

      const result = vm.getSubmitInput();
      expect(result).not.toBeNull();
      expect(result?.scheduleType).toBe('daily');
      // parseCronToFriendly pads to "08:30", so buildCronExpr produces "30 08 * * *"
      expect(result?.cronExpr).toBe('30 08 * * *');
    });

    it('should build weekly cron expression', async () => {
      const wrapper = createWrapper();
      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;

      await wrapper.setProps({
        editing: makeScheduleDetail({
          scheduleType: 'weekly',
          cronExpr: '0 9 * * 1',
        }),
      });
      await wrapper.vm.$nextTick();

      const result = vm.getSubmitInput();
      expect(result).not.toBeNull();
      expect(result?.scheduleType).toBe('weekly');
      // parseCronToFriendly pads to "09:00", so buildCronExpr produces "00 09 * * 1"
      expect(result?.cronExpr).toBe('00 09 * * 1');
    });

    it('should build monthly cron expression', async () => {
      const wrapper = createWrapper();
      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;

      await wrapper.setProps({
        editing: makeScheduleDetail({
          scheduleType: 'monthly',
          cronExpr: '0 10 15 * *',
        }),
      });
      await wrapper.vm.$nextTick();

      const result = vm.getSubmitInput();
      expect(result).not.toBeNull();
      expect(result?.scheduleType).toBe('monthly');
      // parseCronToFriendly pads to "10:00", so buildCronExpr produces "00 10 15 * *"
      expect(result?.cronExpr).toBe('00 10 15 * *');
    });

    it('should use raw cron expression in cron mode', async () => {
      const wrapper = createWrapper();
      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;

      await wrapper.setProps({
        editing: makeScheduleDetail({
          scheduleType: 'cron',
          cronExpr: '*/5 * * * *',
        }),
      });
      await wrapper.vm.$nextTick();

      const result = vm.getSubmitInput();
      expect(result).not.toBeNull();
      expect(result?.scheduleType).toBe('cron');
      expect(result?.cronExpr).toBe('*/5 * * * *');
    });

    it('should handle multiple weekdays in weekly cron expression', async () => {
      const wrapper = createWrapper();
      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;

      await wrapper.setProps({
        editing: makeScheduleDetail({
          scheduleType: 'weekly',
          cronExpr: '0 9 * * 1,3,5',
        }),
      });
      await wrapper.vm.$nextTick();

      const result = vm.getSubmitInput();
      expect(result).not.toBeNull();
      expect(result?.scheduleType).toBe('weekly');
      // parseCronToFriendly pads to "09:00", so buildCronExpr produces "00 09 * * 1,3,5"
      expect(result?.cronExpr).toBe('00 09 * * 1,3,5');
    });
  });

  describe('initial defaults', () => {
    it('preselects workflow by workflowName after workflows load', async () => {
      const wrapper = createWrapper({
        editing: null,
        initial: {
          name: 'Morning Sales',
          workflowName: 'Sales',
        },
      });

      const workflowStore = useWorkflowStore();
      workflowStore.workflows = [
        makeWorkflow({ id: 'wf-finance', name: 'Finance Rollup' }),
        makeWorkflow({ id: 'wf-sales', name: 'Daily Sales Report' }),
      ];
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;
      const result = vm.getSubmitInput();

      expect(result).not.toBeNull();
      expect(result?.workflowId).toBe('wf-sales');
    });

    it('preselects workflow by workflowQuery name includes match', async () => {
      const wrapper = createWrapper({
        editing: null,
        initial: {
          name: 'Ops Digest',
          workflowQuery: 'ops',
        },
      });

      const workflowStore = useWorkflowStore();
      workflowStore.workflows = [
        makeWorkflow({ id: 'wf-sales', name: 'Daily Sales Report' }),
        makeWorkflow({ id: 'wf-ops', name: 'Nightly Ops Digest' }),
      ];
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;
      const result = vm.getSubmitInput();

      expect(result).not.toBeNull();
      expect(result?.workflowId).toBe('wf-ops');
    });

    it('prefills cron schedule type and expression', async () => {
      const workflowStore = useWorkflowStore();
      workflowStore.workflows = [makeWorkflow()];

      const wrapper = createWrapper({
        editing: null,
        initial: {
          name: 'Cron Sales',
          workflowName: 'Sales',
          scheduleType: 'cron',
          cronExpr: '*/15 * * * *',
        },
      });
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;
      const result = vm.getSubmitInput();

      expect(result).not.toBeNull();
      expect(result?.scheduleType).toBe('cron');
      expect(result?.cronExpr).toBe('*/15 * * * *');
    });

    it('prefills daily time and timezone', async () => {
      const workflowStore = useWorkflowStore();
      workflowStore.workflows = [makeWorkflow()];

      const wrapper = createWrapper({
        editing: null,
        initial: {
          name: 'Tokyo Sales',
          workflowName: 'Sales',
          scheduleType: 'daily',
          time: '09:45',
          timezone: 'Asia/Tokyo',
        },
      });
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;
      const result = vm.getSubmitInput();

      expect(result).not.toBeNull();
      expect(result?.scheduleType).toBe('daily');
      expect(result?.cronExpr).toBe('45 09 * * *');
      expect(result?.timezone).toBe('Asia/Tokyo');
    });

    it('returns enabled false from initial create submit input', async () => {
      const workflowStore = useWorkflowStore();
      workflowStore.workflows = [makeWorkflow()];

      const wrapper = createWrapper({
        editing: null,
        initial: {
          name: 'Disabled Sales',
          workflowName: 'Sales',
          enabled: false,
        },
      });
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;
      const result = vm.getSubmitInput();

      expect(result).not.toBeNull();
      expect(result?.enabled).toBe(false);
    });

    it('create still works when no defaults are provided', async () => {
      const workflowStore = useWorkflowStore();
      workflowStore.workflows = [makeWorkflow()];

      const wrapper = createWrapper({ editing: null });
      await wrapper.find('input.el-input').setValue('Manual Sales');
      await wrapper.find('select.el-select').setValue('wf-1');

      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;
      const result = vm.getSubmitInput();

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Manual Sales');
      expect(result?.workflowId).toBe('wf-1');
      expect(result?.enabled).toBe(true);
    });

    it('does not let stale initial workflow params overwrite manual workflow params', async () => {
      let resolveInitial: (value: WorkflowDetail) => void = () => undefined;
      let resolveManual: (value: WorkflowDetail) => void = () => undefined;

      vi.mocked(getWorkflow).mockImplementation((workflowId: string) => {
        if (workflowId === 'wf-initial') {
          return new Promise<WorkflowDetail>((resolve) => {
            resolveInitial = resolve;
          });
        }
        return new Promise<WorkflowDetail>((resolve) => {
          resolveManual = resolve;
        });
      });

      const workflowStore = useWorkflowStore();
      workflowStore.workflows = [
        makeWorkflow({ id: 'wf-initial', name: 'Initial Sales Report' }),
        makeWorkflow({ id: 'wf-manual', name: 'Manual Sales Report' }),
      ];

      const wrapper = createWrapper({
        editing: null,
        initial: {
          name: 'Race Safe Schedule',
          workflowName: 'Initial',
        },
      });
      await wrapper.vm.$nextTick();

      await wrapper.find('select.el-select').setValue('wf-manual');
      resolveManual(makeWorkflowDetail('wf-manual', 'manualParam'));
      await wrapper.vm.$nextTick();
      await Promise.resolve();

      resolveInitial(makeWorkflowDetail('wf-initial', 'staleParam'));
      await wrapper.vm.$nextTick();
      await Promise.resolve();

      const paramKeys = wrapper.findAll('.schedule-form__param-key').map((node) => node.text());
      expect(paramKeys).toEqual(['manualParam']);
    });
  });

  describe('editing mode', () => {
    it('should populate form from editing prop', async () => {
      const editing = makeScheduleDetail({
        name: 'My Schedule',
        description: 'Test description',
        workflowId: 'wf-42',
        scheduleType: 'daily',
        cronExpr: '0 8 * * *',
        timezone: 'UTC',
        params: { key1: 'val1' },
      });

      const wrapper = createWrapper({ editing });
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;
      const result = vm.getSubmitInput();

      expect(result).not.toBeNull();
      expect(result?.name).toBe('My Schedule');
      expect(result?.workflowId).toBe('wf-42');
      expect(result?.scheduleType).toBe('daily');
      expect(result?.timezone).toBe('UTC');
    });

    it('should include non-empty params in submit input', async () => {
      const editing = makeScheduleDetail({
        name: 'Param Schedule',
        workflowId: 'wf-1',
        scheduleType: 'daily',
        cronExpr: '0 8 * * *',
        params: { startDate: '2026-01-01', endDate: '' },
      });

      const wrapper = createWrapper({ editing });
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;
      const result = vm.getSubmitInput();

      expect(result).not.toBeNull();
      // Only non-empty params should be included
      expect(result?.params).toEqual({ startDate: '2026-01-01' });
    });

    it('does not let stale edit workflow params overwrite manual workflow params', async () => {
      let resolveEdit: (value: WorkflowDetail) => void = () => undefined;
      let resolveManual: (value: WorkflowDetail) => void = () => undefined;

      vi.mocked(getWorkflow).mockImplementation((workflowId: string) => {
        if (workflowId === 'wf-edit') {
          return new Promise<WorkflowDetail>((resolve) => {
            resolveEdit = resolve;
          });
        }
        return new Promise<WorkflowDetail>((resolve) => {
          resolveManual = resolve;
        });
      });

      const workflowStore = useWorkflowStore();
      workflowStore.workflows = [
        makeWorkflow({ id: 'wf-edit', name: 'Edit Sales Report' }),
        makeWorkflow({ id: 'wf-manual', name: 'Manual Sales Report' }),
      ];

      const wrapper = createWrapper({
        editing: makeScheduleDetail({
          workflowId: 'wf-edit',
          workflowName: 'Edit Sales Report',
        }),
      });
      await wrapper.vm.$nextTick();

      await wrapper.find('select.el-select').setValue('wf-manual');
      resolveManual(makeWorkflowDetail('wf-manual', 'manualParam'));
      await wrapper.vm.$nextTick();
      await Promise.resolve();

      resolveEdit(makeWorkflowDetail('wf-edit', 'staleEditParam'));
      await wrapper.vm.$nextTick();
      await Promise.resolve();

      const paramKeys = wrapper.findAll('.schedule-form__param-key').map((node) => node.text());
      expect(paramKeys).toEqual(['manualParam']);
    });

    it('should return null when name is empty', async () => {
      const editing = makeScheduleDetail({
        name: '',
        workflowId: 'wf-1',
        cronExpr: '0 8 * * *',
      });

      const wrapper = createWrapper({ editing });
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;
      const result = vm.getSubmitInput();

      expect(result).toBeNull();
    });

    it('should return null when workflowId is empty', async () => {
      const editing = makeScheduleDetail({
        name: 'Test',
        workflowId: '',
        cronExpr: '0 8 * * *',
      });

      const wrapper = createWrapper({ editing });
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;
      const result = vm.getSubmitInput();

      expect(result).toBeNull();
    });

    it('should reset form when editing prop becomes null', async () => {
      const editing = makeScheduleDetail();

      const wrapper = createWrapper({ editing });
      await wrapper.vm.$nextTick();

      await wrapper.setProps({ editing: null });
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;
      const result = vm.getSubmitInput();
      // After reset, name and workflowId are empty → null
      expect(result).toBeNull();
    });
  });

  describe('schedule type tabs rendering', () => {
    it('should render schedule type buttons', () => {
      const wrapper = createWrapper();
      const buttons = wrapper.findAll('.schedule-form__type-tab');
      expect(buttons.length).toBe(4);
    });

    it('should mark daily as active by default', () => {
      const wrapper = createWrapper();
      const activeButtons = wrapper.findAll('.schedule-form__type-tab--active');
      expect(activeButtons.length).toBe(1);
      expect(activeButtons[0].text()).toContain(zhCN.schedule.daily);
    });

    it('should change active schedule type on button click', async () => {
      const wrapper = createWrapper();
      const buttons = wrapper.findAll('.schedule-form__type-tab');

      // Click on "weekly" tab (index 1)
      await buttons[1].trigger('click');
      await wrapper.vm.$nextTick();

      const activeButtons = wrapper.findAll('.schedule-form__type-tab--active');
      expect(activeButtons.length).toBe(1);
      expect(activeButtons[0].text()).toContain(zhCN.schedule.weekly);
    });

    it('should show cron input when cron type is selected', async () => {
      const wrapper = createWrapper();
      const buttons = wrapper.findAll('.schedule-form__type-tab');

      // Click on "cron" tab (index 3)
      await buttons[3].trigger('click');
      await wrapper.vm.$nextTick();

      // CronPreview stub should be present
      expect(wrapper.find('.cron-preview-stub').exists()).toBe(true);
    });

    it('should show weekday buttons when weekly type is selected', async () => {
      const wrapper = createWrapper();
      const buttons = wrapper.findAll('.schedule-form__type-tab');

      // Click on "weekly" tab (index 1)
      await buttons[1].trigger('click');
      await wrapper.vm.$nextTick();

      const weekdayButtons = wrapper.findAll('.schedule-form__weekday-btn');
      expect(weekdayButtons.length).toBe(7);
    });
  });

  describe('getSubmitInput enabled flag', () => {
    it('should include enabled: true in submit input', async () => {
      const wrapper = createWrapper({
        editing: makeScheduleDetail({ enabled: true }),
      });
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;
      const result = vm.getSubmitInput();

      expect(result).not.toBeNull();
      expect(result?.enabled).toBe(true);
    });

    it('should preserve enabled false from editing schedule', async () => {
      const wrapper = createWrapper({
        editing: makeScheduleDetail({ enabled: false }),
      });
      await wrapper.vm.$nextTick();

      const vm = wrapper.vm as InstanceType<typeof ScheduleForm>;
      const result = vm.getSubmitInput();

      expect(result).not.toBeNull();
      expect(result?.enabled).toBe(false);
    });
  });

  describe('workflowStore integration', () => {
    it('should access workflow store', () => {
      const wrapper = createWrapper();
      const store = useWorkflowStore();
      // Store should be accessible and empty by default
      expect(store.workflows).toEqual([]);
      expect(wrapper.exists()).toBe(true);
    });
  });
});
