import type { WorkflowNodeType } from '@/types/workflow';

export const NODE_COLORS: Record<WorkflowNodeType, string> = {
  sql: '#3B82F6',
  python: '#22C55E',
  llm: '#A855F7',
  email: '#EC4899',
  branch: '#F59E0B',
  web_search: '#06B6D4',
};

export interface NodeOutputField {
  field: string;
  type: string;
}

export const NODE_OUTPUT_FIELDS: Record<WorkflowNodeType, NodeOutputField[]> = {
  sql: [
    { field: 'csvPath', type: 'csvFile' },
    { field: 'totalRows', type: 'number' },
    { field: 'columns', type: 'array' },
    { field: 'previewData', type: 'object' },
  ],
  python: [
    { field: 'result', type: 'object' },
    { field: 'csvPath', type: 'csvFile' },
    { field: 'stderr', type: 'text' },
  ],
  llm: [
    { field: 'result', type: 'object' },
    { field: 'rawResponse', type: 'text' },
  ],
  email: [
    { field: 'success', type: 'boolean' },
    { field: 'messageId', type: 'text' },
    { field: 'recipients', type: 'array' },
  ],
  branch: [{ field: 'result', type: 'boolean' }],
  web_search: [
    { field: 'markdownPath', type: 'markdownFile' },
    { field: 'totalResults', type: 'number' },
  ],
};
