import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SqliteParseError } from '../../../src/errors/types';
import { TableSourceTypeValues } from '../../../src/table/table.types';

// Mock better-sqlite3 first to prevent native module loading
vi.mock('better-sqlite3', () => ({
  default: vi.fn(),
}));

// Mock database infrastructure to prevent pg loading
vi.mock('../../../src/infrastructure/database', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  withTransaction: vi.fn(),
}));

// Mock config
vi.mock('../../../src/base/config', () => ({
  config: {
    upload: {
      directory: '/mock/uploads',
    },
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Create hoisted mocks
const mockWriteFile = vi.hoisted(() => vi.fn());
const mockUnlink = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockMkdirSync = vi.hoisted(() => vi.fn());

vi.mock('fs', async () => {
  return {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    promises: {
      writeFile: mockWriteFile,
      unlink: mockUnlink,
    },
  };
});

// Create hoisted mocks for sqliteParser
const mockParseSqliteFile = vi.hoisted(() => vi.fn());
const mockValidateSqliteFile = vi.hoisted(() => vi.fn());

vi.mock('../../../src/sqlite/sqliteParser', () => ({
  parseSqliteFile: mockParseSqliteFile,
  validateSqliteFile: mockValidateSqliteFile,
}));

// Create hoisted mocks for repository - need to mock entire module
const mockCreateDatasource = vi.hoisted(() => vi.fn());
const mockCreateTable = vi.hoisted(() => vi.fn());
const mockDeleteDatasource = vi.hoisted(() => vi.fn());
const mockFindDatasourceById = vi.hoisted(() => vi.fn());
const mockFindTablesByDatasourceId = vi.hoisted(() => vi.fn());
const mockUpdateTableDictionaryPath = vi.hoisted(() => vi.fn());

vi.mock('../../../src/table/table.repository', () => ({
  createDatasource: mockCreateDatasource,
  createTable: mockCreateTable,
  deleteDatasource: mockDeleteDatasource,
  findDatasourceById: mockFindDatasourceById,
  findTablesByDatasourceId: mockFindTablesByDatasourceId,
  updateTableDictionaryPath: mockUpdateTableDictionaryPath,
}));

// Create hoisted mocks for dictionaryGenerator
const mockSaveSqliteDictionaryFile = vi.hoisted(() => vi.fn());
const mockSaveConfigIni = vi.hoisted(() => vi.fn());
const mockDeleteDatabaseDictionary = vi.hoisted(() => vi.fn());

vi.mock('../../../src/table/dictionaryGenerator', () => ({
  saveSqliteDictionaryFile: mockSaveSqliteDictionaryFile,
  saveConfigIni: mockSaveConfigIni,
  deleteDatabaseDictionary: mockDeleteDatabaseDictionary,
}));

// Import after all mocks
import { uploadSqliteFile, deleteDatasourceWithFiles } from '../../../src/sqlite/sqlite.service';

describe('sqliteUploadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock defaults
    mockExistsSync.mockReturnValue(false);
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockValidateSqliteFile.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('uploadSqliteFile', () => {
    const mockBuffer = Buffer.from('mock sqlite data');
    const mockOriginalName = 'test_database.db';

    const mockParsedTables = [
      {
        displayName: 'users',
        physicalName: 'users',
        type: TableSourceTypeValues.SQLITE,
        columns: [
          { displayName: 'id', physicalName: 'id', dataType: 'number', columnOrder: 0 },
          { displayName: 'name', physicalName: 'name', dataType: 'string', columnOrder: 1 },
        ],
      },
    ];

    it('should save file to uploads directory', async () => {
      mockParseSqliteFile.mockReturnValue(mockParsedTables);
      mockCreateDatasource.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'test_database',
      });
      mockCreateTable.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440002',
        displayName: 'users',
      });
      mockSaveSqliteDictionaryFile.mockResolvedValue('/dict/test_database/users.md');
      mockSaveConfigIni.mockResolvedValue(undefined);
      mockUpdateTableDictionaryPath.mockResolvedValue(undefined);

      await uploadSqliteFile(mockBuffer, mockOriginalName);

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining(mockOriginalName),
        mockBuffer
      );
    });

    it('should create datasource record', async () => {
      mockParseSqliteFile.mockReturnValue(mockParsedTables);
      mockCreateDatasource.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'test_database',
      });
      mockCreateTable.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440002',
        displayName: 'users',
      });
      mockSaveSqliteDictionaryFile.mockResolvedValue('/dict/test_database/users.md');
      mockSaveConfigIni.mockResolvedValue(undefined);
      mockUpdateTableDictionaryPath.mockResolvedValue(undefined);

      await uploadSqliteFile(mockBuffer, mockOriginalName);

      expect(mockCreateDatasource).toHaveBeenCalledWith({
        name: 'test_database',
        type: TableSourceTypeValues.SQLITE,
        filePath: expect.stringContaining('test_database.db'),
        database: 'test_database',
      });
    });

    it('should create table records for each parsed table', async () => {
      const multipleTables = [
        ...mockParsedTables,
        {
          displayName: 'orders',
          physicalName: 'orders',
          type: TableSourceTypeValues.SQLITE,
          columns: [
            {
              displayName: 'order_id',
              physicalName: 'order_id',
              dataType: 'number',
              columnOrder: 0,
            },
          ],
        },
      ];
      mockParseSqliteFile.mockReturnValue(multipleTables);
      mockCreateDatasource.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'test_database',
      });
      mockCreateTable
        .mockResolvedValueOnce({
          id: '550e8400-e29b-41d4-a716-446655440002',
          displayName: 'users',
        })
        .mockResolvedValueOnce({
          id: '550e8400-e29b-41d4-a716-446655440003',
          displayName: 'orders',
        });
      mockSaveSqliteDictionaryFile.mockResolvedValue('/dict/path.md');
      mockSaveConfigIni.mockResolvedValue(undefined);
      mockUpdateTableDictionaryPath.mockResolvedValue(undefined);

      await uploadSqliteFile(mockBuffer, mockOriginalName);

      expect(mockCreateTable).toHaveBeenCalledTimes(2);
      expect(mockCreateTable).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'users',
          datasourceId: '550e8400-e29b-41d4-a716-446655440001',
        })
      );
      expect(mockCreateTable).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'orders',
          datasourceId: '550e8400-e29b-41d4-a716-446655440001',
        })
      );
    });

    it('should generate dictionary files', async () => {
      mockParseSqliteFile.mockReturnValue(mockParsedTables);
      mockCreateDatasource.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'test_database',
      });
      mockCreateTable.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440002',
        displayName: 'users',
      });
      mockSaveSqliteDictionaryFile.mockResolvedValue('/dict/test_database/users.md');
      mockSaveConfigIni.mockResolvedValue(undefined);
      mockUpdateTableDictionaryPath.mockResolvedValue(undefined);

      await uploadSqliteFile(mockBuffer, mockOriginalName);

      expect(mockSaveSqliteDictionaryFile).toHaveBeenCalled();
      expect(mockSaveConfigIni).toHaveBeenCalledWith(
        'test_database',
        expect.any(String),
        '550e8400-e29b-41d4-a716-446655440001'
      );
      expect(mockUpdateTableDictionaryPath).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440002',
        '/dict/test_database/users.md'
      );
    });

    it('should return datasourceId and tableIds', async () => {
      mockParseSqliteFile.mockReturnValue(mockParsedTables);
      mockCreateDatasource.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440042',
        name: 'test_database',
      });
      mockCreateTable.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440100',
        displayName: 'users',
      });
      mockSaveSqliteDictionaryFile.mockResolvedValue('/dict/path.md');
      mockSaveConfigIni.mockResolvedValue(undefined);
      mockUpdateTableDictionaryPath.mockResolvedValue(undefined);

      const result = await uploadSqliteFile(mockBuffer, mockOriginalName);

      expect(result).toEqual({
        datasourceId: '550e8400-e29b-41d4-a716-446655440042',
        databaseName: 'test_database',
        tableIds: ['550e8400-e29b-41d4-a716-446655440100'],
      });
    });

    it('should cleanup file on validation error', async () => {
      mockValidateSqliteFile.mockReturnValue(false);
      // First call for directory check returns false (dir doesn't exist)
      // Second call for unique filename check returns false (file doesn't exist)
      // Third call for cleanup check returns true (file exists and should be deleted)
      mockExistsSync
        .mockReturnValueOnce(false) // ensureDirectoryExists
        .mockReturnValueOnce(false) // getUniqueFilename - file doesn't exist
        .mockReturnValueOnce(true); // cleanup check - file exists

      await expect(uploadSqliteFile(mockBuffer, mockOriginalName)).rejects.toThrow(
        SqliteParseError
      );
      expect(mockUnlink).toHaveBeenCalled();
    });

    it('should cleanup file on parse error', async () => {
      mockValidateSqliteFile.mockReturnValue(true);
      mockParseSqliteFile.mockImplementation(() => {
        throw new SqliteParseError('No tables found');
      });
      // First call for directory check returns false (dir doesn't exist)
      // Second call for unique filename check returns false (file doesn't exist)
      // Third call for cleanup check returns true (file exists and should be deleted)
      mockExistsSync
        .mockReturnValueOnce(false) // ensureDirectoryExists
        .mockReturnValueOnce(false) // getUniqueFilename - file doesn't exist
        .mockReturnValueOnce(true); // cleanup check - file exists

      await expect(uploadSqliteFile(mockBuffer, mockOriginalName)).rejects.toThrow(
        SqliteParseError
      );
      expect(mockUnlink).toHaveBeenCalled();
    });

    it('should throw SqliteParseError for invalid database', async () => {
      mockValidateSqliteFile.mockReturnValue(false);

      await expect(uploadSqliteFile(mockBuffer, mockOriginalName)).rejects.toThrow(
        'Invalid SQLite database file'
      );
    });

    it('should generate unique filename for duplicates', async () => {
      // First call returns true (file exists), second returns false
      mockExistsSync
        .mockReturnValueOnce(false) // directory check
        .mockReturnValueOnce(true) // first filename check - exists
        .mockReturnValueOnce(false); // second filename check with _1 - doesn't exist

      mockParseSqliteFile.mockReturnValue(mockParsedTables);
      mockCreateDatasource.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'test_database',
      });
      mockCreateTable.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440002',
        displayName: 'users',
      });
      mockSaveSqliteDictionaryFile.mockResolvedValue('/dict/path.md');
      mockSaveConfigIni.mockResolvedValue(undefined);
      mockUpdateTableDictionaryPath.mockResolvedValue(undefined);

      await uploadSqliteFile(mockBuffer, mockOriginalName);

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('test_database_1.db'),
        mockBuffer
      );
    });
  });

  describe('deleteDatasourceWithFiles', () => {
    it('should delete datasource and related files', async () => {
      mockFindDatasourceById.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'test_database',
        type: TableSourceTypeValues.SQLITE,
        filePath: '2024-01-01/test.db',
      });
      mockFindTablesByDatasourceId.mockResolvedValue([
        { id: '550e8400-e29b-41d4-a716-446655440002', displayName: 'users' },
      ]);
      mockDeleteDatabaseDictionary.mockResolvedValue(undefined);
      mockExistsSync.mockReturnValue(true);
      mockDeleteDatasource.mockResolvedValue(undefined);

      await deleteDatasourceWithFiles('550e8400-e29b-41d4-a716-446655440001');

      expect(mockDeleteDatasource).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001');
    });

    it('should delete dictionary directory', async () => {
      mockFindDatasourceById.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'test_database',
        type: TableSourceTypeValues.SQLITE,
        filePath: '2024-01-01/test.db',
      });
      mockFindTablesByDatasourceId.mockResolvedValue([]);
      mockDeleteDatabaseDictionary.mockResolvedValue(undefined);
      mockExistsSync.mockReturnValue(true);
      mockDeleteDatasource.mockResolvedValue(undefined);

      await deleteDatasourceWithFiles('550e8400-e29b-41d4-a716-446655440001');

      expect(mockDeleteDatabaseDictionary).toHaveBeenCalledWith('test_database');
    });

    it('should delete SQLite file from uploads', async () => {
      mockFindDatasourceById.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'test_database',
        type: TableSourceTypeValues.SQLITE,
        filePath: '2024-01-01/test.db',
      });
      mockFindTablesByDatasourceId.mockResolvedValue([]);
      mockDeleteDatabaseDictionary.mockResolvedValue(undefined);
      mockExistsSync.mockReturnValue(true);
      mockDeleteDatasource.mockResolvedValue(undefined);

      await deleteDatasourceWithFiles('550e8400-e29b-41d4-a716-446655440001');

      expect(mockUnlink).toHaveBeenCalledWith('/mock/uploads/2024-01-01/test.db');
    });

    it('should throw SqliteParseError if datasource not found', async () => {
      mockFindDatasourceById.mockResolvedValue(null);

      await expect(
        deleteDatasourceWithFiles('550e8400-e29b-41d4-a716-446655440999')
      ).rejects.toThrow(SqliteParseError);
      await expect(
        deleteDatasourceWithFiles('550e8400-e29b-41d4-a716-446655440999')
      ).rejects.toThrow('Datasource not found');
    });

    it('should handle missing SQLite file gracefully', async () => {
      mockFindDatasourceById.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'test_database',
        type: TableSourceTypeValues.SQLITE,
        filePath: '2024-01-01/test.db',
      });
      mockFindTablesByDatasourceId.mockResolvedValue([]);
      mockDeleteDatabaseDictionary.mockResolvedValue(undefined);
      mockExistsSync.mockReturnValue(false); // File doesn't exist
      mockDeleteDatasource.mockResolvedValue(undefined);

      // Should not throw
      await expect(
        deleteDatasourceWithFiles('550e8400-e29b-41d4-a716-446655440001')
      ).resolves.not.toThrow();
      expect(mockUnlink).not.toHaveBeenCalled();
      expect(mockDeleteDatasource).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001');
    });

    it('should handle datasource without filePath', async () => {
      mockFindDatasourceById.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'test_database',
        type: TableSourceTypeValues.SQLITE,
        filePath: null,
      });
      mockFindTablesByDatasourceId.mockResolvedValue([]);
      mockDeleteDatabaseDictionary.mockResolvedValue(undefined);
      mockDeleteDatasource.mockResolvedValue(undefined);

      await expect(
        deleteDatasourceWithFiles('550e8400-e29b-41d4-a716-446655440001')
      ).resolves.not.toThrow();
      expect(mockUnlink).not.toHaveBeenCalled();
      expect(mockDeleteDatasource).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440001');
    });
  });

  describe('helper functions', () => {
    describe('getTodayDirectory', () => {
      it('should return YYYY-MM-DD format', async () => {
        // We test this indirectly through uploadSqliteFile
        mockParseSqliteFile.mockReturnValue([
          {
            displayName: 'test',
            physicalName: 'test',
            type: TableSourceTypeValues.SQLITE,
            columns: [
              { displayName: 'id', physicalName: 'id', dataType: 'number', columnOrder: 0 },
            ],
          },
        ]);
        mockCreateDatasource.mockResolvedValue({
          id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'test',
        });
        mockCreateTable.mockResolvedValue({
          id: '550e8400-e29b-41d4-a716-446655440002',
          displayName: 'test',
        });
        mockSaveSqliteDictionaryFile.mockResolvedValue('/dict/path.md');
        mockSaveConfigIni.mockResolvedValue(undefined);
        mockUpdateTableDictionaryPath.mockResolvedValue(undefined);

        await uploadSqliteFile(Buffer.from('data'), 'test.db');

        // Check that the file path contains a date pattern
        expect(mockWriteFile).toHaveBeenCalledWith(
          expect.stringMatching(/\/mock\/uploads\/\d{4}-\d{2}-\d{2}\/test\.db/),
          expect.any(Buffer)
        );
      });
    });

    describe('generateDatabaseName', () => {
      it('should sanitize filename', async () => {
        mockParseSqliteFile.mockReturnValue([
          {
            displayName: 'test',
            physicalName: 'test',
            type: TableSourceTypeValues.SQLITE,
            columns: [
              { displayName: 'id', physicalName: 'id', dataType: 'number', columnOrder: 0 },
            ],
          },
        ]);
        mockCreateDatasource.mockResolvedValue({
          id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'my_database',
        });
        mockCreateTable.mockResolvedValue({
          id: '550e8400-e29b-41d4-a716-446655440002',
          displayName: 'test',
        });
        mockSaveSqliteDictionaryFile.mockResolvedValue('/dict/path.md');
        mockSaveConfigIni.mockResolvedValue(undefined);
        mockUpdateTableDictionaryPath.mockResolvedValue(undefined);

        await uploadSqliteFile(Buffer.from('data'), 'my-database@v2.db');

        expect(mockCreateDatasource).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'my_database_v2',
          })
        );
      });
    });
  });
});
