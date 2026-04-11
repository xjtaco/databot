import { http } from '@/utils';
import type { DatabaseType } from '@/types/datafile';

export interface DatabaseConnectionConfig {
  dbType: DatabaseType;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  schema?: string;
  properties?: Record<string, string>;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
}

export interface DatasourceResult {
  datasourceId: string;
  databaseName: string;
  tableIds: string[];
}

export async function testConnection(
  config: DatabaseConnectionConfig
): Promise<TestConnectionResult> {
  return http.post<TestConnectionResult>('/datasource/test-connection', config);
}

export async function createDatasource(
  config: DatabaseConnectionConfig
): Promise<DatasourceResult> {
  return http.post<DatasourceResult>('/datasource', config);
}

export async function updateDatasource(
  id: string,
  config: DatabaseConnectionConfig
): Promise<DatasourceResult> {
  return http.put<DatasourceResult>(`/datasource/${id}`, config);
}

export async function deleteDatasource(id: string): Promise<void> {
  return http.delete(`/datasource/${id}`);
}
