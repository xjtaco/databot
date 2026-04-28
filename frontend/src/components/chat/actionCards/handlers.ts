import type { ActionCallbacks, ActionResult, ActionHandler } from './actionCardRegistry';
import { registerActionHandler } from './actionCardRegistry';
import type { UiActionCardPayload } from '@/types/actionCard';
import type { DatabaseDatasourceType } from '@/types/datafile';
import type { NodeConfig, WorkflowNodeType } from '@/types/workflow';
import { useNavigationStore } from '@/stores/navigationStore';

// ── Navigation Handlers ────────────────────────────────────

function navigationHandler(
  targetNav: 'data' | 'workflow' | 'schedule',
  targetTab?: 'data' | 'knowledge'
): ActionHandler {
  return async (
    payload: UiActionCardPayload,
    _callbacks: ActionCallbacks
  ): Promise<ActionResult> => {
    const navigationStore = useNavigationStore();
    if (targetTab) {
      navigationStore.setPendingIntent({ type: 'open_data_management', tab: targetTab });
    }
    navigationStore.navigateTo(targetNav);
    return { success: true, summary: `Navigated to ${payload.title}` };
  };
}

registerActionHandler('data', 'open', navigationHandler('data', 'data'));
registerActionHandler('knowledge', 'open', navigationHandler('data', 'knowledge'));
registerActionHandler('schedule', 'open', navigationHandler('schedule'));
registerActionHandler('workflow', 'open', navigationHandler('workflow'));

// ── Workflow Handlers ──────────────────────────────────────

function getParamString(payload: UiActionCardPayload, key: string): string | undefined {
  const value = payload.params[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function getCopilotPrompt(payload: UiActionCardPayload): string | undefined {
  return payload.copilotPrompt ?? getParamString(payload, 'copilotPrompt');
}

function getWorkflowName(payload: UiActionCardPayload, fallback: string): string {
  return getParamString(payload, 'name') ?? fallback;
}

function getDescription(payload: UiActionCardPayload): string | undefined {
  return getParamString(payload, 'description');
}

async function createWorkflowAndOpen(
  payload: UiActionCardPayload,
  fallbackName: string
): Promise<ActionResult> {
  const navigationStore = useNavigationStore();
  const name = getWorkflowName(payload, fallbackName);
  const description = getDescription(payload);
  const copilotPrompt = getCopilotPrompt(payload);

  try {
    const { useWorkflowStore } = await import('@/stores/workflowStore');
    const workflowStore = useWorkflowStore();
    const workflowId = await workflowStore.createWorkflow(name, description);

    navigationStore.setPendingIntent({
      type: 'open_workflow_editor',
      workflowId,
      copilotPrompt,
    });
    navigationStore.navigateTo('workflow');

    return {
      success: true,
      summary: `Created workflow "${name}"${copilotPrompt ? ' and sent prompt to Copilot' : ''}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      summary: 'Failed to create workflow.',
    };
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

async function createTemplateAndOpen(payload: UiActionCardPayload): Promise<ActionResult> {
  const navigationStore = useNavigationStore();
  const name = getWorkflowName(payload, 'Untitled Template');
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

    navigationStore.setPendingIntent({
      type: 'open_template_editor',
      templateId: template.id,
      copilotPrompt,
    });
    navigationStore.navigateTo('workflow');

    return {
      success: true,
      summary: `Created template "${name}"${copilotPrompt ? ' and sent prompt to Copilot' : ''}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      summary: 'Failed to create template.',
    };
  }
}

registerActionHandler(
  'workflow',
  'copilot_create',
  async (payload: UiActionCardPayload, _callbacks: ActionCallbacks): Promise<ActionResult> =>
    createWorkflowAndOpen(payload, 'Untitled Workflow')
);

registerActionHandler(
  'workflow',
  'template_node',
  async (payload: UiActionCardPayload, _callbacks: ActionCallbacks): Promise<ActionResult> =>
    createTemplateAndOpen(payload)
);

registerActionHandler(
  'workflow',
  'template_etl',
  async (payload: UiActionCardPayload, _callbacks: ActionCallbacks): Promise<ActionResult> =>
    createWorkflowAndOpen(payload, 'Untitled ETL Workflow')
);

registerActionHandler(
  'workflow',
  'template_report',
  async (payload: UiActionCardPayload, _callbacks: ActionCallbacks): Promise<ActionResult> =>
    createWorkflowAndOpen(payload, 'Untitled Report Workflow')
);

// ── Template copilot_create Handler ────────────────────────

registerActionHandler(
  'template',
  'copilot_create',
  async (payload: UiActionCardPayload, _callbacks: ActionCallbacks): Promise<ActionResult> => {
    const navigationStore = useNavigationStore();
    const name = getWorkflowName(payload, 'Untitled Template');
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

      navigationStore.setPendingIntent({
        type: 'open_template_editor',
        templateId: template.id,
        copilotPrompt,
      });
      navigationStore.navigateTo('workflow');

      return {
        success: true,
        summary: `Created template "${name}"${copilotPrompt ? ' and sent prompt to Copilot' : ''}`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        summary: 'Failed to create template.',
      };
    }
  }
);

// ── Datasource Test Handler (navigation) ───────────────────

registerActionHandler(
  'data',
  'datasource_test',
  async (_payload: UiActionCardPayload, _callbacks: ActionCallbacks): Promise<ActionResult> => {
    const navigationStore = useNavigationStore();
    navigationStore.setPendingIntent({ type: 'open_data_management', tab: 'data' });
    navigationStore.navigateTo('data');
    return {
      success: false,
      summary: 'Please test the datasource connection from the Data Management page.',
    };
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
      return { success: true, summary: 'Datasource deleted successfully.' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
);

// ── Knowledge File Open Handler (navigation) ────────────────

registerActionHandler('knowledge', 'file_open', navigationHandler('data', 'knowledge'));
