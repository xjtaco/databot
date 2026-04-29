import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { getResourceAdapter } from '@/components/chat/actionCards/resourceAdapters';
import { useNavigationStore } from '@/stores/navigationStore';
import { useScheduleStore } from '@/stores/scheduleStore';
import type { ResourceActionSpec } from '@/types/actionCard';
import type { WorkflowListItem, CustomNodeTemplateInfo } from '@/types/workflow';
import type { DatasourceWithTables, TableMetadata } from '@/types/datafile';
import type { ScheduleListItem } from '@/types/schedule';
import type { KnowledgeFolder, KnowledgeFile } from '@/types/knowledge';

const {
  listWorkflowsMock,
  startWorkflowMock,
  deleteWorkflowMock,
  listTemplatesMock,
  deleteTemplateMock,
  listDatasourcesMock,
  listTablesMock,
  getTableMock,
  deleteDatasourceMock,
  deleteRemoteDatasourceMock,
  deleteTableMock,
  listSchedulesMock,
  updateScheduleMock,
  deleteScheduleMock,
  listFolderTreeMock,
  getFileContentMock,
  deleteFolderMock,
  deleteFileMock,
} = vi.hoisted(() => ({
  listWorkflowsMock: vi.fn<() => Promise<WorkflowListItem[]>>(),
  startWorkflowMock: vi.fn<(id: string) => Promise<string>>(),
  deleteWorkflowMock: vi.fn<(id: string) => Promise<void>>(),
  listTemplatesMock: vi.fn<() => Promise<CustomNodeTemplateInfo[]>>(),
  deleteTemplateMock: vi.fn<(id: string) => Promise<void>>(),
  listDatasourcesMock: vi.fn<() => Promise<{ datasources: DatasourceWithTables[] }>>(),
  listTablesMock: vi.fn<() => Promise<{ tables: TableMetadata[] }>>(),
  getTableMock: vi.fn<(id: string) => Promise<{ table: TableMetadata }>>(),
  deleteDatasourceMock: vi.fn<(id: string) => Promise<void>>(),
  deleteRemoteDatasourceMock: vi.fn<(id: string) => Promise<void>>(),
  deleteTableMock: vi.fn<(id: string) => Promise<void>>(),
  listSchedulesMock: vi.fn<() => Promise<ScheduleListItem[]>>(),
  updateScheduleMock:
    vi.fn<(id: string, input: { enabled?: boolean }) => Promise<ScheduleListItem>>(),
  deleteScheduleMock: vi.fn<(id: string) => Promise<void>>(),
  listFolderTreeMock: vi.fn<() => Promise<{ folders: KnowledgeFolder[] }>>(),
  getFileContentMock: vi.fn<(id: string) => Promise<{ file: KnowledgeFile; content: string }>>(),
  deleteFolderMock: vi.fn<(id: string) => Promise<void>>(),
  deleteFileMock: vi.fn<(id: string) => Promise<void>>(),
}));

vi.mock('@/api/workflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/workflow')>();
  return {
    ...actual,
    listWorkflows: listWorkflowsMock,
    startWorkflow: startWorkflowMock,
    deleteWorkflow: deleteWorkflowMock,
    listTemplates: listTemplatesMock,
    deleteTemplate: deleteTemplateMock,
  };
});

vi.mock('@/api/datafile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/datafile')>();
  return {
    ...actual,
    listDatasources: listDatasourcesMock,
    listTables: listTablesMock,
    getTable: getTableMock,
    deleteDatasource: deleteDatasourceMock,
    deleteTable: deleteTableMock,
  };
});

vi.mock('@/api/datasource', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/datasource')>();
  return {
    ...actual,
    deleteDatasource: deleteRemoteDatasourceMock,
  };
});

vi.mock('@/api/schedule', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/schedule')>();
  return {
    ...actual,
    listSchedules: listSchedulesMock,
    updateSchedule: updateScheduleMock,
    deleteSchedule: deleteScheduleMock,
  };
});

vi.mock('@/api/knowledge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/knowledge')>();
  return {
    ...actual,
    listFolderTree: listFolderTreeMock,
    getFileContent: getFileContentMock,
    deleteFolder: deleteFolderMock,
    deleteFile: deleteFileMock,
  };
});

