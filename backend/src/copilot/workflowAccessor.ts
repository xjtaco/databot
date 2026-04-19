import { rm } from 'fs/promises';
import { mkdirSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { config as appConfig } from '../base/config';
import * as service from '../workflow/workflow.service';
import * as executionEngine from '../workflow/executionEngine';
import { annotateOutputTypes } from '../workflow/executionEngine';
import {
  resolveTemplate,
  resolveParamsTemplates,
  flattenResultField,
} from '../workflow/templateResolver';
import { getNodeExecutor } from '../workflow/nodeExecutors';
import { WorkflowNodeNotFoundError } from '../errors/types';
import type {
  WorkflowDetail,
  WorkflowNodeInfo,
  SaveWorkflowNodeInput,
  WsWorkflowEvent,
  NodeConfig,
  NodeOutput,
  SqlNodeConfig,
  PythonNodeConfig,
  LlmNodeConfig,
  EmailNodeConfig,
  BranchNodeConfig,
  WebSearchNodeConfig,
} from '../workflow/workflow.types';

/**
 * Abstraction over workflow data access. Allows tools to work
 * with both DB-persisted workflows and in-memory debug workflows.
 */
export interface WorkflowAccessor {
  readonly workflowId: string;
  getWorkflow(): Promise<WorkflowDetail>;
  getNode(nodeId: string): Promise<WorkflowNodeInfo>;
  updateNode(nodeId: string, updates: Partial<SaveWorkflowNodeInput>): Promise<void>;
  executeNode(
    nodeId: string,
    options: {
      mockInputs?: Record<string, unknown>;
      cascade?: boolean;
      onProgress?: (event: WsWorkflowEvent) => void;
    }
  ): Promise<{ runId: string }>;
  getRunResult(runId: string): Promise<Record<string, unknown>>;
}

/**
 * DB-backed implementation — wraps existing workflow.service calls.
 * Used by CopilotAgent.
 */
export class DbWorkflowAccessor implements WorkflowAccessor {
  readonly workflowId: string;
  private readonly tempWorkdir?: string;

  constructor(workflowId: string, tempWorkdir?: string) {
    this.workflowId = workflowId;
    this.tempWorkdir = tempWorkdir;
  }

  async getWorkflow(): Promise<WorkflowDetail> {
    return service.getWorkflow(this.workflowId);
  }

  async getNode(nodeId: string): Promise<WorkflowNodeInfo> {
    const wf = await this.getWorkflow();
    const node = wf.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    return node;
  }

  async updateNode(nodeId: string, updates: Partial<SaveWorkflowNodeInput>): Promise<void> {
    const wf = await this.getWorkflow();
    const idx = wf.nodes.findIndex((n) => n.id === nodeId);
    if (idx === -1) throw new Error(`Node ${nodeId} not found`);
    Object.assign(wf.nodes[idx], updates);
    await service.saveWorkflow(this.workflowId, {
      name: wf.name,
      description: wf.description ?? undefined,
      nodes: wf.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        description: n.description ?? undefined,
        type: n.type,
        config: n.config,
        positionX: n.positionX,
        positionY: n.positionY,
      })),
      edges: wf.edges.map((e) => ({
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        sourceHandle: e.sourceHandle ?? undefined,
      })),
    });
  }

  async executeNode(
    nodeId: string,
    options: {
      mockInputs?: Record<string, unknown>;
      cascade?: boolean;
      onProgress?: (event: WsWorkflowEvent) => void;
    }
  ): Promise<{ runId: string }> {
    const workFolder = createExecutionWorkFolder(this.tempWorkdir);
    let handle: Awaited<ReturnType<typeof executionEngine.executeNode>> | undefined;
    try {
      handle = await executionEngine.executeNode(this.workflowId, nodeId, {
        mockInputs: options.mockInputs,
        cascade: options.cascade,
        workFolder,
      });
      if (options.onProgress) {
        executionEngine.registerProgressCallback(handle.runId, options.onProgress);
      }
      await handle.promise;
      return { runId: handle.runId };
    } catch (error) {
      if (!handle) {
        await rm(workFolder, { recursive: true, force: true }).catch(() => {
          // Ignore cleanup failures for throwaway temp workdirs.
        });
      }
      throw error;
    } finally {
      if (options.onProgress && handle) {
        executionEngine.unregisterProgressCallback(handle.runId);
      }
    }
  }

  async getRunResult(runId: string): Promise<Record<string, unknown>> {
    const detail = await service.getRunDetail(this.workflowId, runId);
    return detail as unknown as Record<string, unknown>;
  }
}

