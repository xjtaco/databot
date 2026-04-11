import * as fs from 'fs';
import * as path from 'path';
import { config } from '../base/config';
import { KnowledgeNotFoundError, KnowledgeFileError, ValidationError } from '../errors/types';
import logger from '../utils/logger';
import {
  getTodayDateDir,
  ensureDirectoryExists,
  getFileBasename,
  getFileExtension,
} from '../utils/fileHelpers';
import * as repository from './knowledge.repository';
import {
  KnowledgeFile,
  KnowledgeFolder,
  KnowledgeFolderWithFiles,
  FolderTreeNode,
  UploadFileInput,
} from './knowledge.types';

async function writeFileExclusive(
  directory: string,
  basename: string,
  extension: string,
  data: Buffer
): Promise<string> {
  let filename = `${basename}${extension}`;
  let counter = 1;
  const MAX_ATTEMPTS = 100;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const filePath = path.join(directory, filename);
    try {
      const fd = await fs.promises.open(
        filePath,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
      );
      try {
        await fd.writeFile(data);
      } finally {
        await fd.close();
      }
      return filePath;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'EEXIST'
      ) {
        filename = `${basename}_${counter}${extension}`;
        counter++;
        continue;
      }
      throw error;
    }
  }

  throw new KnowledgeFileError('Could not find unique filename after maximum attempts');
}

function resolveFilePath(relativePath: string): string {
  return path.join(config.knowledge_folder, relativePath);
}

export async function createFolder(
  name: string,
  parentId?: string
): Promise<KnowledgeFolderWithFiles> {
  if (parentId) {
    const parent = await repository.findFolderById(parentId);
    if (!parent) {
      throw new KnowledgeNotFoundError('Parent folder not found');
    }
  }

  return repository.createFolder(name, parentId);
}

