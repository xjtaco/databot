import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, h, nextTick } from 'vue';
import ActionCard from '@/components/chat/ActionCard.vue';
import type { ChatActionCard } from '@/types/actionCard';
import enUS from '@/locales/en-US';
import zhCN from '@/locales/zh-CN';

const {
  executeActionMock,
  inlineCreateMock,
  listFolderTreeMock,
  knowledgeApiMock,
  createDatasourceMock,
  datafileApiMock,
} = vi.hoisted(() => ({
  executeActionMock: vi.fn(),
  inlineCreateMock: vi.fn(),
  listFolderTreeMock: vi.fn(),
  knowledgeApiMock: vi.fn(),
  createDatasourceMock: vi.fn(),
  datafileApiMock: vi.fn(),
}));

vi.mock('@/components/chat/actionCards', () => ({
  executeAction: executeActionMock,
}));

vi.mock('@/api/knowledge', () => ({
  listFolderTree: listFolderTreeMock,
  createFolder: inlineCreateMock,
  deleteFolder: knowledgeApiMock,
  updateFolder: knowledgeApiMock,
  uploadFiles: knowledgeApiMock,
  moveFile: knowledgeApiMock,
  deleteFile: knowledgeApiMock,
}));

vi.mock('@/api/datasource', () => ({
  createDatasource: createDatasourceMock,
  testConnection: datafileApiMock,
  updateDatasource: datafileApiMock,
  deleteDatasource: datafileApiMock,
}));

vi.mock('@/api/datafile', () => ({
  uploadFile: datafileApiMock,
  uploadSqliteFile: datafileApiMock,
  listTables: datafileApiMock,
  listDatasources: datafileApiMock,
  getTable: datafileApiMock,
  getDictionaryContent: datafileApiMock,
  updateTable: datafileApiMock,
  deleteTable: datafileApiMock,
  deleteDatasource: datafileApiMock,
  getTablePreview: datafileApiMock,
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: enUS, 'zh-CN': zhCN },
});

function makeCard(overrides?: Partial<ChatActionCard>): ChatActionCard {
  return {
    id: 'card-1',
    payload: {
      id: 'card-1',
      cardId: 'data.open',
      domain: 'data',
      action: 'open',
      title: 'Open Data Management',
      summary: 'Navigate to data management page.',
      params: {},
      riskLevel: 'low',
      confirmRequired: false,
      executionMode: 'frontend',
      targetNav: 'data',
    },
    status: 'proposed',
    ...overrides,
  };
}

