import type { Request, Response } from 'express';
import { FileUploadError } from '../errors/types';
import { processUploadedFile } from './datafile.service';
import { uploadAndSaveFile } from '../table/table.service';

export async function legacyUploadHandler(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new FileUploadError('No file uploaded');
  }
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const result = await processUploadedFile(req.file.buffer, originalName);
  res.json(result);
}

export async function uploadAndSaveHandler(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new FileUploadError('No file uploaded');
  }
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const tableIds = await uploadAndSaveFile(req.file.buffer, originalName);
  res.status(201).json({ tableIds });
}
