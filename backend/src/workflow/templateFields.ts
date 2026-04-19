import type { WorkflowNodeInfo, WorkflowNodeRunInfo, WorkflowNodeTypeValue } from './workflow.types';

const INTERNAL_TEMPLATE_FIELD_KEYS = new Set(['_sanitized']);

export const RAW_OUTPUT_TEMPLATE_WARNING =
  'raw_output is not a structured template field source. Fix the upstream Python node by assigning downstream fields to result, then re-run it.';

export interface TemplateFieldSummary {
  fields: string[];
  hasRawOutput: boolean;
  needsUpstreamFix: boolean;
  warnings: string[];
}

export interface NodeTemplateFieldSummary extends TemplateFieldSummary {
  nodeId?: string;
  nodeName?: string;
  nodeType?: WorkflowNodeTypeValue | string;
  outputVariable?: string;
  referenceNames: string[];
}

type NodeSummaryInput = Pick<WorkflowNodeInfo, 'id' | 'name' | 'type' | 'config'>;
type NodeRunSummaryInput = Pick<WorkflowNodeRunInfo, 'nodeId' | 'nodeName' | 'nodeType'>;

interface BuildNodeTemplateFieldSummaryInput {
  node?: NodeSummaryInput;
  nodeRun?: NodeRunSummaryInput;
  output: Record<string, unknown>;
}

interface NodeOutputLike {
  nodeName?: string;
  nodeId?: string;
  output: Record<string, unknown>;
}

function uniqueDefined(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value === undefined || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function getOutputVariable(node?: NodeSummaryInput): string | undefined {
  return node?.config.outputVariable;
}

function toNodeOutputEntries(
  nodeOutputs:
    | Iterable<NodeOutputLike>
    | Map<string, Record<string, unknown>>
    | Record<string, Record<string, unknown>>
): Array<{ name: string; output: Record<string, unknown> }> {
  if (nodeOutputs instanceof Map) {
    return [...nodeOutputs.entries()].map(([name, output]) => ({ name, output }));
  }

  if (Symbol.iterator in Object(nodeOutputs)) {
    return [...(nodeOutputs as Iterable<NodeOutputLike>)].map(({ nodeName, nodeId, output }) => ({
      name: nodeName ?? nodeId ?? 'unknown',
      output,
    }));
  }

  return Object.entries(nodeOutputs).map(([name, output]) => ({ name, output }));
}

export function buildTemplateFieldSummary(output: Record<string, unknown>): TemplateFieldSummary {
  const fields = Object.entries(output)
    .filter(([key, value]) => !INTERNAL_TEMPLATE_FIELD_KEYS.has(key) && value !== undefined)
    .map(([key]) => key);
  const hasRawOutput = fields.includes('raw_output');

  return {
    fields,
    hasRawOutput,
    needsUpstreamFix: hasRawOutput,
    warnings: hasRawOutput ? [RAW_OUTPUT_TEMPLATE_WARNING] : [],
  };
}

export function buildNodeTemplateFieldSummary(
  input: BuildNodeTemplateFieldSummaryInput
): NodeTemplateFieldSummary {
  const base = buildTemplateFieldSummary(input.output);
  const nodeId = input.node?.id ?? input.nodeRun?.nodeId;
  const nodeName = input.node?.name ?? input.nodeRun?.nodeName;
  const nodeType = input.node?.type ?? input.nodeRun?.nodeType;
  const outputVariable = getOutputVariable(input.node);
  const referenceNames = uniqueDefined([outputVariable, nodeName]);

  return {
    ...base,
    nodeId,
    nodeName,
    nodeType,
    outputVariable,
    referenceNames,
  };
}

export function formatRawOutputTemplateDiagnostics(
  nodeOutputs:
    | Iterable<NodeOutputLike>
    | Map<string, Record<string, unknown>>
    | Record<string, Record<string, unknown>>
): string {
  const lines = toNodeOutputEntries(nodeOutputs)
    .map(({ name, output }) => ({ name, summary: buildTemplateFieldSummary(output) }))
    .filter(({ summary }) => summary.needsUpstreamFix)
    .map(({ name }) => `- ${name}: needsUpstreamFix: true, assign \`result = {"months": value}\``);

  if (lines.length === 0) return '';

  return [
    'Raw-output upstream nodes need fixes before downstream templates can reference computed fields:',
    ...lines,
  ].join('\n');
}
