import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { KnowledgeFolder } from '@/types/knowledge';
import * as knowledgeApi from '@/api/knowledge';
import { useAsyncAction } from '@/composables/useAsyncAction';

export const useKnowledgeStore = defineStore('knowledge', () => {
  const folderTree = ref<KnowledgeFolder[]>([]);

  const { isLoading, error, wrapAction } = useAsyncAction();

  const fetchFolderTree = wrapAction(async (): Promise<void> => {
    const result = await knowledgeApi.listFolderTree();
    folderTree.value = result.folders;
  });

  const createFolder = wrapAction(async (name: string, parentId?: string): Promise<void> => {
    await knowledgeApi.createFolder(name, parentId);
    await fetchFolderTree();
  });

  const deleteFolder = wrapAction(async (id: string): Promise<void> => {
    await knowledgeApi.deleteFolder(id);
    await fetchFolderTree();
  });

  const uploadFiles = wrapAction(async (folderId: string, files: File[]): Promise<void> => {
    await knowledgeApi.uploadFiles(folderId, files);
    await fetchFolderTree();
  });

  const moveFile = wrapAction(async (id: string, folderId: string): Promise<void> => {
    await knowledgeApi.moveFile(id, folderId);
    await fetchFolderTree();
  });

  const moveFolder = wrapAction(
    async (id: string, targetParentId: string | null): Promise<void> => {
      await knowledgeApi.updateFolder(id, { parentId: targetParentId });
      await fetchFolderTree();
    }
  );

  const deleteFile = wrapAction(async (id: string): Promise<void> => {
    await knowledgeApi.deleteFile(id);
    await fetchFolderTree();
  });

  return {
    folderTree,
    isLoading,
    error,
    fetchFolderTree,
    createFolder,
    deleteFolder,
    uploadFiles,
    moveFile,
    moveFolder,
    deleteFile,
  };
});
