<template>
  <div class="folder-tree-selector" :class="{ 'folder-tree-selector--root': level === 0 }">
    <!-- Root node (only at level 0 and when showRoot is true) -->
    <div
      v-if="level === 0 && showRoot"
      class="folder-tree-selector__row"
      :class="{ 'is-selected': selectedFolderId === null }"
      @click="selectFolder(null)"
    >
      <el-icon class="folder-tree-selector__folder-icon">
        <Folder />
      </el-icon>
      <span class="folder-tree-selector__name">{{ t('knowledge.title') }}</span>
      <el-icon v-if="selectedFolderId === null" class="folder-tree-selector__check">
        <Check />
      </el-icon>
    </div>

    <!-- Folder items -->
    <div v-for="folder in folders" :key="folder.id" class="folder-tree-selector__item">
      <div
        class="folder-tree-selector__row"
        :class="{ 'is-selected': selectedFolderId === folder.id }"
        :style="{ paddingLeft: `${12 + level * 24}px` }"
        @click="handleFolderClick(folder)"
      >
        <el-icon
          v-if="folder.children.length > 0"
          class="folder-tree-selector__arrow"
          :class="{ 'is-expanded': expandedFolders.has(folder.id) }"
        >
          <ArrowRight />
        </el-icon>
        <span v-else class="folder-tree-selector__arrow-placeholder"></span>
        <el-icon class="folder-tree-selector__folder-icon">
          <Folder />
        </el-icon>
        <span class="folder-tree-selector__name">{{ folder.name }}</span>
        <el-icon v-if="selectedFolderId === folder.id" class="folder-tree-selector__check">
          <Check />
        </el-icon>
      </div>

      <!-- Recursive children -->
      <transition name="folder-tree">
        <FolderTreeSelector
          v-if="expandedFolders.has(folder.id) && folder.children.length > 0"
          :folders="folder.children"
          :selected-folder-id="selectedFolderId"
          :show-root="false"
          :level="level + 1"
          @update:selected-folder-id="$emit('update:selectedFolderId', $event)"
        />
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowRight, Folder, Check } from '@element-plus/icons-vue';
import type { KnowledgeFolder } from '@/types/knowledge';

withDefaults(
  defineProps<{
    folders: KnowledgeFolder[];
    selectedFolderId: string | null;
    showRoot?: boolean;
    level?: number;
  }>(),
  {
    showRoot: true,
    level: 0,
  }
);

const emit = defineEmits<{
  'update:selectedFolderId': [value: string | null];
}>();

const { t } = useI18n();
const expandedFolders = ref<Set<string>>(new Set());

function selectFolder(id: string | null): void {
  emit('update:selectedFolderId', id);
}

function handleFolderClick(folder: KnowledgeFolder): void {
  selectFolder(folder.id);
  if (folder.children.length > 0) {
    if (expandedFolders.value.has(folder.id)) {
      expandedFolders.value.delete(folder.id);
    } else {
      expandedFolders.value.add(folder.id);
    }
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.folder-tree-selector {
  &--root {
    max-height: 240px;
    overflow-y: auto;
    border: 1px solid var(--border-primary);
    border-radius: $radius-md;
  }

  &__row {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-sm $spacing-md;
    cursor: pointer;
    border-radius: $radius-sm;
    transition: background-color $transition-fast;

    &:hover {
      background-color: var(--bg-hover);
    }

    &.is-selected {
      background-color: var(--el-color-primary-light-9);

      .folder-tree-selector__folder-icon {
        color: var(--el-color-primary);
      }

      .folder-tree-selector__name {
        font-weight: $font-weight-medium;
        color: var(--el-color-primary);
      }
    }
  }

  &__arrow {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-tertiary);
    transition: transform $transition-fast;

    &.is-expanded {
      transform: rotate(90deg);
    }
  }

  &__arrow-placeholder {
    display: inline-block;
    flex-shrink: 0;
    width: 12px;
  }

  &__folder-icon {
    flex-shrink: 0;
    color: var(--el-color-warning);
  }

  &__name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-sm;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  &__check {
    flex-shrink: 0;
    font-size: 14px;
    color: var(--el-color-primary);
  }
}

.folder-tree-enter-active,
.folder-tree-leave-active {
  max-height: 300px;
  overflow: hidden;
  transition:
    max-height $transition-normal,
    opacity $transition-normal;
}

.folder-tree-enter-from,
.folder-tree-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
