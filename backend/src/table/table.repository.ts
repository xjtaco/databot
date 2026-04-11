import { Prisma, PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../infrastructure/database';
import {
  TableMetadata,
  ColumnMetadata,
  TableWithColumns,
  ConfirmTableInput,
  UpdateTableInput,
  FieldDataType,
  TableSourceType,
  DatasourceMetadata,
  CreateDatasourceInput,
  DatasourceWithTables,
} from './table.types';
import logger from '../utils/logger';
import { PASSWORD_MASK } from '../utils/encryption';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
type PrismaTable = Prisma.TableGetPayload<object>;
type PrismaColumn = Prisma.ColumnGetPayload<object>;
type PrismaDatasource = Prisma.DatasourceGetPayload<object>;
type PrismaTableWithColumns = Prisma.TableGetPayload<{ include: { columns: true } }>;
type PrismaDatasourceWithTables = Prisma.DatasourceGetPayload<{ include: { tables: true } }>;

interface PrismaKnownError {
  code: string;
  meta?: Record<string, unknown>;
}

function isPrismaKnownError(error: unknown, code: string): error is PrismaKnownError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as PrismaKnownError).code === code
  );
}

/** Check whether a P2002 meta contains the given field in its constraint info */
export function metaHasUniqueField(
  meta: Record<string, unknown> | undefined,
  field: string
): boolean {
  if (!meta) return false;
  // Prisma v5: meta.target is string[] or string
  const target = meta.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === 'string') return target.includes(field);
  // Prisma v7 with driver adapter: meta.driverAdapterError.cause.constraint.fields
  const dae = meta.driverAdapterError;
  if (dae && typeof dae === 'object') {
    const cause = (dae as Record<string, unknown>).cause;
    if (cause && typeof cause === 'object') {
      const constraint = (cause as Record<string, unknown>).constraint;
      if (constraint && typeof constraint === 'object') {
        const fields = (constraint as Record<string, unknown>).fields;
        if (Array.isArray(fields)) return fields.includes(field);
      }
    }
  }
  return false;
}

function mapTable(table: PrismaTable): TableMetadata {
  return {
    id: table.id,
    displayName: table.displayName,
    physicalName: table.physicalName,
    description: table.description ?? undefined,
    type: table.type as TableSourceType,
    datasourceId: table.datasourceId ?? undefined,
    dictionaryPath: table.dictionaryPath ?? undefined,
    dataFilePath: table.dataFilePath ?? undefined,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
  };
}

function mapColumn(column: PrismaColumn): ColumnMetadata {
  return {
    id: column.id,
    tableId: column.tableId,
    displayName: column.displayName,
    physicalName: column.physicalName,
    description: column.description ?? undefined,
    dataType: column.dataType as FieldDataType,
    columnOrder: column.columnOrder,
    createdAt: column.createdAt,
    updatedAt: column.updatedAt,
  };
}

function mapTableWithColumns(table: PrismaTableWithColumns): TableWithColumns {
  return {
    ...mapTable(table),
    columns: table.columns.map(mapColumn),
  };
}

function mapDatasource(datasource: PrismaDatasource): DatasourceMetadata {
  return {
    id: datasource.id,
    name: datasource.name,
    type: datasource.type as TableSourceType,
    filePath: datasource.filePath ?? undefined,
    host: datasource.host ?? undefined,
    port: datasource.port ?? undefined,
    database: datasource.database ?? undefined,
    user: datasource.user ?? undefined,
    // Return password mask instead of actual password for API responses
    password: datasource.password ? PASSWORD_MASK : undefined,
    schema: datasource.schema ?? null,
    properties: datasource.properties ?? null,
    createdAt: datasource.createdAt,
    updatedAt: datasource.updatedAt,
  };
}

export async function findAllTables(): Promise<TableMetadata[]> {
  const prisma = getPrismaClient();
  const tables = await prisma.table.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  return tables.map(mapTable);
}

export async function findTableById(id: string): Promise<TableWithColumns | null> {
  const prisma = getPrismaClient();
  const table = await prisma.table.findUnique({
    where: { id },
    include: {
      columns: {
        orderBy: { columnOrder: 'asc' },
      },
    },
  });

  if (!table) {
    return null;
  }

  return mapTableWithColumns(table);
}

