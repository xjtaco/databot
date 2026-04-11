import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useKnowledgeStore } from '@/stores/knowledgeStore';
import * as knowledgeApi from '@/api/knowledge';
import type { KnowledgeFolder, KnowledgeFile } from '@/types/knowledge';

vi.mock('@/api/knowledge');

describe('knowledgeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockFile: KnowledgeFile = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    name: 'test.md',
    folderId: '550e8400-e29b-41d4-a716-446655440001',
    fileSize: 1024,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockFolder: KnowledgeFolder = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Test Folder',
    parentId: null,
    sortOrder: 0,
    children: [],
    files: [mockFile],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  it('should start with empty state', () => {
    const store = useKnowledgeStore();

    expect(store.folderTree).toHaveLength(0);
    expect(store.isLoading).toBe(false);
    expect(store.error).toBeNull();
  });

  describe('fetchFolderTree', () => {
    it('should fetch and store folder tree', async () => {
      vi.mocked(knowledgeApi.listFolderTree).mockResolvedValue({
        folders: [mockFolder],
      });
      const store = useKnowledgeStore();

      await store.fetchFolderTree();

      expect(store.folderTree).toHaveLength(1);
      expect(store.folderTree[0]).toEqual(mockFolder);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('should set loading state during fetch', async () => {
      let resolveFetch: (value: { folders: KnowledgeFolder[] }) => void;
      vi.mocked(knowledgeApi.listFolderTree).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      );
      const store = useKnowledgeStore();

      const promise = store.fetchFolderTree();
      expect(store.isLoading).toBe(true);

      resolveFetch!({ folders: [mockFolder] });
      await promise;
      expect(store.isLoading).toBe(false);
    });

    it('should handle fetch error', async () => {
      const errorMessage = 'Fetch failed';
      vi.mocked(knowledgeApi.listFolderTree).mockRejectedValue(new Error(errorMessage));
      const store = useKnowledgeStore();

      await expect(store.fetchFolderTree()).rejects.toThrow(errorMessage);
      expect(store.error).toBe(errorMessage);
      expect(store.isLoading).toBe(false);
    });
  });

  describe('createFolder', () => {
    it('should create folder and refresh tree', async () => {
      vi.mocked(knowledgeApi.createFolder).mockResolvedValue({ folder: mockFolder });
      vi.mocked(knowledgeApi.listFolderTree).mockResolvedValue({
        folders: [mockFolder],
      });
      const store = useKnowledgeStore();

      await store.createFolder('Test Folder');

      expect(knowledgeApi.createFolder).toHaveBeenCalledWith('Test Folder', undefined);
      expect(store.folderTree).toHaveLength(1);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('should create folder with parentId', async () => {
      vi.mocked(knowledgeApi.createFolder).mockResolvedValue({ folder: mockFolder });
      vi.mocked(knowledgeApi.listFolderTree).mockResolvedValue({
        folders: [mockFolder],
      });
      const store = useKnowledgeStore();

      await store.createFolder('Child', '550e8400-e29b-41d4-a716-446655440001');

      expect(knowledgeApi.createFolder).toHaveBeenCalledWith(
        'Child',
        '550e8400-e29b-41d4-a716-446655440001'
      );
    });

    it('should set loading state during creation', async () => {
      let resolveCreate: (value: { folder: KnowledgeFolder }) => void;
      vi.mocked(knowledgeApi.createFolder).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCreate = resolve;
          })
      );
      vi.mocked(knowledgeApi.listFolderTree).mockResolvedValue({ folders: [] });
      const store = useKnowledgeStore();

      const promise = store.createFolder('Test');
      expect(store.isLoading).toBe(true);

      resolveCreate!({ folder: mockFolder });
      await promise;
      expect(store.isLoading).toBe(false);
    });

    it('should handle creation error', async () => {
      const errorMessage = 'Creation failed';
      vi.mocked(knowledgeApi.createFolder).mockRejectedValue(new Error(errorMessage));
      const store = useKnowledgeStore();

      await expect(store.createFolder('Test')).rejects.toThrow(errorMessage);
      expect(store.error).toBe(errorMessage);
      expect(store.isLoading).toBe(false);
    });
  });

  describe('deleteFolder', () => {
    it('should delete folder and refresh tree', async () => {
      vi.mocked(knowledgeApi.deleteFolder).mockResolvedValue();
      vi.mocked(knowledgeApi.listFolderTree).mockResolvedValue({ folders: [] });
      const store = useKnowledgeStore();

      await store.deleteFolder('550e8400-e29b-41d4-a716-446655440001');

      expect(knowledgeApi.deleteFolder).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440001'
      );
      expect(store.folderTree).toHaveLength(0);
    });

    it('should set loading state during deletion', async () => {
      let resolveDelete: () => void;
      vi.mocked(knowledgeApi.deleteFolder).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveDelete = resolve;
          })
      );
      vi.mocked(knowledgeApi.listFolderTree).mockResolvedValue({ folders: [] });
      const store = useKnowledgeStore();

      const promise = store.deleteFolder('550e8400-e29b-41d4-a716-446655440001');
      expect(store.isLoading).toBe(true);

      resolveDelete!();
      await promise;
      expect(store.isLoading).toBe(false);
    });

    it('should handle deletion error', async () => {
      const errorMessage = 'Delete failed';
      vi.mocked(knowledgeApi.deleteFolder).mockRejectedValue(new Error(errorMessage));
      const store = useKnowledgeStore();

      await expect(store.deleteFolder('550e8400-e29b-41d4-a716-446655440001')).rejects.toThrow(
        errorMessage
      );
      expect(store.error).toBe(errorMessage);
      expect(store.isLoading).toBe(false);
    });
  });

  describe('uploadFiles', () => {
    it('should upload files and refresh tree', async () => {
      vi.mocked(knowledgeApi.uploadFiles).mockResolvedValue({ files: [mockFile] });
      vi.mocked(knowledgeApi.listFolderTree).mockResolvedValue({
        folders: [mockFolder],
      });
      const store = useKnowledgeStore();
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });

      await store.uploadFiles('550e8400-e29b-41d4-a716-446655440001', [file]);

      expect(knowledgeApi.uploadFiles).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440001',
        [file]
      );
      expect(store.folderTree).toHaveLength(1);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('should set loading state during upload', async () => {
      let resolveUpload: (value: { files: KnowledgeFile[] }) => void;
      vi.mocked(knowledgeApi.uploadFiles).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUpload = resolve;
          })
      );
      vi.mocked(knowledgeApi.listFolderTree).mockResolvedValue({ folders: [] });
      const store = useKnowledgeStore();
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });

      const promise = store.uploadFiles('550e8400-e29b-41d4-a716-446655440001', [file]);
      expect(store.isLoading).toBe(true);

      resolveUpload!({ files: [mockFile] });
      await promise;
      expect(store.isLoading).toBe(false);
    });

    it('should handle upload error', async () => {
      const errorMessage = 'Upload failed';
      vi.mocked(knowledgeApi.uploadFiles).mockRejectedValue(new Error(errorMessage));
      const store = useKnowledgeStore();
      const file = new File(['# Test'], 'test.md', { type: 'text/markdown' });

      await expect(
        store.uploadFiles('550e8400-e29b-41d4-a716-446655440001', [file])
      ).rejects.toThrow(errorMessage);
      expect(store.error).toBe(errorMessage);
      expect(store.isLoading).toBe(false);
    });
  });

  describe('moveFile', () => {
    it('should move file and refresh tree', async () => {
      vi.mocked(knowledgeApi.moveFile).mockResolvedValue({
        file: { ...mockFile, folderId: '550e8400-e29b-41d4-a716-446655440002' },
      });
      vi.mocked(knowledgeApi.listFolderTree).mockResolvedValue({ folders: [mockFolder] });
      const store = useKnowledgeStore();

      await store.moveFile(
        '550e8400-e29b-41d4-a716-446655440010',
        '550e8400-e29b-41d4-a716-446655440002'
      );

      expect(knowledgeApi.moveFile).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440010',
        '550e8400-e29b-41d4-a716-446655440002'
      );
    });

    it('should handle move error', async () => {
      const errorMessage = 'Move failed';
      vi.mocked(knowledgeApi.moveFile).mockRejectedValue(new Error(errorMessage));
      const store = useKnowledgeStore();

      await expect(
        store.moveFile(
          '550e8400-e29b-41d4-a716-446655440010',
          '550e8400-e29b-41d4-a716-446655440002'
        )
      ).rejects.toThrow(errorMessage);
      expect(store.error).toBe(errorMessage);
    });
  });

  describe('moveFolder', () => {
    it('should move folder and refresh tree', async () => {
      vi.mocked(knowledgeApi.updateFolder).mockResolvedValue({ folder: mockFolder });
      vi.mocked(knowledgeApi.listFolderTree).mockResolvedValue({ folders: [mockFolder] });
      const store = useKnowledgeStore();

      await store.moveFolder(
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440002'
      );

      expect(knowledgeApi.updateFolder).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440001',
        { parentId: '550e8400-e29b-41d4-a716-446655440002' }
      );
    });

    it('should support moving folder to root (null parentId)', async () => {
      vi.mocked(knowledgeApi.updateFolder).mockResolvedValue({ folder: mockFolder });
      vi.mocked(knowledgeApi.listFolderTree).mockResolvedValue({ folders: [mockFolder] });
      const store = useKnowledgeStore();

      await store.moveFolder('550e8400-e29b-41d4-a716-446655440001', null);

      expect(knowledgeApi.updateFolder).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440001',
        { parentId: null }
      );
    });

    it('should handle move error', async () => {
      const errorMessage = 'Cannot move folder into its own descendant';
      vi.mocked(knowledgeApi.updateFolder).mockRejectedValue(new Error(errorMessage));
      const store = useKnowledgeStore();

      await expect(
        store.moveFolder(
          '550e8400-e29b-41d4-a716-446655440001',
          '550e8400-e29b-41d4-a716-446655440002'
        )
      ).rejects.toThrow(errorMessage);
      expect(store.error).toBe(errorMessage);
    });
  });

  describe('deleteFile', () => {
    it('should delete file and refresh tree', async () => {
      vi.mocked(knowledgeApi.deleteFile).mockResolvedValue();
      vi.mocked(knowledgeApi.listFolderTree).mockResolvedValue({ folders: [mockFolder] });
      const store = useKnowledgeStore();

      await store.deleteFile('550e8400-e29b-41d4-a716-446655440010');

      expect(knowledgeApi.deleteFile).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440010');
    });

    it('should handle deletion error', async () => {
      const errorMessage = 'Delete failed';
      vi.mocked(knowledgeApi.deleteFile).mockRejectedValue(new Error(errorMessage));
      const store = useKnowledgeStore();

      await expect(store.deleteFile('550e8400-e29b-41d4-a716-446655440010')).rejects.toThrow(
        errorMessage
      );
      expect(store.error).toBe(errorMessage);
    });
  });
});
