import { http } from '@/utils/http';
import type {
  WorkflowListItem,
  WorkflowDetail,
  WorkflowRunInfo,
  WorkflowRunDetail,
  SaveWorkflowInput,
  CustomNodeTemplateInfo,
  NodeConfig,
  ExportedWorkflow,
  ImportWorkflowResult,
  ListRunsParams,
  ListRunsResponse,
} from '@/types/workflow';

interface WorkflowListResponse {
  workflows: WorkflowListItem[];
}

interface WorkflowDetailResponse {
  workflow: WorkflowDetail;
}

interface RunDetailResponse {
  run: WorkflowRunDetail;
}

interface TemplateListResponse {
  templates: CustomNodeTemplateInfo[];
}

interface TemplateDetailResponse {
  template: CustomNodeTemplateInfo;
}

// Workflow CRUD
export async function listWorkflows(): Promise<WorkflowListItem[]> {
  const res = await http.get<WorkflowListResponse>('/workflows');
  return res.workflows;
}

export async function getWorkflow(id: string): Promise<WorkflowDetail> {
  const res = await http.get<WorkflowDetailResponse>(`/workflows/${id}`);
  return res.workflow;
}

export async function createWorkflow(name: string, description?: string): Promise<WorkflowDetail> {
  const res = await http.post<WorkflowDetailResponse>('/workflows', { name, description });
  return res.workflow;
}

export async function saveWorkflow(id: string, input: SaveWorkflowInput): Promise<WorkflowDetail> {
  const res = await http.put<WorkflowDetailResponse>(`/workflows/${id}`, input);
  return res.workflow;
}

export async function deleteWorkflow(id: string): Promise<void> {
  await http.delete(`/workflows/${id}`);
}

interface CloneResponse {
  workflow: WorkflowListItem;
}

export async function cloneWorkflow(id: string, name: string): Promise<WorkflowListItem> {
  const res = await http.post<CloneResponse>(`/workflows/${id}/clone`, { name });
  return res.workflow;
}

export async function exportWorkflow(id: string): Promise<ExportedWorkflow> {
  return http.get<ExportedWorkflow>(`/workflows/${id}/export`);
}

interface ImportWorkflowResponse {
  result: ImportWorkflowResult;
}

export async function importWorkflow(data: ExportedWorkflow): Promise<ImportWorkflowResult> {
  const res = await http.post<ImportWorkflowResponse>('/workflows/import', data);
  return res.result;
}

// Execution — returns runId immediately, execution runs asynchronously
interface StartRunResponse {
  runId: string;
}

export async function startWorkflow(id: string, params?: Record<string, string>): Promise<string> {
  const res = await http.post<StartRunResponse>(`/workflows/${id}/run`, { params });
  return res.runId;
}

export async function startNode(
  workflowId: string,
  nodeId: string,
  params?: Record<string, string>,
  cascade?: boolean
): Promise<string> {
  const res = await http.post<StartRunResponse>(`/workflows/${workflowId}/nodes/${nodeId}/run`, {
    params,
    cascade,
  });
  return res.runId;
}

export async function retryRun(workflowId: string, runId: string): Promise<string> {
  const res = await http.post<StartRunResponse>(`/workflows/${workflowId}/runs/${runId}/retry`);
  return res.runId;
}

// Fetch run detail (after execution completes)
export async function getRunDetail(workflowId: string, runId: string): Promise<WorkflowRunDetail> {
  const res = await http.get<RunDetailResponse>(`/workflows/${workflowId}/runs/${runId}`);
  return res.run;
}

export async function listRuns(workflowId: string): Promise<WorkflowRunInfo[]> {
  const res = await http.get<ListRunsResponse>(`/workflows/${workflowId}/runs`);
  return res.runs;
}

export async function listRunsPaginated(
  workflowId: string,
  params: ListRunsParams
): Promise<ListRunsResponse> {
  const query = new URLSearchParams();
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
  if (params.status !== undefined) query.set('status', params.status);
  if (params.startFrom !== undefined) query.set('startFrom', params.startFrom);
  if (params.startTo !== undefined) query.set('startTo', params.startTo);
  const qs = query.toString();
  return http.get<ListRunsResponse>(`/workflows/${workflowId}/runs${qs ? `?${qs}` : ''}`);
}

// Custom Node Templates
export async function listTemplates(): Promise<CustomNodeTemplateInfo[]> {
  const res = await http.get<TemplateListResponse>('/custom-node-templates');
  return res.templates;
}

export async function createTemplate(data: {
  name: string;
  description?: string;
  type: string;
  config: NodeConfig;
}): Promise<CustomNodeTemplateInfo> {
  const res = await http.post<TemplateDetailResponse>('/custom-node-templates', data);
  return res.template;
}

export async function deleteTemplate(id: string): Promise<void> {
  await http.delete(`/custom-node-templates/${id}`);
}

export async function updateTemplate(
  id: string,
  data: { name?: string; description?: string; config?: NodeConfig }
): Promise<CustomNodeTemplateInfo> {
  const res = await http.put<TemplateDetailResponse>(`/custom-node-templates/${id}`, data);
  return res.template;
}
