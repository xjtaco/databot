import { ref, computed, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { renderMarkdown } from '@/utils/markdown';
import * as knowledgeApi from '@/api/knowledge';

export function useKnowledgeContent(fileId: Ref<string | null>) {
  const { t } = useI18n();
  const isLoadingContent = ref(false);
  const isEditing = ref(false);
  const isSaving = ref(false);
  const rawContent = ref('');
  const editContent = ref('');

  const renderedContent = computed(() => renderMarkdown(rawContent.value));

  async function loadContent(id: string): Promise<void> {
    isLoadingContent.value = true;
    isEditing.value = false;
    try {
      const result = await knowledgeApi.getFileContent(id);
      rawContent.value = result.content;
      editContent.value = result.content;
    } catch {
      rawContent.value = '';
      editContent.value = '';
    } finally {
      isLoadingContent.value = false;
    }
  }

  async function handleSave(): Promise<void> {
    if (!fileId.value) return;
    isSaving.value = true;
    try {
      await knowledgeApi.updateFileContent(fileId.value, editContent.value);
      rawContent.value = editContent.value;
      isEditing.value = false;
      ElMessage.success(t('knowledge.saveSuccess'));
    } catch {
      ElMessage.error(t('knowledge.saveFailed'));
    } finally {
      isSaving.value = false;
    }
  }

  function cancelEdit(): void {
    editContent.value = rawContent.value;
    isEditing.value = false;
  }

  function resetState(): void {
    isEditing.value = false;
    rawContent.value = '';
    editContent.value = '';
  }

  return {
    isLoadingContent,
    isEditing,
    isSaving,
    editContent,
    renderedContent,
    loadContent,
    handleSave,
    cancelEdit,
    resetState,
  };
}
