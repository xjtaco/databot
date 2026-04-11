<template>
  <div class="knowledge-folder-tree">
    <div v-for="folder in folders" :key="folder.id" class="knowledge-folder-tree__folder">
      <!-- Folder row -->
      <div class="knowledge-folder-tree__folder-wrapper">
        <div
          class="knowledge-folder-tree__folder-row"
          :class="{
            'is-swiped': swipedFolderId === folder.id,
            'is-drop-target': dropTargetFolderId === folder.id,
          }"
          draggable="true"
          @click="handleFolderClick(folder.id)"
          @dragstart="handleDragStart($event, 'folder', folder.id)"
          @dragend="handleDragEnd"
          @dragover.prevent="handleDragOver($event, folder.id)"
          @dragleave="handleDragLeave(folder.id)"
          @drop.prevent="handleDrop($event, folder.id)"
          @pointerdown="handleFolderPointerDown($event, folder.id)"
          @pointermove="handleFolderPointerMove"
          @pointerup="handleFolderPointerUp"
          @pointercancel="handleFolderPointerUp"
        >
          <el-icon
            class="knowledge-folder-tree__arrow"
            :class="{ 'is-expanded': expandedFolders.has(folder.id) }"
          >
            <ArrowRight />
          </el-icon>
          <el-icon><Folder /></el-icon>
          <span class="knowledge-folder-tree__name">{{ folder.name }}</span>
          <span class="knowledge-folder-tree__count">{{ countItems(folder) }}</span>
          <el-button
            type="danger"
            :icon="Delete"
            size="small"
            circle
            plain
            class="knowledge-folder-tree__delete-btn knowledge-folder-tree__delete-btn--desktop"
            @click.stop="$emit('folderDelete', folder.id)"
          />
        </div>
        <div
          class="knowledge-folder-tree__delete-action"
          @click.stop="handleFolderSwipeDelete(folder.id)"
        >
          <el-icon><Delete /></el-icon>
        </div>
      </div>

      <!-- Folder children (recursive) + Files -->
      <transition name="folder">
        <div v-if="expandedFolders.has(folder.id)" class="knowledge-folder-tree__children">
          <!-- Sub-folders -->
          <KnowledgeFolderTree
            v-if="folder.children.length > 0"
            :folders="folder.children"
            @folder-delete="$emit('folderDelete', $event)"
            @file-select="$emit('fileSelect', $event)"
            @file-delete="$emit('fileDelete', $event)"
            @file-move="$emit('fileMove', $event)"
            @folder-move="$emit('folderMove', $event)"
          />

          <!-- Files in this folder -->
          <div
            v-for="file in folder.files"
            :key="file.id"
            class="knowledge-folder-tree__file-wrapper"
          >
            <div
              class="knowledge-folder-tree__file-row"
              :class="{ 'is-swiped': swipedFileId === file.id }"
              draggable="true"
              @click="handleFileClick(file)"
              @dragstart="handleDragStart($event, 'file', file.id)"
              @dragend="handleDragEnd"
              @pointerdown="handleFilePointerDown($event, file.id)"
              @pointermove="handleFilePointerMove"
              @pointerup="handleFilePointerUp"
              @pointercancel="handleFilePointerUp"
            >
              <el-icon><Document /></el-icon>
              <span class="knowledge-folder-tree__name">{{ file.name }}</span>
              <el-button
                type="danger"
                :icon="Delete"
                size="small"
                circle
                plain
                class="knowledge-folder-tree__delete-btn knowledge-folder-tree__delete-btn--desktop"
                @click.stop="$emit('fileDelete', file.id)"
              />
            </div>
            <div
              class="knowledge-folder-tree__delete-action"
              @click.stop="handleFileSwipeDelete(file.id)"
            >
              <el-icon><Delete /></el-icon>
            </div>
          </div>

          <!-- Empty folder -->
          <div
            v-if="folder.children.length === 0 && folder.files.length === 0"
            class="knowledge-folder-tree__empty"
          >
            {{ t('knowledge.noContent') }}
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowRight, Folder, Document, Delete } from '@element-plus/icons-vue';
import type { KnowledgeFolder, KnowledgeFile } from '@/types/knowledge';
import { useSwipeGesture } from '@/composables/useSwipeGesture';

defineProps<{
  folders: KnowledgeFolder[];
}>();

const emit = defineEmits<{
  folderDelete: [id: string];
  fileSelect: [payload: { id: string; name: string }];
  fileDelete: [id: string];
  fileMove: [payload: { fileId: string; folderId: string }];
  folderMove: [payload: { folderId: string; targetParentId: string | null }];
}>();

const { t } = useI18n();
const expandedFolders = ref<Set<string>>(new Set());
const dropTargetFolderId = ref<string | null>(null);

// Swipe gesture for folders
const {
  swipedId: swipedFolderId,
  isSwiping: isFolderSwiping,
  handlePointerDown: handleFolderPointerDown,
  handlePointerMove: handleFolderPointerMove,
  handlePointerUp: handleFolderPointerUp,
} = useSwipeGesture();

