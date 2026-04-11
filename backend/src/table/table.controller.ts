import type { Request, Response } from 'express';
import { ValidationError } from '../errors/types';
import { isValidUuid } from '../utils/validation';
import { getStringParam } from '../utils/routeParams';
import {
  listTables,
  listDatasourcesWithTables,
  getTable,
  getDictionaryContent,
  updateTable,
  deleteTable,
  getTablePreview,
} from './table.service';
import { UpdateTableInput, UpdateColumnInput, FieldDataTypeValues } from './table.types';

const VALID_DATA_TYPES = Object.values(FieldDataTypeValues);

function validateUpdateTableInput(input: unknown): UpdateTableInput {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError('Invalid request body');
  }

  const body = input as Record<string, unknown>;
  const result: UpdateTableInput = {};

  if (body.displayName !== undefined) {
    if (typeof body.displayName !== 'string') {
      throw new ValidationError('displayName must be a string');
    }
    if (body.displayName.trim().length === 0) {
      throw new ValidationError('displayName cannot be empty');
    }
    result.displayName = body.displayName.trim();
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      throw new ValidationError('description must be a string or null');
    }
    result.description = body.description as string | undefined;
  }

  if (body.columns !== undefined) {
    if (!Array.isArray(body.columns)) {
      throw new ValidationError('columns must be an array');
    }
    result.columns = body.columns.map((col, index) => validateUpdateColumnInput(col, index));
  }

  return result;
}

function validateUpdateColumnInput(input: unknown, index: number): UpdateColumnInput {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError(`Invalid column at index ${index}`);
  }

  const col = input as Record<string, unknown>;

  if (typeof col.id !== 'string' || !isValidUuid(col.id)) {
    throw new ValidationError(`Column at index ${index} must have a valid UUID id`);
  }

  const result: UpdateColumnInput = { id: col.id };

  if (col.displayName !== undefined) {
    if (typeof col.displayName !== 'string') {
      throw new ValidationError(`Column at index ${index}: displayName must be a string`);
    }
    result.displayName = col.displayName;
  }

  if (col.description !== undefined) {
    if (col.description !== null && typeof col.description !== 'string') {
      throw new ValidationError(`Column at index ${index}: description must be a string or null`);
    }
    result.description = col.description as string | undefined;
  }

  if (col.dataType !== undefined) {
    if (typeof col.dataType !== 'string' || !VALID_DATA_TYPES.includes(col.dataType as never)) {
      throw new ValidationError(
        `Column at index ${index}: dataType must be one of: ${VALID_DATA_TYPES.join(', ')}`
      );
    }
    result.dataType = col.dataType as UpdateColumnInput['dataType'];
  }

  return result;
}

export async function listTablesHandler(_req: Request, res: Response): Promise<void> {
  const tables = await listTables();
  res.json({ tables });
}

export async function listDatasourcesHandler(_req: Request, res: Response): Promise<void> {
  const datasources = await listDatasourcesWithTables();
  res.json({ datasources });
}

export async function getTableHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  if (!isValidUuid(id)) {
    throw new ValidationError('Invalid table ID');
  }
  const table = await getTable(id);
  res.json({ table });
}

export async function getDictionaryHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  if (!isValidUuid(id)) {
    throw new ValidationError('Invalid table ID');
  }
  const content = await getDictionaryContent(id);
  res.json({ content });
}

export async function updateTableHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  if (!isValidUuid(id)) {
    throw new ValidationError('Invalid table ID');
  }
  const input = validateUpdateTableInput(req.body);
  const table = await updateTable(id, input);
  res.json({ table });
}

export async function deleteTableHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  if (!isValidUuid(id)) {
    throw new ValidationError('Invalid table ID');
  }
  await deleteTable(id);
  res.json(null);
}

const VALID_PREVIEW_LIMITS = [20, 50, 100];

export async function getTablePreviewHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  if (!isValidUuid(id)) {
    throw new ValidationError('Invalid table ID');
  }

  let limit = 20;
  if (req.query.limit !== undefined) {
    const parsed = Number(req.query.limit);
    if (!VALID_PREVIEW_LIMITS.includes(parsed)) {
      throw new ValidationError(`limit must be one of: ${VALID_PREVIEW_LIMITS.join(', ')}`);
    }
    limit = parsed;
  }

  const preview = await getTablePreview(id, limit);
  res.json(preview);
}
