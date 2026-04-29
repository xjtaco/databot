export type ActionDomain = 'data' | 'knowledge' | 'schedule' | 'workflow' | 'template';
export type RiskLevel = 'low' | 'medium' | 'high' | 'danger';
export type ExecutionMode = 'frontend';
export type PresentationMode =
  | 'inline_form'
  | 'navigate'
  | 'deferred_navigation'
  | 'in_chat'
  | 'action'
  | 'resource_list';
export type ConfirmationMode = 'none' | 'modal';
export type CardStatus =
  | 'proposed'
  | 'confirming'
  | 'editing'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
export type ResourceActionCardType =
  | 'workflow'
  | 'datasource'
  | 'table'
  | 'schedule'
  | 'knowledge_folder'
  | 'knowledge_file'
  | 'template';
export type ResourceActionKey = 'view' | 'edit' | 'execute' | 'delete' | 'enable' | 'disable';

export interface ResourceActionSpec {
  key: ResourceActionKey;
  riskLevel?: RiskLevel;
  confirmationMode?: ConfirmationMode;
}

export interface ResourceSectionSpec {
  resourceType: ResourceActionCardType;
  titleKey: string;
  emptyKey: string;
  allowedActions: ResourceActionSpec[];
  defaultQuery?: string;
}

export interface UiActionCardPayload {
  id: string;
  cardId: string;
  domain: ActionDomain;
  action: string;
  title: string;
  summary: string;
  params: Record<string, unknown>;
  riskLevel: RiskLevel;
  confirmRequired: boolean;
  executionMode: ExecutionMode;
  presentationMode?: PresentationMode;
  confirmationMode?: ConfirmationMode;
  titleKey?: string;
  summaryKey?: string;
  targetNav?: 'data' | 'workflow' | 'schedule';
  targetDataTab?: 'data' | 'knowledge';
  resourceType?: ResourceActionCardType;
  resourceSections?: ResourceSectionSpec[];
  defaultQuery?: string;
  allowedActions?: ResourceActionSpec[];
  copilotPrompt?: string;
}

export interface ChatActionCard {
  id: string;
  payload: UiActionCardPayload;
  status: CardStatus;
  resultSummary?: string;
  error?: string;
  executedAt?: number;
}
