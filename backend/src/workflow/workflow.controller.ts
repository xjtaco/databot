import { readFileSync, realpathSync } from 'fs';
import { resolve } from 'path';
import type { Request, Response } from 'express';
import { ValidationError } from '../errors/types';
import { HttpStatusCode } from '../base/types';
import { config } from '../base/config';
import logger from '../utils/logger';
import { getValidatedUuid } from '../utils/routeParams';
import * as workflowService from './workflow.service';
import {
  SaveWorkflowInput,
  RunWorkflowInput,
  RunStatus,
  RunStatusValue,
  ExportedWorkflow,
} from './workflow.types';

export async function createWorkflowHandler(req: Request, res: Response): Promise<void> {
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name || typeof name !== 'string') {
    throw new ValidationError('Name is required');
  }
  const workflow = await workflowService.createWorkflow(name, description, req.user?.userId);
  if (req.auditContext) {
    req.auditContext.params = { workflowName: workflow.name };
  }
  res.status(HttpStatusCode.CREATED).json({ workflow });
}

export async function listWorkflowsHandler(_req: Request, res: Response): Promise<void> {
  const workflows = await workflowService.listWorkflows();
  res.json({ workflows });
}

export async function getWorkflowHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const workflow = await workflowService.getWorkflow(id);
  res.json({ workflow });
}

export async function saveWorkflowHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const input = req.body as SaveWorkflowInput;
  if (!input.name || typeof input.name !== 'string') {
    throw new ValidationError('Name is required');
  }
  if (!Array.isArray(input.nodes)) {
    throw new ValidationError('Nodes array is required');
  }
  if (!Array.isArray(input.edges)) {
    throw new ValidationError('Edges array is required');
  }
  const workflow = await workflowService.saveWorkflow(id, input);
  if (req.auditContext) {
    req.auditContext.params = { workflowName: workflow.name };
  }
  res.json({ workflow });
}

export async function deleteWorkflowHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const workflow = await workflowService.getWorkflow(id);
  await workflowService.deleteWorkflow(id);
  if (req.auditContext) {
    req.auditContext.params = { workflowName: workflow.name };
  }
  res.json({ deleted: true });
}

export async function cloneWorkflowHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const { name } = req.body as { name?: string };
  if (!name || typeof name !== 'string') {
    throw new ValidationError('Name is required');
  }
  const workflow = await workflowService.cloneWorkflow(id, name);
  res.status(HttpStatusCode.CREATED).json({ workflow });
}

export async function exportWorkflowHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const exported = await workflowService.exportWorkflow(id);
  res.json(exported);
}

export async function importWorkflowHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as ExportedWorkflow;
  if (!body.name || typeof body.name !== 'string') {
    throw new ValidationError('Name is required');
  }
  if (!Array.isArray(body.nodes)) {
    throw new ValidationError('Nodes array is required');
  }
  if (!Array.isArray(body.edges)) {
    throw new ValidationError('Edges array is required');
  }
  const result = await workflowService.importWorkflow(body, req.user?.userId);
  res.status(HttpStatusCode.CREATED).json({ result });
}

export async function listRunsHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');

  // Parse pagination
  const rawPage = Number(req.query.page);
  const rawPageSize = Number(req.query.pageSize);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize =
    Number.isFinite(rawPageSize) && rawPageSize >= 1 ? Math.min(Math.floor(rawPageSize), 100) : 20;

  // Parse status filter
  const validStatuses = new Set(Object.values(RunStatus));
  const rawStatus = req.query.status;
  const status =
    typeof rawStatus === 'string' && validStatuses.has(rawStatus as RunStatusValue)
      ? (rawStatus as RunStatusValue)
      : undefined;

  // Parse time range
  const rawFrom = req.query.startFrom;
  const rawTo = req.query.startTo;
  const startFrom =
    typeof rawFrom === 'string' && !isNaN(Date.parse(rawFrom)) ? new Date(rawFrom) : undefined;
  // End-of-day: append T23:59:59.999Z for date-only input so runs on the end date are included
  const startTo =
    typeof rawTo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawTo)
      ? new Date(rawTo + 'T23:59:59.999Z')
      : typeof rawTo === 'string' && !isNaN(Date.parse(rawTo))
        ? new Date(rawTo)
        : undefined;

  const result = await workflowService.listRuns(id, {
    page,
    pageSize,
    status,
    startFrom,
    startTo,
  });
  res.json(result);
}