describe('ActionCard.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    executeActionMock.mockResolvedValue({ success: true, summary: 'Opened successfully' });
    inlineCreateMock.mockResolvedValue(undefined);
    listFolderTreeMock.mockResolvedValue({ folders: [] });
    knowledgeApiMock.mockResolvedValue(undefined);
    createDatasourceMock.mockResolvedValue({
      datasourceId: 'ds-1',
      databaseName: 'analytics',
      tableIds: [],
    });
    datafileApiMock.mockImplementation((arg?: unknown) => {
      if (arg instanceof File) {
        return Promise.resolve({ tableIds: ['table-1'] });
      }
      return Promise.resolve({ tables: [], datasources: [] });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function mountActionCard(card: ChatActionCard) {
    return mount(ActionCard, {
      props: { card },
      global: {
        plugins: [i18n],
        stubs: {
          teleport: true,
          'el-button': {
            inheritAttrs: false,
            template: `
              <button
                class="el-button-stub"
                :type="nativeType || 'button'"
                :disabled="disabled"
                @click="$emit('click')"
              >
                <slot />
              </button>
            `,
            emits: ['click'],
            props: ['size', 'type', 'nativeType', 'disabled'],
          },
          'el-input': {
            template:
              '<input class="el-input-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
            props: ['modelValue', 'size', 'placeholder'],
          },
          'el-form': defineComponent({
            props: ['labelPosition', 'model', 'rules', 'labelWidth'],
            emits: ['submit'],
            setup(_, { emit, expose, slots }) {
              expose({
                validate: () => Promise.resolve(true),
              });
              return () =>
                h(
                  'form',
                  {
                    onSubmit: (event: Event) => {
                      event.preventDefault();
                      emit('submit');
                    },
                  },
                  slots.default?.()
                );
            },
          }),
          'el-form-item': {
            template: '<label><slot /></label>',
            props: ['label', 'prop'],
          },
          'el-icon': {
            template: '<span><slot /></span>',
          },
          'el-select': {
            template:
              '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
            props: ['modelValue', 'placeholder', 'disabled'],
          },
          'el-option': {
            template: '<option :value="value">{{ label }}</option>',
            props: ['label', 'value'],
          },
          'el-input-number': {
            template:
              '<input type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
            props: ['modelValue', 'min', 'max', 'disabled', 'controlsPosition'],
          },
          'el-radio-group': {
            template: '<div><slot /></div>',
            props: ['modelValue', 'disabled'],
          },
          'el-radio': {
            template: '<label><slot /></label>',
            props: ['value'],
          },
          FolderTreeSelector: {
            template: '<div class="folder-tree-selector-stub"></div>',
            props: ['selectedFolderId', 'folders', 'showRoot'],
          },
          ConfirmDialog: {
            template: `
              <div v-if="visible" class="confirm-dialog-stub">
                <h3>{{ title }}</h3>
                <p>{{ message }}</p>
                <button class="confirm-dialog-close" @click="$emit('update:visible', false)">Close</button>
                <button class="confirm-dialog-cancel" @click="$emit('cancel')">{{ cancelText }}</button>
                <button class="confirm-dialog-confirm" @click="$emit('confirm')">{{ confirmText }}</button>
              </div>
            `,
            props: ['visible', 'title', 'message', 'confirmText', 'cancelText'],
          },
        },
      },
    });
  }

  async function triggerInlineFolderSubmit(wrapper: VueWrapper): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await vi.dynamicImportSettled();
      await nextTick();

      const stubSubmit = wrapper.find('.inline-folder-submit');
      if (stubSubmit.exists()) {
        await stubSubmit.trigger('click');
        return;
      }

      const formButtons = wrapper.findAll('.knowledge-folder-form__actions button');
      if (formButtons[0]) {
        await formButtons[0].trigger('click');
        return;
      }
    }

    throw new Error('Inline folder submit button was not rendered');
  }

  async function triggerDatasourceSubmit(wrapper: VueWrapper): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await vi.dynamicImportSettled();
      await nextTick();

      const formButtons = wrapper.findAll('.form-actions__right button');
      if (formButtons[1]) {
        await formButtons[1].trigger('click');
        return;
      }
    }

    throw new Error('Datasource submit button was not rendered');
  }

  it('renders localized card title and summary from payload keys', () => {
    const card = makeCard({
      payload: {
        ...makeCard().payload,
        title: 'Legacy title',
        summary: 'Legacy summary',
        titleKey: 'chat.actionCards.data.open.title',
        summaryKey: 'chat.actionCards.data.open.summary',
      },
    });
    const wrapper = mountActionCard(card);
    expect(wrapper.text()).toContain('Open data management');
    expect(wrapper.text()).toContain('Go to data source and table management.');
    expect(wrapper.text()).not.toContain('Legacy title');
    expect(wrapper.text()).not.toContain('Legacy summary');
  });

  it('falls back to legacy card title and summary when payload keys are absent', () => {
    const wrapper = mountActionCard(makeCard());
    expect(wrapper.text()).toContain('Open Data Management');
    expect(wrapper.text()).toContain('Navigate to data management page.');
  });

  it('renders card title and summary', () => {
    const wrapper = mountActionCard(makeCard());
    expect(wrapper.text()).toContain('Open Data Management');
    expect(wrapper.text()).toContain('Navigate to data management page.');
  });

  it('shows confirm button for medium risk cards', () => {
    const card = makeCard({
      payload: { ...makeCard().payload, riskLevel: 'medium', confirmRequired: true },
    });
    const wrapper = mountActionCard(card);
    expect(wrapper.text()).toContain('Confirm');
  });

  it('shows danger confirmation for danger risk cards', () => {
    const card = makeCard({
      payload: { ...makeCard().payload, riskLevel: 'danger', confirmRequired: true },
    });
    const wrapper = mountActionCard(card);
    expect(wrapper.text()).toContain('Dangerous Action');
  });

  it('shows succeeded status when completed', () => {
    const card = makeCard({ status: 'succeeded', resultSummary: 'Opened successfully' });
    const wrapper = mountActionCard(card);
    expect(wrapper.text()).toContain('Completed');
    expect(wrapper.text()).toContain('Opened successfully');
  });

  it('shows failed status with error', () => {
    const card = makeCard({ status: 'failed', error: 'Connection failed' });
    const wrapper = mountActionCard(card);
    expect(wrapper.text()).toContain('Failed');
  });

  it('shows copilot prompt when present', () => {
    const card = makeCard({
      payload: { ...makeCard().payload, copilotPrompt: 'Build a sales report' },
    });
    const wrapper = mountActionCard(card);
    expect(wrapper.text()).toContain('Build a sales report');
  });

  it('shows editing status label when card is in editing state', () => {
    const card = makeCard({ status: 'editing' });
    const wrapper = mountActionCard(card);
    expect(wrapper.text()).toContain('Editing');
  });

  it('applies editing CSS class and shows editing label for form-backed cards', async () => {
    const card = makeCard({
      status: 'editing',
      payload: { ...makeCard().payload, domain: 'data', action: 'datasource_create' },
    });
    const wrapper = mountActionCard(card);
    // The editing CSS class should be applied to the root element
    expect(wrapper.classes()).toContain('action-card--editing');
    // The editing status label should be shown
    expect(wrapper.text()).toContain('Editing');
    // The title should have the pencil indicator via CSS ::after pseudo-element
    const title = wrapper.find('.action-card__title');
    expect(title.exists()).toBe(true);
    expect(title.text()).toContain('Open Data Management');
    // Actions should not be shown in editing state (form replaces them)
    expect(wrapper.find('.action-card__actions').exists()).toBe(false);
  });

  it('defers navigation execution until modal confirmation', async () => {
    const card = makeCard({
      payload: {
        ...makeCard().payload,
        presentationMode: 'deferred_navigation',
        confirmationMode: 'modal',
      },
    });
    const wrapper = mountActionCard(card);

    await wrapper.find('.action-card__actions button').trigger('click');

    expect(wrapper.find('.confirm-dialog-stub').exists()).toBe(true);
    expect(wrapper.text()).toContain('Confirm action');
    expect(wrapper.text()).toContain(
      'This action will leave the current chat or create an object. Continue?'
    );
    expect(executeActionMock).not.toHaveBeenCalled();

    await wrapper.find('.confirm-dialog-confirm').trigger('click');

    expect(executeActionMock).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('statusChange')).toEqual([
      ['card-1', 'running'],
      ['card-1', 'succeeded', { resultSummary: 'Opened successfully' }],
    ]);
  });

  it('does not execute deferred navigation when modal is cancelled', async () => {
    const card = makeCard({
      payload: {
        ...makeCard().payload,
        presentationMode: 'deferred_navigation',
        confirmationMode: 'modal',
      },
    });
    const wrapper = mountActionCard(card);

    await wrapper.find('.action-card__actions button').trigger('click');
    await wrapper.find('.confirm-dialog-cancel').trigger('click');

    expect(executeActionMock).not.toHaveBeenCalled();
    expect(wrapper.emitted('statusChange')).toBeUndefined();
  });

  it('does not execute deferred navigation when modal is closed', async () => {
    const card = makeCard({
      payload: {
        ...makeCard().payload,
        presentationMode: 'deferred_navigation',
        confirmationMode: 'modal',
      },
    });
    const wrapper = mountActionCard(card);

    await wrapper.find('.action-card__actions button').trigger('click');
    await wrapper.find('.confirm-dialog-close').trigger('click');

    expect(executeActionMock).not.toHaveBeenCalled();
    expect(wrapper.emitted('statusChange')).toBeUndefined();
    expect(wrapper.find('.confirm-dialog-stub').exists()).toBe(false);
  });

  it('opens modal before modal-confirm inline form submits final create', async () => {
    const card = makeCard({
      status: 'editing',
      payload: {
        ...makeCard().payload,
        domain: 'knowledge',
        action: 'folder_create',
        presentationMode: 'inline_form',
        confirmationMode: 'modal',
        params: { name: 'Research' },
      },
    });
    const wrapper = mountActionCard(card);
    await vi.dynamicImportSettled();

    await triggerInlineFolderSubmit(wrapper);
    await vi.dynamicImportSettled();

    expect(wrapper.find('.confirm-dialog-stub').exists()).toBe(true);
    expect(inlineCreateMock).not.toHaveBeenCalled();
    expect(wrapper.emitted('statusChange')).toBeUndefined();

    await wrapper.find('.confirm-dialog-confirm').trigger('click');
    await vi.dynamicImportSettled();

    expect(inlineCreateMock).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('statusChange')?.[0]?.[1]).toBe('succeeded');
  });

  it('does not submit modal-confirm inline form when modal is cancelled or closed', async () => {
    const card = makeCard({
      status: 'editing',
      payload: {
        ...makeCard().payload,
        domain: 'knowledge',
        action: 'folder_create',
        presentationMode: 'inline_form',
        confirmationMode: 'modal',
        params: { name: 'Research' },
      },
    });
    const wrapper = mountActionCard(card);
    await vi.dynamicImportSettled();

    await triggerInlineFolderSubmit(wrapper);
    await vi.dynamicImportSettled();
    await wrapper.find('.confirm-dialog-cancel').trigger('click');
    await vi.dynamicImportSettled();

    expect(inlineCreateMock).not.toHaveBeenCalled();
    expect(wrapper.emitted('statusChange')).toBeUndefined();
    expect(
      wrapper.find('.inline-folder-submit').exists() ||
        wrapper.find('.knowledge-folder-form').exists()
    ).toBe(true);

    await triggerInlineFolderSubmit(wrapper);
    await vi.dynamicImportSettled();
    await wrapper.find('.confirm-dialog-close').trigger('click');
    await vi.dynamicImportSettled();

    expect(inlineCreateMock).not.toHaveBeenCalled();
    expect(wrapper.emitted('statusChange')).toBeUndefined();
    expect(
      wrapper.find('.inline-folder-submit').exists() ||
        wrapper.find('.knowledge-folder-form').exists()
    ).toBe(true);
  });

  it('opens modal before modal-confirm datasource create submits final create', async () => {
    const card = makeCard({
      status: 'editing',
      payload: {
        ...makeCard().payload,
        domain: 'data',
        action: 'datasource_create',
        presentationMode: 'inline_form',
        confirmationMode: 'modal',
        params: {
          type: 'postgresql',
          host: 'localhost',
          port: 5432,
          database: 'analytics',
          user: 'reporter',
          password: 'secret',
        },
      },
    });
    const wrapper = mountActionCard(card);
    await vi.dynamicImportSettled();

    await triggerDatasourceSubmit(wrapper);
    await vi.dynamicImportSettled();

    expect(wrapper.find('.confirm-dialog-stub').exists()).toBe(true);
    expect(createDatasourceMock).not.toHaveBeenCalled();
    expect(wrapper.emitted('statusChange')).toBeUndefined();

    await wrapper.find('.confirm-dialog-confirm').trigger('click');
    await vi.dynamicImportSettled();

    expect(createDatasourceMock).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('statusChange')?.[0]?.[1]).toBe('succeeded');
  });

  it('submits non-modal datasource create directly', async () => {
    const card = makeCard({
      status: 'editing',
      payload: {
        ...makeCard().payload,
        domain: 'data',
        action: 'datasource_create',
        presentationMode: 'inline_form',
        confirmationMode: 'none',
        params: {
          type: 'postgresql',
          host: 'localhost',
          port: 5432,
          database: 'analytics',
          user: 'reporter',
          password: 'secret',
        },
      },
    });
    const wrapper = mountActionCard(card);
    await vi.dynamicImportSettled();

    await triggerDatasourceSubmit(wrapper);
    await vi.dynamicImportSettled();

    expect(wrapper.find('.confirm-dialog-stub').exists()).toBe(false);
    expect(createDatasourceMock).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('statusChange')?.[0]?.[1]).toBe('succeeded');
  });

  it('submits non-modal inline forms directly', async () => {
    const card = makeCard({
      status: 'editing',
      payload: {
        ...makeCard().payload,
        domain: 'knowledge',
        action: 'folder_create',
        presentationMode: 'inline_form',
        confirmationMode: 'none',
        params: { name: 'Research' },
      },
    });
    const wrapper = mountActionCard(card);
    await vi.dynamicImportSettled();

    await triggerInlineFolderSubmit(wrapper);
    await vi.dynamicImportSettled();

    expect(wrapper.find('.confirm-dialog-stub').exists()).toBe(false);
    expect(inlineCreateMock).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('statusChange')?.[0]?.[1]).toBe('succeeded');
  });
});
