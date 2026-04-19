import { mkdirSync } from 'fs';
import { randomBytes } from 'crypto';
import { join, resolve } from 'path';
import { config as appConfig } from '../base/config';
import { WorkflowExecutionError, WorkflowNotFoundError } from '../errors/types';
import logger from '../utils/logger';
import * as repository from './workflow.repository';
import { topologicalSort, getUpstreamNodes, getDownstreamNodes } from './dagValidator';
import {
  resolveTemplate,
  resolveParamsTemplates,
  findUnresolvedTemplates,
  flattenResultField,
} from './templateResolver';
import { getNodeExecutor } from './nodeExecutors';
import {
  WorkflowDetail,
  WorkflowNodeInfo,
  WorkflowRunInfo,
  WorkflowRunDetail,
  RunStatus,
  NodeConfig,
  NodeOutput,
  SqlNodeConfig,
  PythonNodeConfig,
  LlmNodeConfig,
  EmailNodeConfig,
  BranchNodeConfig,
  WebSearchNodeConfig,
  BranchNodeOutput,
  WebSearchNodeOutput,
  ParamDefinition,
  OutputValueType,
  WsWorkflowEvent,
} from './workflow.types';

type ProgressCallback = (event: WsWorkflowEvent) => void;

// Active execution progress callbacks keyed by runId
const progressCallbacks = new Map<string, ProgressCallback>();

export function registerProgressCallback(runId: string, callback: ProgressCallback): void {
  progressCallbacks.set(runId, callback);
}

export function unregisterProgressCallback(runId: string): void {
  progressCallbacks.delete(runId);
}

function sendProgress(runId: string, event: WsWorkflowEvent): void {
  const callback = progressCallbacks.get(runId);
  if (callback) {
    try {
      callback(event);
    } catch (err) {
      logger.warn('Failed to send progress event', { runId, error: String(err) });
    }
  }
}

/**
 * Wait for a WebSocket progress callback to be registered for this runId.
 * Returns true if callback was registered, false if timed out.
 * This ensures the frontend has time to connect WebSocket before execution begins.
 */
function waitForProgressCallback(runId: string, timeoutMs: number = 5000): Promise<boolean> {
  if (progressCallbacks.has(runId)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const checkInterval = 50;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += checkInterval;
      if (progressCallbacks.has(runId)) {
        clearInterval(timer);
        resolve(true);
      } else if (elapsed >= timeoutMs) {
        clearInterval(timer);
        logger.warn('Timed out waiting for WebSocket connection', { runId, timeoutMs });
        resolve(false);
      }
    }, checkInterval);
  });
}

function inferFileType(filePath: string): OutputValueType {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'csv':
      return 'csvFile';
    case 'md':
      return 'markdownFile';
    case 'json':
      return 'jsonFile';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
      return 'imageFile';
    default:
      return 'filePath';
  }
}

/**
 * Annotate file-path output fields with their output type metadata.
 * Wraps string file-path fields into TypedOutputValue objects so downstream
 * nodes and the frontend can identify file types without inspecting extensions.
 */
export function annotateOutputTypes(
  nodeType: string,
  output: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...output };
  const fileFieldMap: Record<string, Record<string, OutputValueType>> = {
    sql: { csvPath: 'csvFile' },
    python: { csvPath: 'csvFile' },
    web_search: { markdownPath: 'markdownFile' },
  };
  const fieldMap = fileFieldMap[nodeType];
  if (fieldMap) {
    for (const [field, outputType] of Object.entries(fieldMap)) {
      if (typeof result[field] === 'string') {
        result[field] = { value: result[field], type: outputType };
      }
    }
  }

  // For python nodes, scan result dict for file paths in work_folder
  if (nodeType === 'python' && typeof result.result === 'object' && result.result !== null) {
    const resultDict = result.result as Record<string, unknown>;
    const workFolderPrefix = resolve(appConfig.work_folder) + '/';
    for (const [key, val] of Object.entries(resultDict)) {
      if (typeof val === 'string' && resolve(val).startsWith(workFolderPrefix)) {
        result[`file:${key}`] = { value: val, type: inferFileType(val) };
      }
    }
  }

  return result;
}

// Active workflow executions keyed by workflowId to prevent concurrent runs
const activeExecutions = new Set<string>();

