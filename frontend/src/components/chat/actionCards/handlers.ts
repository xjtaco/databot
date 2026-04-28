import type { ActionCallbacks, ActionResult, ActionHandler } from './actionCardRegistry';
import { registerActionHandler } from './actionCardRegistry';
import type { UiActionCardPayload } from '@/types/actionCard';
import type { DatabaseDatasourceType } from '@/types/datafile';
import type { NodeConfig, WorkflowNodeType } from '@/types/workflow';
import { useNavigationStore } from '@/stores/navigationStore';
import { i18n } from '@/locales';

// ── Navigation Handlers ────────────────────────────────────

function navigationHandler(
  targetNav: 'data' | 'workflow' | 'schedule',
  targetTab?: 'data' | 'knowledge'
): ActionHandler {
  return async (
    _payload: UiActionCardPayload,
    callbacks: ActionCallbacks
  ): Promise<ActionResult> => {
    const navigationStore = useNavigationStore();
    if (targetTab) {
      navigationStore.setPendingIntent({ type: 'open_data_management', tab: targetTab });
    }
    callbacks.setStatus('succeeded');
    navigationStore.navigateTo(targetNav);
    return { success: true };
  };
}

registerActionHandler('data', 'open', navigationHandler('data', 'data'));
registerActionHandler('knowledge', 'open', navigationHandler('data', 'knowledge'));
registerActionHandler('schedule', 'open', navigationHandler('schedule'));
registerActionHandler('workflow', 'open', navigationHandler('workflow'));

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

// ── Datasource Test Handler (navigation) ───────────────────

registerActionHandler(
  'data',
  'datasource_test',
  async (_payload: UiActionCardPayload, callbacks: ActionCallbacks): Promise<ActionResult> => {
    const navigationStore = useNavigationStore();
    const summary = t('chat.actionCards.results.datasourceTestNavigate');
    callbacks.setResult(summary);
    navigationStore.setPendingIntent({ type: 'open_data_management', tab: 'data' });
    navigationStore.navigateTo('data');
    return { success: true, summary };
  }
);

// ── Datasource Delete Handler ───────────────────────────────

registerActionHandler(
  'data',
  'datasource_delete',
  async (payload: UiActionCardPayload, _callbacks: ActionCallbacks): Promise<ActionResult> => {
    try {
      const { useDatafileStore } = await import('@/stores/datafileStore');
      const datafileStore = useDatafileStore();
      const datasourceId = payload.params.datasourceId as string;
      const datasourceType = payload.params.type as string;
      await datafileStore.deleteDatasource(datasourceId, datasourceType as DatabaseDatasourceType);
      return { success: true, summary: t('chat.actionCards.results.datasourceDeleted') };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
);

// ── Knowledge File Open Handler (navigation) ────────────────

registerActionHandler('knowledge', 'file_open', navigationHandler('data', 'knowledge'));
