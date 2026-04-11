import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import LoginPage from '@/components/auth/LoginPage.vue';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
    }),
  };
});

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  getProfile: vi.fn(),
}));

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
  UserIcon: iconStub,
  LockIcon: iconStub,
  ElForm: {
    template: '<form class="el-form-stub"><slot /></form>',
    props: ['model', 'rules'],
    methods: { validate: () => Promise.resolve(true) },
  },
  ElFormItem: {
    template: '<div class="el-form-item-stub"><slot /></div>',
    props: ['prop'],
  },
  ElInput: {
    template: '<input class="el-input-stub" />',
    props: ['modelValue', 'placeholder', 'prefixIcon', 'size', 'type', 'showPassword'],
  },
  ElButton: {
    template: '<button class="el-button-stub"><slot /></button>',
    props: ['type', 'size', 'loading'],
  },
};

describe('LoginPage', () => {
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

  function createWrapper() {
    return mount(LoginPage, {
      global: {
        plugins: [i18n, pinia],
        stubs: defaultStubs,
      },
    });
  }

  it('renders the login form with title and logo', () => {
    wrapper = createWrapper();
    expect(wrapper.find('.login-card__header').exists()).toBe(true);
    expect(wrapper.find('.login-card__logo').exists()).toBe(true);
    expect(wrapper.find('.login-card__title').text()).toBe('DataBot');
  });

  it('renders username and password input fields', () => {
    wrapper = createWrapper();
    const formItems = wrapper.findAll('.el-form-item-stub');
    expect(formItems.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the login button with i18n text', () => {
    wrapper = createWrapper();
    const button = wrapper.find('.el-button-stub');
    expect(button.exists()).toBe(true);
    // The button text should come from i18n auth.loginButton
    expect(button.text()).toBe(zhCN.auth.loginButton);
  });

  it('does not show error message initially', () => {
    wrapper = createWrapper();
    expect(wrapper.find('.login-card__error').exists()).toBe(false);
  });
});
