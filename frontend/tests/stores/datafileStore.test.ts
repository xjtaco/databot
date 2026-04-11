import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDatafileStore } from '@/stores/datafileStore';
import * as datafileApi from '@/api/datafile';
import * as datasourceApi from '@/api/datasource';
import type { TableMetadata, TableWithColumns } from '@/types/datafile';

vi.mock('@/api/datafile');
vi.mock('@/api/datasource');

describe('datafileStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockTableMetadata: TableMetadata = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    displayName: 'test',
    physicalName: 'test',
    type: 'csv',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockTableWithColumns: TableWithColumns = {
    ...mockTableMetadata,
    columns: [
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        tableId: '550e8400-e29b-41d4-a716-446655440001',
        displayName: 'name',
        physicalName: 'name',
        dataType: 'string',
        columnOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ],
  };

  it('should start with empty state', () => {
    const store = useDatafileStore();

    expect(store.tables).toHaveLength(0);
    expect(store.currentTable).toBeNull();
    expect(store.dictionaryContent).toBe('');
    expect(store.isLoading).toBe(false);
    expect(store.error).toBeNull();
  });

  describe('uploadFile', () => {
    it('should upload file and refresh tables', async () => {
      vi.mocked(datafileApi.uploadFile).mockResolvedValue({
        tableIds: ['550e8400-e29b-41d4-a716-446655440001'],
      });
      vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [mockTableMetadata] });
      const store = useDatafileStore();
      const file = new File(['content'], 'test.csv', { type: 'text/csv' });

      const tableIds = await store.uploadFile(file);

      expect(datafileApi.uploadFile).toHaveBeenCalledWith(file);
      expect(tableIds).toEqual(['550e8400-e29b-41d4-a716-446655440001']);
      expect(store.tables).toHaveLength(1);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('should set loading state during upload', async () => {
      let resolveUpload: (value: { tableIds: string[] }) => void;
      vi.mocked(datafileApi.uploadFile).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpload = resolve;
          })
      );
      vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
      const store = useDatafileStore();
      const file = new File(['content'], 'test.csv', { type: 'text/csv' });

      const promise = store.uploadFile(file);
      expect(store.isLoading).toBe(true);

      resolveUpload!({ tableIds: ['550e8400-e29b-41d4-a716-446655440001'] });
      await promise;
      expect(store.isLoading).toBe(false);
    });

    it('should handle upload error', async () => {
      const errorMessage = 'Upload failed';
      vi.mocked(datafileApi.uploadFile).mockRejectedValue(new Error(errorMessage));
      const store = useDatafileStore();
      const file = new File(['content'], 'test.csv', { type: 'text/csv' });

      await expect(store.uploadFile(file)).rejects.toThrow(errorMessage);
      expect(store.error).toBe(errorMessage);
      expect(store.isLoading).toBe(false);
    });
  });

  describe('fetchTables', () => {
    it('should fetch and store tables', async () => {
      vi.mocked(datafileApi.listTables).mockResolvedValue({
        tables: [mockTableMetadata],
      });
      const store = useDatafileStore();

      await store.fetchTables();

      expect(store.tables).toHaveLength(1);
      expect(store.tables[0]).toEqual(mockTableMetadata);
    });

    it('should handle fetch error', async () => {
      const errorMessage = 'Fetch failed';
      vi.mocked(datafileApi.listTables).mockRejectedValue(new Error(errorMessage));
      const store = useDatafileStore();

      await expect(store.fetchTables()).rejects.toThrow(errorMessage);
      expect(store.error).toBe(errorMessage);
    });
  });

  describe('fetchTable', () => {
    it('should fetch and store single table with columns', async () => {
      vi.mocked(datafileApi.getTable).mockResolvedValue({
        table: mockTableWithColumns,
      });
      const store = useDatafileStore();

      await store.fetchTable('550e8400-e29b-41d4-a716-446655440001');

      expect(datafileApi.getTable).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001');
      expect(store.currentTable).toEqual(mockTableWithColumns);
    });

    it('should handle fetch error', async () => {
      const errorMessage = 'Table not found';
      vi.mocked(datafileApi.getTable).mockRejectedValue(new Error(errorMessage));
      const store = useDatafileStore();

      await expect(store.fetchTable('550e8400-e29b-41d4-a716-446655440999')).rejects.toThrow(
        errorMessage
      );
      expect(store.error).toBe(errorMessage);
    });
  });

  describe('fetchDictionaryContent', () => {
    it('should fetch and store dictionary content', async () => {
      const content = '# Test Table\n\nDescription';
      vi.mocked(datafileApi.getDictionaryContent).mockResolvedValue({ content });
      const store = useDatafileStore();

      await store.fetchDictionaryContent('550e8400-e29b-41d4-a716-446655440001');

      expect(store.dictionaryContent).toBe(content);
    });

    it('should handle fetch error', async () => {
      const errorMessage = 'Dictionary not found';
      vi.mocked(datafileApi.getDictionaryContent).mockRejectedValue(new Error(errorMessage));
      const store = useDatafileStore();

      await expect(
        store.fetchDictionaryContent('550e8400-e29b-41d4-a716-446655440001')
      ).rejects.toThrow(errorMessage);
      expect(store.error).toBe(errorMessage);
    });
  });

  describe('updateTable', () => {
    it('should update table and refresh list', async () => {
      const updatedTable = { ...mockTableWithColumns, displayName: 'updated' };
      vi.mocked(datafileApi.updateTable).mockResolvedValue({ table: updatedTable });
      vi.mocked(datafileApi.listTables).mockResolvedValue({
        tables: [{ ...mockTableMetadata, displayName: 'updated' }],
      });
      const store = useDatafileStore();

      await store.updateTable('550e8400-e29b-41d4-a716-446655440001', { displayName: 'updated' });

      expect(datafileApi.updateTable).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001', {
        displayName: 'updated',
      });
      expect(store.currentTable?.displayName).toBe('updated');
    });

    it('should handle update error', async () => {
      const errorMessage = 'Update failed';
      vi.mocked(datafileApi.updateTable).mockRejectedValue(new Error(errorMessage));
      const store = useDatafileStore();

      await expect(store.updateTable('550e8400-e29b-41d4-a716-446655440001', {})).rejects.toThrow(
        errorMessage
      );
      expect(store.error).toBe(errorMessage);
    });
  });

  describe('deleteTable', () => {
    it('should delete table and refresh list', async () => {
      vi.mocked(datafileApi.deleteTable).mockResolvedValue();
      vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
      const store = useDatafileStore();
      store.currentTable = mockTableWithColumns;

      await store.deleteTable('550e8400-e29b-41d4-a716-446655440001');

      expect(datafileApi.deleteTable).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001');
      expect(store.currentTable).toBeNull();
      expect(store.tables).toHaveLength(0);
    });

    it('should not clear currentTable if deleting different table', async () => {
      vi.mocked(datafileApi.deleteTable).mockResolvedValue();
      vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
      const store = useDatafileStore();
      store.currentTable = mockTableWithColumns;

      await store.deleteTable('550e8400-e29b-41d4-a716-446655440999');

      expect(store.currentTable).not.toBeNull();
    });

    it('should handle delete error', async () => {
      const errorMessage = 'Delete failed';
      vi.mocked(datafileApi.deleteTable).mockRejectedValue(new Error(errorMessage));
      const store = useDatafileStore();

      await expect(store.deleteTable('550e8400-e29b-41d4-a716-446655440001')).rejects.toThrow(
        errorMessage
      );
      expect(store.error).toBe(errorMessage);
    });
  });

  describe('clearCurrentTable', () => {
    it('should clear current table and dictionary content', () => {
      const store = useDatafileStore();
      store.currentTable = mockTableWithColumns;
      store.dictionaryContent = 'some content';

      store.clearCurrentTable();

      expect(store.currentTable).toBeNull();
      expect(store.dictionaryContent).toBe('');
    });
  });

  describe('uploadSqliteFile', () => {
    const mockSqliteResult = {
      datasourceId: '550e8400-e29b-41d4-a716-446655440001',
      databaseName: 'test_db',
      tableIds: ['550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440003'],
    };

    it('should upload file and refresh tables', async () => {
      vi.mocked(datafileApi.uploadSqliteFile).mockResolvedValue(mockSqliteResult);
      vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [mockTableMetadata] });
      vi.mocked(datafileApi.listDatasources).mockResolvedValue({ datasources: [] });
      const store = useDatafileStore();
      const file = new File(['sqlite content'], 'test.db', { type: 'application/x-sqlite3' });

      const result = await store.uploadSqliteFile(file);

      expect(datafileApi.uploadSqliteFile).toHaveBeenCalledWith(file);
      expect(result).toEqual(mockSqliteResult);
      expect(store.tables).toHaveLength(1);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('should set loading state during upload', async () => {
      let resolveUpload: (value: typeof mockSqliteResult) => void;
      vi.mocked(datafileApi.uploadSqliteFile).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpload = resolve;
          })
      );
      vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
      vi.mocked(datafileApi.listDatasources).mockResolvedValue({ datasources: [] });
      const store = useDatafileStore();
      const file = new File(['sqlite content'], 'test.db', { type: 'application/x-sqlite3' });

      const promise = store.uploadSqliteFile(file);
      expect(store.isLoading).toBe(true);

      resolveUpload!(mockSqliteResult);
      await promise;
      expect(store.isLoading).toBe(false);
    });

    it('should set error on failure', async () => {
      const errorMessage = 'Invalid SQLite file';
      vi.mocked(datafileApi.uploadSqliteFile).mockRejectedValue(new Error(errorMessage));
      const store = useDatafileStore();
      const file = new File(['invalid content'], 'bad.db', { type: 'application/x-sqlite3' });

      await expect(store.uploadSqliteFile(file)).rejects.toThrow(errorMessage);
      expect(store.error).toBe(errorMessage);
      expect(store.isLoading).toBe(false);
    });

    it('should return upload result', async () => {
      vi.mocked(datafileApi.uploadSqliteFile).mockResolvedValue(mockSqliteResult);
      vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
      vi.mocked(datafileApi.listDatasources).mockResolvedValue({ datasources: [] });
      const store = useDatafileStore();
      const file = new File(['sqlite content'], 'test.db', { type: 'application/x-sqlite3' });

      const result = await store.uploadSqliteFile(file);

      expect(result.datasourceId).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(result.databaseName).toBe('test_db');
      expect(result.tableIds).toEqual([
        '550e8400-e29b-41d4-a716-446655440002',
        '550e8400-e29b-41d4-a716-446655440003',
      ]);
    });
  });

  describe('deleteDatasource', () => {
    const mockTableWithDatasource: TableWithColumns = {
      ...mockTableWithColumns,
      datasourceId: '550e8400-e29b-41d4-a716-446655440010',
    };

    it('should delete datasource and refresh tables', async () => {
      vi.mocked(datafileApi.deleteDatasource).mockResolvedValue();
      vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
      vi.mocked(datafileApi.listDatasources).mockResolvedValue({ datasources: [] });
      const store = useDatafileStore();

      await store.deleteDatasource('550e8400-e29b-41d4-a716-446655440010', 'sqlite');

      expect(datafileApi.deleteDatasource).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440010'
      );
      expect(store.tables).toHaveLength(0);
    });

    it('should clear currentTable if it belonged to deleted datasource', async () => {
      vi.mocked(datafileApi.deleteDatasource).mockResolvedValue();
      vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
      vi.mocked(datafileApi.listDatasources).mockResolvedValue({ datasources: [] });
      const store = useDatafileStore();
      store.currentTable = mockTableWithDatasource;

      await store.deleteDatasource('550e8400-e29b-41d4-a716-446655440010', 'sqlite');

      expect(store.currentTable).toBeNull();
    });

    it('should not clear currentTable if deleting different datasource', async () => {
      vi.mocked(datafileApi.deleteDatasource).mockResolvedValue();
      vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
      vi.mocked(datafileApi.listDatasources).mockResolvedValue({ datasources: [] });
      const store = useDatafileStore();
      store.currentTable = mockTableWithDatasource;

      await store.deleteDatasource('550e8400-e29b-41d4-a716-446655440999', 'sqlite');

      expect(store.currentTable).not.toBeNull();
    });

    it('should set loading state during deletion', async () => {
      let resolveDelete: () => void;
      vi.mocked(datafileApi.deleteDatasource).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveDelete = resolve;
          })
      );
      vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
      vi.mocked(datafileApi.listDatasources).mockResolvedValue({ datasources: [] });
      const store = useDatafileStore();

      const promise = store.deleteDatasource('550e8400-e29b-41d4-a716-446655440010', 'sqlite');
      expect(store.isLoading).toBe(true);

      resolveDelete!();
      await promise;
      expect(store.isLoading).toBe(false);
    });

    it('should set error on failure', async () => {
      const errorMessage = 'Datasource not found';
      vi.mocked(datafileApi.deleteDatasource).mockRejectedValue(new Error(errorMessage));
      const store = useDatafileStore();

      await expect(
        store.deleteDatasource('550e8400-e29b-41d4-a716-446655440999', 'sqlite')
      ).rejects.toThrow(errorMessage);
      expect(store.error).toBe(errorMessage);
      expect(store.isLoading).toBe(false);
    });

    it('should call datasourceApi for non-sqlite datasources', async () => {
      vi.mocked(datasourceApi.deleteDatasource).mockResolvedValue();
      vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
      vi.mocked(datafileApi.listDatasources).mockResolvedValue({ datasources: [] });
      const store = useDatafileStore();

      await store.deleteDatasource('550e8400-e29b-41d4-a716-446655440010', 'postgresql');

      expect(datasourceApi.deleteDatasource).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440010'
      );
      expect(datafileApi.deleteDatasource).not.toHaveBeenCalled();
    });
  });

  describe('datasource operations', () => {
    const mockDatasourceConfig = {
      dbType: 'postgresql' as const,
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      user: 'testuser',
      password: 'testpass',
    };

    const mockDatasourceResult = {
      datasourceId: '550e8400-e29b-41d4-a716-446655440020',
      databaseName: 'testdb',
      tableIds: ['table1', 'table2'],
    };

    describe('testDatasourceConnection', () => {
      it('should test connection and return result', async () => {
        const mockResult = { success: true, message: 'Connection successful' };
        vi.mocked(datasourceApi.testConnection).mockResolvedValue(mockResult);
        const store = useDatafileStore();

        const result = await store.testDatasourceConnection(mockDatasourceConfig);

        expect(datasourceApi.testConnection).toHaveBeenCalledWith(mockDatasourceConfig);
        expect(result).toEqual(mockResult);
      });

      it('should set loading state during connection test', async () => {
        let resolveTest: (value: { success: boolean; message: string }) => void;
        vi.mocked(datasourceApi.testConnection).mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveTest = resolve;
            })
        );
        const store = useDatafileStore();

        const promise = store.testDatasourceConnection(mockDatasourceConfig);
        expect(store.isLoading).toBe(true);

        resolveTest!({ success: true, message: 'OK' });
        await promise;
        expect(store.isLoading).toBe(false);
      });

      it('should set error on connection failure', async () => {
        const errorMessage = 'Connection failed';
        vi.mocked(datasourceApi.testConnection).mockRejectedValue(new Error(errorMessage));
        const store = useDatafileStore();

        await expect(store.testDatasourceConnection(mockDatasourceConfig)).rejects.toThrow(
          errorMessage
        );
        expect(store.error).toBe(errorMessage);
      });
    });

    describe('createDatasource', () => {
      it('should create datasource and refresh lists', async () => {
        vi.mocked(datasourceApi.createDatasource).mockResolvedValue(mockDatasourceResult);
        vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
        vi.mocked(datafileApi.listDatasources).mockResolvedValue({ datasources: [] });
        const store = useDatafileStore();

        const result = await store.createDatasource(mockDatasourceConfig);

        expect(datasourceApi.createDatasource).toHaveBeenCalledWith(mockDatasourceConfig);
        expect(result).toEqual(mockDatasourceResult);
        expect(datafileApi.listTables).toHaveBeenCalled();
        expect(datafileApi.listDatasources).toHaveBeenCalled();
      });

      it('should set loading state during creation', async () => {
        let resolveCreate: (value: typeof mockDatasourceResult) => void;
        vi.mocked(datasourceApi.createDatasource).mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveCreate = resolve;
            })
        );
        vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
        vi.mocked(datafileApi.listDatasources).mockResolvedValue({ datasources: [] });
        const store = useDatafileStore();

        const promise = store.createDatasource(mockDatasourceConfig);
        expect(store.isLoading).toBe(true);

        resolveCreate!(mockDatasourceResult);
        await promise;
        expect(store.isLoading).toBe(false);
      });

      it('should set error on creation failure', async () => {
        const errorMessage = 'Failed to create datasource';
        vi.mocked(datasourceApi.createDatasource).mockRejectedValue(new Error(errorMessage));
        const store = useDatafileStore();

        await expect(store.createDatasource(mockDatasourceConfig)).rejects.toThrow(errorMessage);
        expect(store.error).toBe(errorMessage);
      });
    });

    describe('updateDatasource', () => {
      it('should update datasource and refresh lists', async () => {
        vi.mocked(datasourceApi.updateDatasource).mockResolvedValue(mockDatasourceResult);
        vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
        vi.mocked(datafileApi.listDatasources).mockResolvedValue({ datasources: [] });
        const store = useDatafileStore();

        const result = await store.updateDatasource(
          '550e8400-e29b-41d4-a716-446655440020',
          mockDatasourceConfig
        );

        expect(datasourceApi.updateDatasource).toHaveBeenCalledWith(
          '550e8400-e29b-41d4-a716-446655440020',
          mockDatasourceConfig
        );
        expect(result).toEqual(mockDatasourceResult);
        expect(datafileApi.listTables).toHaveBeenCalled();
        expect(datafileApi.listDatasources).toHaveBeenCalled();
      });

      it('should clear currentTable if it belonged to updated datasource', async () => {
        vi.mocked(datasourceApi.updateDatasource).mockResolvedValue(mockDatasourceResult);
        vi.mocked(datafileApi.listTables).mockResolvedValue({ tables: [] });
        vi.mocked(datafileApi.listDatasources).mockResolvedValue({ datasources: [] });
        const store = useDatafileStore();
        store.currentTable = {
          ...mockTableWithColumns,
          datasourceId: '550e8400-e29b-41d4-a716-446655440020',
        };

        await store.updateDatasource('550e8400-e29b-41d4-a716-446655440020', mockDatasourceConfig);

        expect(store.currentTable).toBeNull();
      });

      it('should set error on update failure', async () => {
        const errorMessage = 'Failed to update datasource';
        vi.mocked(datasourceApi.updateDatasource).mockRejectedValue(new Error(errorMessage));
        const store = useDatafileStore();

        await expect(
          store.updateDatasource('550e8400-e29b-41d4-a716-446655440020', mockDatasourceConfig)
        ).rejects.toThrow(errorMessage);
        expect(store.error).toBe(errorMessage);
      });
    });
  });
});
