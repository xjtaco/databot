import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import WfVariableInsertButton from '@/components/workflow/config/WfVariableInsertButton.vue';
import { useWorkflowStore } from '@/stores/workflowStore';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';
import type {
  WorkflowDetail,
  WorkflowNodeInfo,
  WorkflowEdgeInfo,
  SqlNodeConfig,
  PythonNodeConfig,
  LlmNodeConfig,
} from '@/types/workflow';

vi.mock('@/api/workflow');

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

const globalStubs = {
  'el-tooltip': {
    template: '<div class="el-tooltip-stub"><slot /></div>',
    props: ['content', 'disabled', 'placement'],
  },
  'el-button': {
    template:
      '<button class="el-button-stub" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
    props: ['disabled', 'size'],
    emits: ['click'],
  },
  'el-scrollbar': {
    template: '<div class="el-scrollbar-stub"><slot /></div>',
    props: ['maxHeight'],
  },
  'el-tag': {
    template: '<span class="el-tag-stub"><slot /></span>',
    props: ['size', 'type', 'effect'],
  },
};

function makeNode(
  id: string,
  name: string,
  type: 'sql' | 'python' | 'llm',
  outputVariable: string
): WorkflowNodeInfo {
  const configs: Record<string, SqlNodeConfig | PythonNodeConfig | LlmNodeConfig> = {
    sql: { nodeType: 'sql', datasourceId: 'ds-1', params: {}, sql: 'SELECT 1', outputVariable },
    python: { nodeType: 'python', params: {}, script: '', outputVariable },
    llm: { nodeType: 'llm', params: {}, prompt: '', outputVariable },
  };
  return {
    id,
    workflowId: 'wf-1',
    name,
    description: null,
    type,
    config: configs[type],
    positionX: 0,
    positionY: 0,
  };
}

function makeEdge(sourceNodeId: string, targetNodeId: string): WorkflowEdgeInfo {
  return {
    id: `edge_${sourceNodeId}_${targetNodeId}`,
    workflowId: 'wf-1',
    sourceNodeId,
    targetNodeId,
  };
}

