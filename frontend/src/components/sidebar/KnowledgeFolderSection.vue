<template>
  <div class="knowledge-folder-section">
    <div
      class="knowledge-folder-section__header"
      :class="{ 'is-drop-target': isRootDropTarget }"
      @click="isExpanded = !isExpanded"
      @dragover.prevent="handleRootDragOver"
      @dragleave="isRootDropTarget = false"
      @drop.prevent="handleRootDrop"
    >
      <el-icon class="knowledge-folder-section__chevron" :class="{ 'is-collapsed': !isExpanded }">
        <ArrowDown />
      </el-icon>
      <el-icon class="knowledge-folder-section__folder-icon"><Reading /></el-icon>
      <span class="knowledge-folder-section__title">{{ t('knowledge.title') }}</span>
      <span class="knowledge-folder-section__count">{{ totalFileCount }}</span>
      <div class="knowledge-folder-section__header-actions" @click.stop>
        <IconButton :title="t('knowledge.newFolder')" @click="showCreateFolder = true">
          <el-icon><FolderAdd /></el-icon>
        </IconButton>
        <IconButton :title="t('knowledge.uploadFiles')" @click="triggerUpload">
          <el-icon><Upload /></el-icon>
        </IconButton>
      </div>
    </div>

    <transition name="folder">
      <div v-if="isExpanded" class="knowledge-folder-section__content">
        <div v-if="folders.length === 0" class="knowledge-folder-section__empty">
          {{ t('knowledge.noContent') }}
        </div>
        <KnowledgeFolderTree
          v-else
          :folders="folders"
          @folder-delete="$emit('folderDelete', $event)"
          @file-select="(payload) => $emit('fileSelect', payload.id, payload.name)"
          @file-delete="$emit('fileDelete', $event)"
          @file-move="(payload) => $emit('fileMove', payload.fileId, payload.folderId)"
          @folder-move="(payload) => $emit('folderMove', payload.folderId, payload.targetParentId)"
        />
      </div>
    </transition>

    <CreateFolderDialog
      v-model:visible="showCreateFolder"
      :loading="isCreatingFolder"
      :folders="folders"
      @submit="handleCreateFolder"
    />

    <UploadKnowledgeDialog
      v-model:visible="showUploadDialog"
      :folders="folders"
      :loading="isUploading"
      @upload="handleUploadFiles"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowDown, Upload, FolderAdd, Reading } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { IconButton } from '@/components/common';
import KnowledgeFolderTree from './KnowledgeFolderTree.vue';
import CreateFolderDialog from './CreateFolderDialog.vue';
import UploadKnowledgeDialog from '@/components/knowledge/UploadKnowledgeDialog.vue';
import { useKnowledgeStore } from '@/stores';
import type { KnowledgeFolder } from '@/types/knowledge';

const props = defineProps<{
  folders: KnowledgeFolder[];
}>();

const emit = defineEmits<{
  folderDelete: [id: string];
  fileSelect: [id: string, name: string];
  fileDelete: [id: string];
  fileMove: [fileId: string, folderId: string];
  folderMove: [folderId: string, targetParentId: string | null];
}>();

const { t } = useI18n();
const knowledgeStore = useKnowledgeStore();
const isExpanded = ref(true);
const showCreateFolder = ref(false);
const isCreatingFolder = ref(false);
const showUploadDialog = ref(false);
const isUploading = ref(false);
const isRootDropTarget = ref(false);

function countAllFiles(folders: KnowledgeFolder[]): number {
  let count = 0;
  for (const folder of folders) {
    count += folder.files.length;
    count += countAllFiles(folder.children);
  }
  return count;
}

const totalFileCount = computed(() => countAllFiles(props.folders));

function handleRootDragOver(event: DragEvent): void {
  if (!event.dataTransfer) return;
  const type = event.dataTransfer.types;
  if (type.includes('application/x-knowledge-type')) {
    event.dataTransfer.dropEffect = 'move';
    isRootDropTarget.value = true;
  }
}

function handleRootDrop(event: DragEvent): void {
  isRootDropTarget.value = false;
  if (!event.dataTransfer) return;

  const type = event.dataTransfer.getData('application/x-knowledge-type');
  const id = event.dataTransfer.getData('application/x-knowledge-id');
  if (!type || !id) return;

  if (type === 'folder') {
    emit('folderMove', id, null);
  }
}

async function handleCreateFolder(name: string, parentId?: string): Promise<void> {
  isCreatingFolder.value = true;
  try {
    await knowledgeStore.createFolder(name, parentId);
    showCreateFolder.value = false;
    ElMessage.success(t('knowledge.createFolderSuccess'));
  } catch {
    ElMessage.error(t('common.failed'));
  } finally {
    isCreatingFolder.value = false;
  }
}

function triggerUpload(): void {
  if (props.folders.length === 0) {
    ElMessage.warning(t('knowledge.selectFolderFirst'));
    showCreateFolder.value = true;
    return;
  }
  showUploadDialog.value = true;
}

async function handleUploadFiles(folderId: string, files: File[]): Promise<void> {
  isUploading.value = true;
  try {
    await knowledgeStore.uploadFiles(folderId, files);
    showUploadDialog.value = false;
    ElMessage.success(t('knowledge.uploadSuccess'));
  } catch {
    ElMessage.error(t('knowledge.uploadFailed'));
  } finally {
    isUploading.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.knowledge-folder-section {
  &__header {
    display: flex;
    gap: $spacing-xs;
    align-items: center;
    min-width: 0;
    padding: $spacing-sm $spacing-sm;
    cursor: pointer;
    border-radius: $radius-sm;
    transition: background-color $transition-fast;

    &:hover {
      background-color: var(--bg-hover);
    }

    &.is-drop-target {
      outline: 2px dashed var(--accent);
      outline-offset: -2px;
      background-color: var(--accent-tint10);
    }
  }

  &__chevron {
    flex-shrink: 0;
    font-size: 14px;
    color: var(--text-tertiary);
    transition: transform $transition-fast;

    &.is-collapsed {
      transform: rotate(-90deg);
    }
  }

  &__folder-icon {
    flex-shrink: 0;
    font-size: 16px;
    color: var(--accent);
  }

  &__title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
    font-weight: $font-weight-semibold;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  &__count {
    padding: 2px $spacing-sm;
    font-size: 11px;
    color: var(--text-tertiary);
    background-color: var(--bg-elevated);
    border-radius: $radius-pill;
  }

  &__header-actions {
    display: flex;
    gap: $spacing-xs;
    align-items: center;
  }

  &__content {
    padding-left: 0;
  }

  &__empty {
    padding: $spacing-sm $spacing-md;
    font-size: $font-size-sm;
    font-style: italic;
    color: var(--text-tertiary);
  }
}

.folder-enter-active,
.folder-leave-active {
  max-height: 500px;
  overflow: hidden;
  transition:
    max-height $transition-normal,
    opacity $transition-normal;
}

.folder-enter-from,
.folder-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
