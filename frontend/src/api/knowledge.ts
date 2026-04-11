import { http } from '@/utils';
import type { KnowledgeFolder, KnowledgeFile } from '@/types/knowledge';

export async function createFolder(
  name: string,
  parentId?: string
): Promise<{ folder: KnowledgeFolder }> {
  return http.post<{ folder: KnowledgeFolder }>('/knowledge/folders', { name, parentId });
}

export async function listFolderTree(): Promise<{ folders: KnowledgeFolder[] }> {
  return http.get<{ folders: KnowledgeFolder[] }>('/knowledge/folders');
}

export async function updateFolder(
  id: string,
  data: { name?: string; parentId?: string | null }
): Promise<{ folder: KnowledgeFolder }> {
  return http.put<{ folder: KnowledgeFolder }>(`/knowledge/folders/${id}`, data);
}

export async function deleteFolder(id: string): Promise<void> {
  return http.delete(`/knowledge/folders/${id}`);
}

export async function uploadFiles(
  folderId: string,
  files: File[]
): Promise<{ files: KnowledgeFile[] }> {
  return http.uploadMultiple<{ files: KnowledgeFile[] }>(
    `/knowledge/folders/${folderId}/files`,
    files,
    'files'
  );
}

export async function getFileContent(
  id: string
): Promise<{ file: KnowledgeFile; content: string }> {
  return http.get<{ file: KnowledgeFile; content: string }>(`/knowledge/files/${id}`);
}

export async function updateFileContent(
  id: string,
  content: string
): Promise<{ file: KnowledgeFile }> {
  return http.put<{ file: KnowledgeFile }>(`/knowledge/files/${id}`, { content });
}

export async function moveFile(id: string, folderId: string): Promise<{ file: KnowledgeFile }> {
  return http.put<{ file: KnowledgeFile }>(`/knowledge/files/${id}/move`, { folderId });
}

export async function deleteFile(id: string): Promise<void> {
  return http.delete(`/knowledge/files/${id}`);
}
