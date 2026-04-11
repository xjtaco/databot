import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../infrastructure/database';
import {
  KnowledgeFolder,
  KnowledgeFile,
  KnowledgeFolderWithFiles,
  KnowledgeFileWithPath,
} from './knowledge.types';

type PrismaFolder = Prisma.KnowledgeFolderGetPayload<object>;
type PrismaFile = Prisma.KnowledgeFileGetPayload<object>;
type PrismaFolderWithFiles = Prisma.KnowledgeFolderGetPayload<{
  include: { files: true };
}>;

function mapFolder(folder: PrismaFolder): KnowledgeFolder {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    sortOrder: folder.sortOrder,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

function mapFile(file: PrismaFile): KnowledgeFile {
  return {
    id: file.id,
    name: file.name,
    folderId: file.folderId,
    fileSize: file.fileSize,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

function mapFileWithPath(file: PrismaFile): KnowledgeFileWithPath {
  return {
    ...mapFile(file),
    filePath: file.filePath,
  };
}

function mapFolderWithFiles(folder: PrismaFolderWithFiles): KnowledgeFolderWithFiles {
  return {
    ...mapFolder(folder),
    files: folder.files.map(mapFile),
  };
}

export async function findFolderById(id: string): Promise<KnowledgeFolder | null> {
  const prisma = getPrismaClient();
  const folder = await prisma.knowledgeFolder.findUnique({ where: { id } });
  return folder ? mapFolder(folder) : null;
}

export async function createFolder(
  name: string,
  parentId?: string
): Promise<KnowledgeFolderWithFiles> {
  const prisma = getPrismaClient();
  const folder = await prisma.knowledgeFolder.create({
    data: {
      name,
      parentId: parentId ?? null,
    },
    include: {
      files: true,
    },
  });
  return mapFolderWithFiles(folder);
}

export async function findAllFoldersWithFiles(): Promise<KnowledgeFolderWithFiles[]> {
  const prisma = getPrismaClient();
  const folders = await prisma.knowledgeFolder.findMany({
    include: {
      files: {
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return folders.map(mapFolderWithFiles);
}

export async function updateFolder(
  id: string,
  data: { name?: string; parentId?: string | null }
): Promise<KnowledgeFolderWithFiles> {
  const prisma = getPrismaClient();
  const updated = await prisma.knowledgeFolder.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
    },
    include: {
      files: true,
    },
  });
  return mapFolderWithFiles(updated);
}

export async function deleteFolder(id: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.knowledgeFolder.delete({ where: { id } });
}

export async function findAllFolderIdsWithParents(): Promise<
  { id: string; parentId: string | null }[]
> {
  const prisma = getPrismaClient();
  return prisma.knowledgeFolder.findMany({
    select: { id: true, parentId: true },
  });
}

export async function findFolderParentId(id: string): Promise<string | null> {
  const prisma = getPrismaClient();
  const record = await prisma.knowledgeFolder.findUnique({
    where: { id },
    select: { parentId: true },
  });
  return record?.parentId ?? null;
}

export async function findFileById(id: string): Promise<KnowledgeFileWithPath | null> {
  const prisma = getPrismaClient();
  const file = await prisma.knowledgeFile.findUnique({ where: { id } });
  return file ? mapFileWithPath(file) : null;
}

export async function findFilesByFolderIds(folderIds: string[]): Promise<KnowledgeFileWithPath[]> {
  const prisma = getPrismaClient();
  const files = await prisma.knowledgeFile.findMany({
    where: { folderId: { in: folderIds } },
  });
  return files.map(mapFileWithPath);
}

export async function createFile(data: {
  name: string;
  filePath: string;
  folderId: string;
  fileSize: number;
}): Promise<KnowledgeFile> {
  const prisma = getPrismaClient();
  const record = await prisma.knowledgeFile.create({ data });
  return mapFile(record);
}

export async function updateFileSize(id: string, fileSize: number): Promise<KnowledgeFile> {
  const prisma = getPrismaClient();
  const updated = await prisma.knowledgeFile.update({
    where: { id },
    data: { fileSize },
  });
  return mapFile(updated);
}

export async function updateFileFolderId(id: string, folderId: string): Promise<KnowledgeFile> {
  const prisma = getPrismaClient();
  const updated = await prisma.knowledgeFile.update({
    where: { id },
    data: { folderId },
  });
  return mapFile(updated);
}

export async function deleteFileRecord(id: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.knowledgeFile.delete({ where: { id } });
}
