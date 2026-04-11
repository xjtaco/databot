import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the http module directly with factory functions
vi.mock('@/utils/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    uploadMultiple: vi.fn(),
  },
  axiosInstance: {},
}));

// Import after mocking
import {
  createFolder,
  listFolderTree,
  updateFolder,
  deleteFolder,
  uploadFiles,
  getFileContent,
  updateFileContent,
  moveFile,
  deleteFile,
} from '@/api/knowledge';
import { http } from '@/utils/http';
import type { KnowledgeFolder, KnowledgeFile } from '@/types/knowledge';

// Type the mocked http for better type inference
const mockedHttp = vi.mocked(http);

const mockFolder: KnowledgeFolder = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Test Folder',
  parentId: null,
  sortOrder: 0,
  children: [],
  files: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const mockFile: KnowledgeFile = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  name: 'test.md',
  folderId: '550e8400-e29b-41d4-a716-446655440001',
  fileSize: 1024,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('knowledgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createFolder', () => {
    it('should create folder and return result', async () => {
      mockedHttp.post.mockResolvedValue({ folder: mockFolder });

      const result = await createFolder('Test Folder');

      expect(mockedHttp.post).toHaveBeenCalledWith('/knowledge/folders', {
        name: 'Test Folder',
        parentId: undefined,
      });
      expect(result.folder.id).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(result.folder.name).toBe('Test Folder');
    });

    it('should create folder with parentId', async () => {
      mockedHttp.post.mockResolvedValue({ folder: mockFolder });

      await createFolder('Child Folder', '550e8400-e29b-41d4-a716-446655440001');

      expect(mockedHttp.post).toHaveBeenCalledWith('/knowledge/folders', {
        name: 'Child Folder',
        parentId: '550e8400-e29b-41d4-a716-446655440001',
      });
    });

    it('should throw error on failure', async () => {
      mockedHttp.post.mockRejectedValue(new Error('Creation failed'));

      await expect(createFolder('Test')).rejects.toThrow('Creation failed');
    });
  });

  describe('listFolderTree', () => {
    it('should fetch and return folder tree', async () => {
      mockedHttp.get.mockResolvedValue({ folders: [mockFolder] });

      const result = await listFolderTree();

      expect(mockedHttp.get).toHaveBeenCalledWith('/knowledge/folders');
      expect(result.folders).toHaveLength(1);
      expect(result.folders[0].name).toBe('Test Folder');
    });

    it('should return empty array when no folders', async () => {
      mockedHttp.get.mockResolvedValue({ folders: [] });

      const result = await listFolderTree();

      expect(result.folders).toHaveLength(0);
    });

    it('should throw error on failure', async () => {
      mockedHttp.get.mockRejectedValue(new Error('Fetch failed'));

      await expect(listFolderTree()).rejects.toThrow('Fetch failed');
    });
  });

  describe('updateFolder', () => {
    it('should update folder name', async () => {
      const updated = { ...mockFolder, name: 'Renamed' };
      mockedHttp.put.mockResolvedValue({ folder: updated });

      const result = await updateFolder('550e8400-e29b-41d4-a716-446655440001', {
        name: 'Renamed',
      });

      expect(mockedHttp.put).toHaveBeenCalledWith(
        '/knowledge/folders/550e8400-e29b-41d4-a716-446655440001',
        { name: 'Renamed' }
      );
      expect(result.folder.name).toBe('Renamed');
    });

    it('should update folder parentId', async () => {
      mockedHttp.put.mockResolvedValue({ folder: mockFolder });

      await updateFolder('550e8400-e29b-41d4-a716-446655440001', {
        parentId: '550e8400-e29b-41d4-a716-446655440002',
      });

      expect(mockedHttp.put).toHaveBeenCalledWith(
        '/knowledge/folders/550e8400-e29b-41d4-a716-446655440001',
        { parentId: '550e8400-e29b-41d4-a716-446655440002' }
      );
    });

    it('should throw error on failure', async () => {
      mockedHttp.put.mockRejectedValue(new Error('Update failed'));

      await expect(
        updateFolder('550e8400-e29b-41d4-a716-446655440001', { name: 'Test' })
      ).rejects.toThrow('Update failed');
    });
  });

  describe('deleteFolder', () => {
    it('should delete folder successfully', async () => {
      mockedHttp.delete.mockResolvedValue(undefined);

      await expect(deleteFolder('550e8400-e29b-41d4-a716-446655440001')).resolves.toBeUndefined();

      expect(mockedHttp.delete).toHaveBeenCalledWith(
        '/knowledge/folders/550e8400-e29b-41d4-a716-446655440001'
      );
    });

    it('should throw error on failure', async () => {
      mockedHttp.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(deleteFolder('550e8400-e29b-41d4-a716-446655440001')).rejects.toThrow(
        'Delete failed'
      );
    });
  });

  describe('uploadFiles', () => {
    it('should upload files using http.uploadMultiple', async () => {
      mockedHttp.uploadMultiple.mockResolvedValue({ files: [mockFile] });

      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      const result = await uploadFiles('550e8400-e29b-41d4-a716-446655440001', [file]);

      expect(mockedHttp.uploadMultiple).toHaveBeenCalledWith(
        '/knowledge/folders/550e8400-e29b-41d4-a716-446655440001/files',
        [file],
        'files'
      );
      expect(result.files).toHaveLength(1);
      expect(result.files[0].name).toBe('test.md');
    });

    it('should throw error on upload failure', async () => {
      mockedHttp.uploadMultiple.mockRejectedValue(new Error('Upload failed'));

      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });
      await expect(uploadFiles('550e8400-e29b-41d4-a716-446655440001', [file])).rejects.toThrow(
        'Upload failed'
      );
    });
  });

  describe('getFileContent', () => {
    it('should fetch file content', async () => {
      mockedHttp.get.mockResolvedValue({
        file: mockFile,
        content: '# Hello World',
      });

      const result = await getFileContent('550e8400-e29b-41d4-a716-446655440010');

      expect(mockedHttp.get).toHaveBeenCalledWith(
        '/knowledge/files/550e8400-e29b-41d4-a716-446655440010'
      );
      expect(result.file.name).toBe('test.md');
      expect(result.content).toBe('# Hello World');
    });

    it('should throw error on failure', async () => {
      mockedHttp.get.mockRejectedValue(new Error('File not found'));

      await expect(getFileContent('550e8400-e29b-41d4-a716-446655440010')).rejects.toThrow(
        'File not found'
      );
    });
  });

  describe('updateFileContent', () => {
    it('should update file content', async () => {
      mockedHttp.put.mockResolvedValue({ file: mockFile });

      const result = await updateFileContent(
        '550e8400-e29b-41d4-a716-446655440010',
        '# Updated Content'
      );

      expect(mockedHttp.put).toHaveBeenCalledWith(
        '/knowledge/files/550e8400-e29b-41d4-a716-446655440010',
        { content: '# Updated Content' }
      );
      expect(result.file.name).toBe('test.md');
    });

    it('should throw error on failure', async () => {
      mockedHttp.put.mockRejectedValue(new Error('Update failed'));

      await expect(
        updateFileContent('550e8400-e29b-41d4-a716-446655440010', '# New')
      ).rejects.toThrow('Update failed');
    });
  });

  describe('moveFile', () => {
    it('should move file to another folder', async () => {
      const movedFile = {
        ...mockFile,
        folderId: '550e8400-e29b-41d4-a716-446655440002',
      };
      mockedHttp.put.mockResolvedValue({ file: movedFile });

      const result = await moveFile(
        '550e8400-e29b-41d4-a716-446655440010',
        '550e8400-e29b-41d4-a716-446655440002'
      );

      expect(mockedHttp.put).toHaveBeenCalledWith(
        '/knowledge/files/550e8400-e29b-41d4-a716-446655440010/move',
        { folderId: '550e8400-e29b-41d4-a716-446655440002' }
      );
      expect(result.file.folderId).toBe('550e8400-e29b-41d4-a716-446655440002');
    });

    it('should throw error on failure', async () => {
      mockedHttp.put.mockRejectedValue(new Error('Move failed'));

      await expect(
        moveFile('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440002')
      ).rejects.toThrow('Move failed');
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      mockedHttp.delete.mockResolvedValue(undefined);

      await expect(deleteFile('550e8400-e29b-41d4-a716-446655440010')).resolves.toBeUndefined();

      expect(mockedHttp.delete).toHaveBeenCalledWith(
        '/knowledge/files/550e8400-e29b-41d4-a716-446655440010'
      );
    });

    it('should throw error on failure', async () => {
      mockedHttp.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(deleteFile('550e8400-e29b-41d4-a716-446655440010')).rejects.toThrow(
        'Delete failed'
      );
    });
  });
});
