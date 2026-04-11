import type { Request, Response } from 'express';
import { ValidationError } from '../errors/types';
import { isPasswordMask } from '../utils/encryption';
import { isValidUuid } from '../utils/validation';
import { getStringParam } from '../utils/routeParams';
import { isDatabaseType } from './datasource.types';
import type { DatabaseConnectionConfig, DatabaseType } from './datasource.types';
import {
  createDatasourceFromConfig,
  updateDatasourceFromConfig,
  deleteDatasourceById,
} from './datasource.service';
import { findDatasourceById } from '../table/table.repository';
import { bridgeClient } from './bridgeClient';

export function validateConnectionConfig(
  body: unknown,
  allowPasswordMask = false
): DatabaseConnectionConfig {
  const config = body as Record<string, unknown>;

  if (typeof config.dbType !== 'string' || !isDatabaseType(config.dbType)) {
    throw new ValidationError('Valid database type is required');
  }

  if (typeof config.host !== 'string' || config.host.trim() === '') {
    throw new ValidationError('Host is required');
  }

  const port = Number(config.port);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new ValidationError('Port must be a number between 1 and 65535');
  }

  if (typeof config.database !== 'string' || config.database.trim() === '') {
    throw new ValidationError('Database name is required');
  }

  if (typeof config.user !== 'string' || config.user.trim() === '') {
    throw new ValidationError('User is required');
  }

  if (typeof config.password !== 'string') {
    throw new ValidationError('Password is required');
  }

  if (!allowPasswordMask && isPasswordMask(config.password)) {
    throw new ValidationError('Password cannot be the mask value');
  }

  const result: DatabaseConnectionConfig = {
    dbType: config.dbType as DatabaseType,
    host: config.host.trim(),
    port,
    database: config.database.trim(),
    user: config.user.trim(),
    password: config.password,
  };

  if (typeof config.schema === 'string' && config.schema.trim() !== '') {
    result.schema = config.schema.trim();
  }

  if (config.properties && typeof config.properties === 'object') {
    result.properties = config.properties as Record<string, string>;
  }

  return result;
}

export async function testConnectionHandler(req: Request, res: Response): Promise<void> {
  const config = validateConnectionConfig(req.body);
  const result = await bridgeClient.testConnection(config);
  res.json(result);
}

export async function createDatasourceHandler(req: Request, res: Response): Promise<void> {
  const config = validateConnectionConfig(req.body);
  const result = await createDatasourceFromConfig(config, req.user?.userId);
  if (req.auditContext) {
    req.auditContext.params = { datasourceName: result.databaseName };
  }
  res.status(201).json(result);
}

export async function updateDatasourceHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  if (!isValidUuid(id)) {
    throw new ValidationError('Invalid datasource ID');
  }
  const config = validateConnectionConfig(req.body, true);
  const result = await updateDatasourceFromConfig(id, config);
  if (req.auditContext) {
    req.auditContext.params = { datasourceName: result.databaseName };
  }
  res.json(result);
}

export async function deleteDatasourceHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  if (!isValidUuid(id)) {
    throw new ValidationError('Invalid datasource ID');
  }
  const datasource = await findDatasourceById(id);
  await deleteDatasourceById(id);
  if (req.auditContext && datasource) {
    req.auditContext.params = { datasourceName: datasource.name };
  }
  res.json(null);
}
