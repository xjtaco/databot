import { describe, it, expect } from 'vitest';
import {
  ColumnType,
  Column,
  DatasourceConfig,
  QueryResult,
  DatasourceType,
} from '../../../src/infrastructure/datasources/types';

describe('Datasource Types', () => {
  describe('ColumnType', () => {
    it('should have all expected column types', () => {
      expect(ColumnType.STRING).toBe('string');
      expect(ColumnType.INTEGER).toBe('integer');
      expect(ColumnType.FLOAT).toBe('float');
      expect(ColumnType.BOOLEAN).toBe('boolean');
      expect(ColumnType.DATE).toBe('date');
      expect(ColumnType.DATETIME).toBe('datetime');
      expect(ColumnType.TEXT).toBe('text');
      expect(ColumnType.JSON).toBe('json');
      expect(ColumnType.UNKNOWN).toBe('unknown');
    });
  });

  describe('Column interface', () => {
    it('should accept valid column object', () => {
      const column: Column = {
        name: 'id',
        type: ColumnType.INTEGER,
        nullable: false,
        primaryKey: true,
        description: 'Primary key',
        defaultValue: '1',
      };

      expect(column.name).toBe('id');
      expect(column.type).toBe(ColumnType.INTEGER);
      expect(column.nullable).toBe(false);
      expect(column.primaryKey).toBe(true);
      expect(column.description).toBe('Primary key');
      expect(column.defaultValue).toBe('1');
    });

    it('should accept column with optional fields', () => {
      const column: Column = {
        name: 'name',
        type: ColumnType.STRING,
        nullable: true,
        primaryKey: false,
      };

      expect(column.name).toBe('name');
      expect(column.description).toBeUndefined();
      expect(column.defaultValue).toBeUndefined();
    });
  });

  describe('DatasourceConfig interface', () => {
    it('should accept MySQL config', () => {
      const config: DatasourceConfig = {
        type: 'mysql' as DatasourceType,
        host: 'localhost',
        port: 3306,
        database: 'testdb',
        user: 'root',
        password: 'password',
      };

      expect(config.type).toBe('mysql');
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(3306);
    });

    it('should accept SQLite config', () => {
      const config: DatasourceConfig = {
        type: 'sqlite' as DatasourceType,
        database: 'testdb',
        filepath: './test.db',
      };

      expect(config.type).toBe('sqlite');
      expect(config.filepath).toBe('./test.db');
    });

    it('should accept config with optional fields', () => {
      const config: DatasourceConfig = {
        type: 'postgres' as DatasourceType,
        database: 'testdb',
        connectionTimeout: 30000,
      };

      expect(config.connectionTimeout).toBe(30000);
      expect(config.host).toBeUndefined();
    });
  });

  describe('QueryResult interface', () => {
    it('should accept valid query result', () => {
      const result: QueryResult = {
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
        fields: [
          { name: 'id', type: 'integer' },
          { name: 'name', type: 'text' },
        ],
      };

      expect(result.rows).toHaveLength(1);
      expect(result.rowCount).toBe(1);
      expect(result.fields).toHaveLength(2);
    });

    it('should accept empty result', () => {
      const result: QueryResult = {
        rows: [],
        rowCount: 0,
        fields: [],
      };

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
    });
  });
});