function buildTree(folders: KnowledgeFolderWithFiles[]): FolderTreeNode[] {
  const map = new Map<string, FolderTreeNode>();
  const roots: FolderTreeNode[] = [];

  for (const folder of folders) {
    map.set(folder.id, {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      sortOrder: folder.sortOrder,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
      children: [],
      files: folder.files,
    });
  }

  for (const folder of folders) {
    const node = map.get(folder.id)!;
    if (folder.parentId && map.has(folder.parentId)) {
      map.get(folder.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function listFolderTree(): Promise<FolderTreeNode[]> {
  const folders = await repository.findAllFoldersWithFiles();
  return buildTree(folders);
}

export async function updateFolder(
  id: string,
  data: { name?: string; parentId?: string | null }
): Promise<KnowledgeFolder> {
  const folder = await repository.findFolderById(id);
  if (!folder) {
    throw new KnowledgeNotFoundError('Folder not found');
  }

  if (data.parentId !== undefined && data.parentId !== null) {
    if (data.parentId === id) {
      throw new ValidationError('Cannot move folder into itself');
    }
    const parent = await repository.findFolderById(data.parentId);
    if (!parent) {
      throw new KnowledgeNotFoundError('Target parent folder not found');
    }
    await checkCircularReference(id, data.parentId);
  }

  return repository.updateFolder(id, data);
}

async function checkCircularReference(folderId: string, targetParentId: string): Promise<void> {
  let currentId: string | null = targetParentId;

  while (currentId) {
    if (currentId === folderId) {
      throw new ValidationError('Cannot move folder into its own descendant');
    }
    currentId = await repository.findFolderParentId(currentId);
  }
}

function collectDescendantIds(
  folderId: string,
  parentToChildren: Map<string | null, string[]>
): string[] {
  const ids: string[] = [];
  const children = parentToChildren.get(folderId) ?? [];
  for (const childId of children) {
    ids.push(childId);
    ids.push(...collectDescendantIds(childId, parentToChildren));
  }
  return ids;
}

async function deletePhysicalFilesForFolder(folderId: string): Promise<void> {
  const allFolders = await repository.findAllFolderIdsWithParents();
  const parentToChildren = new Map<string | null, string[]>();
  for (const f of allFolders) {
    const children = parentToChildren.get(f.parentId) ?? [];
    children.push(f.id);
    parentToChildren.set(f.parentId, children);
  }
  const allFolderIds = [folderId, ...collectDescendantIds(folderId, parentToChildren)];

  const files = await repository.findFilesByFolderIds(allFolderIds);

  for (const file of files) {
    const absolutePath = resolveFilePath(file.filePath);
    try {
      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
        logger.info('Deleted knowledge file', { filePath: file.filePath });
      }
    } catch (error) {
      logger.warn('Failed to delete knowledge file', {
        filePath: file.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function deleteFolder(id: string): Promise<void> {
  const folder = await repository.findFolderById(id);
  if (!folder) {
    throw new KnowledgeNotFoundError('Folder not found');
  }

  await deletePhysicalFilesForFolder(id);
  await repository.deleteFolder(id);

  logger.info('Deleted knowledge folder', { folderId: id, name: folder.name });
}

export async function uploadFiles(
  folderId: string,
  files: UploadFileInput[]
): Promise<KnowledgeFile[]> {
  const folder = await repository.findFolderById(folderId);
  if (!folder) {
    throw new KnowledgeNotFoundError('Folder not found');
  }

  const directory = path.join(config.knowledge_folder, getTodayDateDir());
  ensureDirectoryExists(directory);

  const results: KnowledgeFile[] = [];
  const writtenFilePaths: string[] = [];

  try {
    for (const file of files) {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const basename = getFileBasename(originalName);
      const extension = getFileExtension(originalName);
      const filePath = await writeFileExclusive(directory, basename, extension, file.buffer);
      writtenFilePaths.push(filePath);

      const relativePath = path.relative(config.knowledge_folder, filePath);
      const record = await repository.createFile({
        name: originalName,
        filePath: relativePath,
        folderId,
        fileSize: file.buffer.length,
      });

      results.push(record);

      logger.info('Uploaded knowledge file', { name: originalName, filePath: relativePath });
    }
  } catch (error) {
    // Clean up already-written files on failure
    for (const writtenPath of writtenFilePaths) {
      try {
        await fs.promises.unlink(writtenPath);
      } catch {
        // best-effort cleanup
      }
    }
    // Clean up already-created DB records
    for (const record of results) {
      try {
        await repository.deleteFileRecord(record.id);
      } catch {
        // best-effort cleanup
      }
    }

    if (error instanceof KnowledgeNotFoundError) throw error;
    if (error instanceof KnowledgeFileError) throw error;
    throw new KnowledgeFileError(
      'Failed to upload file',
      { originalname: files[results.length]?.originalname },
      error instanceof Error ? error : undefined
    );
  }

  return results;
}

export async function getFileContent(
  id: string
): Promise<{ file: KnowledgeFile; content: string }> {
  const file = await repository.findFileById(id);
  if (!file) {
    throw new KnowledgeNotFoundError('File not found');
  }

  const absolutePath = resolveFilePath(file.filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new KnowledgeFileError('Physical file not found on disk');
  }

  const content = await fs.promises.readFile(absolutePath, 'utf-8');

  return {
    file: {
      id: file.id,
      name: file.name,
      folderId: file.folderId,
      fileSize: file.fileSize,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    },
    content,
  };
}

export async function updateFileContent(id: string, content: string): Promise<KnowledgeFile> {
  const file = await repository.findFileById(id);
  if (!file) {
    throw new KnowledgeNotFoundError('File not found');
  }

  const absolutePath = resolveFilePath(file.filePath);
  try {
    await fs.promises.writeFile(absolutePath, content, 'utf-8');
  } catch (error) {
    throw new KnowledgeFileError(
      'Failed to write file content',
      { filePath: file.filePath },
      error instanceof Error ? error : undefined
    );
  }

  const updated = await repository.updateFileSize(id, Buffer.byteLength(content, 'utf-8'));

  logger.info('Updated knowledge file content', { fileId: id, name: file.name });

  return updated;
}

export async function moveFile(id: string, targetFolderId: string): Promise<KnowledgeFile> {
  const file = await repository.findFileById(id);
  if (!file) {
    throw new KnowledgeNotFoundError('File not found');
  }

  const targetFolder = await repository.findFolderById(targetFolderId);
  if (!targetFolder) {
    throw new KnowledgeNotFoundError('Target folder not found');
  }

  const updated = await repository.updateFileFolderId(id, targetFolderId);

  logger.info('Moved knowledge file', { fileId: id, targetFolderId });

  return updated;
}

export async function deleteFile(id: string): Promise<void> {
  const file = await repository.findFileById(id);
  if (!file) {
    throw new KnowledgeNotFoundError('File not found');
  }

  const absolutePath = resolveFilePath(file.filePath);
  try {
    if (fs.existsSync(absolutePath)) {
      await fs.promises.unlink(absolutePath);
      logger.info('Deleted knowledge file from disk', { filePath: file.filePath });
    }
  } catch (error) {
    logger.warn('Failed to delete knowledge file from disk', {
      filePath: file.filePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  await repository.deleteFileRecord(id);

  logger.info('Deleted knowledge file', { fileId: id, name: file.name });
}
