import type { ActionCallbacks, ActionResult } from './actionCardRegistry';
import { registerActionHandler } from './actionCardRegistry';
import type { UiActionCardPayload } from '@/types/actionCard';
import type { DatabaseDatasourceType } from '@/types/datafile';
import type { KnowledgeFile, KnowledgeFolder } from '@/types/knowledge';
import type { ScheduleListItem } from '@/types/schedule';
import type { NodeConfig, WorkflowListItem, WorkflowNodeType } from '@/types/workflow';
import { useNavigationStore } from '@/stores/navigationStore';
import { i18n } from '@/locales';

// ── Legacy In-chat Handlers ────────────────────────────────
// Current catalog list/delete cards use resource_list and ResourceActionCard.
// Keep these handlers registered so persisted older in_chat cards still run.

const MAX_PREVIEW_ITEMS = 5;
const MAX_FILE_PREVIEW_LENGTH = 600;

function renderLimitedList(
  title: string,
  items: string[],
  emptyText: string,
  moreTextKey: string
): string {
  if (items.length === 0) {
    return `${title}\n${emptyText}`;
  }

  const visibleItems = items.slice(0, MAX_PREVIEW_ITEMS);
  const lines = visibleItems.map((item, index) => `${index + 1}. ${item}`);
  const hiddenCount = items.length - visibleItems.length;
  if (hiddenCount > 0) {
    lines.push(t(moreTextKey, { count: String(hiddenCount) }));
  }
  return `${title}\n${lines.join('\n')}`;
}

function completeInChat(callbacks: ActionCallbacks, summary: string): ActionResult {
  callbacks.setResult(summary);
  return { success: true, summary };
}

async function workflowListHandler(
  _payload: UiActionCardPayload,
  callbacks: ActionCallbacks
): Promise<ActionResult> {
  const { useWorkflowStore } = await import('@/stores/workflowStore');
  const workflowStore = useWorkflowStore();
  await workflowStore.fetchWorkflows();

  const rows = workflowStore.workflows.map((workflow: WorkflowListItem) =>
    t('chat.actionCards.results.workflowListItem', {
      name: workflow.name,
      nodes: String(workflow.nodeCount),
      status: workflow.lastRunStatus ?? t('chat.actionCards.results.neverRun'),
    })
  );
  const summary = renderLimitedList(
    t('chat.actionCards.results.workflowListTitle', {
      count: String(workflowStore.workflows.length),
    }),
    rows,
    t('chat.actionCards.results.workflowListEmpty'),
    'chat.actionCards.results.listMore'
  );
  return completeInChat(callbacks, summary);
}

async function dataListHandler(
  _payload: UiActionCardPayload,
  callbacks: ActionCallbacks
): Promise<ActionResult> {
  const { useDatafileStore } = await import('@/stores/datafileStore');
  const datafileStore = useDatafileStore();
  await Promise.all([datafileStore.fetchDatasources(), datafileStore.fetchTables()]);

  const datasourceRows = datafileStore.datasources.map((datasource) =>
    t('chat.actionCards.results.datasourceListItem', {
      name: datasource.name,
      type: datasource.type,
      tables: String(datasource.tables.length),
    })
  );
  const tableRows = datafileStore.tables.map((table) =>
    t('chat.actionCards.results.tableListItem', {
      name: table.displayName,
      type: table.type,
    })
  );
  const summary = [
    renderLimitedList(
      t('chat.actionCards.results.datasourceListTitle', {
        count: String(datafileStore.datasources.length),
      }),
      datasourceRows,
      t('chat.actionCards.results.datasourceListEmpty'),
      'chat.actionCards.results.listMore'
    ),
    renderLimitedList(
      t('chat.actionCards.results.tableListTitle', { count: String(datafileStore.tables.length) }),
      tableRows,
      t('chat.actionCards.results.tableListEmpty'),
      'chat.actionCards.results.listMore'
    ),
  ].join('\n\n');
  return completeInChat(callbacks, summary);
}

function collectKnowledgeFiles(folders: KnowledgeFolder[]): KnowledgeFile[] {
  const files: KnowledgeFile[] = [];
  const visit = (folder: KnowledgeFolder): void => {
    files.push(...folder.files);
    folder.children.forEach(visit);
  };
  folders.forEach(visit);
  return files;
}

