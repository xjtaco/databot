import type { BranchNodeConfig, BranchNodeOutput } from '../workflow.types';
import type { NodeExecutionContext, NodeExecutor } from './types';

export function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return !isNaN(value) && value !== 0;
  if (typeof value === 'string') return value !== '' && value.toLowerCase() !== 'false';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

export class BranchNodeExecutor implements NodeExecutor {
  readonly type = 'branch';

  async execute(context: NodeExecutionContext): Promise<BranchNodeOutput> {
    const config = context.resolvedConfig as BranchNodeConfig;
    const fieldValue = config.field;

    // Template resolver returns strings; try JSON.parse to recover structured types
    let parsed: unknown = fieldValue;
    if (typeof fieldValue === 'string') {
      try {
        parsed = JSON.parse(fieldValue);
      } catch {
        // Not valid JSON — keep the raw string
      }
    }

    const result = isTruthy(parsed);
    return { result };
  }
}
