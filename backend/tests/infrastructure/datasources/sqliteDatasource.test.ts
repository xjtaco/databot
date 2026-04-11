import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SqliteDatasource } from '../../../src/infrastructure/datasources/sqliteDatasource';
import {
  DatasourceConnectionError,
  DatasourceQueryError,
  DatasourceSchemaError,
} from '../../../src/errors/types';
import { ColumnType } from '../../../src/infrastructure/datasources/types';

// Use vi.hoisted() to create mock variables that can be modified in tests
const mockDb = vi.hoisted(() => ({
  run: vi.fn(),
  all: vi.fn(),
  close: vi.fn(),
}));

const mockOpen = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn());

// Mock sqlite module
vi.mock('sqlite', () => ({
  open: mockOpen,
}));

// Mock sqlite3 module
vi.mock('sqlite3', () => ({
  default: { Database: vi.fn() },
}));

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    mkdir: mockMkdir,
  },
}));

describe('SqliteDatasource', () => {
  let datasource: SqliteDatasource;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock database methods
    mockDb.run = vi.fn().mockResolvedValue({ changes: 0 });
    mockDb.all = vi.fn().mockResolvedValue([]);
    mockDb.close = vi.fn().mockResolvedValue(undefined);

    // Reset open to return mockDb
    mockOpen.mockResolvedValue(mockDb);

    // Mock fs.mkdir
    mockMkdir.mockResolvedValue(undefined);
  });

  describe('connect', () => {
    it('should successfully connect to SQLite', async () => {
      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test.db',
      });

      await datasource.connect();

      expect(datasource.isConnected).toBe(true);
      expect(mockOpen).toHaveBeenCalledWith(expect.objectContaining({ filename: './test.db' }));
      expect(mockDb.run).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
    });

    it('should throw error when filepath is missing', async () => {
      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
      });

      await expect(datasource.connect()).rejects.toThrow('filepath is required');
    });

    it('should throw DatasourceConnectionError on connection failure', async () => {
      mockOpen.mockRejectedValue(new Error('Cannot open database'));

      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test.db',
      });

      await expect(datasource.connect()).rejects.toThrow(DatasourceConnectionError);
    });
  });

  describe('disconnect', () => {
    it('should successfully disconnect from SQLite', async () => {
      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test.db',
      });

      await datasource.connect();
      await datasource.disconnect();

      expect(datasource.isConnected).toBe(false);
      expect(mockDb.close).toHaveBeenCalled();
    });
  });

  describe('executeQuery', () => {
    beforeEach(async () => {
      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test.db',
      });
      await datasource.connect();
    });

    it('should execute SELECT query successfully', async () => {
      mockDb.all.mockResolvedValue([{ id: 1, name: 'test' }]);

      const result = await datasource.executeQuery('SELECT * FROM users');

      expect(result.rows).toEqual([{ id: 1, name: 'test' }]);
      expect(result.rowCount).toBe(1);
      expect(mockDb.all).toHaveBeenCalled();
    });

    it('should throw DatasourceQueryError on query failure', async () => {
      mockDb.all.mockRejectedValue(new Error('Syntax error'));

      await expect(datasource.executeQuery('SELECT * FROM bad_query')).rejects.toThrow(
        DatasourceQueryError
      );
    });

    it('should throw error when not connected', async () => {
      const newDatasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test2.db',
      });

      await expect(newDatasource.executeQuery('SELECT 1')).rejects.toThrow('not connected');
    });
  });

  describe('getTables', () => {
    beforeEach(async () => {
      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test.db',
      });
      await datasource.connect();
    });

    it('should return list of tables', async () => {
      const mockTables = [{ name: 'users' }, { name: 'products' }];
      mockDb.all.mockResolvedValue(mockTables);

      const tables = await datasource.getTables();

      expect(tables).toEqual(['users', 'products']);
    });

    it('should throw DatasourceSchemaError on failure', async () => {
      mockDb.all.mockRejectedValue(new Error('Database error'));

      await expect(datasource.getTables()).rejects.toThrow(DatasourceSchemaError);
    });
  });

  describe('getColumns', () => {
    beforeEach(async () => {
      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test.db',
      });
      await datasource.connect();
    });

    it('should return column information', async () => {
      const mockColumns = [
        {
          cid: 0,
          name: 'id',
          type: 'INTEGER',
          notnull: 1,
          dflt_value: null,
          pk: 1,
        },
        {
          cid: 1,
          name: 'name',
          type: 'TEXT',
          notnull: 0,
          dflt_value: null,
          pk: 0,
        },
      ];
      mockDb.all.mockResolvedValue(mockColumns);

      const columns = await datasource.getColumns('users');

      expect(columns).toHaveLength(2);
      expect(columns[0].name).toBe('id');
      expect(columns[0].type).toBe(ColumnType.INTEGER);
      expect(columns[0].primaryKey).toBe(true);
      expect(columns[0].nullable).toBe(false);
      expect(columns[1].name).toBe('name');
      expect(columns[1].type).toBe(ColumnType.STRING);
      expect(columns[1].primaryKey).toBe(false);
      expect(columns[1].nullable).toBe(true);
    });

    it('should throw DatasourceSchemaError on failure', async () => {
      mockDb.all.mockRejectedValue(new Error('Table not found'));

      await expect(datasource.getColumns('nonexistent')).rejects.toThrow(DatasourceSchemaError);
    });
  });

  describe('mapVendorTypeToCommon', () => {
    beforeEach(async () => {
      datasource = new SqliteDatasource({
        type: 'sqlite',
        database: 'testdb',
        filepath: './test.db',
      });
      await datasource.connect();
    });

    it('should map TEXT to STRING', async () => {
      const mockColumns = [
        { cid: 0, name: 'col', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      ];
      mockDb.all.mockResolvedValue(mockColumns);

      const columns = await datasource.getColumns('test');
      expect(columns[0].type).toBe(ColumnType.STRING);
    });

    it('should map INTEGER to INTEGER', async () => {
      const mockColumns = [
        { cid: 0, name: 'col', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
      ];
      mockDb.all.mockResolvedValue(mockColumns);

      const columns = await datasource.getColumns('test');
      expect(columns[0].type).toBe(ColumnType.INTEGER);
    });

    it('should map REAL to FLOAT', async () => {
      const mockColumns = [
        { cid: 0, name: 'col', type: 'REAL', notnull: 0, dflt_value: null, pk: 0 },
      ];
      mockDb.all.mockResolvedValue(mockColumns);

      const columns = await datasource.getColumns('test');
      expect(columns[0].type).toBe(ColumnType.FLOAT);
    });

    it('should map unknown types to UNKNOWN', async () => {
      const mockColumns = [
        { cid: 0, name: 'col', type: 'CUSTOM_TYPE', notnull: 0, dflt_value: null, pk: 0 },
      ];
      mockDb.all.mockResolvedValue(mockColumns);

      const columns = await datasource.getColumns('test');
      expect(columns[0].type).toBe(ColumnType.UNKNOWN);
    });

    it('should map empty type to UNKNOWN', async () => {
      const mockColumns = [{ cid: 0, name: 'col', type: '', notnull: 0, dflt_value: null, pk: 0 }];
      mockDb.all.mockResolvedValue(mockColumns);

      const columns = await datasource.getColumns('test');
      expect(columns[0].type).toBe(ColumnType.UNKNOWN);
    });
  });
});
