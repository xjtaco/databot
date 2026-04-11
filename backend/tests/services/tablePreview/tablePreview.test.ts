import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetadataNotFoundError } from '../../../src/errors/types';
import { TableSourceTypeValues } from '../../../src/table/table.types';

// Hoist all mocks
const mockFindTableById = vi.hoisted(() => vi.fn());
const mockFindDatasourceById = vi.hoisted(() => vi.fn());
const mockGetDatasourceRawPassword = vi.hoisted(() => vi.fn());

vi.mock('../../../src/table/table.repository', () => ({
  findTableById: mockFindTableById,
  findDatasourceById: mockFindDatasourceById,
  getDatasourceRawPassword: mockGetDatasourceRawPassword,
}));

// Mock DatasourceFactory
const mockExecuteQuery = vi.hoisted(() => vi.fn());
const mockConnect = vi.hoisted(() => vi.fn());
const mockGetOrCreateDatasource = vi.hoisted(() => vi.fn());

vi.mock('../../../src/infrastructure/datasources/datasourceFactory', () => ({
  DatasourceFactory: {
    getOrCreateDatasource: mockGetOrCreateDatasource,
  },
}));

// Mock decryptPassword
vi.mock('../../../src/utils/encryption', () => ({
  decryptPassword: vi.fn((v: string) => `decrypted_${v}`),
}));

// Mock config
vi.mock('../../../src/base/config', () => ({
  config: {
    upload: {
      directory: '/uploads',
    },
    encryption: {
      key: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    },
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock fs
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mockExistsSync,
      readFileSync: mockReadFileSync,
    },
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  };
});

import { getTablePreview } from '../../../src/table/table.service';