export async function findTableByPhysicalName(physicalName: string): Promise<TableMetadata | null> {
  const prisma = getPrismaClient();
  const table = await prisma.table.findFirst({
    where: { physicalName },
  });
  return table ? mapTable(table) : null;
}

const MAX_RETRY_ATTEMPTS = 10;

async function insertTableWithUniqueName(
  tx: TransactionClient,
  input: ConfirmTableInput
): Promise<PrismaTableWithColumns> {
  let physicalName = input.physicalName;
  let counter = 0;

  while (counter < MAX_RETRY_ATTEMPTS) {
    try {
      const table = await tx.table.create({
        data: {
          displayName: input.displayName,
          physicalName,
          description: input.description ?? null,
          type: input.type,
          datasourceId: input.datasourceId ?? null,
          dataFilePath: input.dataFilePath ?? null,
          columns: {
            create: input.columns.map((col) => ({
              displayName: col.displayName,
              physicalName: col.physicalName,
              description: col.description ?? null,
              dataType: col.dataType,
              columnOrder: col.columnOrder,
            })),
          },
        },
        include: {
          columns: {
            orderBy: { columnOrder: 'asc' },
          },
        },
      });
      return table;
    } catch (error: unknown) {
      if (isPrismaKnownError(error, 'P2002') && metaHasUniqueField(error.meta, 'physical_name')) {
        counter++;
        physicalName = `${input.physicalName}_${counter}`;
        logger.debug('Physical name collision, retrying with suffix', { physicalName, counter });
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Failed to generate unique physical name after ${MAX_RETRY_ATTEMPTS} attempts`);
}

export async function createTable(input: ConfirmTableInput): Promise<TableWithColumns> {
  const prisma = getPrismaClient();
  const table = await prisma.$transaction(async (tx) => {
    return insertTableWithUniqueName(tx, input);
  });

  logger.info('Table created', {
    id: table.id,
    physicalName: table.physicalName,
    type: table.type,
    columnCount: table.columns.length,
  });

  return mapTableWithColumns(table);
}

export async function updateTable(
  id: string,
  input: UpdateTableInput
): Promise<TableWithColumns | null> {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx: TransactionClient) => {
    // Check if table exists
    const existingTable = await tx.table.findUnique({ where: { id } });
    if (!existingTable) {
      return null;
    }

    // Update table fields if provided
    if (input.displayName !== undefined || input.description !== undefined) {
      const updateData: Prisma.TableUpdateInput = {};

      if (input.displayName !== undefined) {
        updateData.displayName = input.displayName;
      }
      if (input.description !== undefined) {
        updateData.description = input.description ?? null;
      }

      await tx.table.update({
        where: { id },
        data: updateData,
      });
    }

    // Update columns if provided
    if (input.columns && input.columns.length > 0) {
      for (const col of input.columns) {
        const updateData: Prisma.ColumnUpdateInput = {};

        if (col.displayName !== undefined) {
          updateData.displayName = col.displayName;
        }
        if (col.description !== undefined) {
          updateData.description = col.description ?? null;
        }
        if (col.dataType !== undefined) {
          updateData.dataType = col.dataType;
        }

        if (Object.keys(updateData).length > 0) {
          await tx.column.update({
            where: { id: col.id },
            data: updateData,
          });
        }
      }
    }

    logger.info('Table updated', { id });

    // Return updated table with columns
    const updatedTable = await tx.table.findUnique({
      where: { id },
      include: {
        columns: {
          orderBy: { columnOrder: 'asc' },
        },
      },
    });

    return updatedTable ? mapTableWithColumns(updatedTable) : null;
  });
}

export async function updateTableDictionaryPath(id: string, dictionaryPath: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.table.update({
    where: { id },
    data: { dictionaryPath },
  });
}

export async function deleteTable(id: string): Promise<TableMetadata | null> {
  const prisma = getPrismaClient();

  try {
    const table = await prisma.table.delete({
      where: { id },
    });

    logger.info('Table deleted', { id, physicalName: table.physicalName });
    return mapTable(table);
  } catch (error: unknown) {
    if (isPrismaKnownError(error, 'P2025')) {
      return null;
    }
    throw error;
  }
}

// Datasource-related functions

export async function findDatasourceByName(name: string): Promise<DatasourceMetadata | null> {
  const prisma = getPrismaClient();
  const datasource = await prisma.datasource.findUnique({
    where: { name },
  });
  return datasource ? mapDatasource(datasource) : null;
}

export async function findDatasourceById(id: string): Promise<DatasourceMetadata | null> {
  const prisma = getPrismaClient();
  const datasource = await prisma.datasource.findUnique({
    where: { id },
  });
  return datasource ? mapDatasource(datasource) : null;
}

/**
 * Get the raw encrypted password for a datasource (internal use only)
 * This bypasses the password masking in mapDatasource()
 */
export async function getDatasourceRawPassword(id: string): Promise<string | null> {
  const prisma = getPrismaClient();
  const datasource = await prisma.datasource.findUnique({
    where: { id },
    select: { password: true },
  });
  return datasource?.password ?? null;
}

export async function findDatasourceByConnection(
  type: string,
  host: string,
  port: number,
  database: string,
  schema?: string
): Promise<DatasourceMetadata | null> {
  const prisma = getPrismaClient();
  const datasource = await prisma.datasource.findFirst({
    where: {
      type,
      host,
      port,
      database,
      schema: schema ?? null,
    },
  });
  return datasource ? mapDatasource(datasource) : null;
}

export async function findAllDatasources(): Promise<DatasourceMetadata[]> {
  const prisma = getPrismaClient();
  const datasources = await prisma.datasource.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  return datasources.map(mapDatasource);
}

const MAX_DATASOURCE_RETRY_ATTEMPTS = 10;

export async function createDatasource(input: CreateDatasourceInput): Promise<DatasourceMetadata> {
  const prisma = getPrismaClient();
  let name = input.name;
  let counter = 0;

  while (counter < MAX_DATASOURCE_RETRY_ATTEMPTS) {
    try {
      const datasource = await prisma.datasource.create({
        data: {
          name,
          type: input.type,
          filePath: input.filePath ?? null,
          host: input.host ?? null,
          port: input.port ?? null,
          database: input.database ?? null,
          user: input.user ?? null,
          password: input.password ?? null,
          schema: input.schema ?? null,
          properties: input.properties ?? null,
          createdBy: input.createdBy ?? null,
        },
      });

      logger.info('Datasource created', {
        id: datasource.id,
        name: datasource.name,
        type: datasource.type,
      });

      return mapDatasource(datasource);
    } catch (error: unknown) {
      if (isPrismaKnownError(error, 'P2002')) {
        if (metaHasUniqueField(error.meta, 'name')) {
          counter++;
          name = `${input.name}_${counter}`;
          logger.debug('Datasource name collision, retrying with suffix', { name, counter });
          continue;
        }
      }
      throw error;
    }
  }

  throw new Error(
    `Failed to generate unique datasource name after ${MAX_DATASOURCE_RETRY_ATTEMPTS} attempts`
  );
}

export async function deleteDatasource(id: string): Promise<DatasourceMetadata | null> {
  const prisma = getPrismaClient();

  try {
    // Tables are deleted via ON DELETE CASCADE
    const datasource = await prisma.datasource.delete({
      where: { id },
    });

    logger.info('Datasource deleted', { id, name: datasource.name });
    return mapDatasource(datasource);
  } catch (error: unknown) {
    if (isPrismaKnownError(error, 'P2025')) {
      return null;
    }
    throw error;
  }
}

export async function findTablesByDatasourceId(datasourceId: string): Promise<TableMetadata[]> {
  const prisma = getPrismaClient();
  const tables = await prisma.table.findMany({
    where: { datasourceId },
    orderBy: { updatedAt: 'desc' },
  });
  return tables.map(mapTable);
}

export async function findAllDatasourcesWithTables(): Promise<DatasourceWithTables[]> {
  const prisma = getPrismaClient();
  const datasources = await prisma.datasource.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      tables: {
        orderBy: { updatedAt: 'desc' },
      },
    },
  });
  return datasources.map((ds: PrismaDatasourceWithTables) => ({
    ...mapDatasource(ds),
    tables: ds.tables.map(mapTable),
  }));
}