/** Clear active execution locks. Exported for test cleanup only. */
export function clearActiveExecutions(): void {
  activeExecutions.clear();
}

function generateShortId(): string {
  return randomBytes(6).toString('hex');
}

/** Return type for async execution: runId is available immediately, promise resolves when done */
export interface AsyncExecutionHandle {
  runId: string;
  promise: Promise<WorkflowRunDetail>;
}

/**
 * Execute a full workflow asynchronously.
 * Returns runId immediately; execution runs in background.
 * Frontend connects WebSocket with runId to receive real-time status events.
 */
export async function executeWorkflow(
  workflowId: string,
  params?: Record<string, string>,
  options?: {
    workFolder?: string;
  }
): Promise<AsyncExecutionHandle> {
  if (activeExecutions.has(workflowId)) {
    throw new WorkflowExecutionError('Workflow is already executing');
  }

  const workflow = await repository.findWorkflowById(workflowId);
  if (!workflow) {
    throw new WorkflowNotFoundError('Workflow not found');
  }

  const nodeIds = workflow.nodes.map((n) => ({ id: n.id }));
  const edges = workflow.edges.map((e) => ({
    sourceNodeId: e.sourceNodeId,
    targetNodeId: e.targetNodeId,
  }));
  const sortedIds = topologicalSort(nodeIds, edges);

  // Create run record eagerly so runId is available before execution starts
  const workFolder = options?.workFolder ?? join(appConfig.work_folder, `wf_${generateShortId()}`);
  mkdirSync(workFolder, { recursive: true });
  const run = await repository.createRun(workflow.id, RunStatus.Running, workFolder);

  activeExecutions.add(workflowId);
  const promise = executeNodes(workflow, sortedIds, run, workFolder, params).finally(() =>
    activeExecutions.delete(workflowId)
  );

  return { runId: run.id, promise };
}

export interface ExecuteNodeOptions {
  params?: Record<string, string>;
  mockInputs?: Record<string, unknown>;
  cascade?: boolean;
  workFolder?: string;
}

/**
 * Execute a single node with three modes:
 * 1. mockInputs provided (highest priority): use mock data as upstream outputs, run only target node.
 * 2. cascade=true: compute upstream via getUpstreamNodes(), run all (existing behavior).
 * 3. cascade=false (default): look up historical outputs for upstream nodes, run only target node.
 *
 * Returns runId immediately; execution runs in background.
 */
export async function executeNode(
  workflowId: string,
  nodeId: string,
  options?: ExecuteNodeOptions
): Promise<AsyncExecutionHandle> {
  if (activeExecutions.has(workflowId)) {
    throw new WorkflowExecutionError('Workflow is already executing');
  }

  const workflow = await repository.findWorkflowById(workflowId);
  if (!workflow) {
    throw new WorkflowNotFoundError('Workflow not found');
  }

  const dagNodes = workflow.nodes.map((n) => ({ id: n.id }));
  const dagEdges = workflow.edges.map((e) => ({
    sourceNodeId: e.sourceNodeId,
    targetNodeId: e.targetNodeId,
  }));

  const params = options?.params;
  const mockInputs = options?.mockInputs;
  const cascade = options?.cascade ?? false;

  const workFolder = options?.workFolder ?? join(appConfig.work_folder, `wf_${generateShortId()}`);
  mkdirSync(workFolder, { recursive: true });
  const run = await repository.createRun(workflow.id, RunStatus.Running, workFolder);

  let sortedIds: string[];
  let existingOutputs: Map<string, Record<string, unknown>> | undefined;

  if (mockInputs) {
    // Mode 1: mockInputs — highest priority; run only the target node
    sortedIds = [nodeId];
    existingOutputs = new Map<string, Record<string, unknown>>();
    for (const [key, value] of Object.entries(mockInputs)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        existingOutputs.set(key, flattenResultField(value as Record<string, unknown>));
      }
    }
  } else if (cascade) {
    // Mode 2: cascade — run all upstream nodes + target
    sortedIds = getUpstreamNodes(nodeId, dagNodes, dagEdges);
  } else {
    // Mode 3: non-cascade (default) — use historical outputs for upstream nodes
    const allUpstream = getUpstreamNodes(nodeId, dagNodes, dagEdges);
    const upstreamOnly = allUpstream.filter((id) => id !== nodeId);

    existingOutputs = new Map<string, Record<string, unknown>>();
    for (const upId of upstreamOnly) {
      const upNode = workflow.nodes.find((n) => n.id === upId);
      const output = await repository.findLatestSuccessfulNodeRunOutput(upId);
      if (!output) {
        const upName = upNode?.name ?? upId;
        await repository.updateRunStatus(
          run.id,
          RunStatus.Failed,
          `No historical output for '${upName}'`
        );
        throw new WorkflowExecutionError(
          `No historical output found for upstream node '${upName}'. Run it first or use cascade mode.`
        );
      }
      if (upNode) {
        const resolvedOutput = flattenResultField(output);
        existingOutputs.set(upNode.name, resolvedOutput);
        const outputVar = getOutputVariable(upNode.config);
        if (outputVar) {
          existingOutputs.set(outputVar, resolvedOutput);
        }
      }
    }
    sortedIds = [nodeId];
  }

  activeExecutions.add(workflowId);
  const promise = executeNodes(
    workflow,
    sortedIds,
    run,
    workFolder,
    params,
    existingOutputs
  ).finally(() => activeExecutions.delete(workflowId));

  return { runId: run.id, promise };
}

