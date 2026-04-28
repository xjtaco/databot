<template>
  <div class="knowledge-folder-form">
    <!-- folder_create -->
    <template v-if="action === 'folder_create'">
      <el-form label-position="top" @submit.prevent="handleCreate">
        <el-form-item :label="t('knowledge.folderName')">
          <el-input
            v-model="folderName"
            :placeholder="t('knowledge.folderNamePlaceholder')"
            clearable
          />
        </el-form-item>
        <el-form-item :label="t('knowledge.selectParentFolder')">
          <FolderTreeSelector
            v-model:selected-folder-id="parentId"
            :folders="knowledgeStore.folderTree"
            :show-root="true"
          />
        </el-form-item>
      </el-form>
    </template>

    <!-- folder_rename -->
    <template v-else-if="action === 'folder_rename'">
      <el-form label-position="top" @submit.prevent="handleRename">
        <el-form-item :label="t('chat.actionCard.inlineForm.folderName')">
          <el-input
            v-model="folderName"
            :placeholder="t('knowledge.folderNamePlaceholder')"
            clearable
          />
        </el-form-item>
      </el-form>
    </template>

    <!-- folder_move -->
    <template v-else-if="action === 'folder_move'">
      <el-form label-position="top" @submit.prevent="handleMove">
        <el-form-item :label="t('knowledge.selectTargetFolder')">
          <FolderTreeSelector
            v-model:selected-folder-id="targetParentId"
            :folders="knowledgeStore.folderTree"
            :show-root="true"
          />
        </el-form-item>
      </el-form>
    </template>

    <!-- folder_delete -->
    <template v-else-if="action === 'folder_delete'">
      <div class="knowledge-folder-form__delete-warning">
        <el-icon class="knowledge-folder-form__delete-icon"><WarningFilled /></el-icon>
        <span>{{ t('knowledge.deleteFolderConfirm') }}</span>
      </div>
    </template>

    <!-- Action buttons -->
    <div class="knowledge-folder-form__actions">
      <el-button
        v-if="action === 'folder_delete'"
        type="danger"
        size="small"
        :loading="submitting"
        @click="handleDelete"
      >
        {{ t('common.delete') }}
      </el-button>
      <el-button v-else type="primary" size="small" :loading="submitting" @click="handleSubmit">
        {{ t('common.confirm') }}
      </el-button>
      <el-button size="small" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { WarningFilled } from '@element-plus/icons-vue';
import { useKnowledgeStore } from '@/stores';
import { updateFolder } from '@/api/knowledge';
import FolderTreeSelector from '@/components/knowledge/FolderTreeSelector.vue';
import type { UiActionCardPayload } from '@/types/actionCard';

const props = defineProps<{ payload: UiActionCardPayload }>();
const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
}>();

const { t } = useI18n();
const knowledgeStore = useKnowledgeStore();

const action = computed(() => props.payload.action);

const folderId = computed(() => (props.payload.params.folderId as string) ?? '');
const folderName = ref((props.payload.params.name as string) ?? '');
const parentId = ref<string | null>((props.payload.params.parentId as string | null) ?? null);
const targetParentId = ref<string | null>(
  (props.payload.params.targetParentId as string | null) ?? null
);

const submitting = ref(false);

onMounted(async () => {
  try {
    await knowledgeStore.fetchFolderTree();
  } catch {
    // Folder tree load failure is non-fatal; user can still interact with the form
  }
});

async function handleSubmit(): Promise<void> {
  if (action.value === 'folder_create') {
    await handleCreate();
  } else if (action.value === 'folder_rename') {
    await handleRename();
  } else if (action.value === 'folder_move') {
    await handleMove();
  }
}

async function handleCreate(): Promise<void> {
  if (!folderName.value.trim()) {
    emit('submit', 'failed', { error: t('chat.actionCard.inlineForm.folderNameRequired') });
    return;
  }
  submitting.value = true;
  try {
    await knowledgeStore.createFolder(folderName.value.trim(), parentId.value ?? undefined);
    emit('submit', 'succeeded', {
      resultSummary: t('knowledge.createFolderSuccess'),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : t('errors.unknownError');
    emit('submit', 'failed', { error: message });
  } finally {
    submitting.value = false;
  }
}

async function handleRename(): Promise<void> {
  if (!folderName.value.trim()) {
    emit('submit', 'failed', { error: t('chat.actionCard.inlineForm.folderNameRequired') });
    return;
  }
  if (!folderId.value) {
    emit('submit', 'failed', { error: t('errors.unknownError') });
    return;
  }
  submitting.value = true;
  try {
    await updateFolder(folderId.value, { name: folderName.value.trim() });
    await knowledgeStore.fetchFolderTree();
    emit('submit', 'succeeded', {
      resultSummary: t('chat.actionCard.inlineForm.renameSuccess'),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : t('errors.unknownError');
    emit('submit', 'failed', { error: message });
  } finally {
    submitting.value = false;
  }
}

async function handleMove(): Promise<void> {
  if (!folderId.value) {
    emit('submit', 'failed', { error: t('errors.unknownError') });
    return;
  }
  submitting.value = true;
  try {
    await knowledgeStore.moveFolder(folderId.value, targetParentId.value);
    emit('submit', 'succeeded', {
      resultSummary: t('knowledge.moveSuccess'),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : t('errors.unknownError');
    emit('submit', 'failed', { error: message });
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(): Promise<void> {
  if (!folderId.value) {
    emit('submit', 'failed', { error: t('errors.unknownError') });
    return;
  }
  submitting.value = true;
  try {
    await knowledgeStore.deleteFolder(folderId.value);
    emit('submit', 'succeeded', {
      resultSummary: t('knowledge.deleteFolderSuccess'),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : t('errors.unknownError');
    emit('submit', 'failed', { error: message });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped lang="scss">
.knowledge-folder-form {
  &__delete-warning {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 12px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--el-color-danger);
    background-color: var(--el-color-danger-light-9);
    border-radius: 6px;
  }

  &__delete-icon {
    flex-shrink: 0;
    margin-top: 2px;
  }

  &__actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 12px;
  }
}
</style>
