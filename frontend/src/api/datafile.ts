import { http } from '@/utils';
import type {
  TableMetadata,
  TableWithColumns,
  UpdateTableInput,
  DatasourceWithTables,
  PreviewData,
} from '@/types/datafile';

export async function uploadFile(file: File): Promise<{ tableIds: string[] }> {
  return http.upload<{ tableIds: string[] }>('/datafile/upload', file);
}

export async function listTables(): Promise<{ tables: TableMetadata[] }> {
  return http.get<{ tables: TableMetadata[] }>('/tables');
}

export async function listDatasources(): Promise<{ datasources: DatasourceWithTables[] }> {
  return http.get<{ datasources: DatasourceWithTables[] }>('/tables/datasources');
}

export async function getTable(id: string): Promise<{ table: TableWithColumns }> {
  return http.get<{ table: TableWithColumns }>(`/tables/${id}`);
}

export async function getDictionaryContent(id: string): Promise<{ content: string }> {
  return http.get<{ content: string }>(`/tables/${id}/dictionary`);
}

export async function updateTable(
  id: string,
  input: UpdateTableInput
): Promise<{ table: TableWithColumns }> {
  return http.put<{ table: TableWithColumns }>(`/tables/${id}`, input);
}

export async function deleteTable(id: string): Promise<void> {
  return http.delete(`/tables/${id}`);
}

export interface SqliteUploadResult {
  datasourceId: string;
  databaseName: string;
  tableIds: string[];
}

export async function uploadSqliteFile(file: File): Promise<SqliteUploadResult> {
  return http.upload<SqliteUploadResult>('/sqlite/upload', file);
}

export async function deleteDatasource(id: string): Promise<void> {
  return http.delete(`/sqlite/datasource/${id}`);
}

export async function getTablePreview(id: string, limit?: number): Promise<PreviewData> {
  const params = limit !== undefined ? `?limit=${limit}` : '';
  return http.get<PreviewData>(`/tables/${id}/preview${params}`);
}