// ── Helpers for resolving node config templates ─────────────

function resolveNodeConfig(
  config: NodeConfig,
  nodeOutputs: Map<string, Record<string, unknown>>
): NodeConfig {
  switch (config.nodeType) {
    case 'sql': {
      const c = config as SqlNodeConfig;
      return { ...c, sql: resolveTemplate(c.sql, nodeOutputs) };
    }
    case 'python': {
      const c = config as PythonNodeConfig;
      const resolved = resolveParamsTemplates(c.params, nodeOutputs);
      const flat: Record<string, string> = {};
      for (const [k, pd] of Object.entries(resolved)) {
        flat[k] = String(pd.value);
      }
      return { ...c, params: flat, script: resolveTemplate(c.script, nodeOutputs) };
    }
    case 'llm': {
      const c = config as LlmNodeConfig;
      const resolved = resolveParamsTemplates(c.params, nodeOutputs);
      const flat: Record<string, string> = {};
      for (const [k, pd] of Object.entries(resolved)) {
        flat[k] = String(pd.value);
      }
      return { ...c, params: flat, prompt: resolveTemplate(c.prompt, nodeOutputs) };
    }
    case 'email': {
      const c = config as EmailNodeConfig;
      return {
        ...c,
        to: resolveTemplate(c.to, nodeOutputs),
        subject: resolveTemplate(c.subject, nodeOutputs),
        body: c.body ? resolveTemplate(c.body, nodeOutputs) : undefined,
        upstreamField: c.upstreamField ? resolveTemplate(c.upstreamField, nodeOutputs) : undefined,
      };
    }
    case 'branch': {
      const c = config as BranchNodeConfig;
      return { ...c, field: resolveTemplate(c.field, nodeOutputs) };
    }
    case 'web_search': {
      const c = config as WebSearchNodeConfig;
      const resolved = resolveParamsTemplates(c.params, nodeOutputs);
      const flat: Record<string, string> = {};
      for (const [k, pd] of Object.entries(resolved)) {
        flat[k] = String(pd.value);
      }
      return { ...c, params: flat, keywords: resolveTemplate(c.keywords, nodeOutputs) };
    }
    default:
      return config;
  }
}

