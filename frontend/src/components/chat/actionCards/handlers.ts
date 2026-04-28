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

// ── Workflow copilot_create Handler ────────────────────────

registerActionHandler(
  'workflow',
  'copilot_create',
  async (payload: UiActionCardPayload, _callbacks: ActionCallbacks): Promise<ActionResult> => {
    const navigationStore = useNavigationStore();
    const name = (payload.params.name as string) || 'Untitled Workflow';
    const description = payload.params.description as string | undefined;
    const copilotPrompt = payload.copilotPrompt;

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
);

// ── Template copilot_create Handler ────────────────────────

registerActionHandler(
  'template',
  'copilot_create',
  async (payload: UiActionCardPayload, _callbacks: ActionCallbacks): Promise<ActionResult> => {
    const navigationStore = useNavigationStore();
    const name = (payload.params.name as string) || 'Untitled Template';
    const description = payload.params.description as string | undefined;
    const copilotPrompt = payload.copilotPrompt;
    const nodeType = ((payload.params.nodeType as string) || 'llm') as WorkflowNodeType;

    try {
      const { createTemplate } = await import('@/api/workflow');
      const template = await createTemplate({
        name,
        description: description ?? '',
        type: nodeType,
        config: {
          nodeType,
          params: {},
          prompt: '',
          outputVariable: 'result',
        } as NodeConfig,
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
