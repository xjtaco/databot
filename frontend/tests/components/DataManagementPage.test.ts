import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';
import DataManagementPage from '@/components/data-management/DataManagementPage.vue';
import * as datafileApi from '@/api/datafile';
import * as knowledgeApi from '@/api/knowledge';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

vi.mock('@/api/datafile');
vi.mock('@/api/knowledge');
vi.mock('@/api/postgres');

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

const defaultStubs = {
  DataTreeContent: {
    template: '<div class="data-tree-content-stub"></div>',
    props: ['activeTab', 'fileTables', 'datasources', 'folders'],
  },
  TableDetail: {
    template: '<div class="table-detail-stub"></div>',
    props: ['tableId'],
  },
  KnowledgeFileViewer: {
    template: '<div class="knowledge-file-viewer-stub"></div>',
    props: ['fileId', 'fileName'],
  },
  PostgresConnectionDialog: { template: '<div class="postgres-dialog-stub"></div>' },
  ConfirmDialog: { template: '<div class="confirm-dialog-stub"></div>' },
  Database: { template: '<span class="database-icon-stub"></span>' },
  ArrowLeft: { template: '<span class="arrow-left-stub"></span>' },
  Menu: { template: '<span class="menu-icon-stub"></span>' },
  'el-drawer': {
    template: '<div class="el-drawer-stub" v-if="modelValue"><slot name="header" /><slot /></div>',
    props: ['modelValue', 'direction', 'size', 'showClose'],
  },
  ElButton: {
    template: '<button class="el-button-stub" @click="$emit(\'click\')"><slot /></button>',
    props: ['icon', 'text'],
  },
  ElIcon: { template: '<span class="el-icon-stub"><slot /></span>' },
};

