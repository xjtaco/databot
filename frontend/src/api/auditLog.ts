import { http, axiosInstance } from '@/utils/http';
import type { AuditLogListResponse, AuditLogFilters, AuditActionsResponse } from '@/types/auditLog';

export async function fetchAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogListResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.category) params.set('category', filters.category);
  if (filters.action) params.set('action', filters.action);
  if (filters.keyword) params.set('keyword', filters.keyword);

  const query = params.toString();
  return http.get<AuditLogListResponse>(`/audit-logs${query ? `?${query}` : ''}`);
}

export async function fetchAuditActions(): Promise<AuditActionsResponse> {
  return http.get<AuditActionsResponse>('/audit-logs/actions');
}

export async function exportAuditLogs(filters: AuditLogFilters = {}): Promise<Blob> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.category) params.set('category', filters.category);
  if (filters.action) params.set('action', filters.action);
  if (filters.keyword) params.set('keyword', filters.keyword);

  const query = params.toString();
  const response = await axiosInstance.get<Blob>(`/audit-logs/export${query ? `?${query}` : ''}`, {
    responseType: 'blob',
  });
  return response.data;
}