describe('getTablePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw MetadataNotFoundError when table not found', async () => {
    mockFindTableById.mockResolvedValue(null);

    await expect(getTablePreview('non-existent-id', 10)).rejects.toThrow(MetadataNotFoundError);
    await expect(getTablePreview('non-existent-id', 10)).rejects.toThrow('Table not found');
  });

  it('should throw MetadataNotFoundError when csv table has no dataFilePath', async () => {
    mockFindTableById.mockResolvedValue({
      id: 'table-1',
      type: TableSourceTypeValues.CSV,
      dataFilePath: undefined,
      columns: [],
    });

    await expect(getTablePreview('table-1', 10)).rejects.toThrow(MetadataNotFoundError);
    await expect(getTablePreview('table-1', 10)).rejects.toThrow('Data file not found for table');
  });

  it('should throw MetadataNotFoundError when database table has no datasourceId', async () => {
    mockFindTableById.mockResolvedValue({
      id: 'table-2',
      type: TableSourceTypeValues.POSTGRESQL,
      datasourceId: undefined,
      physicalName: 'test_table',
      columns: [],
    });

    await expect(getTablePreview('table-2', 10)).rejects.toThrow(MetadataNotFoundError);
    await expect(getTablePreview('table-2', 10)).rejects.toThrow('Datasource not found for table');
  });

  it('should preview CSV file data', async () => {
    mockFindTableById.mockResolvedValue({
      id: 'table-csv',
      type: TableSourceTypeValues.CSV,
      dataFilePath: '2024-01-15/data.csv',
      columns: [],
    });

    mockExistsSync.mockReturnValue(true);

    // Create CSV content as a Buffer
    const csvContent = 'name,age,city\nAlice,30,Beijing\nBob,25,Shanghai\nCharlie,35,Shenzhen';
    mockReadFileSync.mockReturnValue(Buffer.from(csvContent));

    const result = await getTablePreview('table-csv', 10);

    expect(result.columns).toEqual(['name', 'age', 'city']);
    expect(result.totalRows).toBe(3);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual({ name: 'Alice', age: 30, city: 'Beijing' });
    expect(result.rows[1]).toEqual({ name: 'Bob', age: 25, city: 'Shanghai' });
    expect(result.rows[2]).toEqual({ name: 'Charlie', age: 35, city: 'Shenzhen' });
  });

  it('should preview database table data', async () => {
    mockFindTableById.mockResolvedValue({
      id: 'table-db',
      type: TableSourceTypeValues.POSTGRESQL,
      datasourceId: 'ds-1',
      physicalName: 'users',
      columns: [],
    });

    mockFindDatasourceById.mockResolvedValue({
      id: 'ds-1',
      name: 'testdb',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'mydb',
      user: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockGetDatasourceRawPassword.mockResolvedValue('encrypted_pass');

    const mockDatasource = {
      isConnected: true,
      connect: mockConnect,
      executeQuery: mockExecuteQuery,
    };
    mockGetOrCreateDatasource.mockReturnValue(mockDatasource);

    mockExecuteQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        rowCount: 2,
        fields: [
          { name: 'id', type: 'int4' },
          { name: 'name', type: 'varchar' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 100 }],
        rowCount: 1,
        fields: [{ name: 'count', type: 'int8' }],
      });

    const result = await getTablePreview('table-db', 10);

    expect(result.columns).toEqual(['id', 'name']);
    expect(result.rows).toEqual([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);
    expect(result.totalRows).toBe(100);

    // Verify SQL uses escaped identifier
    expect(mockExecuteQuery).toHaveBeenCalledWith('SELECT * FROM "users" LIMIT 10');
    expect(mockExecuteQuery).toHaveBeenCalledWith('SELECT COUNT(*) AS count FROM "users"');

    // Should not call connect since isConnected is true
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('should throw MetadataNotFoundError when data file does not exist on disk', async () => {
    mockFindTableById.mockResolvedValue({
      id: 'table-missing-file',
      type: TableSourceTypeValues.CSV,
      dataFilePath: '2024-01-15/missing.csv',
      columns: [],
    });

    mockExistsSync.mockReturnValue(false);

    await expect(getTablePreview('table-missing-file', 20)).rejects.toThrow(MetadataNotFoundError);
    await expect(getTablePreview('table-missing-file', 20)).rejects.toThrow(
      'Data file does not exist'
    );
  });

  it('should preview Excel file data', async () => {
    mockFindTableById.mockResolvedValue({
      id: 'table-excel',
      type: TableSourceTypeValues.EXCEL,
      dataFilePath: '2024-01-15/data.xlsx',
      columns: [],
    });

    mockExistsSync.mockReturnValue(true);

    // Create a simple Excel buffer using XLSX
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['product', 'price', 'quantity'],
      ['Widget', 9.99, 100],
      ['Gadget', 24.99, 50],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    mockReadFileSync.mockReturnValue(excelBuffer);

    const result = await getTablePreview('table-excel', 20);

    expect(result.columns).toEqual(['product', 'price', 'quantity']);
    expect(result.totalRows).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ product: 'Widget', price: 9.99, quantity: 100 });
    expect(result.rows[1]).toEqual({ product: 'Gadget', price: 24.99, quantity: 50 });
  });

  it('should call connect when datasource is not connected', async () => {
    mockFindTableById.mockResolvedValue({
      id: 'table-db-disconnected',
      type: TableSourceTypeValues.SQLITE,
      datasourceId: 'ds-2',
      physicalName: 'orders',
      columns: [],
    });

    mockFindDatasourceById.mockResolvedValue({
      id: 'ds-2',
      name: 'local_db',
      type: 'sqlite',
      filePath: '/data/test.db',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockGetDatasourceRawPassword.mockResolvedValue(null);

    const mockDatasource = {
      isConnected: false,
      connect: mockConnect.mockResolvedValue(undefined),
      executeQuery: mockExecuteQuery,
    };
    mockGetOrCreateDatasource.mockReturnValue(mockDatasource);

    mockExecuteQuery
      .mockResolvedValueOnce({
        rows: [{ id: 1, total: 500 }],
        rowCount: 1,
        fields: [
          { name: 'id', type: 'integer' },
          { name: 'total', type: 'real' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ count: 10 }],
        rowCount: 1,
        fields: [{ name: 'count', type: 'integer' }],
      });

    const result = await getTablePreview('table-db-disconnected', 20);

    expect(mockConnect).toHaveBeenCalledOnce();
    expect(result.columns).toEqual(['id', 'total']);
    expect(result.rows).toEqual([{ id: 1, total: 500 }]);
    expect(result.totalRows).toBe(10);
  });

  it('should limit rows to requested amount', async () => {
    mockFindTableById.mockResolvedValue({
      id: 'table-csv-limit',
      type: TableSourceTypeValues.CSV,
      dataFilePath: '2024-01-15/data.csv',
      columns: [],
    });

    mockExistsSync.mockReturnValue(true);

    const csvContent = 'name,age\nAlice,30\nBob,25\nCharlie,35\nDave,40\nEve,28';
    mockReadFileSync.mockReturnValue(Buffer.from(csvContent));

    const result = await getTablePreview('table-csv-limit', 2);

    expect(result.totalRows).toBe(5);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ name: 'Alice', age: 30 });
    expect(result.rows[1]).toEqual({ name: 'Bob', age: 25 });
  });
});
