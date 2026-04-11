import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import FileUploadButton from '@/components/sidebar/FileUploadButton.vue';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';
import { useDatafileStore } from '@/stores';

// Mock ElMessage
vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus');
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

describe('FileUploadButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  function createWrapper() {
    return mount(FileUploadButton, {
      global: {
        plugins: [i18n],
        stubs: {
          'el-icon': true,
        },
      },
    });
  }

  it('should render upload button', () => {
    const wrapper = createWrapper();

    expect(wrapper.find('.file-upload-button').exists()).toBe(true);
    expect(wrapper.find('.icon-button').exists()).toBe(true);
  });

  it('should have hidden file input', () => {
    const wrapper = createWrapper();

    const input = wrapper.find('input[type="file"]');
    expect(input.exists()).toBe(true);
    expect(input.classes()).toContain('file-upload-button__input');
    expect(input.attributes('accept')).toBe('.csv,.xls,.xlsx');
  });

  it('should trigger file input click when button is clicked', async () => {
    const wrapper = createWrapper();

    const input = wrapper.find('input[type="file"]');
    const clickSpy = vi.fn();
    (input.element as HTMLInputElement).click = clickSpy;

    await wrapper.find('.icon-button').trigger('click');

    expect(clickSpy).toHaveBeenCalled();
  });

  it('should show tooltip with upload hint', () => {
    const wrapper = createWrapper();

    const button = wrapper.find('.icon-button');
    expect(button.attributes('title')).toBe('上传CSV或Excel文件');
  });

  describe('File upload', () => {
    it('should call uploadFile when valid file is selected', async () => {
      const store = useDatafileStore();
      const uploadFileSpy = vi
        .spyOn(store, 'uploadFile')
        .mockResolvedValue(['550e8400-e29b-41d4-a716-446655440001']);

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.csv', { type: 'text/csv' });
      Object.defineProperty(input.element, 'files', {
        value: [file],
        writable: false,
      });

      await input.trigger('change');
      await flushPromises();

      expect(uploadFileSpy).toHaveBeenCalledWith(file);
    });

    it('should show success message on successful upload', async () => {
      const { ElMessage } = await import('element-plus');
      const store = useDatafileStore();
      vi.spyOn(store, 'uploadFile').mockResolvedValue(['550e8400-e29b-41d4-a716-446655440001']);

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.csv', { type: 'text/csv' });
      Object.defineProperty(input.element, 'files', {
        value: [file],
        writable: false,
      });

      await input.trigger('change');
      await flushPromises();

      expect(ElMessage.success).toHaveBeenCalled();
    });

    it('should show error for invalid file type', async () => {
      const { ElMessage } = await import('element-plus');
      const store = useDatafileStore();
      const uploadFileSpy = vi.spyOn(store, 'uploadFile');

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      Object.defineProperty(input.element, 'files', {
        value: [file],
        writable: false,
      });

      await input.trigger('change');
      await flushPromises();

      expect(ElMessage.error).toHaveBeenCalledWith('请上传CSV或Excel文件');
      expect(uploadFileSpy).not.toHaveBeenCalled();
    });

    it('should handle upload error gracefully', async () => {
      const { ElMessage } = await import('element-plus');
      const store = useDatafileStore();
      vi.spyOn(store, 'uploadFile').mockRejectedValue(new Error('Upload error'));

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.csv', { type: 'text/csv' });
      Object.defineProperty(input.element, 'files', {
        value: [file],
        writable: false,
      });

      await input.trigger('change');
      await flushPromises();

      expect(ElMessage.error).toHaveBeenCalledWith('文件上传失败');
    });
  });

  describe('Loading state', () => {
    it('should disable button during upload', async () => {
      const store = useDatafileStore();
      let resolveUpload: (value: string[]) => void;
      vi.spyOn(store, 'uploadFile').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpload = resolve;
          })
      );

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.csv', { type: 'text/csv' });
      Object.defineProperty(input.element, 'files', {
        value: [file],
        writable: false,
      });

      await input.trigger('change');

      // During upload, button should be disabled
      expect(wrapper.find('.icon-button').attributes('disabled')).toBeDefined();

      // Resolve the upload
      resolveUpload!(['550e8400-e29b-41d4-a716-446655440001']);
      await flushPromises();

      // After upload, button should be enabled
      expect(wrapper.find('.icon-button').attributes('disabled')).toBeUndefined();
    });

    it('should show uploading tooltip during upload', async () => {
      const store = useDatafileStore();
      let resolveUpload: (value: string[]) => void;
      vi.spyOn(store, 'uploadFile').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpload = resolve;
          })
      );

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.csv', { type: 'text/csv' });
      Object.defineProperty(input.element, 'files', {
        value: [file],
        writable: false,
      });

      await input.trigger('change');

      expect(wrapper.find('.icon-button').attributes('title')).toBe('正在上传...');

      resolveUpload!(['550e8400-e29b-41d4-a716-446655440001']);
      await flushPromises();

      expect(wrapper.find('.icon-button').attributes('title')).toBe('上传CSV或Excel文件');
    });
  });

  describe('File input reset', () => {
    it('should reset file input after upload', async () => {
      const store = useDatafileStore();
      vi.spyOn(store, 'uploadFile').mockResolvedValue(['550e8400-e29b-41d4-a716-446655440001']);

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');
      const inputElement = input.element as HTMLInputElement;

      const file = new File(['content'], 'test.csv', { type: 'text/csv' });
      Object.defineProperty(inputElement, 'files', {
        value: [file],
        writable: false,
      });

      // Mock the value setter to track if it was reset
      let inputValue = 'test.csv';
      Object.defineProperty(inputElement, 'value', {
        get: () => inputValue,
        set: (v) => {
          inputValue = v;
        },
      });

      await input.trigger('change');
      await flushPromises();

      expect(inputValue).toBe('');
    });
  });
});