function nodeOutputToRecord(output: NodeOutput): Record<string, unknown> {
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

function generateShortId(): string {
  return randomBytes(6).toString('hex');
}

const WF_TEMP_DIR_PREFIX = 'wf_';

function createDebugTempWorkdir(): string {
  mkdirSync(appConfig.work_folder, { recursive: true });
  return mkdtempSync(join(appConfig.work_folder, WF_TEMP_DIR_PREFIX));
}

export function createExecutionWorkFolder(parentWorkdir: string = appConfig.work_folder): string {
  mkdirSync(parentWorkdir, { recursive: true });
  return mkdtempSync(join(parentWorkdir, WF_TEMP_DIR_PREFIX));
}

/**
 * In-memory implementation — holds a workflow object without DB persistence.
 * Used by DebugAgent for single-node editing and testing.
 */
export class InMemoryWorkflowAccessor implements WorkflowAccessor {
  readonly workflowId: string;
  private workflow: WorkflowDetail;
  private readonly runResults = new Map<string, Record<string, unknown>>();
  private readonly tempDirs: string[] = [];
  private tempWorkdir?: string;

  constructor(workflow: WorkflowDetail) {
    this.workflowId = workflow.id;
    this.workflow = workflow;
  }

  getTempWorkdir(): string {
    if (!this.tempWorkdir) {
      this.tempWorkdir = createDebugTempWorkdir();
      this.tempDirs.push(this.tempWorkdir);
    }
    return this.tempWorkdir;
  }

  async getWorkflow(): Promise<WorkflowDetail> {
    return this.workflow;
  }

  async getNode(nodeId: string): Promise<WorkflowNodeInfo> {
    const node = this.workflow.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new WorkflowNodeNotFoundError(`Node ${nodeId} not found`);
    }
    return node;
  }

  async updateNode(nodeId: string, updates: Partial<SaveWorkflowNodeInput>): Promise<void> {
    const idx = this.workflow.nodes.findIndex((n) => n.id === nodeId);
    if (idx === -1) {
      throw new WorkflowNodeNotFoundError(`Node ${nodeId} not found`);
    }
    Object.assign(this.workflow.nodes[idx], updates);
  }

  async executeNode(
    nodeId: string,
    options: {
      mockInputs?: Record<string, unknown>;
      cascade?: boolean;
      onProgress?: (event: WsWorkflowEvent) => void;
    }
  ): Promise<{ runId: string }> {
    const node = await this.getNode(nodeId);
    const runId = `mem-run-${generateShortId()}`;

    // Build nodeOutputs map from mockInputs
    const nodeOutputs = new Map<string, Record<string, unknown>>();
    if (options.mockInputs) {
      for (const [key, value] of Object.entries(options.mockInputs)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          nodeOutputs.set(key, flattenResultField(value as Record<string, unknown>));
        }
      }
    }

    // Notify progress: node_start
    options.onProgress?.({
      type: 'node_start',
      runId,
      nodeId,
      nodeName: node.name,
    });

    try {
      // Resolve templates in config
      const resolvedConfig = resolveNodeConfig(node.config, nodeOutputs);

      // Execute via the registered executor
      const executor = getNodeExecutor(node.type);
      const workFolder = createExecutionWorkFolder(this.getTempWorkdir());
      this.tempDirs.push(workFolder);
      const output = await executor.execute({
        workFolder,
        nodeId,
        nodeName: node.name,
        resolvedConfig,
      });

      // Convert and annotate output
      const rawRecord = nodeOutputToRecord(output);
      const outputRecord = annotateOutputTypes(node.type, rawRecord);
      const resolvedOutput = flattenResultField(outputRecord);

      // Store under node name and outputVariable
      nodeOutputs.set(node.name, resolvedOutput);
      const outputVar = getOutputVariable(node.config);
      if (outputVar) {
        nodeOutputs.set(outputVar, resolvedOutput);
      }

      // Store run result
      this.runResults.set(runId, resolvedOutput);

      // Notify progress: node_complete
      options.onProgress?.({
        type: 'node_complete',
        runId,
        nodeId,
        nodeName: node.name,
        preview: outputRecord,
      });

      options.onProgress?.({
        type: 'run_complete',
        runId,
        status: 'completed',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Store the error in run results so getRunResult can retrieve it
      this.runResults.set(runId, { error: errorMessage });

      options.onProgress?.({
        type: 'node_error',
        runId,
        nodeId,
        nodeName: node.name,
        error: errorMessage,
      });

      options.onProgress?.({
        type: 'run_complete',
        runId,
        status: 'failed',
      });
    }

    return { runId };
  }

  async getRunResult(runId: string): Promise<Record<string, unknown>> {
    const result = this.runResults.get(runId);
    if (!result) {
      throw new Error(`Run result not found for runId: ${runId}`);
    }
    return result;
  }

  /**
   * Removes temp directories and clears the in-memory run map.
   */
  async cleanup(): Promise<void> {
    for (const dir of this.tempDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {
        // Ignore cleanup errors — temp dirs may already be removed
      });
    }
    this.tempDirs.length = 0;
    this.runResults.clear();
  }
}
