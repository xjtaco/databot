import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the http module directly with factory functions
vi.mock('@/utils/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
  axiosInstance: {},
}));

// Import after mocking
import {
  uploadFile,
  listTables,
  getTable,
  getDictionaryContent,
  updateTable,
  deleteTable,
  uploadSqliteFile,
  deleteDatasource,
} from '@/api/datafile';
import { http } from '@/utils/http';

// Type the mocked http for better type inference
const mockedHttp = vi.mocked(http);

describe('datafileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload file and return table IDs', async () => {
      const mockResult = {
        tableIds: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
      };
      mockedHttp.upload.mockResolvedValue(mockResult);

      const file = new File(['content'], 'test.csv', { type: 'text/csv' });
      const result = await uploadFile(file);

      expect(mockedHttp.upload).toHaveBeenCalledWith('/datafile/upload', file);
      expect(result.tableIds).toEqual([
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440002',
      ]);
    });

    it('should throw error on failed response', async () => {
      mockedHttp.upload.mockRejectedValue(new Error('Upload failed'));

      const file = new File(['content'], 'test.csv', { type: 'text/csv' });
      await expect(uploadFile(file)).rejects.toThrow('Upload failed');
    });
  });

  describe('listTables', () => {
    it('should fetch and return tables list', async () => {
      const mockTables = [
        { id: '550e8400-e29b-41d4-a716-446655440001', displayName: 'Table1' },
        { id: '550e8400-e29b-41d4-a716-446655440002', displayName: 'Table2' },
      ];
      mockedHttp.get.mockResolvedValue({ tables: mockTables });

      const result = await listTables();

      expect(mockedHttp.get).toHaveBeenCalledWith('/tables');
      expect(result.tables).toHaveLength(2);
    });

    it('should throw error on failed response', async () => {
      mockedHttp.get.mockRejectedValue(new Error('List failed'));

      await expect(listTables()).rejects.toThrow('List failed');
    });
  });

  describe('getTable', () => {
    it('should fetch single table with columns', async () => {
      const mockTable = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        displayName: 'Test',
        columns: [{ id: '550e8400-e29b-41d4-a716-446655440002', displayName: 'col1' }],
      };
      mockedHttp.get.mockResolvedValue({ table: mockTable });

      const result = await getTable('550e8400-e29b-41d4-a716-446655440001');

      expect(mockedHttp.get).toHaveBeenCalledWith('/tables/550e8400-e29b-41d4-a716-446655440001');
      expect(result.table.id).toBe('550e8400-e29b-41d4-a716-446655440001');
    });

    it('should throw error on failed response', async () => {
      mockedHttp.get.mockRejectedValue(new Error('Not found'));

      await expect(getTable('550e8400-e29b-41d4-a716-446655440999')).rejects.toThrow('Not found');
    });
  });

  describe('getDictionaryContent', () => {
    it('should fetch dictionary content', async () => {
      const content = '# Table Dictionary';
      mockedHttp.get.mockResolvedValue({ content });

      const result = await getDictionaryContent('550e8400-e29b-41d4-a716-446655440001');

      expect(mockedHttp.get).toHaveBeenCalledWith(
        '/tables/550e8400-e29b-41d4-a716-446655440001/dictionary'
      );
      expect(result.content).toBe(content);
    });

    it('should throw error on failed response', async () => {
      mockedHttp.get.mockRejectedValue(new Error('Dictionary not found'));

      await expect(getDictionaryContent('550e8400-e29b-41d4-a716-446655440001')).rejects.toThrow(
        'Dictionary not found'
      );
    });
  });

  describe('updateTable', () => {
    it('should update table and return result', async () => {
      const updatedTable = { id: '550e8400-e29b-41d4-a716-446655440001', displayName: 'Updated' };
      mockedHttp.put.mockResolvedValue({ table: updatedTable });

      const result = await updateTable('550e8400-e29b-41d4-a716-446655440001', {
        displayName: 'Updated',
      });

      expect(mockedHttp.put).toHaveBeenCalledWith('/tables/550e8400-e29b-41d4-a716-446655440001', {
        displayName: 'Updated',
      });
      expect(result.table.displayName).toBe('Updated');
    });

    it('should throw error on failed response', async () => {
      mockedHttp.put.mockRejectedValue(new Error('Update failed'));

      await expect(updateTable('550e8400-e29b-41d4-a716-446655440001', {})).rejects.toThrow(
        'Update failed'
      );
    });
  });

  describe('deleteTable', () => {
    it('should delete table successfully', async () => {
      mockedHttp.delete.mockResolvedValue(undefined);

      await expect(deleteTable('550e8400-e29b-41d4-a716-446655440001')).resolves.toBeUndefined();

      expect(mockedHttp.delete).toHaveBeenCalledWith(
        '/tables/550e8400-e29b-41d4-a716-446655440001'
      );
    });

    it('should throw error on failed response', async () => {
      mockedHttp.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(deleteTable('550e8400-e29b-41d4-a716-446655440001')).rejects.toThrow(
        'Delete failed'
      );
    });
  });

  describe('uploadSqliteFile', () => {
    it('should call upload endpoint with file', async () => {
      const mockResult = {
        datasourceId: '550e8400-e29b-41d4-a716-446655440001',
        databaseName: 'test_db',
        tableIds: [
          '550e8400-e29b-41d4-a716-446655440002',
          '550e8400-e29b-41d4-a716-446655440003',
          '550e8400-e29b-41d4-a716-446655440004',
        ],
      };
      mockedHttp.upload.mockResolvedValue(mockResult);

      const file = new File(['sqlite content'], 'test.db', { type: 'application/x-sqlite3' });
      const result = await uploadSqliteFile(file);

      expect(mockedHttp.upload).toHaveBeenCalledWith('/sqlite/upload', file);
      expect(result).toEqual(mockResult);
    });

    it('should return SqliteUploadResult on success', async () => {
      const mockResult = {
        datasourceId: '550e8400-e29b-41d4-a716-446655440042',
        databaseName: 'my_database',
        tableIds: ['550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440101'],
      };
      mockedHttp.upload.mockResolvedValue(mockResult);

      const file = new File(['sqlite content'], 'my_database.sqlite', {
        type: 'application/x-sqlite3',
      });
      const result = await uploadSqliteFile(file);

      expect(result.datasourceId).toBe('550e8400-e29b-41d4-a716-446655440042');
      expect(result.databaseName).toBe('my_database');
      expect(result.tableIds).toEqual([
        '550e8400-e29b-41d4-a716-446655440100',
        '550e8400-e29b-41d4-a716-446655440101',
      ]);
    });

    it('should throw error on failure', async () => {
      mockedHttp.upload.mockRejectedValue(new Error('Invalid SQLite file'));

      const file = new File(['invalid content'], 'bad.db', { type: 'application/x-sqlite3' });
      await expect(uploadSqliteFile(file)).rejects.toThrow('Invalid SQLite file');
    });
  });

  describe('deleteDatasource', () => {
    it('should call delete endpoint with id', async () => {
      mockedHttp.delete.mockResolvedValue(undefined);

      await deleteDatasource('550e8400-e29b-41d4-a716-446655440123');

      expect(mockedHttp.delete).toHaveBeenCalledWith(
        '/sqlite/datasource/550e8400-e29b-41d4-a716-446655440123'
      );
    });

    it('should complete without error on success', async () => {
      mockedHttp.delete.mockResolvedValue(undefined);

      await expect(
        deleteDatasource('550e8400-e29b-41d4-a716-446655440001')
      ).resolves.toBeUndefined();
    });

    it('should throw error on failure', async () => {
      mockedHttp.delete.mockRejectedValue(new Error('Datasource not found'));

      await expect(deleteDatasource('550e8400-e29b-41d4-a716-446655440999')).rejects.toThrow(
        'Datasource not found'
      );
    });
  });
});
