import Database from 'better-sqlite3';
import { SqliteParseError } from '../errors/types';
import { FieldDataType, FieldDataTypeValues, TableSourceTypeValues } from '../table/table.types';
import { SqliteTableInfo, SqliteColumnInfo, ParsedSqliteTableMetadata } from './sqlite.types';
import logger from '../utils/logger';

function mapSqliteTypeToFieldType(sqliteType: string): FieldDataType {
  const normalizedType = sqliteType.toUpperCase().trim();

  // Integer types
  if (
    normalizedType.includes('INT') ||
    normalizedType.includes('TINYINT') ||
    normalizedType.includes('SMALLINT') ||
    normalizedType.includes('MEDIUMINT') ||
    normalizedType.includes('BIGINT')
  ) {
    return FieldDataTypeValues.NUMBER;
  }

  // Real/Float types
  if (
    normalizedType.includes('REAL') ||
    normalizedType.includes('DOUBLE') ||
    normalizedType.includes('FLOAT') ||
    normalizedType.includes('NUMERIC') ||
    normalizedType.includes('DECIMAL')
  ) {
    return FieldDataTypeValues.NUMBER;
  }

  // Boolean types
  if (normalizedType.includes('BOOL') || normalizedType.includes('BOOLEAN')) {
    return FieldDataTypeValues.BOOLEAN;
  }

  // Date/Time types
  if (
    normalizedType.includes('DATE') ||
    normalizedType.includes('TIME') ||
    normalizedType.includes('DATETIME') ||
    normalizedType.includes('TIMESTAMP')
  ) {
    return FieldDataTypeValues.DATETIME;
  }

  // Default to string for TEXT, VARCHAR, CHAR, BLOB, and unknown types
  return FieldDataTypeValues.STRING;
}

function sanitizePhysicalName(name: string): string {
  // Keep alphanumeric, underscores, and Chinese characters
  return name
    .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function parseSqliteFile(filePath: string): ParsedSqliteTableMetadata[] {
  let db: Database.Database | null = null;

  try {
    // Open database in readonly mode
    db = new Database(filePath, { readonly: true });

    // Get list of tables (exclude system tables)
    const tablesQuery = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    const tables = tablesQuery.all() as { name: string }[];

    if (tables.length === 0) {
      throw new SqliteParseError('No tables found in SQLite database');
    }

    const parsedTables: ParsedSqliteTableMetadata[] = [];

    for (const table of tables) {
      const tableInfo = getTableInfo(db, table.name);

      if (tableInfo.columns.length === 0) {
        logger.warn('Skipping table with no columns', { tableName: table.name });
        continue;
      }

      const parsedTable: ParsedSqliteTableMetadata = {
        displayName: table.name,
        physicalName: sanitizePhysicalName(table.name),
        type: TableSourceTypeValues.SQLITE,
        columns: tableInfo.columns.map((col, index) => ({
          displayName: col.name,
          physicalName: sanitizePhysicalName(col.name),
          dataType: mapSqliteTypeToFieldType(col.type),
          columnOrder: index,
        })),
      };

      parsedTables.push(parsedTable);
    }

    logger.info('SQLite file parsed', {
      filePath,
      tableCount: parsedTables.length,
      tables: parsedTables.map((t) => t.displayName),
    });

    return parsedTables;
  } catch (error) {
    if (error instanceof SqliteParseError) {
      throw error;
    }
    throw new SqliteParseError(
      'Failed to parse SQLite database',
      { filePath },
      error instanceof Error ? error : undefined
    );
  } finally {
    if (db) {
      db.close();
    }
  }
}

function getTableInfo(db: Database.Database, tableName: string): SqliteTableInfo {
  try {
    // Use parameterized query where possible, but table_info requires direct name
    // We validate tableName to prevent SQL injection
    if (!/^[\w\u4e00-\u9fa5]+$/.test(tableName)) {
      throw new SqliteParseError(`Invalid table name: ${tableName}`);
    }

    const columnsQuery = db.prepare(`PRAGMA table_info("${tableName}")`);
    const columns = columnsQuery.all() as SqliteColumnInfo[];

    return {
      name: tableName,
      columns,
    };
  } catch (error) {
    if (error instanceof SqliteParseError) {
      throw error;
    }
    throw new SqliteParseError(
      `Failed to get table info for ${tableName}`,
      { tableName },
      error instanceof Error ? error : undefined
    );
  }
}

export function validateSqliteFile(filePath: string): boolean {
  let db: Database.Database | null = null;

  try {
    db = new Database(filePath, { readonly: true });
    // Try to execute a simple query to validate the file
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  } finally {
    if (db) {
      db.close();
    }
  }
}
