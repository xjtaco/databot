import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SqliteParseError } from '../../../src/errors/types';
import { FieldDataTypeValues } from '../../../src/table/table.types';

// Use vi.hoisted() to create mock variables that can be modified in tests
const mockDb = vi.hoisted(() => ({
  prepare: vi.fn(),
  close: vi.fn(),
}));

// Create a mock class constructor for better-sqlite3
const MockDatabase = vi.hoisted(() => {
  const Database = vi.fn(function (this: typeof mockDb) {
    Object.assign(this, mockDb);
    return this;
  }) as unknown as {
    new (_filename: string, _options?: { readonly?: boolean }): typeof mockDb;
    mockImplementation: (fn: () => typeof mockDb) => void;
    mockReturnValue: (value: typeof mockDb) => void;
  };
  return Database;
});

// Mock better-sqlite3 module with hoisted mock
vi.mock('better-sqlite3', () => ({
  default: MockDatabase,
}));

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocking
import { parseSqliteFile, validateSqliteFile } from '../../../src/sqlite/sqliteParser';

describe('sqliteParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock database methods
    mockDb.prepare = vi.fn();
    mockDb.close = vi.fn();

    // Reset Database constructor to return mockDb
    MockDatabase.mockImplementation(function (this: typeof mockDb) {
      Object.assign(this, mockDb);
      return this;
    });
  });

  describe('mapSqliteTypeToFieldType', () => {
    // These tests are indirect - we test the type mapping through parseSqliteFile

    it('should map INTEGER types to number', () => {
      const mockTablesStmt = { all: vi.fn().mockReturnValue([{ name: 'test_table' }]) };
      const mockColumnsStmt = {
        all: vi.fn().mockReturnValue([
          { cid: 0, name: 'int_col', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 1, name: 'tinyint_col', type: 'TINYINT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 2, name: 'bigint_col', type: 'BIGINT', notnull: 0, dflt_value: null, pk: 0 },
        ]),
      };
      mockDb.prepare.mockReturnValueOnce(mockTablesStmt).mockReturnValueOnce(mockColumnsStmt);

      const result = parseSqliteFile('/test/db.sqlite');

      expect(result[0].columns[0].dataType).toBe(FieldDataTypeValues.NUMBER);
      expect(result[0].columns[1].dataType).toBe(FieldDataTypeValues.NUMBER);
      expect(result[0].columns[2].dataType).toBe(FieldDataTypeValues.NUMBER);
    });

    it('should map REAL/FLOAT types to number', () => {
      const mockTablesStmt = { all: vi.fn().mockReturnValue([{ name: 'test_table' }]) };
      const mockColumnsStmt = {
        all: vi.fn().mockReturnValue([
          { cid: 0, name: 'real_col', type: 'REAL', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 1, name: 'float_col', type: 'FLOAT', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 2, name: 'double_col', type: 'DOUBLE', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 3, name: 'numeric_col', type: 'NUMERIC', notnull: 0, dflt_value: null, pk: 0 },
          {
            cid: 4,
            name: 'decimal_col',
            type: 'DECIMAL(10,2)',
            notnull: 0,
            dflt_value: null,
            pk: 0,
          },
        ]),
      };
      mockDb.prepare.mockReturnValueOnce(mockTablesStmt).mockReturnValueOnce(mockColumnsStmt);

      const result = parseSqliteFile('/test/db.sqlite');

      expect(result[0].columns[0].dataType).toBe(FieldDataTypeValues.NUMBER);
      expect(result[0].columns[1].dataType).toBe(FieldDataTypeValues.NUMBER);
      expect(result[0].columns[2].dataType).toBe(FieldDataTypeValues.NUMBER);
      expect(result[0].columns[3].dataType).toBe(FieldDataTypeValues.NUMBER);
      expect(result[0].columns[4].dataType).toBe(FieldDataTypeValues.NUMBER);
    });

    it('should map BOOLEAN types to boolean', () => {
      const mockTablesStmt = { all: vi.fn().mockReturnValue([{ name: 'test_table' }]) };
      const mockColumnsStmt = {
        all: vi.fn().mockReturnValue([
          { cid: 0, name: 'bool_col', type: 'BOOL', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 1, name: 'boolean_col', type: 'BOOLEAN', notnull: 0, dflt_value: null, pk: 0 },
        ]),
      };
      mockDb.prepare.mockReturnValueOnce(mockTablesStmt).mockReturnValueOnce(mockColumnsStmt);

      const result = parseSqliteFile('/test/db.sqlite');

      expect(result[0].columns[0].dataType).toBe(FieldDataTypeValues.BOOLEAN);
      expect(result[0].columns[1].dataType).toBe(FieldDataTypeValues.BOOLEAN);
    });

    it('should map DATE/TIME types to datetime', () => {
      const mockTablesStmt = { all: vi.fn().mockReturnValue([{ name: 'test_table' }]) };
      const mockColumnsStmt = {
        all: vi.fn().mockReturnValue([
          { cid: 0, name: 'date_col', type: 'DATE', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 1, name: 'time_col', type: 'TIME', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 2, name: 'datetime_col', type: 'DATETIME', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 3, name: 'timestamp_col', type: 'TIMESTAMP', notnull: 0, dflt_value: null, pk: 0 },
        ]),
      };
      mockDb.prepare.mockReturnValueOnce(mockTablesStmt).mockReturnValueOnce(mockColumnsStmt);

      const result = parseSqliteFile('/test/db.sqlite');

      expect(result[0].columns[0].dataType).toBe(FieldDataTypeValues.DATETIME);
      expect(result[0].columns[1].dataType).toBe(FieldDataTypeValues.DATETIME);
      expect(result[0].columns[2].dataType).toBe(FieldDataTypeValues.DATETIME);
      expect(result[0].columns[3].dataType).toBe(FieldDataTypeValues.DATETIME);
    });

    it('should default to string for TEXT/VARCHAR/unknown types', () => {
      const mockTablesStmt = { all: vi.fn().mockReturnValue([{ name: 'test_table' }]) };
      const mockColumnsStmt = {
        all: vi.fn().mockReturnValue([
          { cid: 0, name: 'text_col', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          {
            cid: 1,
            name: 'varchar_col',
            type: 'VARCHAR(255)',
            notnull: 0,
            dflt_value: null,
            pk: 0,
          },
          { cid: 2, name: 'unknown_col', type: 'CUSTOM_TYPE', notnull: 0, dflt_value: null, pk: 0 },
          { cid: 3, name: 'blob_col', type: 'BLOB', notnull: 0, dflt_value: null, pk: 0 },
        ]),
      };
      mockDb.prepare.mockReturnValueOnce(mockTablesStmt).mockReturnValueOnce(mockColumnsStmt);

      const result = parseSqliteFile('/test/db.sqlite');

      expect(result[0].columns[0].dataType).toBe(FieldDataTypeValues.STRING);
      expect(result[0].columns[1].dataType).toBe(FieldDataTypeValues.STRING);
      expect(result[0].columns[2].dataType).toBe(FieldDataTypeValues.STRING);
      expect(result[0].columns[3].dataType).toBe(FieldDataTypeValues.STRING);
    });
  });

  describe('sanitizePhysicalName', () => {
    // These tests are indirect - we test sanitization through parseSqliteFile

    it('should keep alphanumeric and underscores', () => {
      const mockTablesStmt = { all: vi.fn().mockReturnValue([{ name: 'valid_table_123' }]) };
      const mockColumnsStmt = {
        all: vi
          .fn()
          .mockReturnValue([
            { cid: 0, name: 'valid_column_abc', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          ]),
      };
      mockDb.prepare.mockReturnValueOnce(mockTablesStmt).mockReturnValueOnce(mockColumnsStmt);

      const result = parseSqliteFile('/test/db.sqlite');

      expect(result[0].physicalName).toBe('valid_table_123');
      expect(result[0].columns[0].physicalName).toBe('valid_column_abc');
    });

    it('should keep Chinese characters', () => {
      const mockTablesStmt = { all: vi.fn().mockReturnValue([{ name: '用户表' }]) };
      const mockColumnsStmt = {
        all: vi
          .fn()
          .mockReturnValue([
            { cid: 0, name: '用户名', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          ]),
      };
      mockDb.prepare.mockReturnValueOnce(mockTablesStmt).mockReturnValueOnce(mockColumnsStmt);

      const result = parseSqliteFile('/test/db.sqlite');

      expect(result[0].physicalName).toBe('用户表');
      expect(result[0].columns[0].physicalName).toBe('用户名');
    });

    it('should replace special characters with underscore', () => {
      // Note: Table names with special chars like - @ # are rejected by getTableInfo validation
      // But column names and valid table names with spaces are sanitized
      // Test with valid table name but column with spaces
      const mockTablesStmt = { all: vi.fn().mockReturnValue([{ name: 'valid_table' }]) };
      const mockColumnsStmt = {
        all: vi
          .fn()
          .mockReturnValue([
            { cid: 0, name: 'column name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          ]),
      };
      mockDb.prepare.mockReturnValueOnce(mockTablesStmt).mockReturnValueOnce(mockColumnsStmt);

      const result = parseSqliteFile('/test/db.sqlite');

      // Column name with space gets sanitized
      expect(result[0].columns[0].physicalName).toBe('column_name');
    });

    it('should remove leading/trailing underscores', () => {
      const mockTablesStmt = { all: vi.fn().mockReturnValue([{ name: '_table_name_' }]) };
      const mockColumnsStmt = {
        all: vi
          .fn()
          .mockReturnValue([
            { cid: 0, name: '__column__', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
          ]),
      };
      mockDb.prepare.mockReturnValueOnce(mockTablesStmt).mockReturnValueOnce(mockColumnsStmt);

      const result = parseSqliteFile('/test/db.sqlite');

      expect(result[0].physicalName).toBe('table_name');
      expect(result[0].columns[0].physicalName).toBe('column');
    });
  });

  describe('parseSqliteFile', () => {
    it('should parse valid SQLite file with tables', () => {
      const mockTablesStmt = {
        all: vi.fn().mockReturnValue([{ name: 'users' }, { name: 'orders' }]),
      };
      const mockUsersColumnsStmt = {
        all: vi.fn().mockReturnValue([
          { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
          { cid: 1, name: 'name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
        ]),
      };
      const mockOrdersColumnsStmt = {
        all: vi.fn().mockReturnValue([
          { cid: 0, name: 'order_id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
          { cid: 1, name: 'amount', type: 'REAL', notnull: 0, dflt_value: null, pk: 0 },
        ]),
      };
      mockDb.prepare
        .mockReturnValueOnce(mockTablesStmt)
        .mockReturnValueOnce(mockUsersColumnsStmt)
        .mockReturnValueOnce(mockOrdersColumnsStmt);

      const result = parseSqliteFile('/test/db.sqlite');

      expect(result).toHaveLength(2);
      expect(result[0].displayName).toBe('users');
      expect(result[0].columns).toHaveLength(2);
      expect(result[1].displayName).toBe('orders');
      expect(result[1].columns).toHaveLength(2);
      expect(mockDb.close).toHaveBeenCalled();
    });

    it('should throw SqliteParseError for empty database', () => {
      const mockTablesStmt = { all: vi.fn().mockReturnValue([]) };
      mockDb.prepare.mockReturnValueOnce(mockTablesStmt);

      expect(() => parseSqliteFile('/test/empty.sqlite')).toThrow(SqliteParseError);
      expect(mockDb.close).toHaveBeenCalled();
    });

    it('should skip tables with no columns', () => {
      const mockTablesStmt = {
        all: vi.fn().mockReturnValue([{ name: 'empty_table' }, { name: 'valid_table' }]),
      };
      const mockEmptyColumnsStmt = { all: vi.fn().mockReturnValue([]) };
      const mockValidColumnsStmt = {
        all: vi
          .fn()
          .mockReturnValue([
            { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
          ]),
      };
      mockDb.prepare
        .mockReturnValueOnce(mockTablesStmt)
        .mockReturnValueOnce(mockEmptyColumnsStmt)
        .mockReturnValueOnce(mockValidColumnsStmt);

      const result = parseSqliteFile('/test/db.sqlite');

      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('valid_table');
    });

    it('should exclude sqlite_ system tables (via SQL query)', () => {
      // The exclusion is done in the SQL query, so we just verify the query is correct
      // by checking that tables returned are used directly
      const mockTablesStmt = { all: vi.fn().mockReturnValue([{ name: 'users' }]) };
      const mockColumnsStmt = {
        all: vi
          .fn()
          .mockReturnValue([
            { cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
          ]),
      };
      mockDb.prepare.mockReturnValueOnce(mockTablesStmt).mockReturnValueOnce(mockColumnsStmt);

      const result = parseSqliteFile('/test/db.sqlite');

      // Verify the SQL query excludes sqlite_ tables
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining("name NOT LIKE 'sqlite_%'")
      );
      expect(result).toHaveLength(1);
    });

    it('should throw SqliteParseError for invalid file', () => {
      MockDatabase.mockImplementation(function () {
        throw new Error('SQLITE_NOTADB: file is not a database');
      });

      expect(() => parseSqliteFile('/test/invalid.txt')).toThrow(SqliteParseError);
      expect(() => parseSqliteFile('/test/invalid.txt')).toThrow('Failed to parse SQLite database');
    });

    it('should close database connection on error', () => {
      const mockTablesStmt = {
        all: vi.fn().mockImplementation(() => {
          throw new Error('Query failed');
        }),
      };
      mockDb.prepare.mockReturnValueOnce(mockTablesStmt);

      expect(() => parseSqliteFile('/test/db.sqlite')).toThrow(SqliteParseError);
      expect(mockDb.close).toHaveBeenCalled();
    });
  });

  describe('validateSqliteFile', () => {
    it('should return true for valid SQLite file', () => {
      const mockStmt = { get: vi.fn().mockReturnValue({ 1: 1 }) };
      mockDb.prepare.mockReturnValue(mockStmt);

      const result = validateSqliteFile('/test/valid.sqlite');

      expect(result).toBe(true);
      expect(mockDb.close).toHaveBeenCalled();
    });

    it('should return false for invalid file', () => {
      MockDatabase.mockImplementation(function () {
        throw new Error('SQLITE_NOTADB: file is not a database');
      });

      const result = validateSqliteFile('/test/invalid.txt');

      expect(result).toBe(false);
    });

    it('should return false for non-existent file', () => {
      MockDatabase.mockImplementation(function () {
        throw new Error('SQLITE_CANTOPEN: unable to open database file');
      });

      const result = validateSqliteFile('/test/nonexistent.sqlite');

      expect(result).toBe(false);
    });
  });
});
