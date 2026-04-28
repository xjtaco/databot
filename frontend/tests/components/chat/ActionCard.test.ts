import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ActionCard from '@/components/chat/ActionCard.vue';
import type { ChatActionCard } from '@/types/actionCard';
import enUS from '@/locales/en-US';
import zhCN from '@/locales/zh-CN';

const { executeActionMock } = vi.hoisted(() => ({
  executeActionMock: vi.fn(),
}));

vi.mock('@/components/chat/actionCards', () => ({
  executeAction: executeActionMock,
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
    executeActionMock.mockResolvedValue({ success: true, summary: 'Opened successfully' });
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
            template: `
              <button
                class="el-button-stub"
                :type="nativeType"
                :disabled="disabled"
                @click="$emit('click')"
              >
                <slot />
              </button>
            `,
            props: ['size', 'type', 'nativeType', 'disabled'],
          },
          'el-input': {
            template:
              '<input class="el-input-stub" :value="modelValue" @input="$emit(\'update:modelValue\', ($event.target as HTMLInputElement).value)" />',
            props: ['modelValue', 'size', 'placeholder'],
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
});
