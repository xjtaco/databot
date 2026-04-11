import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatasourceFactory } from '../../../src/infrastructure/datasources/datasourceFactory';

// Mock the datasource modules
vi.mock('../../../src/infrastructure/datasources/bridgeDatasource', () => {
  const MockBridgeDatasource = class {
    type: string;
    isConnected = false;
    connect = vi.fn();
    disconnect = vi.fn();
    constructor(config: { type: string }) {
      this.type = config.type;
    }
  };
  return {
    BridgeDatasource: MockBridgeDatasource,
  };
});

vi.mock('../../../src/infrastructure/datasources/sqliteDatasource', () => {
  const MockSqliteDatasource = class {
    type = 'sqlite';
    isConnected = false;
    connect = vi.fn();
    disconnect = vi.fn();
  };
  return {
    SqliteDatasource: MockSqliteDatasource,
  };
});

describe('DatasourceFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    DatasourceFactory.clearCache();
  });

  describe('createDatasource', () => {
    it('should create MySQL datasource via Bridge', () => {
      const config = {
        type: 'mysql' as const,
        database: 'testdb',
      };

      const result = DatasourceFactory.createDatasource(config);

      expect(result.type).toBe('mysql');
    });

    it('should create PostgreSQL datasource via Bridge', () => {
      const config = {
        type: 'postgresql' as const,
        database: 'testdb',
      };

      const result = DatasourceFactory.createDatasource(config);

      expect(result.type).toBe('postgresql');
    });

    it('should create SQLite datasource', () => {
      const config = {
        type: 'sqlite' as const,
        database: 'testdb',
        filename: './test.db',
      };

      const result = DatasourceFactory.createDatasource(config);

      expect(result.type).toBe('sqlite');
    });

    it('should create Oracle datasource via Bridge', () => {
      const config = {
        type: 'oracle' as const,
        database: 'testdb',
      };

      const result = DatasourceFactory.createDatasource(config);

      expect(result.type).toBe('oracle');
    });
  });

  describe('getOrCreateDatasource', () => {
    it('should create new datasource on first call', () => {
      const config = {
        type: 'mysql' as const,
        database: 'testdb',
      };

      const result = DatasourceFactory.getOrCreateDatasource(config);

      expect(result.type).toBe('mysql');
      expect(DatasourceFactory.hasCachedDatasource(config)).toBe(true);
    });

    it('should return cached datasource on subsequent calls', () => {
      const config = {
        type: 'mysql' as const,
        database: 'testdb',
      };

      const result1 = DatasourceFactory.getOrCreateDatasource(config);
      const result2 = DatasourceFactory.getOrCreateDatasource(config);

      expect(result1).toBe(result2);
    });

    it('should create separate datasources for different configurations', () => {
      const mysqlConfig = {
        type: 'mysql' as const,
        database: 'testdb',
      };

      const postgresConfig = {
        type: 'postgresql' as const,
        database: 'testdb',
      };

      const mysqlResult = DatasourceFactory.getOrCreateDatasource(mysqlConfig);
      const postgresResult = DatasourceFactory.getOrCreateDatasource(postgresConfig);

      expect(mysqlResult.type).toBe('mysql');
      expect(postgresResult.type).toBe('postgresql');
      expect(DatasourceFactory.hasCachedDatasource(mysqlConfig)).toBe(true);
      expect(DatasourceFactory.hasCachedDatasource(postgresConfig)).toBe(true);
    });
  });

  describe('getDatasource', () => {
    it('should return cached datasource', () => {
      const config = {
        type: 'mysql' as const,
        database: 'testdb',
      };

      DatasourceFactory.getOrCreateDatasource(config);
      const result = DatasourceFactory.getDatasource(config);

      expect(result).toBeDefined();
      expect(result!.type).toBe('mysql');
    });

    it('should return undefined for non-existent datasource', () => {
      const config = {
        type: 'mysql' as const,
        database: 'nonexistent',
      };

      const result = DatasourceFactory.getDatasource(config);

      expect(result).toBeUndefined();
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all cached datasources', async () => {
      const mysqlConfig = {
        type: 'mysql' as const,
        database: 'testdb',
      };

      const postgresConfig = {
        type: 'postgresql' as const,
        database: 'testdb',
      };

      const mysqlDatasource = DatasourceFactory.getOrCreateDatasource(mysqlConfig);
      const postgresDatasource = DatasourceFactory.getOrCreateDatasource(postgresConfig);

      await DatasourceFactory.disconnectAll();

      expect(
        (mysqlDatasource as unknown as { disconnect: ReturnType<typeof vi.fn> }).disconnect
      ).toHaveBeenCalled();
      expect(
        (postgresDatasource as unknown as { disconnect: ReturnType<typeof vi.fn> }).disconnect
      ).toHaveBeenCalled();
      expect(DatasourceFactory.hasCachedDatasource(mysqlConfig)).toBe(false);
      expect(DatasourceFactory.hasCachedDatasource(postgresConfig)).toBe(false);
    });

    it('should handle empty cache gracefully', async () => {
      await expect(DatasourceFactory.disconnectAll()).resolves.not.toThrow();
    });
  });

  describe('hasCachedDatasource', () => {
    it('should return true for cached datasource', () => {
      const config = {
        type: 'mysql' as const,
        database: 'testdb',
      };

      DatasourceFactory.getOrCreateDatasource(config);

      expect(DatasourceFactory.hasCachedDatasource(config)).toBe(true);
    });

    it('should return false for non-cached datasource', () => {
      const config = {
        type: 'mysql' as const,
        database: 'nonexistent',
      };

      expect(DatasourceFactory.hasCachedDatasource(config)).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached datasources without disconnecting', () => {
      const config = {
        type: 'mysql' as const,
        database: 'testdb',
      };

      DatasourceFactory.getOrCreateDatasource(config);
      expect(DatasourceFactory.hasCachedDatasource(config)).toBe(true);

      DatasourceFactory.clearCache();

      expect(DatasourceFactory.hasCachedDatasource(config)).toBe(false);
    });
  });
});
