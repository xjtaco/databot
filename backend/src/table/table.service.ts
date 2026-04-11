import * as fs from 'fs';
import * as path from 'path';
import { config } from '../base/config';
import * as XLSX from 'xlsx';
import { DatasourceFactory } from '../infrastructure/datasources/datasourceFactory';
import { DatasourceConfig, DatasourceType } from '../infrastructure/datasources/types';
import { decryptPassword } from '../utils/encryption';
import {
  TableMetadata,
  TableWithColumns,
  ParsedTableMetadata,
  ConfirmTableInput,
  UpdateTableInput,
  DatasourceWithTables,
  PreviewData,
  TableSourceTypeValues,
} from './table.types';
import * as repository from './table.repository';
import {
  saveDictionaryFile,
  updateDictionaryFile,
  readDictionaryFile,
  deleteDictionaryFile,
} from './dictionaryGenerator';
import { parseFileMetadata, parseFileMetadataInMemory, convertToUtf8 } from './metadataParser';
import { processUploadedFile, deleteUploadedFiles } from '../datafile/datafile.service';
import { MetadataNotFoundError } from '../errors/types';
import logger from '../utils/logger';

/**
 * Upload file and save metadata in one step.
 * Parses the file, saves it to disk, and creates database records.
 * Cleans up saved files if database creation fails.
 */
