export const DATABASE_TYPES = [
  'mysql',
  'sqlserver',
  'mariadb',
  'oracle',
  'db2',
  'saphana',
  'kingbase',
  'clickhouse',
  'spark',
  'hive2',
  'starrocks',
  'trino',
  'prestodb',
  'tidb',
  'dameng',
  'postgresql',
] as const;

export type DatabaseType = (typeof DATABASE_TYPES)[number];

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

export interface BridgeTestResult {
  success: boolean;
  message: string;
}

export interface BridgeColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  ordinal: number;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

export interface BridgeTableInfo {
  name: string;
  schema: string | null;
  type: string;
}

export interface BridgeQueryResult {
  columns: Array<{ name: string; type: string; nullable: boolean }>;
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
}

export interface BridgeErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

export function isDatabaseType(value: string): value is DatabaseType {
  return DATABASE_TYPES.includes(value as DatabaseType);
}

export const DEFAULT_PORTS: Record<DatabaseType, number> = {
  mysql: 3306,
  sqlserver: 1433,
  mariadb: 3306,
  oracle: 1521,
  db2: 50000,
  saphana: 30015,
  kingbase: 54321,
  clickhouse: 8123,
  spark: 10000,
  hive2: 10000,
  starrocks: 9030,
  trino: 8080,
  prestodb: 8080,
  tidb: 3306,
  dameng: 5236,
  postgresql: 5432,
};