export async function getRunDetailHandler(req: Request, res: Response): Promise<void> {
  const workflowId = getValidatedUuid(req, 'workflowId');
  const runId = getValidatedUuid(req, 'runId');
  const run = await workflowService.getRunDetail(workflowId, runId);
  res.json({ run });
}

export async function validateWorkflowHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  // getWorkflow will throw if not found, and DAG is validated during save.
  // Here we just confirm the current saved state is valid.
  const workflow = await workflowService.getWorkflow(id);
  const { validateDag } = await import('./dagValidator');
  validateDag(
    workflow.nodes.map((n) => ({ id: n.id })),
    workflow.edges.map((e) => ({ sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId }))
  );
  res.json({ valid: true });
}

// Execution handlers — fire-and-forget pattern.
// Return runId immediately (202 Accepted), execute asynchronously.
// Frontend connects WebSocket with runId to receive real-time node status events.
export async function runWorkflowHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const input = (req.body ?? {}) as RunWorkflowInput;
  const workflow = await workflowService.getWorkflow(id);
  const { executeWorkflow } = await import('./executionEngine');
  const { runId, promise } = await executeWorkflow(id, input.params);
  // Fire-and-forget: let execution run in background, log errors
  promise.catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Background workflow execution failed', { runId, error: msg });
  });
  if (req.auditContext) {
    req.auditContext.params = { workflowName: workflow.name, runId };
  }
  res.status(202).json({ runId });
}

export async function runNodeHandler(req: Request, res: Response): Promise<void> {
  const workflowId = getValidatedUuid(req, 'workflowId');
  const nodeId = getValidatedUuid(req, 'nodeId');
  const body = (req.body ?? {}) as {
    params?: Record<string, string>;
    cascade?: boolean;
    mockInputs?: Record<string, unknown>;
  };
  const { executeNode } = await import('./executionEngine');
  const { runId, promise } = await executeNode(workflowId, nodeId, {
    params: body.params,
    cascade: body.cascade,
    mockInputs: body.mockInputs,
  });
  promise.catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Background node execution failed', { runId, error: msg });
  });
  res.status(202).json({ runId });
}

export async function retryRunHandler(req: Request, res: Response): Promise<void> {
  const workflowId = getValidatedUuid(req, 'workflowId');
  const runId = getValidatedUuid(req, 'runId');
  const { retryFromFailed } = await import('./executionEngine');
  const { runId: newRunId, promise } = await retryFromFailed(workflowId, runId);
  promise.catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Background retry execution failed', { runId: newRunId, error: msg });
  });
  res.status(202).json({ runId: newRunId });
}

export async function filePreviewHandler(req: Request, res: Response): Promise<void> {
  const pathParam = req.query.path;
  if (typeof pathParam !== 'string' || !pathParam) {
    throw new ValidationError('path query parameter is required');
  }
  const resolved = resolvePathInWorkFolder(pathParam);
  const content = readFileSync(resolved, 'utf-8');
  res.json({ content, path: resolved });
}

const CONTENT_TYPE_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  csv: 'text/csv',
  json: 'application/json',
  md: 'text/markdown',
  txt: 'text/plain',
};

function resolvePathInWorkFolder(pathParam: string): string {
  const resolved = resolve(pathParam);
  const workFolder = realpathSync(resolve(config.work_folder));
  const realPath = realpathSync(resolved);

  if (realPath !== workFolder && !realPath.startsWith(workFolder + '/')) {
    throw new ValidationError('Access denied: file outside work folder');
  }

  return realPath;
}

export async function fileRawHandler(req: Request, res: Response): Promise<void> {
  const pathParam = req.query.path;
  if (typeof pathParam !== 'string' || !pathParam) {
    throw new ValidationError('path query parameter is required');
  }
  const resolved = resolvePathInWorkFolder(pathParam);
  const ext = resolved.split('.').pop()?.toLowerCase() ?? '';
  const contentType = CONTENT_TYPE_MAP[ext] ?? 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  const content = readFileSync(resolved);
  res.send(content);
}
