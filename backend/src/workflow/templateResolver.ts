import logger from '../utils/logger';
import { type ParamDefinition, normalizeParams, isTypedOutputValue } from './workflow.types';

const TEMPLATE_REGEX = /\{\{([^}]+)\}\}/g;

/**
 * Resolves {{node_name.field_path}} template variables in a string.
 *
 * @param template - The template string containing {{...}} placeholders
 * @param nodeOutputs - Map of node name -> output object
 * @returns The resolved string with all placeholders replaced
 */
export function resolveTemplate(
  template: string,
  nodeOutputs: Map<string, Record<string, unknown>>
): string {
  return template.replace(TEMPLATE_REGEX, (match, path: string) => {
    const trimmedPath = path.trim();
    const dotIndex = trimmedPath.indexOf('.');
    if (dotIndex === -1) {
      // Just a node name without field path - return the whole output as JSON
      const output = nodeOutputs.get(trimmedPath);
      if (output === undefined) {
        logger.warn('Template variable not found', { variable: trimmedPath });
        return match;
      }
      return JSON.stringify(output);
    }

    const nodeName = trimmedPath.slice(0, dotIndex);
    const fieldPath = trimmedPath.slice(dotIndex + 1);
    const output = nodeOutputs.get(nodeName);

    if (output === undefined) {
      logger.warn('Template node not found', { nodeName, variable: trimmedPath });
      return match;
    }

    const value = getNestedValue(output, fieldPath);
    if (value === undefined) {
      logger.warn('Template field not found', { nodeName, fieldPath, variable: trimmedPath });
      return match;
    }

    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  });
}

/**
 * Resolves template variables in all string values of a Record.
 * Supports both legacy string params and typed ParamDefinition params.
 * Always returns normalized Record<string, ParamDefinition>.
 */
export function resolveParamsTemplates(
  params: Record<string, string | ParamDefinition>,
  nodeOutputs: Map<string, Record<string, unknown>>
): Record<string, ParamDefinition> {
  const normalized = normalizeParams(params);
  const resolved: Record<string, ParamDefinition> = {};
  for (const [key, paramDef] of Object.entries(normalized)) {
    if (typeof paramDef.value === 'string') {
      resolved[key] = { ...paramDef, value: resolveTemplate(paramDef.value, nodeOutputs) };
    } else {
      resolved[key] = paramDef;
    }
  }
  return resolved;
}

/**
 * Extracts all parameter names referenced as {{params.xxx}} in a string.
 */
export function extractParamNames(template: string): string[] {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(TEMPLATE_REGEX.source, 'g');
  while ((match = regex.exec(template)) !== null) {
    const path = match[1].trim();
    if (path.startsWith('params.')) {
      names.add(path.slice('params.'.length));
    }
  }
  return Array.from(names);
}

/**
 * Checks a resolved string for any remaining unresolved {{...}} placeholders.
 * Returns the list of unresolved variable references, or an empty array if all resolved.
 */
export function findUnresolvedTemplates(value: string): string[] {
  const unresolved: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(TEMPLATE_REGEX.source, 'g');
  while ((match = regex.exec(value)) !== null) {
    unresolved.push(match[1].trim());
  }
  return unresolved;
}

/**
 * Flattens the `result` field into the top level so that
 * {{outputVar.field}} resolves without needing {{outputVar.result.field}}.
 * Existing top-level fields take priority; `result` itself is preserved.
 */
export function flattenResultField(record: Record<string, unknown>): Record<string, unknown> {
  const result = record['result'];
  if (
    result === null ||
    result === undefined ||
    typeof result !== 'object' ||
    Array.isArray(result)
  ) {
    return record;
  }
  const resultObj = result as Record<string, unknown>;
  const flattened = { ...record };
  for (const [key, value] of Object.entries(resultObj)) {
    if (!(key in flattened)) {
      flattened[key] = value;
    }
  }
  return flattened;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    // Auto-extract value from TypedOutputValue when traversing
    if (isTypedOutputValue(current)) {
      current = current.value;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  // Auto-extract value from TypedOutputValue at the final result
  if (isTypedOutputValue(current)) {
    return current.value;
  }

  return current;
}