/**
 * Retry from the failed node in an existing run.
 */
export async function retryFromFailed(
  workflowId: string,
  runId: string
): Promise<AsyncExecutionHandle> {
  const workflow = await repository.findWorkflowById(workflowId);
  if (!workflow) {
    throw new WorkflowNotFoundError('Workflow not found');
  }

  const existingRun = await repository.findRunById(runId);
  if (!existingRun || existingRun.workflowId !== workflowId) {
    throw new WorkflowNotFoundError('Workflow run not found');
  }

  if (existingRun.status !== RunStatus.Failed) {
    throw new WorkflowExecutionError('Can only retry failed runs');
  }

  // Find the failed node
  const failedNodeRun = existingRun.nodeRuns.find((nr) => nr.status === RunStatus.Failed);
  if (!failedNodeRun) {
    throw new WorkflowExecutionError('No failed node found in run');
  }

  // Collect completed node outputs to reuse (store under both name and outputVariable)
  const completedOutputs = new Map<string, Record<string, unknown>>();
  for (const nr of existingRun.nodeRuns) {
    if (nr.status === RunStatus.Completed && nr.outputs) {
      const node = workflow.nodes.find((n) => n.id === nr.nodeId);
      if (node) {
        const resolvedOutput = flattenResultField(nr.outputs);
        completedOutputs.set(node.name, resolvedOutput);
        const outputVar = getOutputVariable(node.config);
        if (outputVar) {
          completedOutputs.set(outputVar, resolvedOutput);
        }
      }
    }
  }

  // Get only the failed node and its downstream dependents
  const nodeIds = workflow.nodes.map((n) => ({ id: n.id }));
  const edges = workflow.edges.map((e) => ({
    sourceNodeId: e.sourceNodeId,
    targetNodeId: e.targetNodeId,
  }));
  const nodesToExecute = getDownstreamNodes(failedNodeRun.nodeId, nodeIds, edges);

  const workFolder = await repository.getRunWorkFolder(runId);
  if (!workFolder) {
    throw new WorkflowExecutionError('Failed to find work folder for retry');
  }

  const newRun = await repository.createRun(workflow.id, RunStatus.Running, workFolder);
  const promise = executeNodes(
    workflow,
    nodesToExecute,
    newRun,
    workFolder,
    undefined,
    completedOutputs
  );

  return { runId: newRun.id, promise };
}

/**
 * Core execution logic for a set of nodes in topological order.
 * The run record and work folder are created by the caller (executeWorkflow/executeNode/retryFromFailed)
 * so the runId is available immediately for WebSocket connections.
 */