async function knowledgeListHandler(
  _payload: UiActionCardPayload,
  callbacks: ActionCallbacks
): Promise<ActionResult> {
  const { useKnowledgeStore } = await import('@/stores/knowledgeStore');
  const knowledgeStore = useKnowledgeStore();
  await knowledgeStore.fetchFolderTree();

  const folders = knowledgeStore.folderTree;
  const files = collectKnowledgeFiles(folders);
  const folderRows = folders.map((folder: KnowledgeFolder) =>
    t('chat.actionCards.results.knowledgeFolderListItem', {
      name: folder.name,
      files: String(folder.files.length),
    })
  );
  const fileRows = files.map((file) =>
    t('chat.actionCards.results.knowledgeFileListItem', { name: file.name })
  );
  const summary = [
    renderLimitedList(
      t('chat.actionCards.results.knowledgeFolderListTitle', { count: String(folders.length) }),
      folderRows,
      t('chat.actionCards.results.knowledgeFolderListEmpty'),
      'chat.actionCards.results.listMore'
    ),
    renderLimitedList(
      t('chat.actionCards.results.knowledgeFileListTitle', { count: String(files.length) }),
      fileRows,
      t('chat.actionCards.results.knowledgeFileListEmpty'),
      'chat.actionCards.results.listMore'
    ),
  ].join('\n\n');
  return completeInChat(callbacks, summary);
}

async function scheduleListHandler(
  _payload: UiActionCardPayload,
  callbacks: ActionCallbacks
): Promise<ActionResult> {
  const { useScheduleStore } = await import('@/stores/scheduleStore');
  const scheduleStore = useScheduleStore();
  await scheduleStore.fetchSchedules();

  const rows = scheduleStore.schedules.map((schedule: ScheduleListItem) =>
    t('chat.actionCards.results.scheduleListItem', {
      name: schedule.name,
      workflow: schedule.workflowName,
      status: schedule.enabled
        ? t('chat.actionCards.results.enabled')
        : t('chat.actionCards.results.disabled'),
    })
  );
  const summary = renderLimitedList(
    t('chat.actionCards.results.scheduleListTitle', {
      count: String(scheduleStore.schedules.length),
    }),
    rows,
    t('chat.actionCards.results.scheduleListEmpty'),
    'chat.actionCards.results.listMore'
  );
  return completeInChat(callbacks, summary);
}

async function templateListHandler(
  _payload: UiActionCardPayload,
  callbacks: ActionCallbacks
): Promise<ActionResult> {
  const { useWorkflowStore } = await import('@/stores/workflowStore');
  const workflowStore = useWorkflowStore();
  await workflowStore.fetchTemplates();

  const rows = workflowStore.customTemplates.map((template) =>
    t('chat.actionCards.results.templateListItem', {
      name: template.name,
      type: template.type,
    })
  );
  const summary = renderLimitedList(
    t('chat.actionCards.results.templateListTitle', {
      count: String(workflowStore.customTemplates.length),
    }),
    rows,
    t('chat.actionCards.results.templateListEmpty'),
    'chat.actionCards.results.listMore'
  );
  return completeInChat(callbacks, summary);
}

async function knowledgeFileOpenHandler(
  payload: UiActionCardPayload,
  callbacks: ActionCallbacks
): Promise<ActionResult> {
  const fileId = getParamString(payload, 'fileId');
  if (!fileId) {
    return completeInChat(callbacks, t('chat.actionCards.results.knowledgeFileOpenInChat'));
  }

  const { getFileContent } = await import('@/api/knowledge');
  const result = await getFileContent(fileId);
  const content =
    result.content.length > MAX_FILE_PREVIEW_LENGTH
      ? `${result.content.slice(0, MAX_FILE_PREVIEW_LENGTH)}...`
      : result.content;
  const summary = t('chat.actionCards.results.knowledgeFilePreview', {
    name: result.file.name,
    content,
  });
  return completeInChat(callbacks, summary);
}

registerActionHandler('data', 'open', dataListHandler);
registerActionHandler('knowledge', 'open', knowledgeListHandler);
registerActionHandler('schedule', 'open', scheduleListHandler);
registerActionHandler('workflow', 'open', workflowListHandler);
registerActionHandler('template', 'open', templateListHandler);

// ── Workflow Handlers ──────────────────────────────────────

function t(key: string, params?: Record<string, string>): string {
  return i18n.global.t(key, params ?? {});
}