// Swipe gesture for files
const {
  swipedId: swipedFileId,
  isSwiping: isFileSwiping,
  handlePointerDown: handleFilePointerDown,
  handlePointerMove: handleFilePointerMove,
  handlePointerUp: handleFilePointerUp,
} = useSwipeGesture();

function countItems(folder: KnowledgeFolder): number {
  let count = folder.files.length;
  for (const child of folder.children) {
    count += countItems(child);
  }
  return count;
}

function toggleFolder(id: string): void {
  if (expandedFolders.value.has(id)) {
    expandedFolders.value.delete(id);
  } else {
    expandedFolders.value.add(id);
  }
}

// --- Drag and Drop ---
function handleDragStart(event: DragEvent, type: 'file' | 'folder', id: string): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-knowledge-type', type);
  event.dataTransfer.setData('application/x-knowledge-id', id);
}

function handleDragEnd(): void {
  dropTargetFolderId.value = null;
}

function handleDragOver(event: DragEvent, folderId: string): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.dropEffect = 'move';
  dropTargetFolderId.value = folderId;
}

function handleDragLeave(folderId: string): void {
  if (dropTargetFolderId.value === folderId) {
    dropTargetFolderId.value = null;
  }
}

function handleDrop(event: DragEvent, targetFolderId: string): void {
  if (!event.dataTransfer) return;
  dropTargetFolderId.value = null;

  const type = event.dataTransfer.getData('application/x-knowledge-type');
  const id = event.dataTransfer.getData('application/x-knowledge-id');

  if (!type || !id) return;

  if (type === 'file') {
    emit('fileMove', { fileId: id, folderId: targetFolderId });
  } else if (type === 'folder') {
    if (id === targetFolderId) return;
    emit('folderMove', { folderId: id, targetParentId: targetFolderId });
  }
}

// --- Folder click/swipe ---
function handleFolderClick(folderId: string): void {
  if (isFolderSwiping()) {
    return;
  }
  if (swipedFolderId.value !== null && swipedFolderId.value !== folderId) {
    swipedFolderId.value = null;
    return;
  }
  if (swipedFolderId.value === folderId) {
    swipedFolderId.value = null;
    return;
  }
  toggleFolder(folderId);
}

function handleFolderSwipeDelete(folderId: string): void {
  swipedFolderId.value = null;
  emit('folderDelete', folderId);
}

// --- File click/swipe ---
function handleFileClick(file: KnowledgeFile): void {
  if (isFileSwiping()) {
    return;
  }
  if (swipedFileId.value !== null && swipedFileId.value !== file.id) {
    swipedFileId.value = null;
    return;
  }
  if (swipedFileId.value === file.id) {
    swipedFileId.value = null;
    return;
  }
  emit('fileSelect', { id: file.id, name: file.name });
}

function handleFileSwipeDelete(fileId: string): void {
  swipedFileId.value = null;
  emit('fileDelete', fileId);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.knowledge-folder-tree {
  &__folder-wrapper,
  &__file-wrapper {
    position: relative;
    overflow: hidden;
    border-radius: $radius-md;
  }

  &__folder-row,
  &__file-row {
    position: relative;
    z-index: 1;
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-xs $spacing-md;
    touch-action: pan-y;
    cursor: pointer;
    background-color: var(--bg-secondary);
    border-radius: $radius-md;
    transition:
      background-color $transition-fast,
      transform 0.2s ease;

    &:hover {
      background-color: var(--bg-hover);
    }

    &.is-swiped {
      transform: translateX(-60px);
    }

    &.is-drop-target {
      outline: 2px dashed var(--el-color-primary);
      outline-offset: -2px;
      background-color: var(--el-color-primary-light-9);
    }
  }

  &__arrow {
    flex-shrink: 0;
    transition: transform $transition-fast;

    &.is-expanded {
      transform: rotate(90deg);
    }
  }

  &__name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-sm;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  &__count {
    flex-shrink: 0;
    padding: 2px 6px;
    font-size: $font-size-xs;
    color: var(--text-tertiary);
    background-color: var(--bg-tertiary);
    border-radius: $radius-full;
  }

  &__children {
    padding-left: $spacing-lg;
  }

  &__empty {
    padding: $spacing-xs $spacing-md;
    font-size: $font-size-xs;
    font-style: italic;
    color: var(--text-tertiary);
  }

  &__delete-btn--desktop {
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.2s;

    @media (max-width: $breakpoint-md) {
      display: none;
    }
  }

  &__folder-row:hover &__delete-btn--desktop,
  &__file-row:hover &__delete-btn--desktop {
    opacity: 1;
  }

  &__delete-action {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 60px;
    color: var(--text-inverse);
    cursor: pointer;
    background-color: var(--el-color-danger);
    border-radius: 0 $radius-md $radius-md 0;
    opacity: 0;
    transition: opacity 0.2s ease;

    &:active {
      background-color: var(--el-color-danger-dark-2);
    }

    @media (min-width: $breakpoint-md + 1) {
      display: none;
    }
  }

  &__folder-row.is-swiped + &__delete-action,
  &__file-row.is-swiped + &__delete-action {
    opacity: 1;
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
