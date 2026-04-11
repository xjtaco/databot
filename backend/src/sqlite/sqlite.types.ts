import { FieldDataType, TableSourceType, ParsedColumnMetadata } from '../table/table.types';

export interface SqliteTableInfo {
  name: string;
  columns: SqliteColumnInfo[];
}

export interface SqliteColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export interface ParsedSqliteTableMetadata {
  displayName: string;
  physicalName: string;
  description?: string;
  type: TableSourceType;
  columns: ParsedColumnMetadata[];
}

export interface SqliteUploadResult {
  datasourceId: string;
  databaseName: string;
  tableIds: string[];
}

export interface SqliteTypeMapping {
  sqliteType: string;
  fieldDataType: FieldDataType;
}
