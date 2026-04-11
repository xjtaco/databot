import type { Request, Response } from 'express';
import { ValidationError } from '../errors/types';
import { getValidatedUuid } from '../utils/routeParams';
import * as knowledgeService from './knowledge.service';
import * as knowledgeRepository from './knowledge.repository';

export async function createFolderHandler(req: Request, res: Response): Promise<void> {
  const { name, parentId } = req.body as { name?: string; parentId?: string };
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('Folder name is required');
  }
  const folder = await knowledgeService.createFolder(name.trim(), parentId);
  if (req.auditContext) {
    req.auditContext.params = { folderName: folder.name };
  }
  res.status(201).json({ folder });
}

export async function listFolderTreeHandler(_req: Request, res: Response): Promise<void> {
  const tree = await knowledgeService.listFolderTree();
  res.json({ folders: tree });
}

export async function updateFolderHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const { name, parentId } = req.body as { name?: string; parentId?: string | null };
  const folder = await knowledgeService.updateFolder(id, { name, parentId });
  res.json({ folder });
}

export async function deleteFolderHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const folder = await knowledgeRepository.findFolderById(id);
  await knowledgeService.deleteFolder(id);
  if (req.auditContext && folder) {
    req.auditContext.params = { folderName: folder.name };
  }
  res.json({ deleted: true });
}

export async function uploadFilesHandler(req: Request, res: Response): Promise<void> {
  const folderId = getValidatedUuid(req, 'folderId');
  const files = req.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new ValidationError('No files uploaded');
  }
  const result = await knowledgeService.uploadFiles(
    folderId,
    files.map((f) => ({ buffer: f.buffer, originalname: f.originalname }))
  );
  if (req.auditContext) {
    req.auditContext.params = {
      fileName: result.map((f) => f.name).join(', '),
    };
  }
  res.status(201).json({ files: result });
}

export async function getFileContentHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const result = await knowledgeService.getFileContent(id);
  res.json(result);
}

export async function updateFileContentHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const { content } = req.body as { content?: string };
  if (content === undefined || typeof content !== 'string') {
    throw new ValidationError('Content is required');
  }
  const file = await knowledgeService.updateFileContent(id, content);
  res.json({ file });
}

export async function moveFileHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const { folderId } = req.body as { folderId?: string };
  if (!folderId || typeof folderId !== 'string') {
    throw new ValidationError('Target folder ID is required');
  }
  const file = await knowledgeService.moveFile(id, folderId);
  res.json({ file });
}

export async function deleteFileHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const file = await knowledgeRepository.findFileById(id);
  await knowledgeService.deleteFile(id);
  if (req.auditContext && file) {
    req.auditContext.params = { fileName: file.name };
  }
  res.json({ deleted: true });
}
