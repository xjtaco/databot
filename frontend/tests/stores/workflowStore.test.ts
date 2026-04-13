import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWorkflowStore } from '@/stores/workflowStore';
import * as workflowApi from '@/api/workflow';
import type {
  WorkflowDetail,
  WorkflowNodeInfo,
  WorkflowEdgeInfo,
  CustomNodeTemplateInfo,
  NodeConfig,
  SqlNodeConfig,
  PythonNodeConfig,
  LlmNodeConfig,
} from '@/types/workflow';

vi.mock('@/api/workflow');

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('workflowStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Helpers / Fixtures ─────────────────────────────────

  const makeNode = (overrides: Partial<WorkflowNodeInfo> = {}): WorkflowNodeInfo => ({
    id: 'node-1',
    workflowId: 'wf-1',
    name: 'sql_1',
    description: null,
    type: 'sql',
    config: {
      nodeType: 'sql',
      datasourceId: '',
      params: {},
      sql: 'SELECT * FROM ',
      outputVariable: 'result',
    } satisfies SqlNodeConfig,
    positionX: 100,
    positionY: 200,
    ...overrides,
  });

  const makeEdge = (overrides: Partial<WorkflowEdgeInfo> = {}): WorkflowEdgeInfo => ({
    id: 'edge-1',
    workflowId: 'wf-1',
    sourceNodeId: 'node-1',
    targetNodeId: 'node-2',
    ...overrides,
  });

  const makeWorkflowDetail = (overrides: Partial<WorkflowDetail> = {}): WorkflowDetail => ({
    id: 'wf-1',
    name: 'Test Workflow',
    description: null,
    nodes: [],
    edges: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  });

  /** Set up the store with an editor workflow already loaded. */
  function setupEditorWorkflow(detail?: WorkflowDetail) {
    const store = useWorkflowStore();
    store.editorWorkflow = detail ?? makeWorkflowDetail();
    store.isDirty = false;
    return store;
  }

  // ── Initial State ──────────────────────────────────────

  it('should start with empty state', () => {
    const store = useWorkflowStore();

    expect(store.workflows).toHaveLength(0);
    expect(store.isLoading).toBe(false);
    expect(store.editorWorkflow).toBeNull();
    expect(store.isDirty).toBe(false);
    expect(store.selectedNodeId).toBeNull();
    expect(store.currentRunId).toBeNull();
    expect(store.isExecuting).toBe(false);
    expect(store.lastRunDetail).toBeNull();
    expect(store.runs).toHaveLength(0);
    expect(store.customTemplates).toHaveLength(0);
  });

  // ── addNode ────────────────────────────────────────────

  describe('addNode', () => {
    it('should add a sql node with default config', () => {
      const store = setupEditorWorkflow();

      const nodeId = store.addNode('sql', { x: 50, y: 75 });

      expect(nodeId).toMatch(/^temp_/);
      expect(store.editorWorkflow!.nodes).toHaveLength(1);

      const node = store.editorWorkflow!.nodes[0];
      expect(node.id).toBe(nodeId);
      expect(node.workflowId).toBe('wf-1');
      expect(node.type).toBe('sql');
      expect(node.positionX).toBe(50);
      expect(node.positionY).toBe(75);
      expect((node.config as SqlNodeConfig).nodeType).toBe('sql');
      expect((node.config as SqlNodeConfig).params).toEqual({});
      expect((node.config as SqlNodeConfig).sql).toBe('SELECT * FROM ');
      expect((node.config as SqlNodeConfig).outputVariable).toMatch(/^query_\w+\.csv$/);
    });

    it('should add a python node with default config', () => {
      const store = setupEditorWorkflow();

      store.addNode('python', { x: 0, y: 0 });

      const node = store.editorWorkflow!.nodes[0];
      expect(node.type).toBe('python');
      expect((node.config as PythonNodeConfig).nodeType).toBe('python');
      expect((node.config as PythonNodeConfig).script).toContain('params');
    });

    it('should add an llm node with default config', () => {
      const store = setupEditorWorkflow();

      store.addNode('llm', { x: 0, y: 0 });

      const node = store.editorWorkflow!.nodes[0];
      expect(node.type).toBe('llm');
      expect((node.config as LlmNodeConfig).nodeType).toBe('llm');
      expect((node.config as LlmNodeConfig).prompt).toBe('');
    });

    it('should set isDirty to true', () => {
      const store = setupEditorWorkflow();

      store.addNode('sql', { x: 0, y: 0 });

      expect(store.isDirty).toBe(true);
    });

    it('should select the newly added node', () => {
      const store = setupEditorWorkflow();

      const nodeId = store.addNode('sql', { x: 0, y: 0 });

      expect(store.selectedNodeId).toBe(nodeId);
    });

    it('should generate unique temp ids for each node', () => {
      const store = setupEditorWorkflow();

      const id1 = store.addNode('sql', { x: 0, y: 0 });
      const id2 = store.addNode('python', { x: 100, y: 100 });

      expect(id1).not.toBe(id2);
      expect(store.editorWorkflow!.nodes).toHaveLength(2);
    });

    it('should generate sequential names based on existing node count', () => {
      const store = setupEditorWorkflow(
        makeWorkflowDetail({ nodes: [makeNode({ id: 'existing-1', name: 'sql_1' })] })
      );

      store.addNode('python', { x: 0, y: 0 });

      const addedNode = store.editorWorkflow!.nodes[1];
      expect(addedNode.name).toBe('python_2');
    });

    it('should return empty string when no editor workflow is loaded', () => {
      const store = useWorkflowStore();

      const result = store.addNode('sql', { x: 0, y: 0 });

      expect(result).toBe('');
    });
  });

  // ── removeNode ─────────────────────────────────────────

  describe('removeNode', () => {
    it('should remove the specified node', () => {
      const node1 = makeNode({ id: 'node-1' });
      const node2 = makeNode({ id: 'node-2', name: 'sql_2' });
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [node1, node2] }));

      store.removeNode('node-1');

      expect(store.editorWorkflow!.nodes).toHaveLength(1);
      expect(store.editorWorkflow!.nodes[0].id).toBe('node-2');
    });

    it('should remove all edges connected to the removed node', () => {
      const edge1 = makeEdge({ id: 'edge-1', sourceNodeId: 'node-1', targetNodeId: 'node-2' });
      const edge2 = makeEdge({ id: 'edge-2', sourceNodeId: 'node-2', targetNodeId: 'node-3' });
      const edge3 = makeEdge({ id: 'edge-3', sourceNodeId: 'node-3', targetNodeId: 'node-1' });
      const store = setupEditorWorkflow(
        makeWorkflowDetail({
          nodes: [
            makeNode({ id: 'node-1' }),
            makeNode({ id: 'node-2' }),
            makeNode({ id: 'node-3' }),
          ],
          edges: [edge1, edge2, edge3],
        })
      );

      store.removeNode('node-1');

      // edge1 (source=node-1) and edge3 (target=node-1) should be removed
      expect(store.editorWorkflow!.edges).toHaveLength(1);
      expect(store.editorWorkflow!.edges[0].id).toBe('edge-2');
    });

    it('should deselect the node if it was selected', () => {
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [makeNode()] }));
      store.selectedNodeId = 'node-1';

      store.removeNode('node-1');

      expect(store.selectedNodeId).toBeNull();
    });

    it('should not deselect if a different node was selected', () => {
      const store = setupEditorWorkflow(
        makeWorkflowDetail({
          nodes: [makeNode({ id: 'node-1' }), makeNode({ id: 'node-2' })],
        })
      );
      store.selectedNodeId = 'node-2';

      store.removeNode('node-1');

      expect(store.selectedNodeId).toBe('node-2');
    });

    it('should set isDirty to true', () => {
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [makeNode()] }));

      store.removeNode('node-1');

      expect(store.isDirty).toBe(true);
    });

    it('should do nothing when no editor workflow is loaded', () => {
      const store = useWorkflowStore();
      // Should not throw
      store.removeNode('node-1');
    });
  });

  // ── updateNodeConfig ───────────────────────────────────

  describe('updateNodeConfig', () => {
    it('should update node properties', () => {
      const node = makeNode({ id: 'node-1', name: 'sql_1' });
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [node] }));

      store.updateNodeConfig('node-1', { name: 'renamed_node' });

      expect(store.editorWorkflow!.nodes[0].name).toBe('renamed_node');
    });

    it('should update node config object', () => {
      const node = makeNode({ id: 'node-1' });
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [node] }));
      const newConfig: NodeConfig = {
        nodeType: 'sql',
        datasourceId: 'ds-1',
        params: {},
        sql: 'SELECT id FROM users',
        outputVariable: 'users',
      };

      store.updateNodeConfig('node-1', { config: newConfig });

      expect((store.editorWorkflow!.nodes[0].config as SqlNodeConfig).sql).toBe(
        'SELECT id FROM users'
      );
      expect((store.editorWorkflow!.nodes[0].config as SqlNodeConfig).datasourceId).toBe('ds-1');
    });

    it('should set isDirty to true', () => {
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [makeNode()] }));

      store.updateNodeConfig('node-1', { name: 'updated' });

      expect(store.isDirty).toBe(true);
    });

    it('should do nothing for non-existent node', () => {
      const node = makeNode({ id: 'node-1', name: 'original' });
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [node] }));

      store.updateNodeConfig('non-existent', { name: 'updated' });

      expect(store.editorWorkflow!.nodes[0].name).toBe('original');
    });

    it('should do nothing when no editor workflow is loaded', () => {
      const store = useWorkflowStore();
      // Should not throw
      store.updateNodeConfig('node-1', { name: 'updated' });
    });
  });

  // ── addEdge ────────────────────────────────────────────

  describe('addEdge', () => {
    it('should add a new edge', () => {
      const store = setupEditorWorkflow(
        makeWorkflowDetail({
          nodes: [makeNode({ id: 'node-1' }), makeNode({ id: 'node-2' })],
        })
      );

      const edgeId = store.addEdge('node-1', 'node-2');

      expect(edgeId).not.toBeNull();
      expect(edgeId).toMatch(/^edge_/);
      expect(store.editorWorkflow!.edges).toHaveLength(1);
      expect(store.editorWorkflow!.edges[0].sourceNodeId).toBe('node-1');
      expect(store.editorWorkflow!.edges[0].targetNodeId).toBe('node-2');
      expect(store.editorWorkflow!.edges[0].workflowId).toBe('wf-1');
    });

    it('should prevent duplicate edges', () => {
      const existingEdge = makeEdge({
        sourceNodeId: 'node-1',
        targetNodeId: 'node-2',
      });
      const store = setupEditorWorkflow(
        makeWorkflowDetail({
          edges: [existingEdge],
        })
      );

      const result = store.addEdge('node-1', 'node-2');

      expect(result).toBeNull();
      expect(store.editorWorkflow!.edges).toHaveLength(1);
    });

    it('should allow edges with same source but different target', () => {
      const existingEdge = makeEdge({
        sourceNodeId: 'node-1',
        targetNodeId: 'node-2',
      });
      const store = setupEditorWorkflow(makeWorkflowDetail({ edges: [existingEdge] }));

      const edgeId = store.addEdge('node-1', 'node-3');

      expect(edgeId).not.toBeNull();
      expect(store.editorWorkflow!.edges).toHaveLength(2);
    });

    it('should allow edges with same target but different source', () => {
      const existingEdge = makeEdge({
        sourceNodeId: 'node-1',
        targetNodeId: 'node-3',
      });
      const store = setupEditorWorkflow(makeWorkflowDetail({ edges: [existingEdge] }));

      const edgeId = store.addEdge('node-2', 'node-3');

      expect(edgeId).not.toBeNull();
      expect(store.editorWorkflow!.edges).toHaveLength(2);
    });

    it('should set isDirty to true', () => {
      const store = setupEditorWorkflow();

      store.addEdge('node-1', 'node-2');

      expect(store.isDirty).toBe(true);
    });

    it('should return null when no editor workflow is loaded', () => {
      const store = useWorkflowStore();

      const result = store.addEdge('node-1', 'node-2');

      expect(result).toBeNull();
    });

    it('should auto-configure downstream python node params with upstream output', () => {
      const sqlNode = makeNode({
        id: 'sql-1',
        name: 'query_data',
        type: 'sql',
        config: {
          nodeType: 'sql',
          datasourceId: 'ds-1',
          params: {},
          sql: 'SELECT * FROM t',
          outputVariable: 'output.csv',
        } satisfies SqlNodeConfig,
      });
      const pyNode = makeNode({
        id: 'py-1',
        name: 'process',
        type: 'python',
        config: {
          nodeType: 'python',
          params: {},
          script: '',
          outputVariable: 'result',
        } satisfies PythonNodeConfig,
      });
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [sqlNode, pyNode] }));

      store.addEdge('sql-1', 'py-1');

      const pyConfig = store.editorWorkflow!.nodes[1].config as PythonNodeConfig;
      expect(pyConfig.params['query_data']).toBe('output.csv');
    });

    it('should not overwrite existing param when connecting', () => {
      const sqlNode = makeNode({
        id: 'sql-1',
        name: 'query_data',
        type: 'sql',
        config: {
          nodeType: 'sql',
          datasourceId: 'ds-1',
          params: {},
          sql: 'SELECT * FROM t',
          outputVariable: 'output.csv',
        } satisfies SqlNodeConfig,
      });
      const pyNode = makeNode({
        id: 'py-1',
        name: 'process',
        type: 'python',
        config: {
          nodeType: 'python',
          params: { query_data: 'existing.csv' },
          script: '',
          outputVariable: 'result',
        } satisfies PythonNodeConfig,
      });
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [sqlNode, pyNode] }));

      store.addEdge('sql-1', 'py-1');

      const pyConfig = store.editorWorkflow!.nodes[1].config as PythonNodeConfig;
      expect(pyConfig.params['query_data']).toBe('existing.csv');
    });
  });

  // ── removeEdge ─────────────────────────────────────────

  describe('removeEdge', () => {
    it('should remove the specified edge', () => {
      const edge1 = makeEdge({ id: 'edge-1' });
      const edge2 = makeEdge({ id: 'edge-2', sourceNodeId: 'node-2', targetNodeId: 'node-3' });
      const store = setupEditorWorkflow(makeWorkflowDetail({ edges: [edge1, edge2] }));

      store.removeEdge('edge-1');

      expect(store.editorWorkflow!.edges).toHaveLength(1);
      expect(store.editorWorkflow!.edges[0].id).toBe('edge-2');
    });

    it('should set isDirty to true', () => {
      const store = setupEditorWorkflow(makeWorkflowDetail({ edges: [makeEdge()] }));

      store.removeEdge('edge-1');

      expect(store.isDirty).toBe(true);
    });

    it('should do nothing when no editor workflow is loaded', () => {
      const store = useWorkflowStore();
      // Should not throw
      store.removeEdge('edge-1');
    });

    it('should do nothing when edge does not exist', () => {
      const store = setupEditorWorkflow(makeWorkflowDetail({ edges: [makeEdge()] }));

      store.removeEdge('non-existent');

      expect(store.editorWorkflow!.edges).toHaveLength(1);
    });
  });

  // ── selectNode ─────────────────────────────────────────

  describe('selectNode', () => {
    it('should set selectedNodeId', () => {
      const store = useWorkflowStore();

      store.selectNode('node-1');

      expect(store.selectedNodeId).toBe('node-1');
    });

    it('should clear selectedNodeId when null is passed', () => {
      const store = useWorkflowStore();
      store.selectedNodeId = 'node-1';

      store.selectNode(null);

      expect(store.selectedNodeId).toBeNull();
    });

    it('should update selectedNode computed when editor has matching node', () => {
      const node = makeNode({ id: 'node-1' });
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [node] }));

      store.selectNode('node-1');

      expect(store.selectedNode).not.toBeNull();
      expect(store.selectedNode!.id).toBe('node-1');
    });

    it('should return null for selectedNode when node does not exist', () => {
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [makeNode()] }));

      store.selectNode('non-existent');

      expect(store.selectedNode).toBeNull();
    });

    it('should return null for selectedNode when no editor workflow', () => {
      const store = useWorkflowStore();

      store.selectNode('node-1');

      expect(store.selectedNode).toBeNull();
    });
  });

  // ── closeEditor ────────────────────────────────────────

  describe('loadForEditing', () => {
    it('should preserve manual-layout edits when reloading the same workflow', async () => {
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [makeNode()] }));
      store.updateNodePosition('node-1', 320, 240, { source: 'user-drag' });
      expect(store.hasManualLayoutEdits).toBe(true);

      vi.mocked(workflowApi.getWorkflow).mockResolvedValue(
        makeWorkflowDetail({
          id: 'wf-1',
          nodes: [makeNode({ positionX: 500, positionY: 600 })],
          updatedAt: '2024-01-02T00:00:00Z',
        })
      );
      vi.mocked(workflowApi.listRuns).mockResolvedValue([]);

      await store.loadForEditing('wf-1');

      expect(store.hasManualLayoutEdits).toBe(true);
      expect(store.editorWorkflow?.updatedAt).toBe('2024-01-02T00:00:00Z');
    });

    it('should ignore stale workflow reload responses and keep the newest result', async () => {
      const store = useWorkflowStore();
      const olderLoad = createDeferred<WorkflowDetail>();
      const newerLoad = createDeferred<WorkflowDetail>();

      vi.mocked(workflowApi.getWorkflow)
        .mockReturnValueOnce(olderLoad.promise)
        .mockReturnValueOnce(newerLoad.promise);
      vi.mocked(workflowApi.listRuns).mockResolvedValue([]);

      const olderPromise = store.loadForEditing('wf-1');
      const newerPromise = store.loadForEditing('wf-1');

      newerLoad.resolve(
        makeWorkflowDetail({
          id: 'wf-1',
          name: 'Newest Workflow',
          updatedAt: '2024-01-03T00:00:00Z',
        })
      );
      await newerPromise;

      olderLoad.resolve(
        makeWorkflowDetail({
          id: 'wf-1',
          name: 'Stale Workflow',
          updatedAt: '2024-01-02T00:00:00Z',
        })
      );
      await olderPromise;

      expect(store.editorWorkflow?.name).toBe('Newest Workflow');
      expect(store.editorWorkflow?.updatedAt).toBe('2024-01-03T00:00:00Z');
    });

    it('should ignore stale run-detail responses from an older reload', async () => {
      const store = useWorkflowStore();
      const staleRuns = createDeferred<
        Array<{
          id: string;
          workflowId: string;
          status: 'completed';
          startedAt: string;
          completedAt: string;
          errorMessage: null;
        }>
      >();

      vi.mocked(workflowApi.getWorkflow)
        .mockResolvedValueOnce(makeWorkflowDetail({ name: 'Stale Workflow' }))
        .mockResolvedValueOnce(makeWorkflowDetail({ name: 'Newest Workflow' }));
      vi.mocked(workflowApi.listRuns)
        .mockReturnValueOnce(staleRuns.promise)
        .mockResolvedValueOnce([]);
      vi.mocked(workflowApi.getRunDetail).mockResolvedValue({
        id: 'run-stale',
        workflowId: 'wf-1',
        status: 'completed',
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:01:00Z',
        errorMessage: null,
        nodeRuns: [],
      });

      const olderPromise = store.loadForEditing('wf-1');
      await Promise.resolve();
      const newerPromise = store.loadForEditing('wf-1');

      await newerPromise;

      staleRuns.resolve([
        {
          id: 'run-stale',
          workflowId: 'wf-1',
          status: 'completed',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          errorMessage: null,
        },
      ]);
      await olderPromise;

      expect(store.editorWorkflow?.name).toBe('Newest Workflow');
      expect(store.lastRunDetail).toBeNull();
    });
  });

  describe('closeEditor', () => {
    it('should reset all editor state', () => {
      const store = setupEditorWorkflow(
        makeWorkflowDetail({ nodes: [makeNode()], edges: [makeEdge()] })
      );
      store.isDirty = true;
      store.selectedNodeId = 'node-1';
      store.currentRunId = 'run-1';
      store.nodeExecutionStates.set('node-1', 'completed');
      store.lastRunDetail = {
        id: 'run-1',
        workflowId: 'wf-1',
        status: 'completed',
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:00:01Z',
        errorMessage: null,
        nodeRuns: [],
      };

      store.closeEditor();

      expect(store.editorWorkflow).toBeNull();
      expect(store.isDirty).toBe(false);
      expect(store.selectedNodeId).toBeNull();
      expect(store.hasManualLayoutEdits).toBe(false);
      expect(store.currentRunId).toBeNull();
      expect(store.nodeExecutionStates.size).toBe(0);
      expect(store.lastRunDetail).toBeNull();
    });

    it('should set isEditing computed to false', () => {
      const store = setupEditorWorkflow();
      expect(store.isEditing).toBe(true);

      store.closeEditor();

      expect(store.isEditing).toBe(false);
    });
  });

  // ── saveNodeAsTemplate ─────────────────────────────────

  describe('saveNodeAsTemplate', () => {
    it('should call createTemplate API with correct parameters', async () => {
      const sqlConfig: SqlNodeConfig = {
        nodeType: 'sql',
        datasourceId: 'ds-1',
        params: {},
        sql: 'SELECT * FROM users',
        outputVariable: 'result',
      };
      const node = makeNode({ id: 'node-1', type: 'sql', config: sqlConfig });
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [node] }));

      const mockTemplates: CustomNodeTemplateInfo[] = [];
      vi.mocked(workflowApi.createTemplate).mockResolvedValue({
        id: 'tmpl-1',
        name: 'My Template',
        description: 'A useful template',
        type: 'sql',
        config: sqlConfig,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        creatorName: null,
      });
      vi.mocked(workflowApi.listTemplates).mockResolvedValue(mockTemplates);

      await store.saveNodeAsTemplate('node-1', 'My Template', 'A useful template');

      expect(workflowApi.createTemplate).toHaveBeenCalledWith({
        name: 'My Template',
        description: 'A useful template',
        type: 'sql',
        config: sqlConfig,
      });
    });

    it('should refresh templates after saving', async () => {
      const node = makeNode({ id: 'node-1' });
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [node] }));

      const savedTemplate: CustomNodeTemplateInfo = {
        id: 'tmpl-1',
        name: 'Template',
        description: null,
        type: 'sql',
        config: node.config,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        creatorName: null,
      };
      vi.mocked(workflowApi.createTemplate).mockResolvedValue(savedTemplate);
      vi.mocked(workflowApi.listTemplates).mockResolvedValue([savedTemplate]);

      await store.saveNodeAsTemplate('node-1', 'Template');

      expect(workflowApi.listTemplates).toHaveBeenCalled();
      expect(store.customTemplates).toHaveLength(1);
    });

    it('should call createTemplate without description when not provided', async () => {
      const node = makeNode({ id: 'node-1' });
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [node] }));

      vi.mocked(workflowApi.createTemplate).mockResolvedValue({
        id: 'tmpl-1',
        name: 'Template',
        description: null,
        type: 'sql',
        config: node.config,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        creatorName: null,
      });
      vi.mocked(workflowApi.listTemplates).mockResolvedValue([]);

      await store.saveNodeAsTemplate('node-1', 'Template');

      expect(workflowApi.createTemplate).toHaveBeenCalledWith({
        name: 'Template',
        description: undefined,
        type: 'sql',
        config: node.config,
      });
    });

    it('should do nothing when node does not exist', async () => {
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [makeNode()] }));

      await store.saveNodeAsTemplate('non-existent', 'Template');

      expect(workflowApi.createTemplate).not.toHaveBeenCalled();
    });

    it('should do nothing when no editor workflow is loaded', async () => {
      const store = useWorkflowStore();

      await store.saveNodeAsTemplate('node-1', 'Template');

      expect(workflowApi.createTemplate).not.toHaveBeenCalled();
    });
  });

  // ── resetExecutionState ────────────────────────────────

  describe('resetExecutionState', () => {
    it('should clear all execution state', () => {
      const store = useWorkflowStore();
      store.currentRunId = 'run-1';
      store.isExecuting = true;
      store.nodeExecutionStates.set('node-1', 'running');
      store.nodeExecutionStates.set('node-2', 'completed');
      store.lastRunDetail = {
        id: 'run-1',
        workflowId: 'wf-1',
        status: 'completed',
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:00:01Z',
        errorMessage: null,
        nodeRuns: [],
      };

      store.resetExecutionState();

      expect(store.nodeExecutionStates.size).toBe(0);
      expect(store.lastRunDetail).toBeNull();
      expect(store.currentRunId).toBeNull();
      expect(store.isExecuting).toBe(false);
    });

    it('should be safe to call when execution state is already clean', () => {
      const store = useWorkflowStore();

      store.resetExecutionState();

      expect(store.nodeExecutionStates.size).toBe(0);
      expect(store.lastRunDetail).toBeNull();
      expect(store.currentRunId).toBeNull();
      expect(store.isExecuting).toBe(false);
    });
  });

  // ── Computed properties ────────────────────────────────

  describe('computed properties', () => {
    it('isEditing should be true when editorWorkflow is set', () => {
      const store = setupEditorWorkflow();

      expect(store.isEditing).toBe(true);
    });

    it('isEditing should be false when editorWorkflow is null', () => {
      const store = useWorkflowStore();

      expect(store.isEditing).toBe(false);
    });

    it('selectedNode should return the matching node', () => {
      const node = makeNode({ id: 'node-1' });
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [node] }));
      store.selectedNodeId = 'node-1';

      expect(store.selectedNode).toEqual(node);
    });

    it('selectedNode should return null when selectedNodeId is null', () => {
      const store = setupEditorWorkflow(makeWorkflowDetail({ nodes: [makeNode()] }));

      expect(store.selectedNode).toBeNull();
    });
  });
});
