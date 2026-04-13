import { ref, reactive, computed } from 'vue';
import { defineStore } from 'pinia';
import JSZip from 'jszip';
import * as workflowApi from '@/api/workflow';
import type {
  WorkflowListItem,
  WorkflowDetail,
  WorkflowNodeInfo,
  WorkflowEdgeInfo,
  WorkflowRunInfo,
  WorkflowRunDetail,
  WorkflowNodeType,
  NodeConfig,
  SaveWorkflowInput,
  CustomNodeTemplateInfo,
  ExecutionStatus,
  WsWorkflowEvent,
  ListRunsParams,
  ExportedWorkflow,
  ImportResultItem,
} from '@/types/workflow';
import { useAuthStore } from './authStore';

type NodePositionUpdateSource = 'user-drag' | 'system';

export const useWorkflowStore = defineStore('workflow', () => {
  // ── List State ──────────────────────────────────────
  const workflows = ref<WorkflowListItem[]>([]);
  const isLoading = ref(false);
  const searchQuery = ref('');
  const statusFilter = ref<ExecutionStatus | 'all' | 'never_run'>('all');

  // ── Editor State ────────────────────────────────────
  const editorWorkflow = ref<WorkflowDetail | null>(null);
  const isDirty = ref(false);
  const selectedNodeId = ref<string | null>(null);
  const hasManualLayoutEdits = ref(false);

  // ── Execution State ─────────────────────────────────
  const currentRunId = ref<string | null>(null);
  const isExecuting = ref(false);
  const nodeExecutionStates = reactive<Map<string, ExecutionStatus>>(new Map());
  const lastRunDetail = ref<WorkflowRunDetail | null>(null);

  // ── Run History ─────────────────────────────────────
  const runs = ref<WorkflowRunInfo[]>([]);

  // ── History State ──────────────────────────────────
  const historyRuns = ref<WorkflowRunInfo[]>([]);
  const historyTotal = ref(0);
  const historyPage = ref(1);
  const historyPageSize = ref(20);
  const historyStatusFilter = ref<ExecutionStatus | 'all'>('all');
  const historyDateRange = ref<[string, string] | null>(null);
  const historyLoading = ref(false);
  const expandedRunDetails = reactive<Map<string, WorkflowRunDetail>>(new Map());
  const expandedRunLoading = ref<string | null>(null);

  // ── Node Cascade State ──────────────────────────────
  const nodeCascadeStates = ref(new Map<string, boolean>());

  // ── Custom Templates ────────────────────────────────
  const customTemplates = ref<CustomNodeTemplateInfo[]>([]);
  const activeTab = ref<'workflows' | 'customNodes'>('workflows');
  const editingTemplateId = ref<string | null>(null);
  let latestEditorLoadRequestId = 0;

  // ── Computed ─────────────────────────────────────────
  const isEditing = computed(() => editorWorkflow.value !== null);

  const selectedNode = computed(() => {
    if (!editorWorkflow.value || !selectedNodeId.value) return null;
    return editorWorkflow.value.nodes.find((n) => n.id === selectedNodeId.value) ?? null;
  });

  const filteredWorkflows = computed(() => {
    let result = workflows.value;
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          (w.description && w.description.toLowerCase().includes(q))
      );
    }
    if (statusFilter.value !== 'all') {
      if (statusFilter.value === 'never_run') {
        result = result.filter((w) => w.lastRunStatus === null);
      } else {
        result = result.filter((w) => w.lastRunStatus === statusFilter.value);
      }
    }
    return result;
  });

  // ── List Actions ─────────────────────────────────────
  async function fetchWorkflows(): Promise<void> {
    isLoading.value = true;
    try {
      workflows.value = await workflowApi.listWorkflows();
    } finally {
      isLoading.value = false;
    }
  }

  async function createWorkflow(name: string, description?: string): Promise<string> {
    const workflow = await workflowApi.createWorkflow(name, description);
    await fetchWorkflows();
    return workflow.id;
  }

  async function removeWorkflow(id: string): Promise<void> {
    await workflowApi.deleteWorkflow(id);
    await fetchWorkflows();
  }

  async function cloneWorkflow(id: string, name: string): Promise<void> {
    await workflowApi.cloneWorkflow(id, name);
    await fetchWorkflows();
  }

  async function exportWorkflow(id: string): Promise<void> {
    const workflow = workflows.value.find((w) => w.id === id);
    const data = await workflowApi.exportWorkflow(id);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow?.name ?? 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function batchExportWorkflows(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    if (ids.length === 1) {
      await exportWorkflow(ids[0]);
      return;
    }

    // Fetch all exports concurrently
    const results = await Promise.all(
      ids.map(async (id) => {
        const wf = workflows.value.find((w) => w.id === id);
        const data = await workflowApi.exportWorkflow(id);
        return { name: wf?.name ?? 'workflow', data };
      })
    );

    // Build zip with sanitized filenames
    const zip = new JSZip();
    const usedNames = new Map<string, number>();

    for (const { name, data } of results) {
      const sanitized = sanitizeFilename(name);
      const count = usedNames.get(sanitized) ?? 0;
      const fileName = count === 0 ? `${sanitized}.json` : `${sanitized}(${count}).json`;
      usedNames.set(sanitized, count + 1);
      zip.file(fileName, JSON.stringify(data, null, 2));
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflows-export.zip';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File): Promise<ImportResultItem[]> {
    const importResults: ImportResultItem[] = [];
    const workflowsToImport: { name: string; data: ExportedWorkflow }[] = [];

    if (file.name.endsWith('.json')) {
      const text = await file.text();
      const parsed = JSON.parse(text) as ExportedWorkflow;
      if (!parsed.name || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        throw new Error('invalid_format');
      }
      workflowsToImport.push({ name: parsed.name, data: parsed });
    } else if (file.name.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      const jsonFiles = Object.keys(zip.files).filter(
        (f) => f.endsWith('.json') && !zip.files[f].dir
      );
      if (jsonFiles.length === 0) {
        throw new Error('no_valid_files');
      }
      for (const jsonFile of jsonFiles) {
        const text = await zip.files[jsonFile].async('text');
        try {
          const parsed = JSON.parse(text) as ExportedWorkflow;
          if (parsed.name && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
            workflowsToImport.push({ name: parsed.name, data: parsed });
          }
        } catch {
          // Skip invalid JSON files in zip
        }
      }
      if (workflowsToImport.length === 0) {
        throw new Error('no_valid_files');
      }
    } else {
      throw new Error('invalid_format');
    }

    // Import sequentially for deterministic rename ordering
    for (const { name, data } of workflowsToImport) {
      try {
        const result = await workflowApi.importWorkflow(data);
        importResults.push({ originalName: name, result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        importResults.push({ originalName: name, error: msg });
      }
    }

    // Refresh list after import
    await fetchWorkflows();
    return importResults;
  }

  // ── Editor Actions ───────────────────────────────────
  async function loadForEditing(id: string): Promise<void> {
    const requestId = ++latestEditorLoadRequestId;
    const preserveManualLayoutSession =
      editorWorkflow.value?.id === id && hasManualLayoutEdits.value;
    const workflow = await workflowApi.getWorkflow(id);
    if (requestId !== latestEditorLoadRequestId) {
      return;
    }

    editorWorkflow.value = workflow;
    isDirty.value = false;
    selectedNodeId.value = null;
    hasManualLayoutEdits.value = preserveManualLayoutSession;
    nodeExecutionStates.clear();
    lastRunDetail.value = null;

    // Load the most recent completed run so node previews are available
    try {
      const runList = await workflowApi.listRuns(id);
      if (requestId !== latestEditorLoadRequestId) {
        return;
      }

      const lastCompleted = runList.find((r) => r.status === 'completed');
      if (lastCompleted) {
        const runDetail = await workflowApi.getRunDetail(id, lastCompleted.id);
        if (requestId !== latestEditorLoadRequestId) {
          return;
        }
        lastRunDetail.value = runDetail;
      }
    } catch {
      // Best effort — previews just won't be available
    }
  }

  function closeEditor(): void {
    latestEditorLoadRequestId += 1;
    editorWorkflow.value = null;
    isDirty.value = false;
    selectedNodeId.value = null;
    hasManualLayoutEdits.value = false;
    currentRunId.value = null;
    nodeExecutionStates.clear();
    lastRunDetail.value = null;
  }

  let tempIdCounter = 0;

  function addNode(type: WorkflowNodeType, position: { x: number; y: number }): string {
    if (!editorWorkflow.value) return '';
    tempIdCounter++;
    const tempId = `temp_${tempIdCounter}_${Date.now()}`;
    const defaultConfig = getDefaultConfig(type);
    const nodeName = `${type}_${editorWorkflow.value.nodes.length + 1}`;

    const newNode: WorkflowNodeInfo = {
      id: tempId,
      workflowId: editorWorkflow.value.id,
      name: nodeName,
      description: null,
      type,
      config: defaultConfig,
      positionX: position.x,
      positionY: position.y,
    };

    editorWorkflow.value.nodes.push(newNode);
    isDirty.value = true;
    selectedNodeId.value = tempId;
    return tempId;
  }

  function removeNode(nodeId: string): void {
    if (!editorWorkflow.value) return;
    editorWorkflow.value.nodes = editorWorkflow.value.nodes.filter((n) => n.id !== nodeId);
    editorWorkflow.value.edges = editorWorkflow.value.edges.filter(
      (e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId
    );
    if (selectedNodeId.value === nodeId) {
      selectedNodeId.value = null;
    }
    isDirty.value = true;
  }

  function updateWorkflowName(name: string): void {
    if (!editorWorkflow.value) return;
    editorWorkflow.value.name = name;
    isDirty.value = true;
  }

  function updateWorkflowDescription(description: string): void {
    if (!editorWorkflow.value) return;
    editorWorkflow.value.description = description || null;
    isDirty.value = true;
  }

  function updateNodeConfig(nodeId: string, updates: Partial<WorkflowNodeInfo>): void {
    if (!editorWorkflow.value) return;
    const node = editorWorkflow.value.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    Object.assign(node, updates);
    isDirty.value = true;
  }

  function updateNodePosition(
    nodeId: string,
    x: number,
    y: number,
    options?: { source?: NodePositionUpdateSource }
  ): void {
    if (!editorWorkflow.value) return;
    const node = editorWorkflow.value.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    node.positionX = x;
    node.positionY = y;
    if (options?.source === 'user-drag') {
      hasManualLayoutEdits.value = true;
    }
    isDirty.value = true;
  }

  function addEdge(
    sourceNodeId: string,
    targetNodeId: string,
    sourceHandle?: string | null
  ): string | null {
    if (!editorWorkflow.value) return null;
    // Check for duplicate
    const exists = editorWorkflow.value.edges.some(
      (e) => e.sourceNodeId === sourceNodeId && e.targetNodeId === targetNodeId
    );
    if (exists) return null;

    const edgeId = `edge_${Date.now()}`;
    const newEdge: WorkflowEdgeInfo = {
      id: edgeId,
      workflowId: editorWorkflow.value.id,
      sourceNodeId,
      targetNodeId,
      sourceHandle: sourceHandle ?? undefined,
    };
    editorWorkflow.value.edges.push(newEdge);

    // Auto-configure: pass upstream output as downstream input param
    const sourceNode = editorWorkflow.value.nodes.find((n) => n.id === sourceNodeId);
    const targetNode = editorWorkflow.value.nodes.find((n) => n.id === targetNodeId);
    if (sourceNode && targetNode) {
      const outputVar = sourceNode.config.outputVariable;
      if (
        outputVar &&
        (targetNode.config.nodeType === 'python' || targetNode.config.nodeType === 'llm')
      ) {
        const paramKey = sourceNode.name;
        if (!(paramKey in targetNode.config.params)) {
          targetNode.config.params[paramKey] = outputVar;
        }
      }
    }

    isDirty.value = true;
    return edgeId;
  }

  function removeEdge(edgeId: string): void {
    if (!editorWorkflow.value) return;
    editorWorkflow.value.edges = editorWorkflow.value.edges.filter((e) => e.id !== edgeId);
    isDirty.value = true;
  }

  function selectNode(nodeId: string | null): void {
    selectedNodeId.value = nodeId;
  }

  async function saveWorkflow(): Promise<void> {
    if (!editorWorkflow.value) return;
    const wf = editorWorkflow.value;

    const input: SaveWorkflowInput = {
      name: wf.name,
      description: wf.description ?? undefined,
      nodes: wf.nodes.map((n) => ({
        id: n.id.startsWith('temp_') ? undefined : n.id,
        tempId: n.id.startsWith('temp_') ? n.id : undefined,
        name: n.name,
        description: n.description ?? undefined,
        type: n.type,
        config: n.config,
        positionX: n.positionX,
        positionY: n.positionY,
      })),
      edges: wf.edges.map((e) => ({
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        sourceHandle: e.sourceHandle,
      })),
    };

    const updated = await workflowApi.saveWorkflow(wf.id, input);
    editorWorkflow.value = updated;
    isDirty.value = false;
    await fetchWorkflows();
  }

  // ── Execution WebSocket ─────────────────────────────
  let executionWs: WebSocket | null = null;

  function buildWorkflowWsUrl(runId: string): string {
    const wsBase = import.meta.env.VITE_WS_URL || '/ws';
    const prefix = wsBase.startsWith('/')
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${wsBase}`
      : wsBase;
    return `${prefix}/workflow?runId=${runId}`;
  }

  function connectExecutionWs(runId: string): void {
    disconnectExecutionWs();
    const url = buildWorkflowWsUrl(runId);
    const ws = new WebSocket(url);

    ws.onopen = () => {
      // Send auth handshake as first frame
      const authStore = useAuthStore();
      if (authStore.accessToken) {
        ws.send(JSON.stringify({ type: 'auth', token: authStore.accessToken }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as WsWorkflowEvent;
        handleExecutionEvent(data);

        // When run completes, fetch final run detail and disconnect
        if (data.type === 'run_complete' && editorWorkflow.value) {
          workflowApi
            .getRunDetail(editorWorkflow.value.id, runId)
            .then((run) => {
              lastRunDetail.value = run;
            })
            .catch(() => {
              // Best effort — states already updated via WebSocket events
            });
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      executionWs = null;
    };

    executionWs = ws;
  }

  function disconnectExecutionWs(): void {
    if (executionWs) {
      executionWs.onmessage = null;
      executionWs.onclose = null;
      executionWs.close();
      executionWs = null;
    }
  }

  // ── Execution Actions ────────────────────────────────
  async function executeWorkflow(params?: Record<string, string>): Promise<void> {
    if (!editorWorkflow.value) throw new Error('No workflow loaded');
    isExecuting.value = true;
    nodeExecutionStates.clear();
    // Set all nodes to pending initially
    for (const n of editorWorkflow.value.nodes) {
      nodeExecutionStates.set(n.id, 'pending');
    }
    const runId = await workflowApi.startWorkflow(editorWorkflow.value.id, params);
    currentRunId.value = runId;
    connectExecutionWs(runId);
  }

  async function executeNode(
    nodeId: string,
    params?: Record<string, string>,
    cascade?: boolean
  ): Promise<void> {
    if (!editorWorkflow.value) throw new Error('No workflow loaded');
    isExecuting.value = true;
    nodeExecutionStates.clear();
    const runId = await workflowApi.startNode(editorWorkflow.value.id, nodeId, params, cascade);
    currentRunId.value = runId;
    connectExecutionWs(runId);
  }

  async function retryRun(runId: string): Promise<void> {
    if (!editorWorkflow.value) throw new Error('No workflow loaded');
    isExecuting.value = true;
    const newRunId = await workflowApi.retryRun(editorWorkflow.value.id, runId);
    currentRunId.value = newRunId;
    connectExecutionWs(newRunId);
  }

  function updateNodeExecutionStatus(nodeId: string, status: ExecutionStatus): void {
    nodeExecutionStates.set(nodeId, status);
  }

  function resetExecutionState(): void {
    nodeExecutionStates.clear();
    lastRunDetail.value = null;
    currentRunId.value = null;
    isExecuting.value = false;
  }

  function handleExecutionEvent(event: WsWorkflowEvent): void {
    if (event.nodeId) {
      switch (event.type) {
        case 'node_start':
          updateNodeExecutionStatus(event.nodeId, 'running');
          break;
        case 'node_complete':
          updateNodeExecutionStatus(event.nodeId, 'completed');
          break;
        case 'node_error':
          updateNodeExecutionStatus(event.nodeId, 'failed');
          break;
        case 'node_skipped':
          updateNodeExecutionStatus(event.nodeId, 'skipped');
          break;
      }
    }
    if (event.type === 'run_complete') {
      isExecuting.value = false;
    }
  }

  // ── Run History ──────────────────────────────────────
  async function fetchRuns(workflowId: string): Promise<void> {
    runs.value = await workflowApi.listRuns(workflowId);
  }

  // ── History Actions ─────────────────────────────────
  async function fetchHistoryRuns(workflowId: string): Promise<void> {
    historyLoading.value = true;
    try {
      const params: ListRunsParams = {
        page: historyPage.value,
        pageSize: historyPageSize.value,
      };
      if (historyStatusFilter.value !== 'all') {
        params.status = historyStatusFilter.value;
      }
      if (historyDateRange.value) {
        params.startFrom = historyDateRange.value[0];
        params.startTo = historyDateRange.value[1];
      }
      const result = await workflowApi.listRunsPaginated(workflowId, params);
      historyRuns.value = result.runs;
      historyTotal.value = result.total;
    } finally {
      historyLoading.value = false;
    }
  }

  async function fetchRunDetailForHistory(workflowId: string, runId: string): Promise<void> {
    if (expandedRunDetails.has(runId)) return;
    expandedRunLoading.value = runId;
    try {
      const detail = await workflowApi.getRunDetail(workflowId, runId);
      expandedRunDetails.set(runId, detail);
    } finally {
      expandedRunLoading.value = null;
    }
  }

  function resetHistoryState(): void {
    historyRuns.value = [];
    historyTotal.value = 0;
    historyPage.value = 1;
    historyPageSize.value = 20;
    historyStatusFilter.value = 'all';
    historyDateRange.value = null;
    historyLoading.value = false;
    expandedRunDetails.clear();
    expandedRunLoading.value = null;
  }

  // ── Custom Templates ─────────────────────────────────
  async function fetchTemplates(): Promise<void> {
    customTemplates.value = await workflowApi.listTemplates();
  }

  async function saveNodeAsTemplate(
    nodeId: string,
    templateName: string,
    templateDescription?: string
  ): Promise<void> {
    if (!editorWorkflow.value) return;
    const node = editorWorkflow.value.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    await workflowApi.createTemplate({
      name: templateName,
      description: templateDescription,
      type: node.type,
      config: node.config,
    });
    await fetchTemplates();
  }

  async function removeTemplate(id: string): Promise<void> {
    await workflowApi.deleteTemplate(id);
    await fetchTemplates();
  }

  function addNodeFromTemplate(
    type: WorkflowNodeType,
    position: { x: number; y: number },
    templateId: string
  ): string {
    if (!editorWorkflow.value) return '';
    const template = customTemplates.value.find((t) => t.id === templateId);
    if (!template) return '';

    tempIdCounter++;
    const tempId = `temp_${tempIdCounter}_${Date.now()}`;
    const config = JSON.parse(JSON.stringify(template.config));
    const nodeName = `${type}_${editorWorkflow.value.nodes.length + 1}`;

    const newNode: WorkflowNodeInfo = {
      id: tempId,
      workflowId: editorWorkflow.value.id,
      name: nodeName,
      description: null,
      type,
      config,
      positionX: position.x,
      positionY: position.y,
    };

    editorWorkflow.value.nodes.push(newNode);
    isDirty.value = true;
    selectedNodeId.value = tempId;
    return tempId;
  }

  async function updateTemplate(
    id: string,
    data: { name?: string; description?: string; type?: string; config?: NodeConfig }
  ): Promise<void> {
    await workflowApi.updateTemplate(id, data);
    await fetchTemplates();
  }

  async function batchExportTemplates(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    if (ids.length === 1) {
      const template = customTemplates.value.find((t) => t.id === ids[0]);
      if (!template) return;
      const data = {
        name: template.name,
        description: template.description,
        type: template.type,
        config: template.config,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFilename(template.name)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // Build zip with sanitized filenames
    const zip = new JSZip();
    const usedNames = new Map<string, number>();

    for (const id of ids) {
      const template = customTemplates.value.find((t) => t.id === id);
      if (!template) continue;
      const data = {
        name: template.name,
        description: template.description,
        type: template.type,
        config: template.config,
      };
      const sanitized = sanitizeFilename(template.name);
      const count = usedNames.get(sanitized) ?? 0;
      const fileName = count === 0 ? `${sanitized}.json` : `${sanitized}(${count}).json`;
      usedNames.set(sanitized, count + 1);
      zip.file(fileName, JSON.stringify(data, null, 2));
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'custom-nodes-export.zip';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importTemplates(file: File): Promise<ImportResultItem[]> {
    const importResults: ImportResultItem[] = [];
    const templatesToImport: {
      name: string;
      description: string | null;
      type: string;
      config: NodeConfig;
    }[] = [];

    if (file.name.endsWith('.json')) {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (
        typeof parsed.name !== 'string' ||
        typeof parsed.type !== 'string' ||
        typeof parsed.config !== 'object' ||
        parsed.config === null ||
        Array.isArray(parsed.config)
      ) {
        throw new Error('invalid_format');
      }
      templatesToImport.push({
        name: parsed.name,
        description: typeof parsed.description === 'string' ? parsed.description : null,
        type: parsed.type,
        config: parsed.config as NodeConfig,
      });
    } else if (file.name.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      const jsonFiles = Object.keys(zip.files).filter(
        (f) => f.endsWith('.json') && !zip.files[f].dir
      );
      if (jsonFiles.length === 0) {
        throw new Error('no_valid_files');
      }
      for (const jsonFile of jsonFiles) {
        const text = await zip.files[jsonFile].async('text');
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          if (
            typeof parsed.name === 'string' &&
            typeof parsed.type === 'string' &&
            typeof parsed.config === 'object' &&
            parsed.config !== null &&
            !Array.isArray(parsed.config)
          ) {
            templatesToImport.push({
              name: parsed.name,
              description: typeof parsed.description === 'string' ? parsed.description : null,
              type: parsed.type,
              config: parsed.config as NodeConfig,
            });
          }
        } catch {
          // Skip invalid JSON files in zip
        }
      }
      if (templatesToImport.length === 0) {
        throw new Error('no_valid_files');
      }
    } else {
      throw new Error('invalid_format');
    }

    // Import sequentially for deterministic rename ordering
    for (const item of templatesToImport) {
      try {
        const result = await workflowApi.createTemplate({
          name: item.name,
          description: item.description ?? undefined,
          type: item.type as import('@/types/workflow').WorkflowNodeType,
          config: item.config,
        });
        importResults.push({
          originalName: item.name,
          result: { id: result.id, name: result.name, renamed: false },
        });
      } catch (err: unknown) {
        // Only retry with renamed name on conflict errors (unique constraint violation)
        const errMsg = err instanceof Error ? err.message : String(err);
        const isConflict =
          errMsg.toLowerCase().includes('unique') || errMsg.toLowerCase().includes('duplicate');

        if (isConflict) {
          try {
            const renamedName = `${item.name} (1)`;
            const result = await workflowApi.createTemplate({
              name: renamedName,
              description: item.description ?? undefined,
              type: item.type,
              config: item.config,
            });
            importResults.push({
              originalName: item.name,
              result: { id: result.id, name: result.name, renamed: true },
            });
          } catch (retryErr) {
            const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            importResults.push({ originalName: item.name, error: retryMsg });
          }
        } else {
          importResults.push({ originalName: item.name, error: errMsg });
        }
      }
    }

    // Refresh list after import
    await fetchTemplates();
    return importResults;
  }

  function enterCustomNodeEditor(templateId: string): void {
    editingTemplateId.value = templateId || null;
  }

  function exitCustomNodeEditor(): void {
    editingTemplateId.value = null;
  }

  // ── Node Cascade Actions ────────────────────────────
  function setNodeCascade(nodeId: string, cascade: boolean): void {
    nodeCascadeStates.value.set(nodeId, cascade);
  }

  function getNodeCascade(nodeId: string): boolean {
    return nodeCascadeStates.value.get(nodeId) ?? false;
  }

  return {
    // List
    workflows,
    isLoading,
    searchQuery,
    statusFilter,
    filteredWorkflows,
    fetchWorkflows,
    createWorkflow,
    removeWorkflow,
    cloneWorkflow,
    exportWorkflow,
    batchExportWorkflows,
    handleImportFile,
    // Editor
    editorWorkflow,
    isDirty,
    selectedNodeId,
    selectedNode,
    isEditing,
    hasManualLayoutEdits,
    loadForEditing,
    closeEditor,
    updateWorkflowName,
    updateWorkflowDescription,
    addNode,
    removeNode,
    updateNodeConfig,
    updateNodePosition,
    addEdge,
    removeEdge,
    selectNode,
    saveWorkflow,
    // Execution
    currentRunId,
    isExecuting,
    nodeExecutionStates,
    lastRunDetail,
    executeWorkflow,
    executeNode,
    retryRun,
    updateNodeExecutionStatus,
    resetExecutionState,
    handleExecutionEvent,
    // Run History
    runs,
    fetchRuns,
    // History
    historyRuns,
    historyTotal,
    historyPage,
    historyPageSize,
    historyStatusFilter,
    historyDateRange,
    historyLoading,
    expandedRunDetails,
    expandedRunLoading,
    fetchHistoryRuns,
    fetchRunDetailForHistory,
    resetHistoryState,
    // Node Cascade
    nodeCascadeStates,
    setNodeCascade,
    getNodeCascade,
    // Custom Templates
    customTemplates,
    activeTab,
    editingTemplateId,
    fetchTemplates,
    saveNodeAsTemplate,
    removeTemplate,
    addNodeFromTemplate,
    updateTemplate,
    batchExportTemplates,
    importTemplates,
    enterCustomNodeEditor,
    exitCustomNodeEditor,
  };
});

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_');
}

function generateCsvFileName(): string {
  const id = Math.random().toString(36).slice(2, 8);
  return `query_${id}.csv`;
}

function getDefaultConfig(type: WorkflowNodeType): NodeConfig {
  switch (type) {
    case 'sql':
      return {
        nodeType: 'sql',
        datasourceId: '',
        params: {},
        sql: 'SELECT * FROM ',
        outputVariable: generateCsvFileName(),
      };
    case 'python':
      return {
        nodeType: 'python',
        params: {},
        script:
          '# params dict contains upstream node outputs\n# e.g. params["sql_1"] = "query_xxx.csv"\n\nresult = {"status": "ok"}',
        outputVariable: 'result',
      };
    case 'llm':
      return {
        nodeType: 'llm',
        params: {},
        prompt: '',
        outputVariable: 'result',
      };
    case 'email':
      return {
        nodeType: 'email',
        to: '',
        subject: '',
        contentSource: 'inline',
        body: '',
        isHtml: true,
        outputVariable: 'email_result',
      };
    case 'branch':
      return {
        nodeType: 'branch',
        field: '',
        outputVariable: 'branch_result',
      };
    case 'web_search':
      return {
        nodeType: 'web_search',
        params: {},
        keywords: '',
        outputVariable: 'search_result',
      };
  }
}
