import type { ActionResult, ActionHandler } from './actionCardRegistry';
import { registerActionHandler } from './actionCardRegistry';
import type { UiActionCardPayload } from '@/types/actionCard';
import type { NodeConfig, WorkflowNodeType } from '@/types/workflow';
import { useNavigationStore } from '@/stores/navigationStore';

// ── Navigation Handlers ────────────────────────────────────

function navigationHandler(
  targetNav: 'data' | 'workflow' | 'schedule',
  targetTab?: 'data' | 'knowledge'
): ActionHandler {
  return async (payload: UiActionCardPayload): Promise<ActionResult> => {
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
  async (payload: UiActionCardPayload): Promise<ActionResult> => {
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

      if (copilotPrompt) {
        const { useCopilotStore } = await import('@/stores/copilotStore');
        const copilotStore = useCopilotStore();

        // Wait for copilot connection with timeout
        const waitForConnection = (): Promise<void> =>
          new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50;
            const interval = setInterval(() => {
              if (copilotStore.isConnected && copilotStore.workflowId === workflowId) {
                clearInterval(interval);
                resolve();
              } else if (++attempts >= maxAttempts) {
                clearInterval(interval);
                reject(new Error('Copilot connection timeout'));
              }
            }, 200);
          });

        await waitForConnection();
        copilotStore.sendMessage(copilotPrompt);
      }

      return {
        success: true,
        summary: `Created workflow "${name}"${copilotPrompt ? ' and sent prompt to Copilot' : ''}`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        summary: 'Workflow draft created but Copilot auto-send failed.',
      };
    }
  }
);

// ── Template copilot_create Handler ────────────────────────

registerActionHandler(
  'template',
  'copilot_create',
  async (payload: UiActionCardPayload): Promise<ActionResult> => {
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

      if (copilotPrompt) {
        const { useDebugCopilotStore } = await import('@/stores/debugCopilotStore');
        const debugCopilotStore = useDebugCopilotStore();

        const waitForConnection = (): Promise<void> =>
          new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50;
            const interval = setInterval(() => {
              if (debugCopilotStore.isConnected) {
                clearInterval(interval);
                resolve();
              } else if (++attempts >= maxAttempts) {
                clearInterval(interval);
                reject(new Error('Debug Copilot connection timeout'));
              }
            }, 200);
          });

        await waitForConnection();
        debugCopilotStore.sendMessage(copilotPrompt);
      }

      return {
        success: true,
        summary: `Created template "${name}"${copilotPrompt ? ' and sent prompt to Copilot' : ''}`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        summary: 'Template draft created but Copilot auto-send failed.',
      };
    }
  }
);

// ── Stub Handlers (not yet fully implemented) ──────────────

const stubActions = [
  ['data', 'datasource_create'],
  ['data', 'datasource_test'],
  ['data', 'datasource_delete'],
  ['knowledge', 'folder_create'],
  ['knowledge', 'folder_rename'],
  ['knowledge', 'folder_move'],
  ['knowledge', 'folder_delete'],
  ['knowledge', 'file_open'],
  ['knowledge', 'file_move'],
  ['knowledge', 'file_delete'],
  ['schedule', 'create'],
  ['schedule', 'update'],
  ['schedule', 'delete'],
] as const;

for (const [domain, action] of stubActions) {
  registerActionHandler(
    domain,
    action,
    async (payload: UiActionCardPayload): Promise<ActionResult> => ({
      success: false,
      summary: `Action "${payload.title}" is not yet fully implemented. Please use the ${payload.targetNav ?? domain} page directly.`,
    })
  );
}
