export interface AuditLogEntry {
  id: string;
  userId: string | null;
  username: string;
  action: string;
  category: string;
  params: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogListResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogFilters {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  userId?: string;
  category?: string;
  action?: string;
  keyword?: string;
}

export interface AuditActionItem {
  action: string;
  category: string;
}

export interface AuditActionsResponse {
  actions: AuditActionItem[];
}
