import type { UiActionCardPayload } from '@/types/actionCard';

export interface ActionResult {
  success: boolean;
  summary?: string;
  error?: string;
}

export type ActionHandler = (payload: UiActionCardPayload) => Promise<ActionResult>;

const registry = new Map<string, ActionHandler>();

function actionKey(domain: string, action: string): string {
  return `${domain}:${action}`;
}

export function registerActionHandler(
  domain: string,
  action: string,
  handler: ActionHandler
): void {
  registry.set(actionKey(domain, action), handler);
}

export function isActionRegistered(domain: string, action: string): boolean {
  return registry.has(actionKey(domain, action));
}

export async function executeAction(payload: UiActionCardPayload): Promise<ActionResult> {
  const handler = registry.get(actionKey(payload.domain, payload.action));
  if (!handler) {
    return {
      success: false,
      summary: `Unsupported action: ${payload.domain}.${payload.action}`,
    };
  }
  try {
    return await handler(payload);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function getRegistry(): Map<string, ActionHandler> {
  return registry;
}