const allowedActions: ResourceActionSpec[] = [
  { key: 'view' },
  { key: 'edit' },
  { key: 'execute' },
  { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
  { key: 'enable' },
  { key: 'disable' },
];

function workflow(id: string, name: string, description: string | null): WorkflowListItem {
  return {
    id,
    name,
    description,
    nodeCount: 2,
    lastRunAt: null,
    lastRunStatus: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    creatorName: null,
  };
}

function template(id: string, name: string, creatorName: string | null): CustomNodeTemplateInfo {
  return {
    id,
    name,
    description: 'Reusable node',
    type: 'llm',
    config: {
      nodeType: 'llm',
      params: {},
      prompt: '',
      outputVariable: 'result',
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-03T00:00:00Z',
    creatorName,
  };
}

function datasource(id: string, name: string): DatasourceWithTables {
  return {
    id,
    name,
    type: 'mysql',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    tables: [table('table-1', 'Orders')],
  };
}

function table(id: string, displayName: string): TableMetadata {
  return {
    id,
    displayName,
    physicalName: displayName.toLowerCase(),
    type: 'mysql',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  };
}

function schedule(id: string, enabled: boolean): ScheduleListItem {
  return {
    id,
    name: enabled ? 'Enabled schedule' : 'Paused schedule',
    description: '',
    workflowId: 'workflow-1',
    workflowName: 'Daily ETL',
    scheduleType: 'cron',
    cronExpr: '0 8 * * *',
    timezone: 'Asia/Shanghai',
    enabled,
    lastRunId: null,
    lastRunStatus: null,
    lastRunAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    creatorName: null,
  };
}

function knowledgeFile(id: string, name: string, folderId: string): KnowledgeFile {
  return {
    id,
    name,
    folderId,
    fileSize: 128,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-03T00:00:00Z',
  };
}

function knowledgeTree(): KnowledgeFolder[] {
  return [
    {
      id: 'folder-parent',
      name: 'Research',
      parentId: null,
      sortOrder: 0,
      children: [
        {
          id: 'folder-child',
          name: 'Revenue',
          parentId: 'folder-parent',
          sortOrder: 0,
          children: [],
          files: [knowledgeFile('file-child', 'forecast.md', 'folder-child')],
          createdAt: '2026-01-02T00:00:00Z',
          updatedAt: '2026-01-03T00:00:00Z',
        },
      ],
      files: [knowledgeFile('file-parent', 'overview.md', 'folder-parent')],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-03T00:00:00Z',
    },
  ];
}

describe('resource adapters', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    startWorkflowMock.mockResolvedValue('run-1');
    deleteWorkflowMock.mockResolvedValue(undefined);
    listTemplatesMock.mockResolvedValue([template('template-1', 'Reusable LLM', 'Alice')]);
    deleteTemplateMock.mockResolvedValue(undefined);
    listDatasourcesMock.mockResolvedValue({ datasources: [datasource('ds-1', 'Warehouse')] });
    listTablesMock.mockResolvedValue({ tables: [table('table-1', 'Orders')] });
    getTableMock.mockResolvedValue({ table: table('table-1', 'Orders') });
    deleteDatasourceMock.mockResolvedValue(undefined);
    deleteRemoteDatasourceMock.mockResolvedValue(undefined);
    deleteTableMock.mockResolvedValue(undefined);
    listSchedulesMock.mockResolvedValue([
      schedule('schedule-1', true),
      schedule('schedule-2', false),
    ]);
    updateScheduleMock.mockImplementation(async (id, input) => ({
      ...schedule(id, input.enabled ?? false),
      enabled: input.enabled ?? false,
    }));
    deleteScheduleMock.mockResolvedValue(undefined);
    listFolderTreeMock.mockResolvedValue({ folders: knowledgeTree() });
    getFileContentMock.mockResolvedValue({
      file: knowledgeFile('file-child', 'forecast.md', 'folder-child'),
      content: 'Revenue forecast content',
    });
    deleteFolderMock.mockResolvedValue(undefined);
    deleteFileMock.mockResolvedValue(undefined);
  });

  it('filters workflows by name and description and limits rows to 10', async () => {
    listWorkflowsMock.mockResolvedValue([
      workflow('workflow-hidden', 'Inventory', 'No match'),
      ...Array.from({ length: 9 }, (_, index) =>
        workflow(`workflow-${index}`, `Revenue Flow ${index}`, null)
      ),
      workflow('workflow-desc', 'Daily Cleanup', 'Revenue cleanup by description'),
      workflow('workflow-extra', 'Revenue Flow Extra', null),
    ]);

    const rows = await getResourceAdapter('workflow').fetchRows({
      query: 'revenue',
      limit: 10,
      allowedActions,
    });

    expect(rows).toHaveLength(10);
    expect(rows.map((row) => row.title)).toContain('Daily Cleanup');
    expect(rows[0].title).toBe('Revenue Flow 0');
    expect(rows[0].title).not.toBe('workflow-0');
  });

  it('workflow execute calls startWorkflow with the row id', async () => {
    listWorkflowsMock.mockResolvedValue([workflow('workflow-1', 'Daily ETL', null)]);
    const [row] = await getResourceAdapter('workflow').fetchRows({
      query: '',
      limit: 10,
      allowedActions,
    });

    const result = await getResourceAdapter('workflow').executeAction(row, 'execute');

    expect(startWorkflowMock).toHaveBeenCalledWith('workflow-1');
    expect(result.refresh).toBe(true);
  });

  it('filters workflow rows by id when an id is used as the query', async () => {
    listWorkflowsMock.mockResolvedValue([
      workflow('workflow-target', 'Daily ETL', null),
      workflow('workflow-other', 'Other ETL', null),
    ]);

    const rows = await getResourceAdapter('workflow').fetchRows({
      query: 'workflow-target',
      limit: 10,
      allowedActions,
    });

    expect(rows.map((row) => row.id)).toEqual(['workflow-target']);
  });

  it('workflow rows expose never-run status and edit/delete actions execute correctly', async () => {
    listWorkflowsMock.mockResolvedValue([workflow('workflow-1', 'Daily ETL', null)]);
    const [row] = await getResourceAdapter('workflow').fetchRows({
      query: '',
      limit: 10,
      allowedActions,
    });

    expect(row.statusLabel).toBe('chat.actionCards.resource.status.workflow.neverRun');

    const editResult = await getResourceAdapter('workflow').executeAction(row, 'edit');
    const navigationStore = useNavigationStore();
    expect(navigationStore.pendingIntent).toEqual({
      type: 'open_workflow_editor',
      workflowId: 'workflow-1',
    });
    expect(navigationStore.activeNav).toBe('workflow');
    expect(editResult.summaryKey).toBe('chat.actionCards.resource.summary.workflow.edit');

    const deleteResult = await getResourceAdapter('workflow').executeAction(row, 'delete');
    expect(deleteWorkflowMock).toHaveBeenCalledWith('workflow-1');
    expect(deleteResult.refresh).toBe(true);
  });

  it('datasource and table delete call the expected delete methods', async () => {
    const [datasourceRow] = await getResourceAdapter('datasource').fetchRows({
      query: '',
      limit: 10,
      allowedActions,
    });
    const [tableRow] = await getResourceAdapter('table').fetchRows({
      query: '',
      limit: 10,
      allowedActions,
    });

    const datasourceResult = await getResourceAdapter('datasource').executeAction(
      datasourceRow,
      'delete'
    );
    const tableResult = await getResourceAdapter('table').executeAction(tableRow, 'delete');

    expect(deleteRemoteDatasourceMock).toHaveBeenCalledWith('ds-1');
    expect(deleteTableMock).toHaveBeenCalledWith('table-1');
    expect(datasourceResult.refresh).toBe(true);
    expect(tableResult.refresh).toBe(true);
    expect(datasourceRow.title).toBe('Warehouse');
    expect(tableRow.title).toBe('Orders');
    expect(datasourceRow.actions.map((action) => action.key)).toEqual(['delete']);
    expect(tableRow.actions.map((action) => action.key)).toEqual(['view', 'delete']);
  });

  it('table view fetches table details and navigates to data management', async () => {
    const [row] = await getResourceAdapter('table').fetchRows({
      query: '',
      limit: 10,
      allowedActions,
    });

    const result = await getResourceAdapter('table').executeAction(row, 'view');
    const navigationStore = useNavigationStore();

    expect(getTableMock).toHaveBeenCalledWith('table-1');
    expect(navigationStore.pendingIntent).toEqual({ type: 'open_data_management', tab: 'data' });
    expect(navigationStore.activeNav).toBe('data');
    expect(result.summaryKey).toBe('chat.actionCards.resource.summary.table.view');
  });

  it('schedule delete, enable, and disable call the schedule store and request refresh', async () => {
    const rows = await getResourceAdapter('schedule').fetchRows({
      query: '',
      limit: 10,
      allowedActions,
    });
    const enabledRow = rows.find((row) => row.id === 'schedule-1');
    const disabledRow = rows.find((row) => row.id === 'schedule-2');

    expect(enabledRow).toBeDefined();
    expect(disabledRow).toBeDefined();
    if (!enabledRow || !disabledRow) return;

    const deleteResult = await getResourceAdapter('schedule').executeAction(enabledRow, 'delete');
    const disableResult = await getResourceAdapter('schedule').executeAction(enabledRow, 'disable');
    const enableResult = await getResourceAdapter('schedule').executeAction(disabledRow, 'enable');

    expect(deleteScheduleMock).toHaveBeenCalledWith('schedule-1');
    expect(updateScheduleMock).toHaveBeenCalledWith('schedule-1', { enabled: false });
    expect(updateScheduleMock).toHaveBeenCalledWith('schedule-2', { enabled: true });
    expect(deleteResult.refresh).toBe(true);
    expect(disableResult.refresh).toBe(true);
    expect(enableResult.refresh).toBe(true);
    expect(enabledRow.actions.map((action) => action.key)).toEqual(['edit', 'disable', 'delete']);
    expect(disabledRow.actions.map((action) => action.key)).toEqual(['edit', 'enable', 'delete']);
  });

  it('schedule enable executes explicit target state when store state diverges from row snapshot', async () => {
    const rows = await getResourceAdapter('schedule').fetchRows({
      query: '',
      limit: 10,
      allowedActions,
    });
    const disabledRow = rows.find((row) => row.id === 'schedule-2');
    expect(disabledRow).toBeDefined();
    if (!disabledRow) return;

    const scheduleStore = useScheduleStore();
    const liveSchedule = scheduleStore.schedules.find((item) => item.id === 'schedule-2');
    if (liveSchedule) {
      liveSchedule.enabled = true;
    }

    const result = await getResourceAdapter('schedule').executeAction(disabledRow, 'enable');

    expect(updateScheduleMock).toHaveBeenCalledWith('schedule-2', { enabled: true });
    expect(result.refresh).toBe(true);
  });

  it('schedule edit returns an inline form request', async () => {
    const [row] = await getResourceAdapter('schedule').fetchRows({
      query: '',
      limit: 10,
      allowedActions,
    });

    const result = await getResourceAdapter('schedule').executeAction(row, 'edit');

    expect(result.inlineForm).toEqual({ kind: 'schedule_edit', scheduleId: 'schedule-1' });
  });

  it('knowledge folder and file adapters flatten recursively and execute view/delete actions', async () => {
    const folderRows = await getResourceAdapter('knowledge_folder').fetchRows({
      query: '',
      limit: 10,
      allowedActions,
    });
    const fileRows = await getResourceAdapter('knowledge_file').fetchRows({
      query: '',
      limit: 10,
      allowedActions,
    });
    const childFolder = folderRows.find((row) => row.id === 'folder-child');
    const childFile = fileRows.find((row) => row.id === 'file-child');

    expect(childFolder?.title).toBe('Revenue');
    expect(childFolder?.meta).toContainEqual({
      label: 'chat.actionCards.resource.meta.parentName',
      value: 'Research',
    });
    expect(childFile?.title).toBe('forecast.md');
    expect(childFile?.subtitle).toBe('Revenue');
    if (!childFolder || !childFile) return;

    const viewResult = await getResourceAdapter('knowledge_file').executeAction(childFile, 'view');
    const deleteFileResult = await getResourceAdapter('knowledge_file').executeAction(
      childFile,
      'delete'
    );
    const deleteFolderResult = await getResourceAdapter('knowledge_folder').executeAction(
      childFolder,
      'delete'
    );

    expect(getFileContentMock).toHaveBeenCalledWith('file-child');
    expect(viewResult.summaryKey).toBe(
      'chat.actionCards.resource.summary.knowledge_file.viewContent'
    );
    expect(viewResult.summaryParams).toEqual({
      name: 'forecast.md',
      content: 'Revenue forecast content',
    });
    expect(deleteFileMock).toHaveBeenCalledWith('file-child');
    expect(deleteFolderMock).toHaveBeenCalledWith('folder-child');
    expect(deleteFileResult.refresh).toBe(true);
    expect(deleteFolderResult.refresh).toBe(true);
  });

  it('template adapter exposes metadata and executes edit/delete actions', async () => {
    const [row] = await getResourceAdapter('template').fetchRows({
      query: 'reusable',
      limit: 10,
      allowedActions,
    });

    expect(row.title).toBe('Reusable LLM');
    expect(row.meta).toContainEqual({
      label: 'chat.actionCards.resource.meta.type',
      value: 'llm',
    });
    expect(row.meta).toContainEqual({
      label: 'chat.actionCards.resource.meta.updatedAt',
      value: '2026-01-03T00:00:00Z',
    });
    expect(row.meta).toContainEqual({
      label: 'chat.actionCards.resource.meta.creatorName',
      value: 'Alice',
    });

    const editResult = await getResourceAdapter('template').executeAction(row, 'edit');
    const navigationStore = useNavigationStore();
    expect(navigationStore.pendingIntent).toEqual({
      type: 'open_template_editor',
      templateId: 'template-1',
    });
    expect(navigationStore.activeNav).toBe('workflow');
    expect(editResult.summaryKey).toBe('chat.actionCards.resource.summary.template.edit');

    const deleteResult = await getResourceAdapter('template').executeAction(row, 'delete');
    expect(deleteTemplateMock).toHaveBeenCalledWith('template-1');
    expect(deleteResult.refresh).toBe(true);
  });
});
