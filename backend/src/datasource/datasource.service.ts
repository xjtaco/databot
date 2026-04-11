import crypto from 'crypto';
import { bridgeClient } from './bridgeClient';
import { mapVendorType } from './typeMapper';
import {
  createDatasource,
  createTable,
  deleteDatasource,
  findDatasourceById,
  findDatasourceByConnection,
  findTablesByDatasourceId,
  getDatasourceRawPassword,
  updateTableDictionaryPath,
} from '../table/table.repository';
import { encryptPassword, isPasswordMask } from '../utils/encryption';
import {
  saveDatabaseDictionaryFile,
  saveDatabaseConfigIni,
  deleteDatabaseDictionary,
} from '../table/dictionaryGenerator';
import { DatasourceConnectionError, DatasourceDuplicateError } from '../errors/types';
import logger from '../utils/logger';
import type { DatabaseConnectionConfig } from './datasource.types';

interface DatasourceResult {
  datasourceId: string;
  databaseName: string;
  tableIds: string[];
}

export async function createDatasourceFromConfig(
  config: DatabaseConnectionConfig,
  createdBy?: string
): Promise<DatasourceResult> {
  // 0. Check for duplicate datasource
  const existing = await findDatasourceByConnection(
    config.dbType,
    config.host,
    config.port,
    config.database,
    config.schema
  );
  if (existing) {
    throw new DatasourceDuplicateError(`Datasource already exists: ${existing.name}`, {
      existingId: existing.id,
      existingName: existing.name,
    });
  }

  // 1. Test connection via Bridge
  await bridgeClient.testConnection(config);

  // 2. Register temp connection with Bridge for metadata extraction
  const tempId = crypto.randomUUID();
  await bridgeClient.registerConnection(tempId, config);

  try {
    // 3. Get tables from Bridge
    const tables = await bridgeClient.getTables(tempId, config.schema);

    if (tables.length === 0) {
      throw new DatasourceConnectionError('No tables found in database', {
        database: config.database,
      });
    }

    // 4. Encrypt password
    const encryptedPassword = encryptPassword(config.password);

    // 5. Create datasource record
    //    Name format: host:port/database
    const datasourceName = `${config.host}:${config.port}/${config.database}`;
    const datasource = await createDatasource({
      name: datasourceName,
      type: config.dbType,
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: encryptedPassword,
      schema: config.schema,
      properties: config.properties ? JSON.stringify(config.properties) : undefined,
      createdBy,
    });

    // 6. Save config.ini
    await saveDatabaseConfigIni(datasource.name, {
      dbType: config.dbType,
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      encryptedPassword,
      datasourceId: datasource.id,
    });

    // 7. For each table, get columns and create records
    const tableIds: string[] = [];

    for (const tableInfo of tables) {
      const columns = await bridgeClient.getColumns(tempId, tableInfo.name, config.schema);

      // Schema-qualified physical name
      const physicalName = tableInfo.schema
        ? `${tableInfo.schema}.${tableInfo.name}`
        : tableInfo.name;

      const tableWithColumns = await createTable({
        displayName: tableInfo.name,
        physicalName,
        type: config.dbType,
        datasourceId: datasource.id,
        columns: columns.map((col, index) => ({
          displayName: col.name,
          physicalName: col.name,
          dataType: mapVendorType(config.dbType, col.type),
          columnOrder: index,
        })),
      });

      // Save dictionary file
      const dictionaryPath = await saveDatabaseDictionaryFile(tableWithColumns, datasource.name);
      await updateTableDictionaryPath(tableWithColumns.id, dictionaryPath);

      tableIds.push(tableWithColumns.id);
    }

    logger.info('Datasource created', {
      datasourceId: datasource.id,
      databaseName: datasource.name,
      dbType: config.dbType,
      tableCount: tableIds.length,
    });

    return {
      datasourceId: datasource.id,
      databaseName: datasource.name,
      tableIds,
    };
  } finally {
    // Clean up temp Bridge connection
    await bridgeClient.destroyConnection(tempId).catch(() => {});
  }
}

export async function updateDatasourceFromConfig(
  id: string,
  config: DatabaseConnectionConfig
): Promise<DatasourceResult> {
  const existingDatasource = await findDatasourceById(id);
  if (!existingDatasource) {
    throw new DatasourceConnectionError('Datasource not found', { id });
  }

  // Handle password mask
  let effectiveConfig = config;
  if (isPasswordMask(config.password)) {
    const originalEncryptedPassword = await getDatasourceRawPassword(id);
    if (!originalEncryptedPassword) {
      throw new DatasourceConnectionError('Original password not found', { id });
    }
    const { decryptPassword } = await import('../utils/encryption');
    const decryptedPassword = decryptPassword(originalEncryptedPassword);
    effectiveConfig = { ...config, password: decryptedPassword };
  }

  // Test connection BEFORE destructive operations
  await bridgeClient.testConnection(effectiveConfig);

  // Delete existing
  await deleteDatabaseDictionary(existingDatasource.name);
  await deleteDatasource(id);

  // Create new with updated config
  return createDatasourceFromConfig(effectiveConfig);
}

export async function deleteDatasourceById(id: string): Promise<void> {
  const datasource = await findDatasourceById(id);
  if (!datasource) {
    throw new DatasourceConnectionError('Datasource not found', { id });
  }

  const tables = await findTablesByDatasourceId(id);
  await deleteDatabaseDictionary(datasource.name);
  await deleteDatasource(id);

  logger.info('Datasource deleted', {
    id,
    name: datasource.name,
    tableCount: tables.length,
  });
}
