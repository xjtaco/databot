import * as fs from 'fs';
import * as path from 'path';
import { config } from '../base/config';
import { SqliteParseError } from '../errors/types';
import { parseSqliteFile, validateSqliteFile } from './sqliteParser';
import { SqliteUploadResult } from './sqlite.types';
import {
  createDatasource,
  createTable,
  deleteDatasource,
  findDatasourceById,
  findTablesByDatasourceId,
} from '../table/table.repository';
import {
  saveSqliteDictionaryFile,
  saveConfigIni,
  deleteDatabaseDictionary,
} from '../table/dictionaryGenerator';
import { updateTableDictionaryPath } from '../table/table.repository';
import { TableSourceTypeValues } from '../table/table.types';
import logger from '../utils/logger';
import {
  getTodayDateDir,
  ensureDirectoryExists,
  getFileBasename,
  getFileExtension,
  getUniqueFilename,
} from '../utils/fileHelpers';

function generateDatabaseName(originalName: string): string {
  // Remove extension and sanitize for use as database name
  const basename = path.basename(originalName, path.extname(originalName));
  return basename
    .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export async function uploadSqliteFile(
  buffer: Buffer,
  originalName: string
): Promise<SqliteUploadResult> {
  // Save file to disk first (better-sqlite3 requires file path)
  const dateDir = getTodayDateDir();
  const uploadDir = path.join(config.upload.directory, dateDir);
  ensureDirectoryExists(uploadDir);

  const basename = getFileBasename(originalName);
  const extension = getFileExtension(originalName);
  const filename = getUniqueFilename(uploadDir, basename, extension);
  const filePath = path.join(uploadDir, filename);

  try {
    await fs.promises.writeFile(filePath, buffer);
    logger.info('SQLite file saved', { filePath, size: buffer.length });

    // Validate SQLite file
    if (!validateSqliteFile(filePath)) {
      throw new SqliteParseError('Invalid SQLite database file', { originalName });
    }

    // Parse SQLite file to extract tables and columns
    const parsedTables = parseSqliteFile(filePath);

    if (parsedTables.length === 0) {
      throw new SqliteParseError('No tables found in SQLite database', { originalName });
    }

    // Generate database name from filename
    const databaseName = generateDatabaseName(originalName);

    // Relative path from upload directory
    const relativeFilePath = path.join(dateDir, filename);

    // Create datasource record
    const datasource = await createDatasource({
      name: databaseName,
      type: TableSourceTypeValues.SQLITE,
      filePath: relativeFilePath,
      database: databaseName,
    });

    // Save config.ini for the database
    await saveConfigIni(datasource.name, relativeFilePath, datasource.id);

    // Create table records and dictionary files
    const tableIds: string[] = [];

    for (const parsedTable of parsedTables) {
      // Create table record with datasource_id
      const tableWithColumns = await createTable({
        displayName: parsedTable.displayName,
        physicalName: parsedTable.physicalName,
        type: TableSourceTypeValues.SQLITE,
        datasourceId: datasource.id,
        dataFilePath: relativeFilePath,
        columns: parsedTable.columns,
      });

      // Save dictionary file in database-specific directory
      const dictionaryPath = await saveSqliteDictionaryFile(tableWithColumns, datasource.name);
      await updateTableDictionaryPath(tableWithColumns.id, dictionaryPath);

      tableIds.push(tableWithColumns.id);
    }

    logger.info('SQLite upload completed', {
      datasourceId: datasource.id,
      databaseName: datasource.name,
      tableCount: tableIds.length,
      tableIds,
    });

    return {
      datasourceId: datasource.id,
      databaseName: datasource.name,
      tableIds,
    };
  } catch (error) {
    // Clean up saved file on error
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (cleanupError) {
      logger.warn('Failed to clean up SQLite file after error', {
        filePath,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    }

    if (error instanceof SqliteParseError) {
      throw error;
    }

    throw new SqliteParseError(
      'Failed to upload SQLite database',
      { originalName },
      error instanceof Error ? error : undefined
    );
  }
}

export async function deleteDatasourceWithFiles(id: string): Promise<void> {
  // Get datasource info
  const datasource = await findDatasourceById(id);
  if (!datasource) {
    throw new SqliteParseError('Datasource not found', { id });
  }

  // Get all tables for this datasource
  const tables = await findTablesByDatasourceId(id);

  // Delete dictionary directory for the database
  await deleteDatabaseDictionary(datasource.name);

  // Delete the SQLite file if it exists
  if (datasource.filePath) {
    const fullFilePath = path.join(config.upload.directory, datasource.filePath);
    try {
      if (fs.existsSync(fullFilePath)) {
        await fs.promises.unlink(fullFilePath);
        logger.info('SQLite file deleted', { filePath: fullFilePath });
      }
    } catch (error) {
      logger.warn('Failed to delete SQLite file', {
        filePath: fullFilePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Delete datasource (tables are deleted via CASCADE)
  await deleteDatasource(id);

  logger.info('Datasource with files deleted', {
    id,
    name: datasource.name,
    tableCount: tables.length,
  });
}