function makeWorkflow(nodes: WorkflowNodeInfo[], edges: WorkflowEdgeInfo[]): WorkflowDetail {
  return {
    id: 'wf-1',
    name: 'Test Workflow',
    description: null,
    nodes,
    edges,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('WfVariableInsertButton', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  function createWrapper(nodeId: string, disabled = false) {
    return mount(WfVariableInsertButton, {
      props: { nodeId, disabled },
      global: {
        plugins: [i18n],
        stubs: globalStubs,
      },
    });
  }

  describe('disabled when no upstream nodes', () => {
    it('should disable the button when there are no upstream nodes', () => {
      const store = useWorkflowStore();
      const currentNode = makeNode('node-1', 'sql_1', 'sql', 'query_result');
      store.editorWorkflow = makeWorkflow([currentNode], []);

      const wrapper = createWrapper('node-1');
      const button = wrapper.find('.el-button-stub');
      expect(button.attributes('disabled')).toBeDefined();
    });

    it('should disable the button when editorWorkflow is null', () => {
      const store = useWorkflowStore();
      store.editorWorkflow = null;

      const wrapper = createWrapper('node-1');
      const button = wrapper.find('.el-button-stub');
      expect(button.attributes('disabled')).toBeDefined();
    });

    it('should disable the button when disabled prop is true even with upstream nodes', () => {
      const store = useWorkflowStore();
      const sqlNode = makeNode('node-1', 'sql_1', 'sql', 'query_result');
      const pythonNode = makeNode('node-2', 'python_1', 'python', 'result');
      store.editorWorkflow = makeWorkflow([sqlNode, pythonNode], [makeEdge('node-1', 'node-2')]);

      const wrapper = createWrapper('node-2', true);
      const button = wrapper.find('.el-button-stub');
      expect(button.attributes('disabled')).toBeDefined();
    });
  });

  describe('upstream group computation', () => {
    it('should compute upstream groups correctly for a single upstream node', () => {
      const store = useWorkflowStore();
      const sqlNode = makeNode('node-1', 'sql_1', 'sql', 'query_orders');
      const pythonNode = makeNode('node-2', 'python_1', 'python', 'result');
      store.editorWorkflow = makeWorkflow([sqlNode, pythonNode], [makeEdge('node-1', 'node-2')]);

      const wrapper = createWrapper('node-2');
      const vm = wrapper.vm as InstanceType<typeof WfVariableInsertButton>;
      const groups = vm.upstreamGroups;

      expect(groups).toHaveLength(1);
      expect(groups[0].nodeId).toBe('node-1');
      expect(groups[0].nodeName).toBe('sql_1');
      expect(groups[0].nodeType).toBe('sql');
      expect(groups[0].fields).toHaveLength(4);
      expect(groups[0].fields[0].template).toBe('{{query_orders.csvPath}}');
      expect(groups[0].fields[0].type).toBe('csvFile');
    });

    it('should compute upstream groups for multiple upstream nodes', () => {
      const store = useWorkflowStore();
      const sqlNode = makeNode('node-1', 'sql_1', 'sql', 'query_orders');
      const llmNode = makeNode('node-2', 'llm_1', 'llm', 'analysis');
      const pythonNode = makeNode('node-3', 'python_1', 'python', 'result');
      store.editorWorkflow = makeWorkflow(
        [sqlNode, llmNode, pythonNode],
        [makeEdge('node-1', 'node-3'), makeEdge('node-2', 'node-3')]
      );

      const wrapper = createWrapper('node-3');
      const vm = wrapper.vm as InstanceType<typeof WfVariableInsertButton>;
      const groups = vm.upstreamGroups;

      expect(groups).toHaveLength(2);

      const nodeNames = groups.map((g) => g.nodeName).sort();
      expect(nodeNames).toEqual(['llm_1', 'sql_1']);
    });

    it('should traverse transitive upstream nodes via BFS', () => {
      const store = useWorkflowStore();
      const sqlNode = makeNode('node-1', 'sql_1', 'sql', 'query_orders');
      const pythonNode = makeNode('node-2', 'python_1', 'python', 'transformed');
      const llmNode = makeNode('node-3', 'llm_1', 'llm', 'report');
      // Chain: sql -> python -> llm
      store.editorWorkflow = makeWorkflow(
        [sqlNode, pythonNode, llmNode],
        [makeEdge('node-1', 'node-2'), makeEdge('node-2', 'node-3')]
      );

      const wrapper = createWrapper('node-3');
      const vm = wrapper.vm as InstanceType<typeof WfVariableInsertButton>;
      const groups = vm.upstreamGroups;

      // Both sql and python should be discovered via BFS
      expect(groups).toHaveLength(2);
      const nodeNames = groups.map((g) => g.nodeName).sort();
      expect(nodeNames).toEqual(['python_1', 'sql_1']);
    });

    it('should build correct template strings using outputVariable', () => {
      const store = useWorkflowStore();
      const llmNode = makeNode('node-1', 'llm_1', 'llm', 'summary_report');
      const pythonNode = makeNode('node-2', 'python_1', 'python', 'result');
      store.editorWorkflow = makeWorkflow([llmNode, pythonNode], [makeEdge('node-1', 'node-2')]);

      const wrapper = createWrapper('node-2');
      const vm = wrapper.vm as InstanceType<typeof WfVariableInsertButton>;
      const groups = vm.upstreamGroups;

      expect(groups).toHaveLength(1);
      expect(groups[0].fields[0].template).toBe('{{summary_report.result}}');
      expect(groups[0].fields[1].template).toBe('{{summary_report.rawResponse}}');
    });

    it('should return empty groups when there are no upstream nodes', () => {
      const store = useWorkflowStore();
      const sqlNode = makeNode('node-1', 'sql_1', 'sql', 'query_result');
      store.editorWorkflow = makeWorkflow([sqlNode], []);

      const wrapper = createWrapper('node-1');
      const vm = wrapper.vm as InstanceType<typeof WfVariableInsertButton>;
      expect(vm.upstreamGroups).toEqual([]);
    });
  });

  describe('insert event', () => {
    it('should emit insert event when a field is clicked', async () => {
      const store = useWorkflowStore();
      const sqlNode = makeNode('node-1', 'sql_1', 'sql', 'query_orders');
      const pythonNode = makeNode('node-2', 'python_1', 'python', 'result');
      store.editorWorkflow = makeWorkflow([sqlNode, pythonNode], [makeEdge('node-1', 'node-2')]);

      const wrapper = createWrapper('node-2');

      // Open the dropdown first
      await wrapper.find('.el-button-stub').trigger('click');

      const fieldItems = wrapper.findAll('.wf-variable-insert-btn__field');
      expect(fieldItems.length).toBeGreaterThan(0);

      await fieldItems[0].trigger('click');
      const emitted = wrapper.emitted('insert');
      expect(emitted).toBeTruthy();
      expect(emitted![0]).toEqual(['{{query_orders.csvPath}}']);
    });
  });

  describe('button text', () => {
    it('should display i18n text for insert variable', () => {
      const store = useWorkflowStore();
      store.editorWorkflow = makeWorkflow([], []);

      const wrapper = createWrapper('node-1');
      const button = wrapper.find('.el-button-stub');
      expect(button.text()).toContain(zhCN.workflow.config.insertVariable);
    });
  });
});