describe('DataManagementPage', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
    vi.mocked(datafileApi.listDatasources).mockResolvedValue({ datasources: [] });
    vi.mocked(knowledgeApi.listFolderTree).mockResolvedValue({ folders: [] });
  });

  afterEach(() => {
    wrapper?.unmount();
    vi.restoreAllMocks();
  });

  function createWrapper(props: { isMobile?: boolean } = {}) {
    return mount(DataManagementPage, {
      props,
      global: {
        plugins: [i18n, createPinia()],
        stubs: defaultStubs,
      },
    });
  }

  describe('Desktop layout', () => {
    it('renders tree panel and detail panel side by side', () => {
      wrapper = createWrapper();
      expect(wrapper.find('.data-management__tree-panel').exists()).toBe(true);
      expect(wrapper.find('.data-management__detail-panel').exists()).toBe(true);
    });

    it('shows empty state when no item is selected', () => {
      wrapper = createWrapper();
      expect(wrapper.find('.data-management__empty-state').exists()).toBe(true);
    });

    it('shows tabs in tree header', () => {
      wrapper = createWrapper();
      const tabs = wrapper.findAll('.data-management__tab');
      expect(tabs.length).toBe(2);
    });

    it('renders DataTreeContent component', () => {
      wrapper = createWrapper();
      expect(wrapper.find('.data-tree-content-stub').exists()).toBe(true);
    });

    it('shows TableDetail when a table is selected', async () => {
      wrapper = createWrapper();
      expect(wrapper.find('.table-detail-stub').exists()).toBe(false);

      // Simulate table select via component internals
      const vm = wrapper.vm as unknown as {
        selectedItem: { type: string; id: string } | null;
      };
      vm.selectedItem = { type: 'table', id: 'test-table-id' };
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.table-detail-stub').exists()).toBe(true);
      expect(wrapper.find('.data-management__empty-state').exists()).toBe(false);
    });

    it('shows KnowledgeFileViewer when a knowledge file is selected', async () => {
      wrapper = createWrapper();
      expect(wrapper.find('.knowledge-file-viewer-stub').exists()).toBe(false);

      const vm = wrapper.vm as unknown as {
        selectedItem: { type: string; id: string; name?: string } | null;
      };
      vm.selectedItem = { type: 'knowledgeFile', id: 'test-file-id', name: 'test.md' };
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.knowledge-file-viewer-stub').exists()).toBe(true);
      expect(wrapper.find('.data-management__empty-state').exists()).toBe(false);
    });

    it('returns to empty state when back is triggered from detail', async () => {
      wrapper = createWrapper();

      const vm = wrapper.vm as unknown as {
        selectedItem: { type: string; id: string } | null;
        handleDetailBack: () => void;
      };
      vm.selectedItem = { type: 'table', id: 'test-id' };
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.table-detail-stub').exists()).toBe(true);

      vm.handleDetailBack();
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.data-management__empty-state').exists()).toBe(true);
    });

    it('does not have mobile class', () => {
      wrapper = createWrapper();
      expect(wrapper.find('.data-management--mobile').exists()).toBe(false);
    });
  });

  describe('Mobile layout', () => {
    it('has mobile class', () => {
      wrapper = createWrapper({ isMobile: true });
      expect(wrapper.find('.data-management--mobile').exists()).toBe(true);
    });

    it('shows mobile header with menu button', () => {
      wrapper = createWrapper({ isMobile: true });
      expect(wrapper.find('.data-management__mobile-header').exists()).toBe(true);
      expect(wrapper.find('.data-management__mobile-title').text()).toBe('数据管理');
    });

    it('shows detail panel with empty state on mobile by default', () => {
      wrapper = createWrapper({ isMobile: true });
      expect(wrapper.find('.data-management__detail-panel').exists()).toBe(true);
      expect(wrapper.find('.data-management__empty-state').exists()).toBe(true);
    });

    it('drawer is open by default on mobile', () => {
      wrapper = createWrapper({ isMobile: true });

      const vm = wrapper.vm as unknown as { mobileDrawerOpen: boolean };
      expect(vm.mobileDrawerOpen).toBe(true);
      expect(wrapper.find('.el-drawer-stub').exists()).toBe(true);
    });

    it('closes drawer and shows detail when item is selected on mobile', async () => {
      wrapper = createWrapper({ isMobile: true });

      const vm = wrapper.vm as unknown as {
        mobileDrawerOpen: boolean;
        handleTableSelect: (id: string) => void;
        selectedItem: { type: string; id: string } | null;
      };
      vm.mobileDrawerOpen = true;
      await wrapper.vm.$nextTick();

      vm.handleTableSelect('test-id');
      await wrapper.vm.$nextTick();

      expect(vm.mobileDrawerOpen).toBe(false);
      expect(vm.selectedItem).toEqual({ type: 'table', id: 'test-id' });
    });

    it('emits back event when back button is clicked', async () => {
      wrapper = createWrapper({ isMobile: true });
      const backBtn = wrapper.find('.data-management__mobile-header .el-button-stub');
      await backBtn.trigger('click');
      expect(wrapper.emitted('back')).toBeTruthy();
    });
  });

  describe('Delete confirmation', () => {
    it('shows delete confirmation when handleTableDelete is called', async () => {
      wrapper = createWrapper();

      const vm = wrapper.vm as unknown as {
        handleTableDelete: (id: string) => void;
        showDeleteConfirm: boolean;
        pendingDeleteType: string;
      };
      vm.handleTableDelete('test-id');
      await wrapper.vm.$nextTick();

      expect(vm.showDeleteConfirm).toBe(true);
      expect(vm.pendingDeleteType).toBe('table');
    });

    it('shows delete confirmation for knowledge folder', async () => {
      wrapper = createWrapper();

      const vm = wrapper.vm as unknown as {
        handleKnowledgeFolderDelete: (id: string) => void;
        showDeleteConfirm: boolean;
        pendingDeleteType: string;
      };
      vm.handleKnowledgeFolderDelete('folder-id');
      await wrapper.vm.$nextTick();

      expect(vm.showDeleteConfirm).toBe(true);
      expect(vm.pendingDeleteType).toBe('knowledgeFolder');
    });

    it('shows delete confirmation for knowledge file', async () => {
      wrapper = createWrapper();

      const vm = wrapper.vm as unknown as {
        handleKnowledgeFileDelete: (id: string) => void;
        showDeleteConfirm: boolean;
        pendingDeleteType: string;
      };
      vm.handleKnowledgeFileDelete('file-id');
      await wrapper.vm.$nextTick();

      expect(vm.showDeleteConfirm).toBe(true);
      expect(vm.pendingDeleteType).toBe('knowledgeFile');
    });

    it('cancels delete and resets state', async () => {
      wrapper = createWrapper();

      const vm = wrapper.vm as unknown as {
        showDeleteConfirm: boolean;
        pendingDeleteId: string | null;
        cancelDelete: () => void;
      };
      vm.showDeleteConfirm = true;
      vm.pendingDeleteId = 'test-id';
      vm.cancelDelete();
      await wrapper.vm.$nextTick();

      expect(vm.showDeleteConfirm).toBe(false);
      expect(vm.pendingDeleteId).toBeNull();
    });
  });

  describe('Selection handlers', () => {
    it('handleTableSelect sets selectedItem', async () => {
      wrapper = createWrapper();

      const vm = wrapper.vm as unknown as {
        handleTableSelect: (id: string) => void;
        selectedItem: { type: string; id: string } | null;
      };
      vm.handleTableSelect('table-123');
      await wrapper.vm.$nextTick();

      expect(vm.selectedItem).toEqual({ type: 'table', id: 'table-123' });
    });

    it('handleKnowledgeFileSelect sets selectedItem with name', async () => {
      wrapper = createWrapper();

      const vm = wrapper.vm as unknown as {
        handleKnowledgeFileSelect: (id: string, name: string) => void;
        selectedItem: { type: string; id: string; name?: string } | null;
      };
      vm.handleKnowledgeFileSelect('file-456', 'readme.md');
      await wrapper.vm.$nextTick();

      expect(vm.selectedItem).toEqual({
        type: 'knowledgeFile',
        id: 'file-456',
        name: 'readme.md',
      });
    });
  });
});
