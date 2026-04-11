import type { Request, Response } from 'express';
import { FileUploadError, ValidationError } from '../errors/types';
import { isValidUuid } from '../utils/validation';
import { getStringParam } from '../utils/routeParams';
import { uploadSqliteFile, deleteDatasourceWithFiles } from './sqlite.service';

export async function uploadSqliteHandler(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new FileUploadError('No file uploaded');
  }
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const result = await uploadSqliteFile(req.file.buffer, originalName);
  res.status(201).json(result);
}

export async function deleteDatasourceHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  if (!isValidUuid(id)) {
    throw new ValidationError('Invalid datasource ID');
  }
  await deleteDatasourceWithFiles(id);
  res.json(null);
}
