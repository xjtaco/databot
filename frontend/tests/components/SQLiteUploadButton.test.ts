import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import SQLiteUploadButton from '@/components/sidebar/SQLiteUploadButton.vue';
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

describe('SQLiteUploadButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  function createWrapper() {
    return mount(SQLiteUploadButton, {
      global: {
        plugins: [i18n],
        stubs: {
          'el-icon': true,
        },
      },
    });
  }

  describe('rendering', () => {
    it('should render upload button', () => {
      const wrapper = createWrapper();

      expect(wrapper.find('.sqlite-upload-button').exists()).toBe(true);
      expect(wrapper.find('.icon-button').exists()).toBe(true);
    });

    it('should have hidden file input', () => {
      const wrapper = createWrapper();

      const input = wrapper.find('input[type="file"]');
      expect(input.exists()).toBe(true);
      expect(input.classes()).toContain('sqlite-upload-button__input');
    });

    it('should accept .db, .sqlite, .sqlite3 files', () => {
      const wrapper = createWrapper();

      const input = wrapper.find('input[type="file"]');
      expect(input.attributes('accept')).toBe('.db,.sqlite,.sqlite3');
    });
  });

  describe('file validation', () => {
    it('should accept .db files', async () => {
      const store = useDatafileStore();
      const uploadSpy = vi.spyOn(store, 'uploadSqliteFile').mockResolvedValue({
        datasourceId: '550e8400-e29b-41d4-a716-446655440001',
        databaseName: 'test',
        tableIds: ['550e8400-e29b-41d4-a716-446655440002'],
      });

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.db', { type: 'application/x-sqlite3' });
      Object.defineProperty(input.element, 'files', { value: [file], writable: false });

      await input.trigger('change');
      await flushPromises();

      expect(uploadSpy).toHaveBeenCalledWith(file);
    });

    it('should accept .sqlite files', async () => {
      const store = useDatafileStore();
      const uploadSpy = vi.spyOn(store, 'uploadSqliteFile').mockResolvedValue({
        datasourceId: '550e8400-e29b-41d4-a716-446655440001',
        databaseName: 'test',
        tableIds: ['550e8400-e29b-41d4-a716-446655440002'],
      });

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.sqlite', { type: 'application/x-sqlite3' });
      Object.defineProperty(input.element, 'files', { value: [file], writable: false });

      await input.trigger('change');
      await flushPromises();

      expect(uploadSpy).toHaveBeenCalledWith(file);
    });

    it('should accept .sqlite3 files', async () => {
      const store = useDatafileStore();
      const uploadSpy = vi.spyOn(store, 'uploadSqliteFile').mockResolvedValue({
        datasourceId: '550e8400-e29b-41d4-a716-446655440001',
        databaseName: 'test',
        tableIds: ['550e8400-e29b-41d4-a716-446655440002'],
      });

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.sqlite3', { type: 'application/x-sqlite3' });
      Object.defineProperty(input.element, 'files', { value: [file], writable: false });

      await input.trigger('change');
      await flushPromises();

      expect(uploadSpy).toHaveBeenCalledWith(file);
    });

    it('should reject invalid file types', async () => {
      const { ElMessage } = await import('element-plus');
      const store = useDatafileStore();
      const uploadSpy = vi.spyOn(store, 'uploadSqliteFile');

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      Object.defineProperty(input.element, 'files', { value: [file], writable: false });

      await input.trigger('change');
      await flushPromises();

      expect(uploadSpy).not.toHaveBeenCalled();
      expect(ElMessage.error).toHaveBeenCalled();
    });

    it('should show error message for invalid type', async () => {
      const { ElMessage } = await import('element-plus');

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'database.csv', { type: 'text/csv' });
      Object.defineProperty(input.element, 'files', { value: [file], writable: false });

      await input.trigger('change');
      await flushPromises();

      expect(ElMessage.error).toHaveBeenCalledWith(zhCN.sidebar.invalidSqliteFileType);
    });
  });

  describe('upload flow', () => {
    it('should call uploadSqliteFile on valid file', async () => {
      const store = useDatafileStore();
      const uploadSpy = vi.spyOn(store, 'uploadSqliteFile').mockResolvedValue({
        datasourceId: '550e8400-e29b-41d4-a716-446655440001',
        databaseName: 'test',
        tableIds: ['550e8400-e29b-41d4-a716-446655440002'],
      });

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.db', { type: 'application/x-sqlite3' });
      Object.defineProperty(input.element, 'files', { value: [file], writable: false });

      await input.trigger('change');
      await flushPromises();

      expect(uploadSpy).toHaveBeenCalledWith(file);
    });

    it('should show success message on upload success', async () => {
      const { ElMessage } = await import('element-plus');
      const store = useDatafileStore();
      vi.spyOn(store, 'uploadSqliteFile').mockResolvedValue({
        datasourceId: '550e8400-e29b-41d4-a716-446655440001',
        databaseName: 'test',
        tableIds: ['550e8400-e29b-41d4-a716-446655440002'],
      });

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.db', { type: 'application/x-sqlite3' });
      Object.defineProperty(input.element, 'files', { value: [file], writable: false });

      await input.trigger('change');
      await flushPromises();

      expect(ElMessage.success).toHaveBeenCalledWith(zhCN.sidebar.uploadSqliteSuccess);
    });

    it('should show error message on upload failure', async () => {
      const { ElMessage } = await import('element-plus');
      const store = useDatafileStore();
      vi.spyOn(store, 'uploadSqliteFile').mockRejectedValue(new Error('Upload failed'));

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.db', { type: 'application/x-sqlite3' });
      Object.defineProperty(input.element, 'files', { value: [file], writable: false });

      await input.trigger('change');
      await flushPromises();

      expect(ElMessage.error).toHaveBeenCalledWith(zhCN.sidebar.uploadSqliteFailed);
    });

    it('should reset file input after upload', async () => {
      const store = useDatafileStore();
      vi.spyOn(store, 'uploadSqliteFile').mockResolvedValue({
        datasourceId: '550e8400-e29b-41d4-a716-446655440001',
        databaseName: 'test',
        tableIds: ['550e8400-e29b-41d4-a716-446655440002'],
      });

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');
      const inputElement = input.element as HTMLInputElement;

      const file = new File(['content'], 'test.db', { type: 'application/x-sqlite3' });
      Object.defineProperty(inputElement, 'files', { value: [file], writable: false });

      // Track value reset
      let inputValue = 'test.db';
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

  describe('loading state', () => {
    it('should disable button during upload', async () => {
      const store = useDatafileStore();
      let resolveUpload: (value: {
        datasourceId: string;
        databaseName: string;
        tableIds: string[];
      }) => void;
      vi.spyOn(store, 'uploadSqliteFile').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpload = resolve;
          })
      );

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.db', { type: 'application/x-sqlite3' });
      Object.defineProperty(input.element, 'files', { value: [file], writable: false });

      await input.trigger('change');

      // During upload, button should be disabled
      expect(wrapper.find('.icon-button').attributes('disabled')).toBeDefined();

      // Resolve the upload
      resolveUpload!({
        datasourceId: '550e8400-e29b-41d4-a716-446655440001',
        databaseName: 'test',
        tableIds: ['550e8400-e29b-41d4-a716-446655440002'],
      });
      await flushPromises();

      // After upload, button should be enabled
      expect(wrapper.find('.icon-button').attributes('disabled')).toBeUndefined();
    });

    it('should show loading icon during upload', async () => {
      const store = useDatafileStore();
      let resolveUpload: (value: {
        datasourceId: string;
        databaseName: string;
        tableIds: string[];
      }) => void;
      vi.spyOn(store, 'uploadSqliteFile').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpload = resolve;
          })
      );

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.db', { type: 'application/x-sqlite3' });
      Object.defineProperty(input.element, 'files', { value: [file], writable: false });

      await input.trigger('change');

      // During upload, should show loading icon
      expect(wrapper.find('.is-loading').exists()).toBe(true);

      resolveUpload!({
        datasourceId: '550e8400-e29b-41d4-a716-446655440001',
        databaseName: 'test',
        tableIds: ['550e8400-e29b-41d4-a716-446655440002'],
      });
      await flushPromises();

      // After upload, loading icon should be gone
      expect(wrapper.find('.is-loading').exists()).toBe(false);
    });

    it('should show uploading tooltip during upload', async () => {
      const store = useDatafileStore();
      let resolveUpload: (value: {
        datasourceId: string;
        databaseName: string;
        tableIds: string[];
      }) => void;
      vi.spyOn(store, 'uploadSqliteFile').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpload = resolve;
          })
      );

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.db', { type: 'application/x-sqlite3' });
      Object.defineProperty(input.element, 'files', { value: [file], writable: false });

      await input.trigger('change');

      expect(wrapper.find('.icon-button').attributes('title')).toBe(zhCN.sidebar.uploading);

      resolveUpload!({
        datasourceId: '550e8400-e29b-41d4-a716-446655440001',
        databaseName: 'test',
        tableIds: ['550e8400-e29b-41d4-a716-446655440002'],
      });
      await flushPromises();

      expect(wrapper.find('.icon-button').attributes('title')).toBe(
        zhCN.sidebar.uploadSqliteTooltip
      );
    });

    it('should restore button after upload completes', async () => {
      const store = useDatafileStore();
      vi.spyOn(store, 'uploadSqliteFile').mockResolvedValue({
        datasourceId: '550e8400-e29b-41d4-a716-446655440001',
        databaseName: 'test',
        tableIds: ['550e8400-e29b-41d4-a716-446655440002'],
      });

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.db', { type: 'application/x-sqlite3' });
      Object.defineProperty(input.element, 'files', { value: [file], writable: false });

      await input.trigger('change');
      await flushPromises();

      // After upload completes
      expect(wrapper.find('.icon-button').attributes('disabled')).toBeUndefined();
      expect(wrapper.find('.is-loading').exists()).toBe(false);
    });

    it('should restore button after upload error', async () => {
      const store = useDatafileStore();
      vi.spyOn(store, 'uploadSqliteFile').mockRejectedValue(new Error('Upload failed'));

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      const file = new File(['content'], 'test.db', { type: 'application/x-sqlite3' });
      Object.defineProperty(input.element, 'files', { value: [file], writable: false });

      await input.trigger('change');
      await flushPromises();

      // After error, button should be restored
      expect(wrapper.find('.icon-button').attributes('disabled')).toBeUndefined();
      expect(wrapper.find('.is-loading').exists()).toBe(false);
    });
  });

  describe('file input trigger', () => {
    it('should trigger file input click when button is clicked', async () => {
      const wrapper = createWrapper();

      const input = wrapper.find('input[type="file"]');
      const clickSpy = vi.fn();
      (input.element as HTMLInputElement).click = clickSpy;

      await wrapper.find('.icon-button').trigger('click');

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('no file selected', () => {
    it('should do nothing when no file is selected', async () => {
      const store = useDatafileStore();
      const uploadSpy = vi.spyOn(store, 'uploadSqliteFile');

      const wrapper = createWrapper();
      const input = wrapper.find('input[type="file"]');

      Object.defineProperty(input.element, 'files', { value: [], writable: false });

      await input.trigger('change');
      await flushPromises();

      expect(uploadSpy).not.toHaveBeenCalled();
    });
  });
});
