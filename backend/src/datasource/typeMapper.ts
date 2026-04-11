import type { FieldDataType } from '../table/table.types';
import type { DatabaseType } from './datasource.types';

const NUMERIC_PATTERN =
  /^(int|integer|bigint|smallint|tinyint|mediumint|serial|bigserial|smallserial|float|double|real|decimal|numeric|number|money|smallmoney)$/i;

const STRING_PATTERN =
  /^(varchar|character varying|character|char|text|nvarchar|nchar|ntext|clob|longtext|mediumtext|tinytext|bpchar|varchar2|string|longvarchar|json|jsonb|xml|uuid|enum|set)$/i;

const BOOLEAN_PATTERN = /^(boolean|bool|bit)$/i;

const DATETIME_PATTERN =
  /^(date|datetime|timestamp|datetime2|datetimeoffset|smalldatetime|timestamp without time zone|timestamp with time zone|time|time without time zone|time with time zone)$/i;

export function mapVendorType(_dbType: DatabaseType, vendorType: string): FieldDataType {
  const normalized = vendorType.trim().toLowerCase();

  if (DATETIME_PATTERN.test(normalized)) return 'datetime';
  if (BOOLEAN_PATTERN.test(normalized)) return 'boolean';
  if (NUMERIC_PATTERN.test(normalized)) return 'number';
  if (STRING_PATTERN.test(normalized)) return 'string';

  // Fallback: treat unknown types as string
  return 'string';
}