async function executeNodes(
  workflow: WorkflowDetail,
  sortedNodeIds: string[],
  run: WorkflowRunInfo,
  workFolder: string,
  params?: Record<string, string>,
  existingOutputs?: Map<string, Record<string, unknown>>
): Promise<WorkflowRunDetail> {
  // Wait for frontend WebSocket to connect before starting execution
  await waitForProgressCallback(run.id);

  // Build node map for quick lookup
  const nodeMap = new Map<string, WorkflowNodeInfo>();
  for (const node of workflow.nodes) {
    nodeMap.set(node.id, node);
  }

  // Create node run records in batch
  const nodeRunMap = new Map<string, string>(); // nodeId -> nodeRunId
  const nodeRuns = await repository.createNodeRunsBatch(run.id, sortedNodeIds, RunStatus.Pending);
  for (const nodeRun of nodeRuns) {
    nodeRunMap.set(nodeRun.nodeId, nodeRun.id);
  }

  // Track outputs: nodeName -> output
  const nodeOutputs = new Map<string, Record<string, unknown>>(existingOutputs ?? []);

  // Add params as a virtual namespace
  if (params) {
    nodeOutputs.set('params', params);
  }

  let failed = false;

  // Track blocked edges for branch skip logic
  const blockedEdgeIds = new Set<string>();

  for (const nodeId of sortedNodeIds) {
    const node = nodeMap.get(nodeId);
    const nodeRunId = nodeRunMap.get(nodeId);
    if (!node || !nodeRunId) continue;

    // Check if node should be skipped (branch logic)
    const inEdges = workflow.edges.filter((e) => e.targetNodeId === nodeId);
    if (inEdges.length > 0 && inEdges.every((e) => blockedEdgeIds.has(e.id))) {
      // All incoming edges are blocked — skip this node
      await repository.updateNodeRun(nodeRunId, { status: RunStatus.Skipped });
      sendProgress(run.id, {
        type: 'node_skipped',
        runId: run.id,
        nodeId,
        nodeName: node.name,
      });
      // Propagate: block all outgoing edges
      for (const outEdge of workflow.edges.filter((e) => e.sourceNodeId === nodeId)) {
        blockedEdgeIds.add(outEdge.id);
      }
      continue;
    }

    if (failed) {
      // Skip downstream nodes after failure
      await repository.updateNodeRun(nodeRunId, { status: RunStatus.Skipped });
      sendProgress(run.id, {
        type: 'node_skipped',
        runId: run.id,
        nodeId,
        nodeName: node.name,
      });
      continue;
    }

    // Mark as running
    await repository.updateNodeRun(nodeRunId, {
      status: RunStatus.Running,
      startedAt: new Date(),
    });
    sendProgress(run.id, {
      type: 'node_start',
      runId: run.id,
      nodeId,
      nodeName: node.name,
    });

    try {
      // Resolve template variables in config
      const resolvedConfig = resolveNodeConfig(node.config, nodeOutputs);
      validateResolvedConfig(resolvedConfig, node.name, nodeOutputs);

      // Get executor and run
      const executor = getNodeExecutor(node.type);
      const output = await executor.execute({
        workFolder,
        nodeId,
        nodeName: node.name,
        resolvedConfig,
      });

      // Store output for downstream nodes
      const rawOutputRecord = nodeOutputToRecord(output);
      const outputRecord = annotateOutputTypes(node.type, rawOutputRecord);
      const resolvedOutput = flattenResultField(outputRecord);
      nodeOutputs.set(node.name, resolvedOutput);

      // Also store under outputVariable name if the config has one
      const outputVar = getOutputVariable(node.config);
      if (outputVar) {
        nodeOutputs.set(outputVar, resolvedOutput);
      }

      // Branch node: block edges for the inactive branch
      if (node.type === 'branch' && 'result' in output) {
        const branchResult = (output as BranchNodeOutput).result;
        const outEdges = workflow.edges.filter((e) => e.sourceNodeId === nodeId);
        for (const edge of outEdges) {
          if (edge.sourceHandle === 'true' && !branchResult) {
            blockedEdgeIds.add(edge.id);
          } else if (edge.sourceHandle === 'false' && branchResult) {
            blockedEdgeIds.add(edge.id);
          }
        }
      }

      // Build preview for WebSocket
      const preview = buildPreview(node.type, output);

      // Mark as completed
      await repository.updateNodeRun(nodeRunId, {
        status: RunStatus.Completed,
        outputs: outputRecord,
        completedAt: new Date(),
      });
      sendProgress(run.id, {
        type: 'node_complete',
        runId: run.id,
        nodeId,
        nodeName: node.name,
        preview,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      failed = true;

      await repository.updateNodeRun(nodeRunId, {
        status: RunStatus.Failed,
        errorMessage,
        completedAt: new Date(),
      });
      sendProgress(run.id, {
        type: 'node_error',
        runId: run.id,
        nodeId,
        nodeName: node.name,
        error: errorMessage,
      });

      logger.error('Workflow node execution failed', {
        workflowId: workflow.id,
        nodeId,
        error: errorMessage,
      });
    }
  }

  // Update run status
  const finalStatus = failed ? RunStatus.Failed : RunStatus.Completed;
  await repository.updateRunStatus(
    run.id,
    finalStatus,
    failed ? 'One or more nodes failed' : undefined
  );
  sendProgress(run.id, {
    type: 'run_complete',
    runId: run.id,
    status: finalStatus as 'completed' | 'failed',
  });

  // Return run detail
  const runDetail = await repository.findRunById(run.id);
  if (!runDetail) {
    throw new WorkflowExecutionError('Failed to load run detail after execution');
  }
  return runDetail;
}

function resolveNodeConfig(
  config: NodeConfig,
  nodeOutputs: Map<string, Record<string, unknown>>
): NodeConfig {
  switch (config.nodeType) {
    case 'sql': {
      const sqlConfig = config as SqlNodeConfig;
      const resolvedParamDefs = resolveParamsTemplates(sqlConfig.params ?? {}, nodeOutputs);
      const flatSqlParams: Record<string, string> = {};
      for (const [k, pd] of Object.entries(resolvedParamDefs)) {
        flatSqlParams[k] = String(pd.value);
      }
      const resolvedSql = resolveTemplate(sqlConfig.sql, nodeOutputs);

      // SECURITY: Template values are interpolated directly into SQL.
      // This is by design — users control both their queries and datasources.
      // Resolved values from upstream nodes should be trusted data (CSV paths, etc.)
      // but we log a warning if params are resolved into SQL so it's auditable.
      if (resolvedSql !== sqlConfig.sql) {
        logger.debug('SQL template resolved with variable substitution', {
          originalLength: sqlConfig.sql.length,
          resolvedLength: resolvedSql.length,
        });
      }

      return {
        ...sqlConfig,
        params: flatSqlParams,
        sql: resolvedSql,
      };
    }
    case 'python': {
      const pyConfig = config as PythonNodeConfig;
      const resolvedParamDefs = resolveParamsTemplates(pyConfig.params, nodeOutputs);
      const flatPyParams: Record<string, string> = {};
      for (const [k, pd] of Object.entries(resolvedParamDefs)) {
        flatPyParams[k] = String(pd.value);
      }
      return {
        ...pyConfig,
        params: flatPyParams,
        script: resolveTemplate(pyConfig.script, nodeOutputs),
      };
    }
    case 'llm': {
      const llmConfig = config as LlmNodeConfig;
      const resolvedLlmParamDefs = resolveParamsTemplates(llmConfig.params, nodeOutputs);
      const flatLlmParams: Record<string, string> = {};
      for (const [k, pd] of Object.entries(resolvedLlmParamDefs)) {
        flatLlmParams[k] = String(pd.value);
      }
      return {
        ...llmConfig,
        params: flatLlmParams,
        prompt: resolveTemplate(llmConfig.prompt, nodeOutputs),
      };
    }
    case 'email': {
      const emailConfig = config as EmailNodeConfig;
      return {
        ...emailConfig,
        to: resolveTemplate(emailConfig.to, nodeOutputs),
        subject: resolveTemplate(emailConfig.subject, nodeOutputs),
        body: emailConfig.body ? resolveTemplate(emailConfig.body, nodeOutputs) : undefined,
        upstreamField: emailConfig.upstreamField
          ? resolveTemplate(emailConfig.upstreamField, nodeOutputs)
          : undefined,
      };
    }
    case 'branch': {
      const branchConfig = config as BranchNodeConfig;
      return {
        ...branchConfig,
        field: resolveTemplate(branchConfig.field, nodeOutputs),
      };
    }
    case 'web_search': {
      const wsConfig = config as WebSearchNodeConfig;
      const resolvedWsParamDefs = resolveParamsTemplates(wsConfig.params, nodeOutputs);
      const flatWsParams: Record<string, string> = {};
      for (const [k, pd] of Object.entries(resolvedWsParamDefs)) {
        flatWsParams[k] = String(pd.value);
      }
      return {
        ...wsConfig,
        params: flatWsParams,
        keywords: resolveTemplate(wsConfig.keywords, nodeOutputs),
      };
    }
    default:
      return config;
  }
}

/**
 * Collects all resolved string values from a NodeConfig for unresolved-template checking.
 */
function paramValueToString(v: string | ParamDefinition): string {
  return typeof v === 'string' ? v : String(v.value);
}

function collectResolvedStrings(config: NodeConfig): string[] {
  switch (config.nodeType) {
    case 'sql': {
      const sqlCfg = config as SqlNodeConfig;
      return [sqlCfg.sql, ...Object.values(sqlCfg.params ?? {}).map(paramValueToString)];
    }
    case 'python': {
      const py = config as PythonNodeConfig;
      return [py.script, ...Object.values(py.params).map(paramValueToString)];
    }
    case 'llm': {
      const llm = config as LlmNodeConfig;
      return [llm.prompt, ...Object.values(llm.params).map(paramValueToString)];
    }
    case 'email': {
      const e = config as EmailNodeConfig;
      return [e.to, e.subject, e.body, e.upstreamField].filter(
        (v): v is string => typeof v === 'string'
      );
    }
    case 'branch':
      return [(config as BranchNodeConfig).field];
    case 'web_search': {
      const ws = config as WebSearchNodeConfig;
      return [ws.keywords, ...Object.values(ws.params).map(paramValueToString)];
    }
    default:
      return [];
  }
}

/**
 * Validates that all template variables in a resolved config have been successfully resolved.
 * Throws WorkflowExecutionError if any {{...}} placeholders remain.
 */
function validateResolvedConfig(
  config: NodeConfig,
  nodeName: string,
  nodeOutputs: Map<string, Record<string, unknown>>
): void {
  const strings = collectResolvedStrings(config);
  const allUnresolved: string[] = [];
  for (const str of strings) {
    allUnresolved.push(...findUnresolvedTemplates(str));
  }
  if (allUnresolved.length > 0) {
    const vars = [...new Set(allUnresolved)].join(', ');
    const available = formatAvailableOutputs(nodeOutputs);
    throw new WorkflowExecutionError(
      `Node '${nodeName}' has unresolved template variables: ${vars}. ` +
        `Available output variables and their fields:\n${available}`
    );
  }
}

/**
 * Formats available node outputs for inclusion in error messages,
 * so the caller can see which outputVariable names and top-level fields exist.
 */
function formatAvailableOutputs(nodeOutputs: Map<string, Record<string, unknown>>): string {
  const lines: string[] = [];
  for (const [name, output] of nodeOutputs) {
    const fields = Object.keys(output);
    lines.push(`  - ${name}: { ${fields.join(', ')} }`);
  }
  return lines.length > 0 ? lines.join('\n') : '  (none)';
}

function nodeOutputToRecord(output: NodeOutput): Record<string, unknown> {
  // Convert typed NodeOutput union to a plain Record for template resolution
  // Each output type's fields are already serializable
  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(output)) {
    record[key] = value;
  }
  return record;
}

function getOutputVariable(config: NodeConfig): string | undefined {
  if ('outputVariable' in config && typeof config.outputVariable === 'string') {
    return config.outputVariable;
  }
  return undefined;
}

function buildPreview(nodeType: string, output: NodeOutput): Record<string, unknown> | null {
  switch (nodeType) {
    case 'sql':
      if ('previewData' in output) {
        return {
          type: 'sql',
          columns: output.columns,
          previewData: output.previewData,
          totalRows: output.totalRows,
        };
      }
      return null;
    case 'python':
      if ('result' in output && 'stderr' in output) {
        return { type: 'python', result: output.result, stderr: output.stderr };
      }
      return null;
    case 'llm':
      if ('result' in output && 'rawResponse' in output) {
        return { type: 'llm', result: output.result };
      }
      return null;
    case 'email':
      if ('success' in output && 'messageId' in output) {
        return { type: 'email', success: output.success, recipients: output.recipients };
      }
      return null;
    case 'branch':
      return { type: 'branch', result: (output as BranchNodeOutput).result };
    case 'web_search':
      return {
        type: 'web_search',
        totalResults: (output as WebSearchNodeOutput).totalResults,
      };
    default:
      return null;
  }
}
