import * as workflowApi from '@/api/workflow';
import { getFileContent } from '@/api/knowledge';
import { useDatafileStore } from '@/stores/datafileStore';
import { useKnowledgeStore } from '@/stores/knowledgeStore';
import { useNavigationStore } from '@/stores/navigationStore';
import { useScheduleStore } from '@/stores/scheduleStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import type {
  ConfirmationMode,
  ResourceActionCardType,
  ResourceActionKey,
  ResourceActionSpec,
  RiskLevel,
} from '@/types/actionCard';
import type {
  DatabaseDatasourceType,
  DatasourceWithTables,
  TableMetadata,
  TableSourceType,
} from '@/types/datafile';
import type { KnowledgeFile, KnowledgeFolder } from '@/types/knowledge';
import type { ScheduleListItem } from '@/types/schedule';
import type { CustomNodeTemplateInfo, WorkflowListItem } from '@/types/workflow';

export interface ResourceRowMeta {
  label: string;
  value: string;
}

export type ResourceInlineFormRequest = { kind: 'schedule_edit'; scheduleId: string } | null;

export interface ResourceRowAction {
  key: ResourceActionKey;
  labelKey: string;
  icon: 'Edit' | 'VideoPlay' | 'Delete' | 'View' | 'TurnOff' | 'Open';
  riskLevel?: RiskLevel;
  confirmationMode?: ConfirmationMode;
}

type ResourceRowData =
  | { kind: 'workflow'; workflow: WorkflowListItem }
  | { kind: 'datasource'; datasource: DatasourceWithTables }
  | { kind: 'table'; table: TableMetadata }
  | { kind: 'schedule'; schedule: ScheduleListItem }
  | { kind: 'knowledge_folder'; folder: KnowledgeFolder; parentName?: string }
  | { kind: 'knowledge_file'; file: KnowledgeFile; folderName: string }
  | { kind: 'template'; template: CustomNodeTemplateInfo };

export interface ResourceRow {
  id: string;
  title: string;
  subtitle?: string;
  meta: ResourceRowMeta[];
  statusLabel?: string;
  actions: ResourceRowAction[];
  rawType: ResourceActionCardType;
  data: ResourceRowData;
}

export interface ResourceFetchContext {
  query: string;
  limit: number;
  allowedActions: ResourceActionSpec[];
}

export interface ResourceActionResult {
  summaryKey: string;
  summaryParams?: Record<string, string | number>;
  refresh?: boolean;
  inlineForm?: ResourceInlineFormRequest;
}

export interface ResourceAdapter {
  fetchRows: (context: ResourceFetchContext) => Promise<ResourceRow[]>;
  executeAction: (row: ResourceRow, actionKey: ResourceActionKey) => Promise<ResourceActionResult>;
}

const RESOURCE_KEY_PREFIX = 'chat.actionCards.resource';
const KNOWLEDGE_CONTENT_PREVIEW_LIMIT = 2_000;

