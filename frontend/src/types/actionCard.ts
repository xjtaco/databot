export type ActionDomain = 'data' | 'knowledge' | 'schedule' | 'workflow' | 'template';
export type RiskLevel = 'low' | 'medium' | 'high' | 'danger';
export type ExecutionMode = 'frontend';
export type PresentationMode = 'inline_form' | 'navigate' | 'deferred_navigation';
export type ConfirmationMode = 'none' | 'modal';
export type CardStatus =
  | 'proposed'
  | 'confirming'
  | 'editing'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

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
