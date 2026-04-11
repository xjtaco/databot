export interface KnowledgeFolder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: KnowledgeFolder[];
  files: KnowledgeFile[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeFile {
  id: string;
  name: string;
  folderId: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
}