const DEFAULT_ALLOWED_ACTIONS: Record<ResourceActionCardType, ResourceActionSpec[]> = {
  workflow: [
    { key: 'edit' },
    { key: 'execute' },
    { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
  ],
  datasource: [{ key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
  table: [{ key: 'view' }, { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
  schedule: [
    { key: 'edit' },
    { key: 'enable' },
    { key: 'disable' },
    { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
  ],
  knowledge_folder: [{ key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
  knowledge_file: [
    { key: 'view' },
    { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' },
  ],
  template: [{ key: 'edit' }, { key: 'delete', riskLevel: 'danger', confirmationMode: 'modal' }],
};

const DATABASE_DATASOURCE_TYPES: readonly DatabaseDatasourceType[] = [
  'sqlite',
  'mysql',
  'sqlserver',
  'mariadb',
  'oracle',
  'db2',
  'saphana',
  'kingbase',
  'clickhouse',
  'spark',
  'hive2',
  'starrocks',
  'trino',
  'prestodb',
  'tidb',
  'dameng',
  'postgresql',
];

const ACTION_ICONS: Record<ResourceActionKey, ResourceRowAction['icon']> = {
  view: 'View',
  edit: 'Edit',
  execute: 'VideoPlay',
  delete: 'Delete',
  enable: 'Open',
  disable: 'TurnOff',
};

export function getDefaultAllowedActions(
  resourceType: ResourceActionCardType
): ResourceActionSpec[] {
  return DEFAULT_ALLOWED_ACTIONS[resourceType].map((action) => ({ ...action }));
}

export function getResourceAdapter(resourceType: ResourceActionCardType): ResourceAdapter {
  return adapters[resourceType];
}

function buildActions(
  resourceType: ResourceActionCardType,
  allowedActions: ResourceActionSpec[],
  visibleKeys?: ResourceActionKey[]
): ResourceRowAction[] {
  const allowedByKey = new Map(allowedActions.map((action) => [action.key, action]));
  const visibleKeySet = new Set(
    visibleKeys ?? DEFAULT_ALLOWED_ACTIONS[resourceType].map((action) => action.key)
  );
  return DEFAULT_ALLOWED_ACTIONS[resourceType]
    .filter(
      (supportedAction) =>
        allowedByKey.has(supportedAction.key) && visibleKeySet.has(supportedAction.key)
    )
    .map((supportedAction) => {
      const allowedAction = allowedByKey.get(supportedAction.key);
      return {
        key: supportedAction.key,
        labelKey: `${RESOURCE_KEY_PREFIX}.actions.${supportedAction.key}`,
        icon: ACTION_ICONS[supportedAction.key],
        riskLevel: allowedAction?.riskLevel ?? supportedAction.riskLevel,
        confirmationMode: allowedAction?.confirmationMode ?? supportedAction.confirmationMode,
      };
    });
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function matchesQuery(query: string, values: Array<string | null | undefined>): boolean {
  if (!query) return true;
  return values.some((value) => value?.toLowerCase().includes(query));
}

function limitRows<T>(rows: T[], limit: number): T[] {
  return rows.slice(0, Math.max(0, limit));
}

function meta(label: string, value: string | number | null | undefined): ResourceRowMeta | null {
  if (value === null || value === undefined || value === '') return null;
  return { label: `${RESOURCE_KEY_PREFIX}.meta.${label}`, value: String(value) };
}

function compactMeta(items: Array<ResourceRowMeta | null>): ResourceRowMeta[] {
  return items.filter((item): item is ResourceRowMeta => item !== null);
}

function summary(actionKey: ResourceActionKey, resourceType: ResourceActionCardType): string {
  return `${RESOURCE_KEY_PREFIX}.summary.${resourceType}.${actionKey}`;
}

function contentPreview(content: string): string {
  if (content.length <= KNOWLEDGE_CONTENT_PREVIEW_LIMIT) return content;
  return content.slice(0, KNOWLEDGE_CONTENT_PREVIEW_LIMIT);
}

function isDatabaseDatasourceType(type: TableSourceType): type is DatabaseDatasourceType {
  return DATABASE_DATASOURCE_TYPES.some((databaseType) => databaseType === type);
}

function ensureDatabaseDatasourceType(type: DatasourceWithTables['type']): DatabaseDatasourceType {
  if (isDatabaseDatasourceType(type)) return type;
  throw new Error(`Unsupported datasource type: ${type}`);
}

function assertRowData<TKind extends ResourceRowData['kind']>(
  row: ResourceRow,
  kind: TKind
): Extract<ResourceRowData, { kind: TKind }> {
  if (row.data.kind !== kind) {
    throw new Error(`Expected ${kind} row, received ${row.data.kind}`);
  }
  return row.data as Extract<ResourceRowData, { kind: TKind }>;
}

const workflowAdapter: ResourceAdapter = {
  async fetchRows(context) {
    const store = useWorkflowStore();
    await store.fetchWorkflows();
    const query = normalizeQuery(context.query);
    return limitRows(
      store.workflows
        .filter((workflow) =>
          matchesQuery(query, [workflow.id, workflow.name, workflow.description])
        )
        .map((workflow) => ({
          id: workflow.id,
          title: workflow.name,
          subtitle: workflow.description ?? undefined,
          meta: compactMeta([
            meta('nodeCount', workflow.nodeCount),
            meta('updatedAt', workflow.updatedAt),
          ]),
          statusLabel: workflow.lastRunStatus
            ? `${RESOURCE_KEY_PREFIX}.status.workflow.${workflow.lastRunStatus}`
            : `${RESOURCE_KEY_PREFIX}.status.workflow.neverRun`,
          actions: buildActions('workflow', context.allowedActions),
          rawType: 'workflow',
          data: { kind: 'workflow', workflow },
        })),
      context.limit
    );
  },
  async executeAction(row, actionKey): Promise<ResourceActionResult> {
    const { workflow } = assertRowData(row, 'workflow');
    if (actionKey === 'execute') {
      await workflowApi.startWorkflow(row.id);
      return {
        summaryKey: summary(actionKey, 'workflow'),
        summaryParams: { name: workflow.name },
        refresh: true,
      };
    }
    if (actionKey === 'delete') {
      await useWorkflowStore().removeWorkflow(row.id);
      return {
        summaryKey: summary(actionKey, 'workflow'),
        summaryParams: { name: workflow.name },
        refresh: true,
      };
    }
    if (actionKey === 'edit') {
      const navigationStore = useNavigationStore();
      navigationStore.setPendingIntent({ type: 'open_workflow_editor', workflowId: row.id });
      navigationStore.navigateTo('workflow');
      return { summaryKey: summary(actionKey, 'workflow'), summaryParams: { name: workflow.name } };
    }
    throw new Error(`Unsupported workflow action: ${actionKey}`);
  },
};

const datasourceAdapter: ResourceAdapter = {
  async fetchRows(context) {
    const store = useDatafileStore();
    await store.fetchDatasources();
    const query = normalizeQuery(context.query);
    return limitRows(
      store.datasources
        .filter((datasource) =>
          matchesQuery(query, [datasource.id, datasource.name, datasource.type])
        )
        .map((datasource) => ({
          id: datasource.id,
          title: datasource.name,
          meta: compactMeta([
            meta('type', datasource.type),
            meta('tableCount', datasource.tables.length),
          ]),
          actions: buildActions('datasource', context.allowedActions),
          rawType: 'datasource',
          data: { kind: 'datasource', datasource },
        })),
      context.limit
    );
  },
  async executeAction(row, actionKey): Promise<ResourceActionResult> {
    const { datasource } = assertRowData(row, 'datasource');
    if (actionKey === 'delete') {
      await useDatafileStore().deleteDatasource(
        row.id,
        ensureDatabaseDatasourceType(datasource.type)
      );
      return {
        summaryKey: summary(actionKey, 'datasource'),
        summaryParams: { name: datasource.name },
        refresh: true,
      };
    }
    throw new Error(`Unsupported datasource action: ${actionKey}`);
  },
};

const tableAdapter: ResourceAdapter = {
  async fetchRows(context) {
    const store = useDatafileStore();
    await store.fetchTables();
    const query = normalizeQuery(context.query);
    return limitRows(
      store.tables
        .filter((table) =>
          matchesQuery(query, [table.id, table.displayName, table.physicalName, table.type])
        )
        .map((table) => ({
          id: table.id,
          title: table.displayName,
          subtitle: table.physicalName,
          meta: compactMeta([meta('type', table.type)]),
          actions: buildActions('table', context.allowedActions),
          rawType: 'table',
          data: { kind: 'table', table },
        })),
      context.limit
    );
  },
  async executeAction(row, actionKey): Promise<ResourceActionResult> {
    const { table } = assertRowData(row, 'table');
    if (actionKey === 'view') {
      await useDatafileStore().fetchTable(row.id);
      const navigationStore = useNavigationStore();
      navigationStore.setPendingIntent({ type: 'open_data_management', tab: 'data' });
      navigationStore.navigateTo('data');
      return {
        summaryKey: summary(actionKey, 'table'),
        summaryParams: { name: table.displayName },
      };
    }
    if (actionKey === 'delete') {
      await useDatafileStore().deleteTable(row.id);
      return {
        summaryKey: summary(actionKey, 'table'),
        summaryParams: { name: table.displayName },
        refresh: true,
      };
    }
    throw new Error(`Unsupported table action: ${actionKey}`);
  },
};

const scheduleAdapter: ResourceAdapter = {
  async fetchRows(context) {
    const store = useScheduleStore();
    await store.fetchSchedules();
    const query = normalizeQuery(context.query);
    return limitRows(
      store.schedules
        .filter((schedule) =>
          matchesQuery(query, [schedule.id, schedule.name, schedule.workflowName])
        )
        .map((schedule) => ({
          id: schedule.id,
          title: schedule.name,
          subtitle: schedule.workflowName,
          meta: compactMeta([
            meta('schedule', schedule.cronExpr),
            meta('timezone', schedule.timezone),
          ]),
          statusLabel: `${RESOURCE_KEY_PREFIX}.status.schedule.${
            schedule.enabled ? 'enabled' : 'disabled'
          }`,
          actions: buildActions('schedule', context.allowedActions, [
            'edit',
            schedule.enabled ? 'disable' : 'enable',
            'delete',
          ]),
          rawType: 'schedule',
          data: { kind: 'schedule', schedule: { ...schedule } },
        })),
      context.limit
    );
  },
  async executeAction(row, actionKey) {
    const { schedule: scheduleItem } = assertRowData(row, 'schedule');
    if (actionKey === 'edit') {
      return {
        summaryKey: summary(actionKey, 'schedule'),
        summaryParams: { name: scheduleItem.name },
        inlineForm: { kind: 'schedule_edit', scheduleId: row.id },
      };
    }
    if (actionKey === 'delete') {
      await useScheduleStore().deleteSchedule(row.id);
      return {
        summaryKey: summary(actionKey, 'schedule'),
        summaryParams: { name: scheduleItem.name },
        refresh: true,
      };
    }
    if (actionKey === 'enable' || actionKey === 'disable') {
      const shouldEnable = actionKey === 'enable';
      if (scheduleItem.enabled !== shouldEnable) {
        await useScheduleStore().updateSchedule(row.id, { enabled: shouldEnable });
      }
      return {
        summaryKey: summary(actionKey, 'schedule'),
        summaryParams: { name: scheduleItem.name },
        refresh: true,
      };
    }
    throw new Error(`Unsupported schedule action: ${actionKey}`);
  },
};

interface FlattenedFolder {
  folder: KnowledgeFolder;
  parentName?: string;
}

interface FlattenedFile {
  file: KnowledgeFile;
  folderName: string;
}

function flattenKnowledge(
  folders: KnowledgeFolder[],
  parentName?: string
): { folders: FlattenedFolder[]; files: FlattenedFile[] } {
  const flattenedFolders: FlattenedFolder[] = [];
  const flattenedFiles: FlattenedFile[] = [];
  for (const folder of folders) {
    flattenedFolders.push({ folder, parentName });
    flattenedFiles.push(...folder.files.map((file) => ({ file, folderName: folder.name })));
    const childItems = flattenKnowledge(folder.children, folder.name);
    flattenedFolders.push(...childItems.folders);
    flattenedFiles.push(...childItems.files);
  }
  return { folders: flattenedFolders, files: flattenedFiles };
}

const knowledgeFolderAdapter: ResourceAdapter = {
  async fetchRows(context) {
    const store = useKnowledgeStore();
    await store.fetchFolderTree();
    const query = normalizeQuery(context.query);
    return limitRows(
      flattenKnowledge(store.folderTree)
        .folders.filter(({ folder, parentName }) =>
          matchesQuery(query, [folder.id, folder.name, parentName])
        )
        .map(({ folder, parentName }) => ({
          id: folder.id,
          title: folder.name,
          meta: compactMeta([
            meta('fileCount', folder.files.length),
            meta('parentName', parentName),
          ]),
          actions: buildActions('knowledge_folder', context.allowedActions),
          rawType: 'knowledge_folder',
          data: { kind: 'knowledge_folder', folder, parentName },
        })),
      context.limit
    );
  },
  async executeAction(row, actionKey) {
    const { folder } = assertRowData(row, 'knowledge_folder');
    if (actionKey === 'delete') {
      await useKnowledgeStore().deleteFolder(row.id);
      return {
        summaryKey: summary(actionKey, 'knowledge_folder'),
        summaryParams: { name: folder.name },
        refresh: true,
      };
    }
    throw new Error(`Unsupported knowledge folder action: ${actionKey}`);
  },
};

const knowledgeFileAdapter: ResourceAdapter = {
  async fetchRows(context) {
    const store = useKnowledgeStore();
    await store.fetchFolderTree();
    const query = normalizeQuery(context.query);
    return limitRows(
      flattenKnowledge(store.folderTree)
        .files.filter(({ file, folderName }) =>
          matchesQuery(query, [file.id, file.name, folderName])
        )
        .map(({ file, folderName }) => ({
          id: file.id,
          title: file.name,
          subtitle: folderName,
          meta: compactMeta([
            meta('folderName', folderName),
            meta('size', file.fileSize),
            meta('updatedAt', file.updatedAt),
          ]),
          actions: buildActions('knowledge_file', context.allowedActions),
          rawType: 'knowledge_file',
          data: { kind: 'knowledge_file', file, folderName },
        })),
      context.limit
    );
  },
  async executeAction(row, actionKey): Promise<ResourceActionResult> {
    const { file } = assertRowData(row, 'knowledge_file');
    if (actionKey === 'view') {
      const result = await getFileContent(row.id);
      return {
        summaryKey: `${RESOURCE_KEY_PREFIX}.summary.knowledge_file.viewContent`,
        summaryParams: { name: file.name, content: contentPreview(result.content) },
      };
    }
    if (actionKey === 'delete') {
      await useKnowledgeStore().deleteFile(row.id);
      return {
        summaryKey: summary(actionKey, 'knowledge_file'),
        summaryParams: { name: file.name },
        refresh: true,
      };
    }
    throw new Error(`Unsupported knowledge file action: ${actionKey}`);
  },
};

const templateAdapter: ResourceAdapter = {
  async fetchRows(context) {
    const store = useWorkflowStore();
    await store.fetchTemplates();
    const query = normalizeQuery(context.query);
    return limitRows(
      store.customTemplates
        .filter((template) =>
          matchesQuery(query, [template.id, template.name, template.description, template.type])
        )
        .map((template) => ({
          id: template.id,
          title: template.name,
          subtitle: template.description ?? undefined,
          meta: compactMeta([
            meta('type', template.type),
            meta('updatedAt', template.updatedAt),
            meta('creatorName', template.creatorName),
          ]),
          actions: buildActions('template', context.allowedActions),
          rawType: 'template',
          data: { kind: 'template', template },
        })),
      context.limit
    );
  },
  async executeAction(row, actionKey) {
    const { template } = assertRowData(row, 'template');
    if (actionKey === 'edit') {
      const navigationStore = useNavigationStore();
      navigationStore.setPendingIntent({ type: 'open_template_editor', templateId: row.id });
      navigationStore.navigateTo('workflow');
      return { summaryKey: summary(actionKey, 'template'), summaryParams: { name: template.name } };
    }
    if (actionKey === 'delete') {
      await useWorkflowStore().removeTemplate(row.id);
      return {
        summaryKey: summary(actionKey, 'template'),
        summaryParams: { name: template.name },
        refresh: true,
      };
    }
    throw new Error(`Unsupported template action: ${actionKey}`);
  },
};

const adapters: Record<ResourceActionCardType, ResourceAdapter> = {
  workflow: workflowAdapter,
  datasource: datasourceAdapter,
  table: tableAdapter,
  schedule: scheduleAdapter,
  knowledge_folder: knowledgeFolderAdapter,
  knowledge_file: knowledgeFileAdapter,
  template: templateAdapter,
};
