<template>
  <el-dialog
    :model-value="visible"
    :title="t('knowledge.uploadDialogTitle')"
    width="520px"
    @update:model-value="$emit('update:visible', $event)"
    @close="handleClose"
  >
    <!-- Folder selection -->
    <div class="upload-dialog__section">
      <div class="upload-dialog__label">{{ t('knowledge.selectTargetFolder') }}</div>
      <FolderTreeSelector
        :folders="folders"
        :selected-folder-id="selectedFolderId"
        :show-root="false"
        @update:selected-folder-id="selectedFolderId = $event"
      />
      <div v-if="pathBreadcrumb.length > 0" class="upload-dialog__path">
        {{ t('knowledge.currentPath') }}: {{ pathBreadcrumb.join(' / ') }}
      </div>
    </div>

    <!-- Drop zone -->
    <div class="upload-dialog__section">
      <div
        class="upload-dialog__dropzone"
        :class="{ 'is-dragover': isDragOver }"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="handleDrop"
        @click="openFilePicker"
      >
        <el-icon class="upload-dialog__dropzone-icon"><Upload /></el-icon>
        <p class="upload-dialog__dropzone-text">
          {{ t('knowledge.dropZoneText') }}
          <span class="upload-dialog__dropzone-link">{{ t('knowledge.dropZoneClickUpload') }}</span>
        </p>
        <p class="upload-dialog__dropzone-hint">{{ t('knowledge.dropZoneHint') }}</p>
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

    <!-- Selected files list -->
    <div v-if="selectedFiles.length > 0" class="upload-dialog__section">
      <div class="upload-dialog__file-list">
        <div v-for="(file, index) in selectedFiles" :key="index" class="upload-dialog__file-item">
          <el-icon><Document /></el-icon>
          <span class="upload-dialog__file-name">{{ file.name }}</span>
          <span class="upload-dialog__file-size">{{ formatFileSize(file.size) }}</span>
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

    <template #footer>
      <el-button @click="$emit('update:visible', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="loading" :disabled="!canUpload" @click="handleUpload">
        {{ t('knowledge.upload') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Upload, Document, Close } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import FolderTreeSelector from './FolderTreeSelector.vue';
import { getFolderPath } from '@/utils/knowledge';
import type { KnowledgeFolder } from '@/types/knowledge';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const props = defineProps<{
  visible: boolean;
  folders: KnowledgeFolder[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  upload: [folderId: string, files: File[]];
}>();

const { t } = useI18n();
const selectedFolderId = ref<string | null>(null);
const selectedFiles = ref<File[]>([]);
const isDragOver = ref(false);
const fileInputRef = ref<HTMLInputElement>();

const pathBreadcrumb = computed(() => getFolderPath(props.folders, selectedFolderId.value));

const canUpload = computed(() => selectedFolderId.value !== null && selectedFiles.value.length > 0);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
    // Avoid duplicates by name
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

function handleUpload(): void {
  if (!selectedFolderId.value || selectedFiles.value.length === 0) return;
  emit('upload', selectedFolderId.value, [...selectedFiles.value]);
}

function handleClose(): void {
  selectedFolderId.value = null;
  selectedFiles.value = [];
  isDragOver.value = false;
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.upload-dialog {
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
}
</style>
