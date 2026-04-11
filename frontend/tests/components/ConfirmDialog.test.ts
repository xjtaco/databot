import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
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

describe('ConfirmDialog', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    wrapper?.unmount();
    vi.restoreAllMocks();
  });

  function createWrapper(
    props: {
      visible?: boolean;
      title?: string;
      message?: string;
      type?: 'warning' | 'danger' | 'info';
      confirmText?: string;
      cancelText?: string;
      loading?: boolean;
    } = {}
  ) {
    const defaultProps = {
      visible: true,
      title: 'Test Title',
      message: 'Test message',
      ...props,
    };

    return mount(ConfirmDialog, {
      props: defaultProps,
      global: {
        plugins: [i18n],
        stubs: {
          'el-dialog': {
            template: `
              <div class="el-dialog-stub" v-if="modelValue">
                <slot />
                <slot name="footer" />
              </div>
            `,
            props: ['modelValue', 'showClose', 'closeOnClickModal', 'width', 'class'],
          },
          'el-button': {
            template: `
              <button
                class="el-button-stub"
                :class="{ 'is-loading': loading }"
                :data-type="type"
                :disabled="loading"
                @click="$emit('click')"
              >
                <slot />
              </button>
            `,
            props: ['type', 'loading'],
          },
          'el-icon': {
            template: '<span class="el-icon-stub"><slot /></span>',
            props: ['size'],
          },
        },
      },
    });
  }

  it('should render dialog when visible', () => {
    wrapper = createWrapper({ visible: true });

    expect(wrapper.find('.el-dialog-stub').exists()).toBe(true);
  });

  it('should not render dialog when not visible', () => {
    wrapper = createWrapper({ visible: false });

    expect(wrapper.find('.el-dialog-stub').exists()).toBe(false);
  });

  it('should display title correctly', () => {
    wrapper = createWrapper({ title: 'Custom Title' });

    expect(wrapper.find('.confirm-title').text()).toBe('Custom Title');
  });

  it('should display message correctly', () => {
    wrapper = createWrapper({ message: 'Custom message' });

    expect(wrapper.find('.confirm-message').text()).toBe('Custom message');
  });

  it('should show warning icon class by default', () => {
    wrapper = createWrapper({});

    expect(wrapper.find('.confirm-icon.icon-warning').exists()).toBe(true);
  });

  it('should show danger icon class when type is danger', () => {
    wrapper = createWrapper({ type: 'danger' });

    expect(wrapper.find('.confirm-icon.icon-danger').exists()).toBe(true);
  });

  it('should show info icon class when type is info', () => {
    wrapper = createWrapper({ type: 'info' });

    expect(wrapper.find('.confirm-icon.icon-info').exists()).toBe(true);
  });

  it('should use danger button type when dialog type is danger', () => {
    wrapper = createWrapper({ type: 'danger' });

    const confirmButton = wrapper.findAll('.el-button-stub')[1];
    expect(confirmButton.attributes('data-type')).toBe('danger');
  });

  it('should use primary button type when dialog type is warning', () => {
    wrapper = createWrapper({ type: 'warning' });

    const confirmButton = wrapper.findAll('.el-button-stub')[1];
    expect(confirmButton.attributes('data-type')).toBe('primary');
  });

  it('should display custom confirm text', () => {
    wrapper = createWrapper({ confirmText: 'Yes, delete' });

    const confirmButton = wrapper.findAll('.el-button-stub')[1];
    expect(confirmButton.text()).toBe('Yes, delete');
  });

  it('should display custom cancel text', () => {
    wrapper = createWrapper({ cancelText: 'No, go back' });

    const cancelButton = wrapper.findAll('.el-button-stub')[0];
    expect(cancelButton.text()).toBe('No, go back');
  });

  it('should display default confirm text from i18n', () => {
    wrapper = createWrapper({});

    const confirmButton = wrapper.findAll('.el-button-stub')[1];
    expect(confirmButton.text()).toBe(zhCN.common.confirm);
  });

  it('should display default cancel text from i18n', () => {
    wrapper = createWrapper({});

    const cancelButton = wrapper.findAll('.el-button-stub')[0];
    expect(cancelButton.text()).toBe(zhCN.common.cancel);
  });

  it('should emit confirm event when confirm button clicked', async () => {
    wrapper = createWrapper({});

    const confirmButton = wrapper.findAll('.el-button-stub')[1];
    await confirmButton.trigger('click');

    expect(wrapper.emitted('confirm')).toBeTruthy();
    expect(wrapper.emitted('confirm')!.length).toBeGreaterThanOrEqual(1);
  });

  it('should emit cancel and update:visible events when cancel button clicked', async () => {
    wrapper = createWrapper({});

    const cancelButton = wrapper.findAll('.el-button-stub')[0];
    await cancelButton.trigger('click');

    expect(wrapper.emitted('cancel')).toBeTruthy();
    expect(wrapper.emitted('update:visible')).toBeTruthy();
    expect(wrapper.emitted('update:visible')![0]).toEqual([false]);
  });

  it('should show loading state on confirm button', () => {
    wrapper = createWrapper({ loading: true });

    const confirmButton = wrapper.findAll('.el-button-stub')[1];
    expect(confirmButton.classes()).toContain('is-loading');
    expect(confirmButton.attributes('disabled')).toBeDefined();
  });

  it('should handle Escape key to cancel', async () => {
    wrapper = createWrapper({});

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);

    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('should handle Enter key to confirm', async () => {
    wrapper = createWrapper({ loading: false });

    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    document.dispatchEvent(event);

    expect(wrapper.emitted('confirm')).toBeTruthy();
  });

  it('should not handle Enter key when loading', async () => {
    wrapper = createWrapper({ loading: true });

    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    document.dispatchEvent(event);

    expect(wrapper.emitted('confirm')).toBeFalsy();
  });

  it('should not handle keyboard events when not visible', async () => {
    wrapper = createWrapper({ visible: false });

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    document.dispatchEvent(escEvent);
    document.dispatchEvent(enterEvent);

    expect(wrapper.emitted('cancel')).toBeFalsy();
    expect(wrapper.emitted('confirm')).toBeFalsy();
  });

  it('should have correct layout structure', () => {
    wrapper = createWrapper({});

    expect(wrapper.find('.confirm-content').exists()).toBe(true);
    expect(wrapper.find('.confirm-icon').exists()).toBe(true);
    expect(wrapper.find('.confirm-text').exists()).toBe(true);
    expect(wrapper.find('.confirm-title').exists()).toBe(true);
    expect(wrapper.find('.confirm-message').exists()).toBe(true);
  });
});
