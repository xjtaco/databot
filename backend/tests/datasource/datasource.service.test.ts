import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatasourceDuplicateError } from '../../src/errors/types';
import type { DatabaseConnectionConfig } from '../../src/datasource/datasource.types';

// Mock dependencies
vi.mock('../../src/table/table.repository', () => ({
  findDatasourceByConnection: vi.fn(),
  createDatasource: vi.fn(),
  createTable: vi.fn().mockResolvedValue({
    id: 'table-1',
    displayName: 'users',
    physicalName: 'users',
    type: 'mysql',
    datasourceId: 'ds-1',
    columns: [],
  }),
  deleteDatasource: vi.fn(),
  findDatasourceById: vi.fn(),
  findTablesByDatasourceId: vi.fn(),
  getDatasourceRawPassword: vi.fn(),
  updateTableDictionaryPath: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/datasource/bridgeClient', () => ({
  bridgeClient: {
    testConnection: vi.fn().mockResolvedValue({ success: true }),
    registerConnection: vi.fn().mockResolvedValue(undefined),
    getTables: vi.fn().mockResolvedValue([{ name: 'users', schema: null }]),
    getColumns: vi.fn().mockResolvedValue([
      { name: 'id', type: 'int' },
      { name: 'name', type: 'varchar' },
    ]),
    destroyConnection: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/utils/encryption', () => ({
  encryptPassword: vi.fn().mockReturnValue('encrypted'),
  isPasswordMask: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/table/dictionaryGenerator', () => ({
  saveDatabaseDictionaryFile: vi.fn().mockResolvedValue('/path/to/dict'),
  saveDatabaseConfigIni: vi.fn().mockResolvedValue(undefined),
  deleteDatabaseDictionary: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/datasource/typeMapper', () => ({
  mapVendorType: vi.fn().mockReturnValue('string'),
}));

vi.mock('../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { createDatasourceFromConfig } from '../../src/datasource/datasource.service';
import {
  findDatasourceByConnection,
  createDatasource,
  createTable,
  updateTableDictionaryPath,
} from '../../src/table/table.repository';
import { bridgeClient } from '../../src/datasource/bridgeClient';

const mockedFindByConnection = vi.mocked(findDatasourceByConnection);
const mockedCreateDatasource = vi.mocked(createDatasource);
const mockedBridgeClient = vi.mocked(bridgeClient);
const mockedCreateTable = vi.mocked(createTable);
const mockedUpdateDictPath = vi.mocked(updateTableDictionaryPath);

const validConfig: DatabaseConnectionConfig = {
  dbType: 'mysql',
  host: '192.168.0.100',
  port: 3306,
  database: 'mydb',
  user: 'root',
  password: 'pass',
};

describe('createDatasourceFromConfig', () => {
  beforeEach(() => {
    mockedFindByConnection.mockReset();
    mockedCreateDatasource.mockReset();
    mockedBridgeClient.testConnection.mockResolvedValue({ success: true, message: 'OK' });
    mockedBridgeClient.registerConnection.mockResolvedValue(undefined);
    mockedBridgeClient.getTables.mockResolvedValue([
      { name: 'users', schema: null, type: 'TABLE' },
    ]);
    mockedBridgeClient.getColumns.mockResolvedValue([
      {
        name: 'id',
        type: 'int',
        nullable: false,
        ordinal: 0,
        defaultValue: null,
        isPrimaryKey: true,
      },
      {
        name: 'name',
        type: 'varchar',
        nullable: true,
        ordinal: 1,
        defaultValue: null,
        isPrimaryKey: false,
      },
    ]);
    mockedBridgeClient.destroyConnection.mockResolvedValue(undefined);
    mockedCreateTable.mockResolvedValue({
      id: 'table-1',
      displayName: 'users',
      physicalName: 'users',
      type: 'mysql',
      datasourceId: 'ds-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      columns: [],
    });
    mockedUpdateDictPath.mockResolvedValue(undefined);
    mockedFindByConnection.mockResolvedValue(null);
    mockedCreateDatasource.mockResolvedValue({
      id: 'ds-1',
      name: '192.168.0.100:3306/mydb',
      type: 'mysql',
      host: '192.168.0.100',
      port: 3306,
      database: 'mydb',
      user: 'root',
      password: '******',
      schema: undefined,
      filePath: undefined,
      properties: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('should throw DatasourceDuplicateError when datasource already exists', async () => {
    mockedFindByConnection.mockResolvedValue({
      id: 'existing-id',
      name: '192.168.0.100:3306/mydb',
      type: 'mysql',
      host: '192.168.0.100',
      port: 3306,
      database: 'mydb',
      user: 'root',
      password: '******',
      schema: undefined,
      filePath: undefined,
      properties: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(createDatasourceFromConfig(validConfig)).rejects.toThrow(DatasourceDuplicateError);
    await expect(createDatasourceFromConfig(validConfig)).rejects.toThrow(
      'Datasource already exists: 192.168.0.100:3306/mydb'
    );
  });

  it('should check duplicate with correct parameters', async () => {
    mockedFindByConnection.mockResolvedValue(null);

    await createDatasourceFromConfig(validConfig);

    expect(mockedFindByConnection).toHaveBeenCalledWith(
      'mysql',
      '192.168.0.100',
      3306,
      'mydb',
      undefined
    );
  });

  it('should pass schema to duplicate check when provided', async () => {
    mockedFindByConnection.mockResolvedValue(null);
    const configWithSchema = { ...validConfig, schema: 'public' };

    await createDatasourceFromConfig(configWithSchema);

    expect(mockedFindByConnection).toHaveBeenCalledWith(
      'mysql',
      '192.168.0.100',
      3306,
      'mydb',
      'public'
    );
  });

  it('should not call bridgeClient.testConnection when duplicate exists', async () => {
    const { bridgeClient } = await import('../../src/datasource/bridgeClient');

    mockedFindByConnection.mockResolvedValue({
      id: 'existing-id',
      name: '192.168.0.100:3306/mydb',
      type: 'mysql',
      host: '192.168.0.100',
      port: 3306,
      database: 'mydb',
      user: 'root',
      password: '******',
      schema: undefined,
      filePath: undefined,
      properties: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(createDatasourceFromConfig(validConfig)).rejects.toThrow();
    expect(bridgeClient.testConnection).not.toHaveBeenCalled();
  });

  it('should create datasource when no duplicate exists', async () => {
    mockedFindByConnection.mockResolvedValue(null);

    const result = await createDatasourceFromConfig(validConfig);

    expect(result.datasourceId).toBe('ds-1');
    expect(result.databaseName).toBe('192.168.0.100:3306/mydb');
    expect(mockedCreateDatasource).toHaveBeenCalled();
  });
});
