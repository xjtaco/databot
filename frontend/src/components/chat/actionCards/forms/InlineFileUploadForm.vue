<template>
  <div class="file-upload-form">
    <!-- Drop zone -->
    <div
      class="file-upload-form__dropzone"
      :class="{ 'is-dragover': isDragOver }"
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="handleDrop"
      @click="openFilePicker"
    >
      <el-icon class="file-upload-form__dropzone-icon"><Upload /></el-icon>
      <p class="file-upload-form__dropzone-text">
        {{ t('chat.actionCard.fileUpload.dropZoneText') }}
        <span class="file-upload-form__dropzone-link">{{
          t('chat.actionCard.fileUpload.dropZoneClickUpload')
        }}</span>
      </p>
      <p class="file-upload-form__dropzone-hint">
        {{ t('chat.actionCard.fileUpload.dropZoneHint') }}
      </p>
    </div>
    <input
      ref="fileInputRef"
      type="file"
      multiple
      :accept="ACCEPTED_EXTENSIONS.join(',')"
      class="file-upload-form__input"
      @change="handleFileInputChange"
    />

    <!-- Selected files list -->
    <div v-if="selectedFiles.length > 0" class="file-upload-form__file-list">
      <div
        v-for="(file, index) in selectedFiles"
        :key="`${file.name}-${file.size}-${index}`"
        class="file-upload-form__file-item"
      >
        <el-icon class="file-upload-form__file-icon"><Document /></el-icon>
        <span class="file-upload-form__file-name">{{ file.name }}</span>
        <span class="file-upload-form__file-size">{{ formatFileSize(file.size) }}</span>
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

    <!-- Action buttons -->
    <div class="file-upload-form__actions">
      <el-button @click="emit('cancel')">{{ t('common.cancel') }}</el-button>
      <el-button
        type="primary"
        :loading="isUploading"
        :disabled="selectedFiles.length === 0"
        @click="handleUpload"
      >
        {{
          isUploading
            ? t('chat.actionCard.fileUpload.uploading')
            : t('chat.actionCard.fileUpload.upload')
        }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Upload, Document, Close } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { UiActionCardPayload } from '@/types/actionCard';
import { useDatafileStore } from '@/stores';

const ACCEPTED_EXTENSIONS = ['.csv', '.xls', '.xlsx', '.db', '.sqlite', '.sqlite3'];
const SQLITE_EXTENSIONS = ['.db', '.sqlite', '.sqlite3'];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

defineProps<{ payload: UiActionCardPayload }>();

const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
}>();

const { t } = useI18n();
const datafileStore = useDatafileStore();

const selectedFiles = ref<File[]>([]);
const isDragOver = ref(false);
const isUploading = ref(false);
const fileInputRef = ref<HTMLInputElement>();

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isValidFileType(filename: string): boolean {
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(extension);
}

function isSqliteFile(filename: string): boolean {
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return SQLITE_EXTENSIONS.includes(extension);
}

function addFiles(files: FileList | File[]): void {
  for (const file of Array.from(files)) {
    if (!isValidFileType(file.name)) {
      ElMessage.warning(`${file.name}: ${t('chat.actionCard.fileUpload.invalidFileType')}`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      ElMessage.warning(`${file.name}: ${t('chat.actionCard.fileUpload.fileSizeExceeded')}`);
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
  if (selectedFiles.value.length === 0) return;

  isUploading.value = true;
  const uploadedNames: string[] = [];
  const files = [...selectedFiles.value];

  try {
    for (const file of files) {
      if (isSqliteFile(file.name)) {
        await datafileStore.uploadSqliteFile(file);
      } else {
        await datafileStore.uploadFile(file);
      }
      uploadedNames.push(file.name);
    }

    const resultSummary = t('chat.actionCard.fileUpload.uploadSuccess');
    emit('submit', 'succeeded', {
      resultSummary: `${resultSummary}: ${uploadedNames.join(', ')}`,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : t('chat.actionCard.fileUpload.uploadFailed');
    emit('submit', 'failed', { error: message });
  } finally {
    isUploading.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.file-upload-form {
  &__input {
    display: none;
  }

  &__dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: $spacing-lg;
    margin-bottom: $spacing-md;
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
    font-size: 32px;
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
    max-height: 200px;
    margin-bottom: $spacing-md;
    overflow-y: auto;
  }

  &__file-item {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-xs $spacing-sm;
    background-color: var(--bg-tertiary);
    border-radius: $radius-sm;
  }

  &__file-icon {
    flex-shrink: 0;
    color: var(--text-tertiary);
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
  }
}

@media (width <= 768px) {
  .file-upload-form {
    &__dropzone {
      padding: $spacing-md;
    }

    &__dropzone-icon {
      font-size: 24px;
    }

    &__dropzone-text {
      font-size: $font-size-xs;
    }

    &__file-list {
      max-height: 150px;
    }

    &__file-item {
      gap: $spacing-xs;
      padding: 4px $spacing-xs;
    }
  }
}
</style>
