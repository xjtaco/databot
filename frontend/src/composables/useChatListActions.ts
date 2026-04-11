import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useChatSessionStore } from '@/stores';

export function useChatListActions(emit: (evt: 'select-session', id: string) => void) {
  const { t } = useI18n();
  const chatSessionStore = useChatSessionStore();
  const showDeleteConfirm = ref(false);
  const pendingDeleteId = ref<string | null>(null);
  const isDeleting = ref(false);

  function handleSelect(id: string) {
    emit('select-session', id);
  }

  function handleDelete(id: string) {
    pendingDeleteId.value = id;
    showDeleteConfirm.value = true;
  }

  async function confirmDelete() {
    if (!pendingDeleteId.value) return;
    isDeleting.value = true;
    try {
      await chatSessionStore.removeSession(pendingDeleteId.value);
      ElMessage.success(t('chat.chatList.deleteSuccess'));
      showDeleteConfirm.value = false;
    } finally {
      isDeleting.value = false;
      pendingDeleteId.value = null;
    }
  }

  return {
    chatSessionStore,
    showDeleteConfirm,
    pendingDeleteId,
    isDeleting,
    handleSelect,
    handleDelete,
    confirmDelete,
  };
}
