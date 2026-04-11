import * as fs from 'fs';
import * as path from 'path';
import { config } from '../base/config';
import { TableWithColumns } from './table.types';
import { DictionaryError } from '../errors/types';
import logger from '../utils/logger';

const FILES_SUBDIR = 'files';

const DB_TYPE_LABELS: Record<string, string> = {
  csv: '文件',
  excel: '文件',
  sqlite: 'SQLite',
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  sqlserver: 'SQL Server',
  mariadb: 'MariaDB',
  oracle: 'Oracle',
  db2: 'DB2',
  saphana: 'SAP HANA',
  kingbase: 'KingBase',
  clickhouse: 'ClickHouse',
  spark: 'Apache Spark',
  hive2: 'Apache Hive',
  starrocks: 'StarRocks',
  trino: 'Trino',
  prestodb: 'PrestoDB',
  tidb: 'TiDB',
  dameng: '达梦',
};

function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sanitizeFilename(name: string): string {
  // Remove characters that are unsafe for filenames
  return name.replace(/[/\\:*?"<>|]/g, '_').trim();
}

function getUniqueFilename(directory: string, basename: string): string {
  let filename = `${basename}.md`;
  let counter = 1;

  while (fs.existsSync(path.join(directory, filename))) {
    filename = `${basename}_${counter}.md`;
    counter++;
  }

  return filename;
}

export function generateDictionaryContent(table: TableWithColumns): string {
  const lines: string[] = [];

  lines.push(`# ${table.displayName}`);
  lines.push('');
  lines.push(`**物理表名**: ${table.physicalName}`);
  lines.push('');

  // 添加数据来源类型
  const sourceLabel = DB_TYPE_LABELS[table.type];
  if (sourceLabel) {
    lines.push(`**数据来源**: ${sourceLabel}`);
    lines.push('');
  }

  // 添加数据文件路径
  if (table.dataFilePath) {
    lines.push(`**文件路径**: ${table.dataFilePath}`);
    lines.push('');
  }

  if (table.description) {
    lines.push(`**描述**: ${table.description}`);
  } else {
    lines.push('**描述**: (无)');
  }
  lines.push('');

  lines.push('## 字段列表');
  lines.push('');
  lines.push('| 字段名 | 物理名 | 类型 | 描述 |');
  lines.push('|--------|--------|------|------|');

  const sortedColumns = [...table.columns].sort((a, b) => a.columnOrder - b.columnOrder);

  for (const column of sortedColumns) {
    const description = column.description || '-';
    lines.push(
      `| ${column.displayName} | ${column.physicalName} | ${column.dataType} | ${description} |`
    );
  }

  lines.push('');
  return lines.join('\n');
}

export function generateDictionaryFilename(table: TableWithColumns): string {
  const sanitizedPhysical = sanitizeFilename(table.physicalName);
  const sanitizedDisplay = sanitizeFilename(table.displayName);
  return `${sanitizedPhysical}_${sanitizedDisplay}`;
}

export async function saveDictionaryFile(table: TableWithColumns): Promise<string> {
  try {
    const filesDir = path.join(config.data_dictionary_folder, FILES_SUBDIR);
    ensureDirectoryExists(filesDir);

    const basename = generateDictionaryFilename(table);
    const filename = getUniqueFilename(filesDir, basename);
    const filePath = path.join(filesDir, filename);

    const content = generateDictionaryContent(table);
    await fs.promises.writeFile(filePath, content, 'utf-8');

    // Return relative path from data_dictionary_folder
    const relativePath = path.join(FILES_SUBDIR, filename);

    logger.info('Dictionary file saved', {
      tableId: table.id,
      physicalName: table.physicalName,
      path: relativePath,
    });

    return relativePath;
  } catch (error) {
    throw new DictionaryError(
      'Failed to save dictionary file',
      { tableId: table.id, physicalName: table.physicalName },
      error instanceof Error ? error : undefined
    );
  }
}

export async function updateDictionaryFile(
  table: TableWithColumns,
  existingPath: string
): Promise<string> {
  try {
    const fullPath = path.join(config.data_dictionary_folder, existingPath);

    // If file exists, update it in place
    if (fs.existsSync(fullPath)) {
      const content = generateDictionaryContent(table);
      await fs.promises.writeFile(fullPath, content, 'utf-8');

      logger.info('Dictionary file updated', {
        tableId: table.id,
        physicalName: table.physicalName,
        path: existingPath,
      });

      return existingPath;
    }

    // If file doesn't exist, create a new one
    return saveDictionaryFile(table);
  } catch (error) {
    throw new DictionaryError(
      'Failed to update dictionary file',
      { tableId: table.id, path: existingPath },
      error instanceof Error ? error : undefined
    );
  }
}

export async function readDictionaryFile(dictionaryPath: string): Promise<string> {
  try {
    const fullPath = path.join(config.data_dictionary_folder, dictionaryPath);

    if (!fs.existsSync(fullPath)) {
      throw new DictionaryError('Dictionary file not found', { path: dictionaryPath });
    }

    const content = await fs.promises.readFile(fullPath, 'utf-8');
    return content;
  } catch (error) {
    if (error instanceof DictionaryError) {
      throw error;
    }
    throw new DictionaryError(
      'Failed to read dictionary file',
      { path: dictionaryPath },
      error instanceof Error ? error : undefined
    );
  }
}

export async function deleteDictionaryFile(dictionaryPath: string): Promise<void> {
  try {
    const fullPath = path.join(config.data_dictionary_folder, dictionaryPath);

    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
      logger.info('Dictionary file deleted', { path: dictionaryPath });
    }
  } catch (error) {
    logger.warn('Failed to delete dictionary file', {
      path: dictionaryPath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// SQLite database dictionary functions

export async function saveSqliteDictionaryFile(
  table: TableWithColumns,
  databaseName: string
): Promise<string> {
  try {
    const databaseDir = path.join(config.data_dictionary_folder, databaseName);
    ensureDirectoryExists(databaseDir);

    const basename = generateDictionaryFilename(table);
    const filename = getUniqueFilename(databaseDir, basename);
    const filePath = path.join(databaseDir, filename);

    const content = generateDictionaryContent(table);
    await fs.promises.writeFile(filePath, content, 'utf-8');

    // Return relative path from data_dictionary_folder
    const relativePath = path.join(databaseName, filename);

    logger.info('SQLite dictionary file saved', {
      tableId: table.id,
      physicalName: table.physicalName,
      databaseName,
      path: relativePath,
    });

    return relativePath;
  } catch (error) {
    throw new DictionaryError(
      'Failed to save SQLite dictionary file',
      { tableId: table.id, physicalName: table.physicalName, databaseName },
      error instanceof Error ? error : undefined
    );
  }
}

export function generateConfigIni(
  database: string,
  filePath: string,
  datasourceId: string
): string {
  const lines: string[] = [
    '[database]',
    `type = sqlite`,
    `database = ${database}`,
    `file_path = ${filePath}`,
    `datasource_id = ${datasourceId}`,
  ];
  return lines.join('\n');
}

export async function saveConfigIni(
  databaseName: string,
  filePath: string,
  datasourceId: string
): Promise<string> {
  try {
    const databaseDir = path.join(config.data_dictionary_folder, databaseName);
    ensureDirectoryExists(databaseDir);

    const configPath = path.join(databaseDir, 'config.ini');
    const content = generateConfigIni(databaseName, filePath, datasourceId);
    await fs.promises.writeFile(configPath, content, 'utf-8');

    logger.info('Config.ini saved', { databaseName, configPath });

    return path.join(databaseName, 'config.ini');
  } catch (error) {
    throw new DictionaryError(
      'Failed to save config.ini',
      { databaseName },
      error instanceof Error ? error : undefined
    );
  }
}

export async function deleteDatabaseDictionary(databaseName: string): Promise<void> {
  try {
    const databaseDir = path.join(config.data_dictionary_folder, databaseName);

    if (fs.existsSync(databaseDir)) {
      await fs.promises.rm(databaseDir, { recursive: true, force: true });
      logger.info('Database dictionary directory deleted', { databaseName });
    }
  } catch (error) {
    logger.warn('Failed to delete database dictionary directory', {
      databaseName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// PostgreSQL database dictionary functions

/** @deprecated Use DatabaseConfigParams instead */
export type PostgresConfigParams = DatabaseConfigParams;

export interface DatabaseConfigParams {
  dbType: string;
  host: string;
  port: number;
  database: string;
  user: string;
  encryptedPassword: string;
  datasourceId: string;
}

export function generateDatabaseConfigIni(params: DatabaseConfigParams): string {
  const lines: string[] = [
    '[database]',
    `type = ${params.dbType}`,
    `host = ${params.host}`,
    `port = ${params.port}`,
    `database = ${params.database}`,
    `user = ${params.user}`,
    `password = ${params.encryptedPassword}`,
    `datasource_id = ${params.datasourceId}`,
  ];
  return lines.join('\n');
}

/** @deprecated Use generateDatabaseConfigIni instead */
export const generatePostgresConfigIni = generateDatabaseConfigIni;

export async function saveDatabaseConfigIni(
  databaseName: string,
  params: DatabaseConfigParams
): Promise<string> {
  try {
    const databaseDir = path.join(config.data_dictionary_folder, databaseName);
    ensureDirectoryExists(databaseDir);

    const configPath = path.join(databaseDir, 'config.ini');
    const content = generateDatabaseConfigIni(params);
    await fs.promises.writeFile(configPath, content, 'utf-8');

    logger.info('Database config.ini saved', { databaseName, configPath });

    return path.join(databaseName, 'config.ini');
  } catch (error) {
    throw new DictionaryError(
      'Failed to save Database config.ini',
      { databaseName },
      error instanceof Error ? error : undefined
    );
  }
}

/** @deprecated Use saveDatabaseConfigIni instead */
export const savePostgresConfigIni = saveDatabaseConfigIni;

export async function saveDatabaseDictionaryFile(
  table: TableWithColumns,
  databaseName: string
): Promise<string> {
  try {
    const databaseDir = path.join(config.data_dictionary_folder, databaseName);
    ensureDirectoryExists(databaseDir);

    const basename = generateDictionaryFilename(table);
    const filename = getUniqueFilename(databaseDir, basename);
    const filePath = path.join(databaseDir, filename);

    const content = generateDictionaryContent(table);
    await fs.promises.writeFile(filePath, content, 'utf-8');

    // Return relative path from data_dictionary_folder
    const relativePath = path.join(databaseName, filename);

    logger.info('Database dictionary file saved', {
      tableId: table.id,
      physicalName: table.physicalName,
      databaseName,
      path: relativePath,
    });

    return relativePath;
  } catch (error) {
    throw new DictionaryError(
      'Failed to save Database dictionary file',
      { tableId: table.id, physicalName: table.physicalName, databaseName },
      error instanceof Error ? error : undefined
    );
  }
}

/** @deprecated Use saveDatabaseDictionaryFile instead */
export const savePostgresDictionaryFile = saveDatabaseDictionaryFile;