function getParamString(payload: UiActionCardPayload, key: string): string | undefined {
  const value = payload.params[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function getCopilotPrompt(payload: UiActionCardPayload): string | undefined {
  return payload.copilotPrompt ?? getParamString(payload, 'copilotPrompt');
}

function getWorkflowName(payload: UiActionCardPayload, fallbackKey: string): string {
  return getParamString(payload, 'name') ?? t(fallbackKey);
}

function getDescription(payload: UiActionCardPayload): string | undefined {
  return getParamString(payload, 'description');
}

async function createWorkflowAndOpen(
  payload: UiActionCardPayload,
  fallbackNameKey: string,
  callbacks: ActionCallbacks
): Promise<ActionResult> {
  const navigationStore = useNavigationStore();
  const name = getWorkflowName(payload, fallbackNameKey);
  const description = getDescription(payload);
  const copilotPrompt = getCopilotPrompt(payload);

  try {
    const { useWorkflowStore } = await import('@/stores/workflowStore');
    const workflowStore = useWorkflowStore();
    const workflowId = await workflowStore.createWorkflow(name, description);

    const summary = t(
      copilotPrompt
        ? 'chat.actionCards.results.workflowCreatedWithCopilot'
        : 'chat.actionCards.results.workflowCreated',
      { name }
    );
    callbacks.setResult(summary);
    navigationStore.setPendingIntent({
      type: 'open_workflow_editor',
      workflowId,
      copilotPrompt,
    });
    navigationStore.navigateTo('workflow');

    return {
      success: true,
      summary,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    callbacks.setError(error);
    return { success: false, error, summary: t('chat.actionCards.results.workflowCreateFailed') };
  }
}

function parseWorkflowNodeType(value: unknown): WorkflowNodeType {
  return value === 'sql' ||
    value === 'python' ||
    value === 'llm' ||
    value === 'email' ||
    value === 'branch' ||
    value === 'web_search'
    ? value
    : 'llm';
}

function createDefaultNodeConfig(nodeType: WorkflowNodeType): NodeConfig {
  switch (nodeType) {
    case 'sql':
      return {
        nodeType,
        datasourceId: '',
        params: {},
        sql: '',
        outputVariable: 'result',
      };
    case 'python':
      return {
        nodeType,
        params: {},
        script: '',
        outputVariable: 'result',
      };
    case 'email':
      return {
        nodeType,
        to: '',
        subject: '',
        contentSource: 'inline',
        body: '',
        isHtml: false,
        outputVariable: 'result',
      };
    case 'branch':
      return {
        nodeType,
        field: '',
        outputVariable: 'result',
      };
    case 'web_search':
      return {
        nodeType,
        params: {},
        keywords: '',
        outputVariable: 'result',
      };
    case 'llm':
      return {
        nodeType,
        params: {},
        prompt: '',
        outputVariable: 'result',
      };
  }
}

async function createTemplateAndOpen(
  payload: UiActionCardPayload,
  callbacks: ActionCallbacks
): Promise<ActionResult> {
  const navigationStore = useNavigationStore();
  const name = getWorkflowName(payload, 'chat.actionCards.results.untitledTemplate');
  const description = getDescription(payload);
  const copilotPrompt = getCopilotPrompt(payload);
  const nodeType = parseWorkflowNodeType(payload.params.nodeType);

  try {
    const { createTemplate } = await import('@/api/workflow');
    const template = await createTemplate({
      name,
      description: description ?? '',
      type: nodeType,
      config: createDefaultNodeConfig(nodeType),
    });

    const summary = t(
      copilotPrompt
        ? 'chat.actionCards.results.templateCreatedWithCopilot'
        : 'chat.actionCards.results.templateCreated',
      { name }
    );
    callbacks.setResult(summary);
    navigationStore.setPendingIntent({
      type: 'open_template_editor',
      templateId: template.id,
      copilotPrompt,
    });
    navigationStore.navigateTo('workflow');

    return {
      success: true,
      summary,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    callbacks.setError(error);
    return { success: false, error, summary: t('chat.actionCards.results.templateCreateFailed') };
  }
}

registerActionHandler(
  'workflow',
  'copilot_create',
  async (payload: UiActionCardPayload, callbacks: ActionCallbacks): Promise<ActionResult> =>
    createWorkflowAndOpen(payload, 'chat.actionCards.results.untitledWorkflow', callbacks)
);

registerActionHandler(
  'workflow',
  'template_node',
  async (payload: UiActionCardPayload, callbacks: ActionCallbacks): Promise<ActionResult> =>
    createTemplateAndOpen(payload, callbacks)
);

registerActionHandler(
  'workflow',
  'template_etl',
  async (payload: UiActionCardPayload, callbacks: ActionCallbacks): Promise<ActionResult> =>
    createWorkflowAndOpen(payload, 'chat.actionCards.results.untitledEtlWorkflow', callbacks)
);

registerActionHandler(
  'workflow',
  'template_report',
  async (payload: UiActionCardPayload, callbacks: ActionCallbacks): Promise<ActionResult> =>
    createWorkflowAndOpen(payload, 'chat.actionCards.results.untitledReportWorkflow', callbacks)
);

// ── Template copilot_create Handler ────────────────────────

registerActionHandler(
  'template',
  'copilot_create',
  async (payload: UiActionCardPayload, callbacks: ActionCallbacks): Promise<ActionResult> => {
    const navigationStore = useNavigationStore();
    const name = getWorkflowName(payload, 'chat.actionCards.results.untitledTemplate');
    const description = getDescription(payload);
    const copilotPrompt = getCopilotPrompt(payload);
    const nodeType = parseWorkflowNodeType(payload.params.nodeType);

    try {
      const { createTemplate } = await import('@/api/workflow');
      const template = await createTemplate({
        name,
        description: description ?? '',
        type: nodeType,
        config: createDefaultNodeConfig(nodeType),
      });

      const summary = t(
        copilotPrompt
          ? 'chat.actionCards.results.templateCreatedWithCopilot'
          : 'chat.actionCards.results.templateCreated',
        { name }
      );
      callbacks.setResult(summary);
      navigationStore.setPendingIntent({
        type: 'open_template_editor',
        templateId: template.id,
        copilotPrompt,
      });
      navigationStore.navigateTo('workflow');

      return {
        success: true,
        summary,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      callbacks.setError(error);
      return { success: false, error, summary: t('chat.actionCards.results.templateCreateFailed') };
    }
  }
);

// ── Datasource Test Handler ────────────────────────────────

registerActionHandler(
  'data',
  'datasource_test',
  async (_payload: UiActionCardPayload, callbacks: ActionCallbacks): Promise<ActionResult> => {
    const summary = t('chat.actionCards.results.datasourceTestInChat');
    callbacks.setResult(summary);
    return { success: true, summary };
  }
);

// ── Legacy Direct Delete Handlers ───────────────────────────
// Current delete cards are resource_list cards with row actions handled by ResourceActionCard.

registerActionHandler(
  'data',
  'datasource_delete',
  async (payload: UiActionCardPayload, _callbacks: ActionCallbacks): Promise<ActionResult> => {
    try {
      const { useDatafileStore } = await import('@/stores/datafileStore');
      const datafileStore = useDatafileStore();
      const datasourceId = getParamString(payload, 'datasourceId');
      let datasourceType = getParamString(payload, 'type');
      if (datasourceId && !datasourceType) {
        await datafileStore.fetchDatasources();
        datasourceType = datafileStore.datasources.find(
          (datasource) => datasource.id === datasourceId
        )?.type;
      }
      if (!datasourceId || !datasourceType) {
        return {
          success: false,
          summary: t('chat.actionCards.results.missingDeleteTarget'),
          error: t('chat.actionCards.results.missingDeleteTarget'),
        };
      }
      await datafileStore.deleteDatasource(datasourceId, datasourceType as DatabaseDatasourceType);
      return { success: true, summary: t('chat.actionCards.results.datasourceDeleted') };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
);

registerActionHandler(
  'data',
  'table_delete',
  async (payload: UiActionCardPayload, _callbacks: ActionCallbacks): Promise<ActionResult> => {
    try {
      const { useDatafileStore } = await import('@/stores/datafileStore');
      const datafileStore = useDatafileStore();
      const tableId = getParamString(payload, 'tableId');
      if (!tableId) {
        return {
          success: false,
          summary: t('chat.actionCards.results.missingDeleteTarget'),
          error: t('chat.actionCards.results.missingDeleteTarget'),
        };
      }
      await datafileStore.deleteTable(tableId);
      return { success: true, summary: t('chat.actionCards.results.tableDeleted') };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
);

registerActionHandler(
  'workflow',
  'delete',
  async (payload: UiActionCardPayload, _callbacks: ActionCallbacks): Promise<ActionResult> => {
    try {
      const { useWorkflowStore } = await import('@/stores/workflowStore');
      const workflowStore = useWorkflowStore();
      const workflowId = getParamString(payload, 'workflowId');
      if (!workflowId) {
        return {
          success: false,
          summary: t('chat.actionCards.results.missingDeleteTarget'),
          error: t('chat.actionCards.results.missingDeleteTarget'),
        };
      }
      await workflowStore.removeWorkflow(workflowId);
      return { success: true, summary: t('chat.actionCards.results.workflowDeleted') };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
);

registerActionHandler(
  'template',
  'delete',
  async (payload: UiActionCardPayload, _callbacks: ActionCallbacks): Promise<ActionResult> => {
    try {
      const { useWorkflowStore } = await import('@/stores/workflowStore');
      const workflowStore = useWorkflowStore();
      const templateId = getParamString(payload, 'templateId');
      if (!templateId) {
        return {
          success: false,
          summary: t('chat.actionCards.results.missingDeleteTarget'),
          error: t('chat.actionCards.results.missingDeleteTarget'),
        };
      }
      await workflowStore.removeTemplate(templateId);
      return { success: true, summary: t('chat.actionCards.results.templateDeleted') };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
);

// ── Knowledge File Open Handler ─────────────────────────────

registerActionHandler('knowledge', 'file_open', knowledgeFileOpenHandler);
