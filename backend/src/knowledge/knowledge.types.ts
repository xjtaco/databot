export interface KnowledgeFolder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeFile {
  id: string;
  name: string;
  folderId: string;
  fileSize: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeFolderWithFiles extends KnowledgeFolder {
  files: KnowledgeFile[];
}

export interface FolderTreeNode extends KnowledgeFolder {
  children: FolderTreeNode[];
  files: KnowledgeFile[];
}

export interface KnowledgeFileWithPath extends KnowledgeFile {
  filePath: string;
}

export interface UploadFileInput {
  buffer: Buffer;
  originalname: string;
}
