import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import KnowledgeFileViewer from '@/components/knowledge/KnowledgeFileViewer.vue';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

const mockGetFileContent = vi.fn();
const mockUpdateFileContent = vi.fn();

vi.mock('@/api/knowledge', () => ({
  getFileContent: (...args: unknown[]) => mockGetFileContent(...args),
  updateFileContent: (...args: unknown[]) => mockUpdateFileContent(...args),
}));

vi.mock('@/utils/markdown', () => ({
  renderMarkdown: (content: string) => `<p>${content}</p>`,
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

const defaultStubs = {
  ElButton: {
    template:
      '<button class="el-button-stub" :class="{ \'is-loading\': loading }" @click="$emit(\'click\')"><slot /></button>',
    props: ['icon', 'text', 'type', 'size', 'plain', 'loading'],
  },
  ElIcon: { template: '<span class="el-icon-stub"><slot /></span>' },
  ElInput: {
    template:
      '<textarea class="el-input-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>',
    props: ['modelValue', 'type', 'autosize', 'resize'],
  },
  ArrowLeft: { template: '<span class="arrow-left-stub"></span>' },
  Loading: { template: '<span class="loading-stub"></span>' },
};

describe('KnowledgeFileViewer', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileContent.mockResolvedValue({ content: '# Test Content\nHello world' });
    mockUpdateFileContent.mockResolvedValue({});
  });

  afterEach(() => {
    wrapper?.unmount();
    vi.restoreAllMocks();
  });

  function createWrapper(props: { fileId?: string | null; fileName?: string } = {}) {
    const defaultProps = {
      fileId: 'test-file-id',
      fileName: 'test-file.md',
      ...props,
    };

    return mount(KnowledgeFileViewer, {
      props: defaultProps,
      global: {
        plugins: [i18n],
        stubs: defaultStubs,
      },
    });
  }

  it('renders the component with file name in header', () => {
    wrapper = createWrapper();
    expect(wrapper.find('.knowledge-file-viewer__title').text()).toBe('test-file.md');
  });

  it('loads content when fileId is provided', async () => {
    wrapper = createWrapper();
    await vi.waitFor(() => {
      expect(mockGetFileContent).toHaveBeenCalledWith('test-file-id');
    });
  });

  it('renders markdown content', async () => {
    wrapper = createWrapper();
    await vi.waitFor(() => {
      expect(wrapper.find('.knowledge-file-viewer__content').exists()).toBe(true);
    });
    expect(wrapper.find('.knowledge-file-viewer__content').html()).toContain('# Test Content');
  });

  it('shows edit button when not editing', () => {
    wrapper = createWrapper();
    const buttons = wrapper.findAll('.el-button-stub');
    const editBtn = buttons.find((b) => b.text().includes('编辑内容'));
    expect(editBtn).toBeTruthy();
  });

  it('switches to edit mode when edit button is clicked', async () => {
    wrapper = createWrapper();
    await vi.waitFor(() => {
      expect(wrapper.find('.knowledge-file-viewer__content').exists()).toBe(true);
    });

    const editBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('编辑内容'));
    await editBtn!.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.el-input-stub').exists()).toBe(true);
    expect(wrapper.find('.knowledge-file-viewer__content').exists()).toBe(false);
  });

  it('shows save and cancel buttons in edit mode', async () => {
    wrapper = createWrapper();
    await vi.waitFor(() => {
      expect(wrapper.find('.knowledge-file-viewer__content').exists()).toBe(true);
    });

    const vm = wrapper.vm as unknown as { isEditing: boolean };
    vm.isEditing = true;
    await wrapper.vm.$nextTick();

    const buttons = wrapper.findAll('.el-button-stub');
    const cancelBtn = buttons.find((b) => b.text().includes('取消'));
    const saveBtn = buttons.find((b) => b.text().includes('保存'));
    expect(cancelBtn).toBeTruthy();
    expect(saveBtn).toBeTruthy();
  });

  it('cancels edit and restores content', async () => {
    wrapper = createWrapper();
    await vi.waitFor(() => {
      expect(wrapper.find('.knowledge-file-viewer__content').exists()).toBe(true);
    });

    const vm = wrapper.vm as unknown as {
      isEditing: boolean;
      editContent: string;
      cancelEdit: () => void;
    };
    vm.isEditing = true;
    vm.editContent = 'modified content';
    await wrapper.vm.$nextTick();

    vm.cancelEdit();
    await wrapper.vm.$nextTick();

    expect(vm.isEditing).toBe(false);
    expect(vm.editContent).toBe('# Test Content\nHello world');
  });

  it('saves content successfully', async () => {
    wrapper = createWrapper();
    await vi.waitFor(() => {
      expect(wrapper.find('.knowledge-file-viewer__content').exists()).toBe(true);
    });

    const vm = wrapper.vm as unknown as {
      isEditing: boolean;
      editContent: string;
      handleSave: () => Promise<void>;
    };
    vm.isEditing = true;
    vm.editContent = 'updated content';
    await wrapper.vm.$nextTick();

    await vm.handleSave();

    expect(mockUpdateFileContent).toHaveBeenCalledWith('test-file-id', 'updated content');
    expect(vm.isEditing).toBe(false);
  });

  it('emits back event when back button is clicked', async () => {
    wrapper = createWrapper();
    await vi.waitFor(() => {
      expect(wrapper.find('.knowledge-file-viewer__content').exists()).toBe(true);
    });
    const backBtns = wrapper.findAll('.knowledge-file-viewer__header .el-button-stub');
    await backBtns[0].trigger('click');
    expect(wrapper.emitted('back')).toBeTruthy();
  });

  it('handles load error gracefully', async () => {
    mockGetFileContent.mockRejectedValue(new Error('Not found'));
    wrapper = createWrapper();

    await vi.waitFor(() => {
      expect(wrapper.find('.knowledge-file-viewer__loading').exists()).toBe(false);
    });

    expect(wrapper.find('.knowledge-file-viewer__content').text()).toBe('');
  });

  it('reloads content when fileId changes', async () => {
    wrapper = createWrapper({ fileId: 'file-1' });
    await vi.waitFor(() => {
      expect(mockGetFileContent).toHaveBeenCalledWith('file-1');
    });

    mockGetFileContent.mockResolvedValue({ content: 'new content' });
    await wrapper.setProps({ fileId: 'file-2' });
    await vi.waitFor(() => {
      expect(mockGetFileContent).toHaveBeenCalledWith('file-2');
    });
  });
});