export async function uploadAndSaveFile(buffer: Buffer, originalName: string): Promise<string[]> {
  // 1. Parse metadata in memory
  const parsedTables = parseFileMetadataInMemory(buffer, originalName);
  logger.debug('Parsed tables from file', {
    originalName,
    tableCount: parsedTables.length,
    tableNames: parsedTables.map((t) => t.physicalName),
  });

  // 2. Save file to disk
  const uploadResult = await processUploadedFile(buffer, originalName);
  logger.debug('Files saved to disk', {
    directory: uploadResult.directory,
    savedFiles: uploadResult.savedFiles,
  });

  // 3. Create database records for each table
  const createdIds: string[] = [];
  const createdDictionaryPaths: string[] = [];

  try {
    for (let i = 0; i < parsedTables.length; i++) {
      const parsed = parsedTables[i];
      const savedFileName = uploadResult.savedFiles[i];

      if (!savedFileName) {
        logger.warn('No saved file for table index', { index: i, parsed });
        continue;
      }

      const tableInput: ConfirmTableInput = {
        displayName: parsed.displayName,
        physicalName: parsed.physicalName,
        description: parsed.description,
        type: parsed.type,
        dataFilePath: `${uploadResult.directory}/${savedFileName}`,
        columns: parsed.columns,
      };

      logger.debug('Creating table record', {
        index: i,
        physicalName: tableInput.physicalName,
        dataFilePath: tableInput.dataFilePath,
        columnCount: tableInput.columns.length,
      });

      const table = await repository.createTable(tableInput);
      logger.debug('Table created successfully', {
        tableId: table.id,
        physicalName: table.physicalName,
      });
      createdIds.push(table.id);

      const dictionaryPath = await saveDictionaryFile(table);
      createdDictionaryPaths.push(dictionaryPath);
      logger.debug('Dictionary file saved', { tableId: table.id, dictionaryPath });
      await repository.updateTableDictionaryPath(table.id, dictionaryPath);
    }
  } catch (error) {
    // Clean up: delete uploaded files and any created dictionary files
    logger.error('Failed to create table records, cleaning up uploaded files', {
      originalName,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Delete uploaded data files
    await deleteUploadedFiles(uploadResult.directory, uploadResult.savedFiles);

    // Delete any dictionary files that were created
    for (const dictPath of createdDictionaryPaths) {
      await deleteDictionaryFile(dictPath);
    }

    // Delete any database records that were created (in case of partial failure)
    for (const id of createdIds) {
      try {
        await repository.deleteTable(id);
      } catch (deleteError) {
        logger.warn('Failed to cleanup table during rollback', {
          tableId: id,
          error: deleteError instanceof Error ? deleteError.message : String(deleteError),
        });
      }
    }

    throw error;
  }

  logger.info('File uploaded and saved', {
    tableCount: createdIds.length,
    tableIds: createdIds,
    originalName,
  });

  return createdIds;
}

export async function parseUploadedFile(
  buffer: Buffer,
  originalName: string,
  savedFiles: string[],
  directory: string
): Promise<ParsedTableMetadata[]> {
  return parseFileMetadata(buffer, originalName, savedFiles, directory);
}

/**
 * Parse uploaded file metadata in memory without saving the file.
 * Used for the parse step to show metadata preview to user.
 */
export async function parseUploadedFileInMemory(
  buffer: Buffer,
  originalName: string
): Promise<ParsedTableMetadata[]> {
  return parseFileMetadataInMemory(buffer, originalName);
}

export async function confirmMetadata(tables: ConfirmTableInput[]): Promise<string[]> {
  const createdIds: string[] = [];

  for (const tableInput of tables) {
    // Create table in database
    const table = await repository.createTable(tableInput);
    createdIds.push(table.id);

    // Generate and save dictionary file
    const dictionaryPath = await saveDictionaryFile(table);
    await repository.updateTableDictionaryPath(table.id, dictionaryPath);
  }

  logger.info('Metadata confirmed', { tableCount: createdIds.length, tableIds: createdIds });
  return createdIds;
}

/**
 * Confirm metadata with file upload (delayed persistence).
 * Saves the file first, then creates metadata entries with the actual file paths.
 */
export async function confirmMetadataWithFile(
  buffer: Buffer,
  originalName: string,
  tables: ConfirmTableInput[]
): Promise<string[]> {
  // First save the file
  const uploadResult = await processUploadedFile(buffer, originalName);

  // Map each table to its corresponding saved file
  const createdIds: string[] = [];

  for (let i = 0; i < tables.length; i++) {
    const tableInput = tables[i];
    const savedFileName = uploadResult.savedFiles[i];

    if (!savedFileName) {
      logger.warn('No saved file for table index', { index: i, tableInput });
      continue;
    }

    // Update dataFilePath with actual saved file path
    const tableWithPath: ConfirmTableInput = {
      ...tableInput,
      dataFilePath: `${uploadResult.directory}/${savedFileName}`,
    };

    // Create table in database
    const table = await repository.createTable(tableWithPath);
    createdIds.push(table.id);

    // Generate and save dictionary file
    const dictionaryPath = await saveDictionaryFile(table);
    await repository.updateTableDictionaryPath(table.id, dictionaryPath);
  }

  logger.info('Metadata confirmed with file', {
    tableCount: createdIds.length,
    tableIds: createdIds,
    originalName,
  });

  return createdIds;
}

export async function listTables(): Promise<TableMetadata[]> {
  return repository.findAllTables();
}

export async function listDatasourcesWithTables(): Promise<DatasourceWithTables[]> {
  return repository.findAllDatasourcesWithTables();
}

export async function getTable(id: string): Promise<TableWithColumns> {
  const table = await repository.findTableById(id);
  if (!table) {
    throw new MetadataNotFoundError('Table not found', { id });
  }
  return table;
}

export async function getDictionaryContent(id: string): Promise<string> {
  const table = await repository.findTableById(id);
  if (!table) {
    throw new MetadataNotFoundError('Table not found', { id });
  }

  if (!table.dictionaryPath) {
    throw new MetadataNotFoundError('Dictionary file not found for table', { id });
  }

  return readDictionaryFile(table.dictionaryPath);
}

export async function updateTable(id: string, input: UpdateTableInput): Promise<TableWithColumns> {
  const existingTable = await repository.findTableById(id);
  if (!existingTable) {
    throw new MetadataNotFoundError('Table not found', { id });
  }

  const updatedTable = await repository.updateTable(id, input);
  if (!updatedTable) {
    throw new MetadataNotFoundError('Table not found after update', { id });
  }

  // Update dictionary file
  if (existingTable.dictionaryPath) {
    const newPath = await updateDictionaryFile(updatedTable, existingTable.dictionaryPath);
    if (newPath !== existingTable.dictionaryPath) {
      await repository.updateTableDictionaryPath(id, newPath);
      updatedTable.dictionaryPath = newPath;
    }
  } else {
    const dictionaryPath = await saveDictionaryFile(updatedTable);
    await repository.updateTableDictionaryPath(id, dictionaryPath);
    updatedTable.dictionaryPath = dictionaryPath;
  }

  return updatedTable;
}

export async function deleteTable(id: string): Promise<void> {
  const table = await repository.findTableById(id);
  if (!table) {
    throw new MetadataNotFoundError('Table not found', { id });
  }

  // Delete dictionary file
  if (table.dictionaryPath) {
    await deleteDictionaryFile(table.dictionaryPath);
  }

  // Delete data file
  if (table.dataFilePath) {
    const dataFilePath = path.join(config.upload.directory, table.dataFilePath);
    try {
      if (fs.existsSync(dataFilePath)) {
        await fs.promises.unlink(dataFilePath);
        logger.info('Data file deleted', { path: table.dataFilePath });
      }
    } catch (error) {
      logger.warn('Failed to delete data file', {
        path: table.dataFilePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Delete from database (columns will cascade delete)
  await repository.deleteTable(id);

  logger.info('Table and associated files deleted', {
    id,
    physicalName: table.physicalName,
  });
}

const BACKTICK_DBS = new Set(['mysql', 'mariadb', 'tidb', 'clickhouse', 'starrocks']);

function escapeIdentifier(name: string, dbType?: string): string {
  if (dbType && BACKTICK_DBS.has(dbType)) {
    return `\`${name.replace(/`/g, '``')}\``;
  }
  if (dbType === 'sqlserver') {
    return `[${name.replace(/]/g, ']]')}]`;
  }
  // postgresql, oracle, db2, saphana, kingbase, dameng, trino, prestodb, hive2, spark
  return `"${name.replace(/"/g, '""')}"`;
}

const datasourceTypeMap: Record<string, string> = {
  postgresql: 'postgresql',
  mysql: 'mysql',
  sqlite: 'sqlite',
  sqlserver: 'sqlserver',
  mariadb: 'mariadb',
  oracle: 'oracle',
  db2: 'db2',
  saphana: 'saphana',
  kingbase: 'kingbase',
  clickhouse: 'clickhouse',
  spark: 'spark',
  hive2: 'hive2',
  starrocks: 'starrocks',
  trino: 'trino',
  prestodb: 'prestodb',
  tidb: 'tidb',
  dameng: 'dameng',
};

export async function getTablePreview(id: string, limit: number): Promise<PreviewData> {
  const table = await repository.findTableById(id);
  if (!table) {
    throw new MetadataNotFoundError('Table not found', { id });
  }

  const tableType = table.type;

  if (tableType === TableSourceTypeValues.CSV || tableType === TableSourceTypeValues.EXCEL) {
    if (!table.dataFilePath) {
      throw new MetadataNotFoundError('Data file not found for table', { id });
    }

    const absolutePath = path.join(config.upload.directory, table.dataFilePath);

    if (!fs.existsSync(absolutePath)) {
      throw new MetadataNotFoundError('Data file does not exist', { id, path: table.dataFilePath });
    }

    const rawBuffer = fs.readFileSync(absolutePath);
    // CSV files (including Excel uploads saved as CSV): XLSX.read with type:'buffer'
    // treats bytes as Latin-1, mangling UTF-8/GBK Chinese. Convert to string first.
    // Real .xlsx files must use type:'buffer' (they are ZIP archives, not text).
    const isTextFile = absolutePath.endsWith('.csv');
    const workbook = isTextFile
      ? XLSX.read(convertToUtf8(rawBuffer), { type: 'string' })
      : XLSX.read(rawBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

    if (data.length === 0) {
      return { columns: [], rows: [], totalRows: 0 };
    }

    const headerRow = data[0] as (string | number)[];
    const columns = headerRow.map((h) => String(h));
    const totalRows = data.length - 1;

    const rows: Record<string, unknown>[] = [];
    const rowEnd = Math.min(data.length, limit + 1);
    for (let i = 1; i < rowEnd; i++) {
      const row = data[i] as unknown[];
      const record: Record<string, unknown> = {};
      for (let j = 0; j < columns.length; j++) {
        record[columns[j]] = row[j] ?? null;
      }
      rows.push(record);
    }

    logger.info('File table preview generated', { id, totalRows, returnedRows: rows.length });

    return { columns, rows, totalRows };
  }

  // Database-backed table
  if (!table.datasourceId) {
    throw new MetadataNotFoundError('Datasource not found for table', { id });
  }

  const datasource = await repository.findDatasourceById(table.datasourceId);
  if (!datasource) {
    throw new MetadataNotFoundError('Datasource not found', { id: table.datasourceId });
  }

  const dsType = datasourceTypeMap[datasource.type];
  if (!dsType) {
    throw new MetadataNotFoundError('Unknown datasource type', { type: datasource.type });
  }

  const rawPassword = await repository.getDatasourceRawPassword(table.datasourceId);
  const password = rawPassword ? decryptPassword(rawPassword) : undefined;

  const dsConfig: DatasourceConfig = {
    type: dsType as DatasourceType,
    host: datasource.host ?? undefined,
    port: datasource.port ?? undefined,
    database: datasource.database ?? '',
    user: datasource.user ?? undefined,
    password,
    filepath:
      datasource.filePath && dsType === 'sqlite' && !path.isAbsolute(datasource.filePath)
        ? path.join(config.upload.directory, datasource.filePath)
        : (datasource.filePath ?? undefined),
    schema: datasource.schema ?? undefined,
    properties: datasource.properties
      ? (JSON.parse(datasource.properties) as Record<string, string>)
      : undefined,
  };

  const ds = DatasourceFactory.getOrCreateDatasource(dsConfig);
  if (!ds.isConnected) {
    await ds.connect();
  }

  const escapedName = escapeIdentifier(table.physicalName, datasource.type);
  const dataResult = await ds.executeQuery(`SELECT * FROM ${escapedName} LIMIT ${limit}`);
  const countResult = await ds.executeQuery(`SELECT COUNT(*) AS count FROM ${escapedName}`);

  const columns = dataResult.fields.map((f) => f.name);
  const totalRows = Number(countResult.rows[0]?.count ?? 0);

  logger.info('Database table preview generated', {
    id,
    totalRows,
    returnedRows: dataResult.rows.length,
  });

  return { columns, rows: dataResult.rows, totalRows };
}
