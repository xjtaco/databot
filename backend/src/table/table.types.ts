export const FieldDataTypeValues = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  DATETIME: 'datetime',
} as const;

export type FieldDataType = (typeof FieldDataTypeValues)[keyof typeof FieldDataTypeValues];

export const TableSourceTypeValues = {
  CSV: 'csv',
  EXCEL: 'excel',
  SQLITE: 'sqlite',
  MYSQL: 'mysql',
  POSTGRESQL: 'postgresql',
  SQLSERVER: 'sqlserver',
  MARIADB: 'mariadb',
  ORACLE: 'oracle',
  DB2: 'db2',
  SAPHANA: 'saphana',
  KINGBASE: 'kingbase',
  CLICKHOUSE: 'clickhouse',
  SPARK: 'spark',
  HIVE2: 'hive2',
  STARROCKS: 'starrocks',
  TRINO: 'trino',
  PRESTODB: 'prestodb',
  TIDB: 'tidb',
  DAMENG: 'dameng',
} as const;

export type TableSourceType = (typeof TableSourceTypeValues)[keyof typeof TableSourceTypeValues];

export interface TableMetadata {
  id: string;
  displayName: string;
  physicalName: string;
  description?: string;
  type: TableSourceType;
  datasourceId?: string;
  dictionaryPath?: string;
  dataFilePath?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ColumnMetadata {
  id: string;
  tableId: string;
  displayName: string;
  physicalName: string;
  description?: string;
  dataType: FieldDataType;
  columnOrder: number;
  createdAt: Date;
  updatedAt: Date;
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
  password?: string;
  schema?: string | null;
  properties?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDatasourceInput {
  name: string;
  type: TableSourceType;
  filePath?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  schema?: string | null;
  properties?: string | null;
  createdBy?: string;
}

export interface DatasourceWithTables extends DatasourceMetadata {
  tables: TableMetadata[];
}

export interface PreviewData {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}
