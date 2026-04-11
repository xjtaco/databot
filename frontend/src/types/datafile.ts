export type FieldDataType = 'string' | 'number' | 'boolean' | 'datetime';

export type TableSourceType =
  | 'csv'
  | 'excel'
  | 'sqlite'
  | 'mysql'
  | 'postgresql'
  | 'sqlserver'
  | 'mariadb'
  | 'oracle'
  | 'db2'
  | 'saphana'
  | 'kingbase'
  | 'clickhouse'
  | 'spark'
  | 'hive2'
  | 'starrocks'
  | 'trino'
  | 'prestodb'
  | 'tidb'
  | 'dameng';

/**
 * Remote database types that connect via the JDBC Bridge.
 */
export type DatabaseType =
  | 'mysql'
  | 'sqlserver'
  | 'mariadb'
  | 'oracle'
  | 'db2'
  | 'saphana'
  | 'kingbase'
  | 'clickhouse'
  | 'spark'
  | 'hive2'
  | 'starrocks'
  | 'trino'
  | 'prestodb'
  | 'tidb'
  | 'dameng'
  | 'postgresql';

/**
 * Database datasource types that support delete/update via their own API.
 * These are database-backed datasources (not file-based like CSV/Excel).
 */
export type DatabaseDatasourceType = 'sqlite' | DatabaseType;

export interface TableMetadata {
  id: string;
  displayName: string;
  physicalName: string;
  description?: string;
  type: TableSourceType;
  datasourceId?: string;
  dictionaryPath?: string;
  dataFilePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnMetadata {
  id: string;
  tableId: string;
  displayName: string;
  physicalName: string;
  description?: string;
  dataType: FieldDataType;
  columnOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TableWithColumns extends TableMetadata {
  columns: ColumnMetadata[];
}

export interface ParsedTableMetadata {
  displayName: string;
  physicalName: string;
  description?: string;
  type: TableSourceType;
  dataFilePath: string;
  columns: ParsedColumnMetadata[];
}

export interface ParsedColumnMetadata {
  displayName: string;
  physicalName: string;
  description?: string;
  dataType: FieldDataType;
  columnOrder: number;
}

export interface ConfirmTableInput {
  displayName: string;
  physicalName: string;
  description?: string;
  type: TableSourceType;
  datasourceId?: string;
  dataFilePath?: string;
  columns: ConfirmColumnInput[];
}

export interface ConfirmColumnInput {
  displayName: string;
  physicalName: string;
  description?: string;
  dataType: FieldDataType;
  columnOrder: number;
}

export interface UpdateTableInput {
  displayName?: string;
  description?: string;
  columns?: UpdateColumnInput[];
}

export interface UpdateColumnInput {
  id: string;
  displayName?: string;
  description?: string;
  dataType?: FieldDataType;
}

export interface DatasourceMetadata {
  id: string;
  name: string;
  type: TableSourceType;
  filePath?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  schema?: string;
  properties?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatasourceWithTables extends DatasourceMetadata {
  tables: TableMetadata[];
}

export interface PreviewData {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}
