import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ActionCard from '@/components/chat/ActionCard.vue';
import type { ChatActionCard } from '@/types/actionCard';
import enUS from '@/locales/en-US';
import zhCN from '@/locales/zh-CN';

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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders card title and summary', () => {
    const wrapper = mount(ActionCard, {
      props: { card: makeCard() },
      global: { plugins: [i18n], stubs: { teleport: true } },
    });
    expect(wrapper.text()).toContain('Open Data Management');
    expect(wrapper.text()).toContain('Navigate to data management page.');
  });

  it('shows confirm button for medium risk cards', () => {
    const card = makeCard({
      payload: { ...makeCard().payload, riskLevel: 'medium', confirmRequired: true },
    });
    const wrapper = mount(ActionCard, {
      props: { card },
      global: { plugins: [i18n], stubs: { teleport: true } },
    });
    expect(wrapper.text()).toContain('Confirm');
  });

  it('shows danger confirmation for danger risk cards', () => {
    const card = makeCard({
      payload: { ...makeCard().payload, riskLevel: 'danger', confirmRequired: true },
    });
    const wrapper = mount(ActionCard, {
      props: { card },
      global: { plugins: [i18n], stubs: { teleport: true } },
    });
    expect(wrapper.text()).toContain('Dangerous Action');
  });

  it('shows succeeded status when completed', () => {
    const card = makeCard({ status: 'succeeded', resultSummary: 'Opened successfully' });
    const wrapper = mount(ActionCard, {
      props: { card },
      global: { plugins: [i18n], stubs: { teleport: true } },
    });
    expect(wrapper.text()).toContain('Completed');
    expect(wrapper.text()).toContain('Opened successfully');
  });

  it('shows failed status with error', () => {
    const card = makeCard({ status: 'failed', error: 'Connection failed' });
    const wrapper = mount(ActionCard, {
      props: { card },
      global: { plugins: [i18n], stubs: { teleport: true } },
    });
    expect(wrapper.text()).toContain('Failed');
  });

  it('shows copilot prompt when present', () => {
    const card = makeCard({
      payload: { ...makeCard().payload, copilotPrompt: 'Build a sales report' },
    });
    const wrapper = mount(ActionCard, {
      props: { card },
      global: { plugins: [i18n], stubs: { teleport: true } },
    });
    expect(wrapper.text()).toContain('Build a sales report');
  });

  it('shows editing status label when card is in editing state', () => {
    const card = makeCard({ status: 'editing' });
    const wrapper = mount(ActionCard, {
      props: { card },
      global: { plugins: [i18n], stubs: { teleport: true } },
    });
    expect(wrapper.text()).toContain('Editing');
  });
});
