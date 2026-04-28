<template>
  <div class="knowledge-file-form">
    <!-- file_upload -->
    <template v-if="payload.action === 'file_upload'">
      <div class="knowledge-file-form__section">
        <div class="knowledge-file-form__label">{{ t('knowledge.selectTargetFolder') }}</div>
        <FolderTreeSelector
          :folders="knowledgeStore.folderTree"
          :selected-folder-id="uploadFolderId"
          :show-root="false"
          @update:selected-folder-id="uploadFolderId = $event"
        />
        <div v-if="uploadPath.length > 0" class="knowledge-file-form__path">
          {{ t('knowledge.currentPath') }}: {{ uploadPath.join(' / ') }}
        </div>
      </div>

      <div class="knowledge-file-form__section">
        <div
          class="knowledge-file-form__dropzone"
          :class="{ 'is-dragover': isDragOver }"
          @dragover.prevent="isDragOver = true"
          @dragleave.prevent="isDragOver = false"
          @drop.prevent="handleDrop"
          @click="openFilePicker"
        >
          <el-icon class="knowledge-file-form__dropzone-icon"><Upload /></el-icon>
          <p class="knowledge-file-form__dropzone-text">
            {{ t('knowledge.dropZoneText') }}
            <span class="knowledge-file-form__dropzone-link">{{
              t('knowledge.dropZoneClickUpload')
            }}</span>
          </p>
          <p class="knowledge-file-form__dropzone-hint">{{ t('knowledge.dropZoneHint') }}</p>
        </div>
        <input
          ref="fileInputRef"
          type="file"
          multiple
          accept=".md,.markdown"
          style="display: none"
          @change="handleFileInputChange"
        />
      </div>

      <div v-if="selectedFiles.length > 0" class="knowledge-file-form__section">
        <div class="knowledge-file-form__file-list">
          <div
            v-for="(file, index) in selectedFiles"
            :key="index"
            class="knowledge-file-form__file-item"
          >
            <el-icon><Document /></el-icon>
            <span class="knowledge-file-form__file-name">{{ file.name }}</span>
            <span class="knowledge-file-form__file-size">{{ formatFileSize(file.size) }}</span>
            <el-button
              type="danger"
              :icon="Close"
              size="small"
              circle
              plain
              @click="removeFile(index)"
            />
          </div>
        </div>
      </div>

      <div class="knowledge-file-form__actions">
        <el-button size="small" @click="emit('cancel')">{{ t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          size="small"
          :loading="isSubmitting"
          :disabled="!canUpload || submitting"
          @click="handleUpload"
        >
          {{ t('knowledge.upload') }}
        </el-button>
      </div>
    </template>

    <!-- file_move -->
    <template v-else-if="payload.action === 'file_move'">
      <div class="knowledge-file-form__section">
        <div class="knowledge-file-form__label">{{ t('knowledge.selectTargetFolder') }}</div>
        <FolderTreeSelector
          :folders="knowledgeStore.folderTree"
          :selected-folder-id="moveTargetFolderId"
          :show-root="true"
          @update:selected-folder-id="moveTargetFolderId = $event"
        />
      </div>

      <div class="knowledge-file-form__actions">
        <el-button size="small" @click="emit('cancel')">{{ t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          size="small"
          :loading="isSubmitting"
          :disabled="moveTargetFolderId === null || submitting"
          @click="handleMove"
        >
          {{ t('common.confirm') }}
        </el-button>
      </div>
    </template>

    <!-- file_delete -->
    <template v-else-if="payload.action === 'file_delete'">
      <div class="knowledge-file-form__section">
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          :description="t('knowledge.deleteFileConfirm')"
        />
      </div>

      <div class="knowledge-file-form__actions">
        <el-button size="small" @click="emit('cancel')">{{ t('common.cancel') }}</el-button>
        <el-button
          type="danger"
          size="small"
          :loading="isSubmitting"
          :disabled="submitting"
          @click="handleDelete"
        >
          {{ t('common.delete') }}
        </el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Upload, Document, Close } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import FolderTreeSelector from '@/components/knowledge/FolderTreeSelector.vue';
import { useKnowledgeStore } from '@/stores';
import { getFolderPath } from '@/utils/knowledge';
import type { UiActionCardPayload } from '@/types/actionCard';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const props = defineProps<{
  payload: UiActionCardPayload;
  requestConfirmation?: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
}>();

const { t } = useI18n();
const knowledgeStore = useKnowledgeStore();

// --- file_upload state ---
const uploadFolderId = ref<string | null>((props.payload.params.folderId as string) ?? null);
const selectedFiles = ref<File[]>([]);
const isDragOver = ref(false);
const fileInputRef = ref<HTMLInputElement>();
const submitting = ref(false);

const uploadPath = computed(() => getFolderPath(knowledgeStore.folderTree, uploadFolderId.value));

const canUpload = computed(() => uploadFolderId.value !== null && selectedFiles.value.length > 0);
const isSubmitting = computed(() => knowledgeStore.isLoading || submitting.value);

// --- file_move state ---
const moveTargetFolderId = ref<string | null>(
  (props.payload.params.targetFolderId as string) ?? null
);

// --- lifecycle ---
onMounted(() => {
  knowledgeStore.fetchFolderTree();
});

// --- helpers ---
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- file_upload handlers ---
function addFiles(files: FileList | File[]): void {
  for (const file of Array.from(files)) {
    if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown')) {
      ElMessage.warning(t('knowledge.invalidFileType'));
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      ElMessage.warning(`${file.name}: ${t('knowledge.fileSizeExceeded')}`);
      continue;
    }
    if (!selectedFiles.value.some((f) => f.name === file.name && f.size === file.size)) {
      selectedFiles.value.push(file);
    }
  }
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false;
  if (event.dataTransfer?.files) {
    addFiles(event.dataTransfer.files);
  }
}

function openFilePicker(): void {
  fileInputRef.value?.click();
}

function handleFileInputChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    addFiles(input.files);
  }
  input.value = '';
}

