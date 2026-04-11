import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import IconBar from '@/components/sidebar/IconBar.vue';
import type { NavType } from '@/types/sidebar';
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

const iconStub = { template: '<span class="icon-stub"></span>' };
const defaultStubs = {
  Zap: iconStub,
  Database: iconStub,
  MessageSquare: iconStub,
  GitBranch: iconStub,
  LucideSettings: iconStub,
  LucideUsers: iconStub,
  LucideCircleUserRound: iconStub,
  LucideUserPen: iconStub,
  LucideKeyRound: iconStub,
  LucideLogOut: iconStub,
  ElDropdown: { template: '<div class="el-dropdown-stub"><slot /><slot name="dropdown" /></div>' },
  ElDropdownMenu: { template: '<div class="el-dropdown-menu-stub"><slot /></div>' },
  ElDropdownItem: {
    template: '<div class="el-dropdown-item-stub"><slot /></div>',
    props: ['command', 'disabled', 'divided'],
  },
};

describe('IconBar', () => {
  let wrapper: VueWrapper;
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    vi.clearAllMocks();
    pinia = createPinia();
    setActivePinia(pinia);
  });

  afterEach(() => {
    wrapper?.unmount();
    vi.restoreAllMocks();
  });

  function createWrapper(props: { activeNav?: NavType; isMobile?: boolean } = {}) {
    const defaultProps = {
      activeNav: 'chat' as NavType,
      ...props,
    };

    return mount(IconBar, {
      props: defaultProps,
      global: {
        plugins: [i18n, pinia],
        stubs: defaultStubs,
      },
    });
  }

  it('renders the icon bar with logo, separator, nav items, and settings', () => {
    wrapper = createWrapper();
    expect(wrapper.find('.icon-bar__logo').exists()).toBe(true);
    expect(wrapper.find('.icon-bar__separator').exists()).toBe(true);
    expect(wrapper.find('.icon-bar__spacer').exists()).toBe(true);
  });

  it('renders data nav as the first nav item', () => {
    wrapper = createWrapper();
    const navButtons = wrapper.findAll('.icon-bar__item');
    // navButtons: [data, chat, workflow, schedule, lang, user-dropdown-button]
    // (users and settings nav hidden for non-admin)
    expect(navButtons.length).toBe(6);
    // First button should be data (title = '数据管理')
    expect(navButtons[0].attributes('title')).toBe('数据管理');
  });

  it('renders chat nav as the second nav item', () => {
    wrapper = createWrapper();
    const navButtons = wrapper.findAll('.icon-bar__item');
    expect(navButtons[1].attributes('title')).toBe('对话');
  });

  it('renders workflow nav as the third nav item', () => {
    wrapper = createWrapper();
    const navButtons = wrapper.findAll('.icon-bar__item');
    expect(navButtons[2].attributes('title')).toBe('工作流');
    expect(navButtons[2].classes()).not.toContain('is-disabled');
  });

  it('highlights the active nav item', () => {
    wrapper = createWrapper({ activeNav: 'data' });
    const navButtons = wrapper.findAll('.icon-bar__item');
    expect(navButtons[0].classes()).toContain('is-active');
    expect(navButtons[1].classes()).not.toContain('is-active');
  });

  it('highlights chat when chat is active', () => {
    wrapper = createWrapper({ activeNav: 'chat' });
    const navButtons = wrapper.findAll('.icon-bar__item');
    expect(navButtons[0].classes()).not.toContain('is-active');
    expect(navButtons[1].classes()).toContain('is-active');
  });

  it('emits toggle event when a nav item is clicked', async () => {
    wrapper = createWrapper();
    const navButtons = wrapper.findAll('.icon-bar__item');
    // Click data nav (first button)
    await navButtons[0].trigger('click');
    expect(wrapper.emitted('toggle')).toBeTruthy();
    expect(wrapper.emitted('toggle')![0]).toEqual(['data']);
  });

  it('emits toggle event with chat when chat nav is clicked', async () => {
    wrapper = createWrapper();
    const navButtons = wrapper.findAll('.icon-bar__item');
    await navButtons[1].trigger('click');
    expect(wrapper.emitted('toggle')![0]).toEqual(['chat']);
  });

  it('emits toggle with workflow when workflow item is clicked', async () => {
    wrapper = createWrapper();
    const navButtons = wrapper.findAll('.icon-bar__item');
    // Workflow is the 3rd item (index 2)
    await navButtons[2].trigger('click');
    expect(wrapper.emitted('toggle')![0]).toEqual(['workflow']);
  });

  it('renders schedule nav as the fourth nav item', () => {
    wrapper = createWrapper();
    const navButtons = wrapper.findAll('.icon-bar__item');
    expect(navButtons[3].attributes('title')).toBe('定时任务');
    expect(navButtons[3].classes()).not.toContain('is-disabled');
  });

  it('emits toggle with schedule when schedule item is clicked', async () => {
    wrapper = createWrapper();
    const navButtons = wrapper.findAll('.icon-bar__item');
    // Schedule is the 4th item (index 3)
    await navButtons[3].trigger('click');
    expect(wrapper.emitted('toggle')![0]).toEqual(['schedule']);
  });

  it('emits toggle with settings when settings is clicked (admin)', async () => {
    const { useAuthStore } = await import('@/stores');
    const authStore = useAuthStore();
    authStore.user = {
      id: '1',
      username: 'admin',
      name: 'Admin',
      role: 'admin',
      mustChangePassword: false,
    };
    authStore.accessToken = 'token';

    wrapper = createWrapper();
    const navButtons = wrapper.findAll('.icon-bar__item');
    // For admin: [data, chat, workflow, schedule, lang, users, auditLog, settings, user-dropdown-button]
    // Settings is at index 7
    await navButtons[7].trigger('click');
    expect(wrapper.emitted('toggle')![0]).toEqual(['settings']);
  });

  it('applies mobile class when isMobile is true', () => {
    wrapper = createWrapper({ isMobile: true });
    expect(wrapper.find('.icon-bar--mobile').exists()).toBe(true);
  });

  it('does not apply mobile class when isMobile is false', () => {
    wrapper = createWrapper({ isMobile: false });
    expect(wrapper.find('.icon-bar--mobile').exists()).toBe(false);
  });
});
