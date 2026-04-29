export type ActionDomain = 'data' | 'knowledge' | 'schedule' | 'workflow' | 'template';
export type RiskLevel = 'low' | 'medium' | 'high' | 'danger';
export type ExecutionMode = 'frontend';
export type ActionCardPresentationMode =
  | 'inline_form'
  | 'navigate'
  | 'deferred_navigation'
  | 'in_chat'
  | 'action';
export type ActionCardConfirmationMode = 'none' | 'modal';
export type CardStatus =
  | 'proposed'
  | 'confirming'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface UiActionCardParamDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  sensitive?: boolean;
}

export interface UiActionCardDefinition {
  cardId: string;
  domain: ActionDomain;
  action: string;
  title: string;
  description: string;
  presentationMode: ActionCardPresentationMode;
  confirmationMode: ActionCardConfirmationMode;
  titleKey: string;
  summaryKey: string;
  usage: string;
  requiredParams: UiActionCardParamDefinition[];
  optionalParams: UiActionCardParamDefinition[];
  riskLevel: RiskLevel;
  confirmRequired: boolean;
  targetNav?: 'data' | 'workflow' | 'schedule';
  targetDataTab?: 'data' | 'knowledge';
  relatedDomains: ActionDomain[];
  dependencies: string[];
}

export interface UiActionCardPayload {
  id: string;
  cardId: string;
  domain: ActionDomain;
  action: string;
  title: string;
  summary: string;
  presentationMode?: ActionCardPresentationMode;
  confirmationMode?: ActionCardConfirmationMode;
  titleKey?: string;
  summaryKey?: string;
  params: Record<string, unknown>;
  riskLevel: RiskLevel;
  confirmRequired: boolean;
  executionMode: ExecutionMode;
  targetNav?: 'data' | 'workflow' | 'schedule';
  targetDataTab?: 'data' | 'knowledge';
  copilotPrompt?: string;
}

export interface PersistedCardState {
  payload: UiActionCardPayload;
  status: CardStatus;
  resultSummary?: string;
  error?: string;
  executedAt?: string;
}