function removeFile(index: number): void {
  selectedFiles.value.splice(index, 1);
}

async function handleUpload(): Promise<void> {
  if (submitting.value) return;
  if (!uploadFolderId.value || selectedFiles.value.length === 0) return;
  submitting.value = true;
  try {
    if (!(await confirmIfNeeded())) return;
    await knowledgeStore.uploadFiles(uploadFolderId.value, [...selectedFiles.value]);
    emit('submit', 'succeeded', { resultSummary: t('knowledge.uploadSuccess') });
  } catch {
    emit('submit', 'failed', { error: t('knowledge.uploadFailed') });
  } finally {
    submitting.value = false;
  }
}

// --- file_move handler ---
async function handleMove(): Promise<void> {
  if (submitting.value) return;
  const fileId = props.payload.params.fileId as string;
  if (!fileId || moveTargetFolderId.value === null) return;
  submitting.value = true;
  try {
    if (!(await confirmIfNeeded())) return;
    await knowledgeStore.moveFile(fileId, moveTargetFolderId.value);
    emit('submit', 'succeeded', { resultSummary: t('knowledge.moveSuccess') });
  } catch {
    emit('submit', 'failed', { error: t('common.failed') });
  } finally {
    submitting.value = false;
  }
}

// --- file_delete handler ---
async function handleDelete(): Promise<void> {
  if (submitting.value) return;
  const fileId = props.payload.params.fileId as string;
  if (!fileId) return;
  submitting.value = true;
  try {
    if (!(await confirmIfNeeded())) return;
    await knowledgeStore.deleteFile(fileId);
    emit('submit', 'succeeded', { resultSummary: t('knowledge.deleteFileSuccess') });
  } catch {
    emit('submit', 'failed', { error: t('common.failed') });
  } finally {
    submitting.value = false;
  }
}

async function confirmIfNeeded(): Promise<boolean> {
  if (props.payload.confirmationMode !== 'modal') {
    return true;
  }

  return props.requestConfirmation ? props.requestConfirmation() : true;
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.knowledge-file-form {
  &__section {
    margin-bottom: $spacing-md;

    &:last-of-type {
      margin-bottom: 0;
    }
  }

  &__label {
    margin-bottom: $spacing-sm;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: var(--text-primary);
  }

  &__path {
    margin-top: $spacing-xs;
    font-size: $font-size-xs;
    color: var(--text-tertiary);
  }

  &__dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: $spacing-lg;
    cursor: pointer;
    border: 2px dashed var(--border-primary);
    border-radius: $radius-md;
    transition:
      border-color $transition-fast,
      background-color $transition-fast;

    &:hover,
    &.is-dragover {
      background-color: var(--el-color-primary-light-9);
      border-color: var(--el-color-primary);
    }
  }

  &__dropzone-icon {
    margin-bottom: $spacing-sm;
    font-size: 28px;
    color: var(--text-tertiary);
  }

  &__dropzone-text {
    margin: 0;
    font-size: $font-size-sm;
    color: var(--text-secondary);
  }

  &__dropzone-link {
    color: var(--el-color-primary);
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }

  &__dropzone-hint {
    margin: $spacing-xs 0 0;
    font-size: $font-size-xs;
    color: var(--text-tertiary);
  }

  &__file-list {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
  }

  &__file-item {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-xs $spacing-sm;
    background-color: var(--bg-tertiary);
    border-radius: $radius-sm;
  }

  &__file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-sm;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  &__file-size {
    flex-shrink: 0;
    font-size: $font-size-xs;
    color: var(--text-tertiary);
  }

  &__actions {
    display: flex;
    gap: $spacing-sm;
    justify-content: flex-end;
    margin-top: $spacing-md;
  }
}

@media (max-width: $breakpoint-sm) {
  .knowledge-file-form {
    &__dropzone {
      padding: $spacing-md;
    }

    &__dropzone-icon {
      font-size: 24px;
    }

    &__actions {
      flex-direction: column-reverse;

      .el-button {
        width: 100%;
      }
    }
  }
}
</style>
