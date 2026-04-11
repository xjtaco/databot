/**
 * Type definitions for the datasource management module
 */

/**
 * Normalized column types that abstract vendor-specific differences
 */
export const ColumnType = {
  STRING: 'string',
  INTEGER: 'integer',
  FLOAT: 'float',
  BOOLEAN: 'boolean',
  DATE: 'date',
  DATETIME: 'datetime',
  TEXT: 'text',
  JSON: 'json',
  UNKNOWN: 'unknown',
} as const;

/**
 * Represents a column in a database table
 */
export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  description?: string;
  defaultValue?: string;
}

/**
 * Datasource type configuration
 */
export type DatasourceType =
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
  | 'postgresql'
  | 'sqlite';

/**
 * Configuration for connecting to a datasource
 */
export interface DatasourceConfig {
  type: DatasourceType;
  host?: string;
  port?: number;
  database: string;
  user?: string;
  password?: string;
  filepath?: string; // For SQLite
  schema?: string; // Schema name (for databases that support schemas)
  properties?: Record<string, string>; // Additional JDBC connection properties
  connectionTimeout?: number;
  poolSize?: number; // Connection pool size for MySQL/PostgreSQL
  queryTimeout?: number; // Query timeout in milliseconds
}

/**
 * Represents the result of a query execution
 */
export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: Array<{ name: string; type: string }>;
}
