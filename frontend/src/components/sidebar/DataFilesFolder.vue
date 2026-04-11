<template>
  <div class="data-files-folder">
    <div class="data-files-folder__header" @click="isExpanded = !isExpanded">
      <el-icon class="data-files-folder__chevron" :class="{ 'is-collapsed': !isExpanded }">
        <ArrowDown />
      </el-icon>
      <component :is="folderIcon" :size="16" class="data-files-folder__folder-icon" />
      <span class="data-files-folder__title">{{ title }}</span>
      <span class="data-files-folder__count">{{ totalCount }}</span>
      <div class="data-files-folder__header-actions" @click.stop>
        <slot name="header-actions"></slot>
      </div>
    </div>

    <transition name="folder">
      <div v-if="isExpanded" class="data-files-folder__content">
        <div v-if="totalCount === 0" class="data-files-folder__empty">
          {{ emptyText }}
        </div>

        <!-- Datasources Section (tree structure) -->
        <DatasourceGroup
          v-for="datasource in datasources"
          :key="datasource.id"
          :datasource="datasource"
          @table-select="$emit('tableSelect', $event)"
          @table-delete="$emit('tableDelete', $event)"
          @delete="(id, type) => $emit('datasourceDelete', id, type)"
          @edit="$emit('datasourceEdit', $event)"
        />

        <!-- Tables Section (flat list for non-datasource tables) -->
        <template v-if="tables.length > 0">
          <div v-for="table in tables" :key="table.id" class="data-files-folder__item-wrapper">
            <div
              class="data-files-folder__item data-files-folder__item--table"
              :class="{ 'is-swiped': swipedTableId === table.id }"
              @click="handleItemClick(table.id)"
              @pointerdown="handlePointerDown($event, table.id)"
              @pointermove="handlePointerMove"
              @pointerup="handlePointerUp"
              @pointercancel="handlePointerUp"
            >
              <File :size="16" />
              <div class="data-files-folder__item-info">
                <span class="data-files-folder__item-name">{{ table.displayName }}</span>
                <span class="data-files-folder__item-meta">{{
                  formatRelativeTime(table.updatedAt)
                }}</span>
              </div>
              <el-button
                type="danger"
                :icon="Delete"
                size="small"
                circle
                plain
                class="data-files-folder__delete-btn data-files-folder__delete-btn--desktop"
                @click.stop="$emit('tableDelete', table.id)"
              />
            </div>
            <div class="data-files-folder__delete-action" @click.stop="handleDeleteClick(table.id)">
              <el-icon><Delete /></el-icon>
            </div>
          </div>
        </template>

        <!-- Static Items Section -->
        <div v-for="item in items" :key="item.id" class="data-files-folder__item">
          <File :size="16" />
          <span class="data-files-folder__item-name">{{ item.name }}</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, type Component } from 'vue';
import { ArrowDown, Delete } from '@element-plus/icons-vue';
import { File } from 'lucide-vue-next';
import type { TableMetadata, DatasourceWithTables, DatabaseDatasourceType } from '@/types/datafile';
import { formatRelativeTime } from '@/utils/time';
import { useSwipeGesture } from '@/composables/useSwipeGesture';
import DatasourceGroup from './DatasourceGroup.vue';

export interface DataFileItem {
  id: string;
  name: string;
}

const props = withDefaults(
  defineProps<{
    title: string;
    folderIcon?: Component;
    items?: DataFileItem[];
    tables?: TableMetadata[];
    datasources?: DatasourceWithTables[];
    emptyText: string;
  }>(),
  {
    folderIcon: () => File,
    items: () => [],
    tables: () => [],
    datasources: () => [],
  }
);

const emit = defineEmits<{
  (e: 'tableSelect', id: string): void;
  (e: 'tableDelete', id: string): void;
  (e: 'datasourceDelete', id: string, type: DatabaseDatasourceType): void;
  (e: 'datasourceEdit', id: string): void;
}>();

const isExpanded = ref(true);

// Swipe gesture for standalone tables
const {
  swipedId: swipedTableId,
  isSwiping: isTableSwiping,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
} = useSwipeGesture();

const totalCount = computed(() => {
  const datasourceTableCount = props.datasources.reduce((acc, ds) => acc + ds.tables.length, 0);
  return props.items.length + props.tables.length + datasourceTableCount;
});

function handleItemClick(tableId: string): void {
  if (isTableSwiping()) return;

  if (swipedTableId.value !== null && swipedTableId.value !== tableId) {
    swipedTableId.value = null;
    return;
  }

  if (swipedTableId.value === tableId) {
    swipedTableId.value = null;
    return;
  }

  emit('tableSelect', tableId);
}

function handleDeleteClick(tableId: string): void {
  swipedTableId.value = null;
  emit('tableDelete', tableId);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.data-files-folder {
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

  &__item-wrapper {
    position: relative;
    overflow: hidden;
    border-radius: $radius-md;
  }

  &__item {
    position: relative;
    z-index: 1;
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-sm $spacing-sm $spacing-sm $spacing-md;
    cursor: pointer;
    background-color: var(--bg-secondary);
    border-radius: $radius-sm;
    transition:
      background-color $transition-fast,
      transform 0.2s ease;

    &:hover {
      background-color: var(--bg-hover);
    }

    :deep(.el-icon) {
      flex-shrink: 0;
      font-size: 16px;
      color: var(--text-tertiary);
    }

    &--table {
      touch-action: pan-y;

      &.is-swiped {
        transform: translateX(-60px);
      }
    }
  }

  &__item-info {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  &__item-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  &__item-meta {
    margin-top: 2px;
    font-size: 11px;
    color: var(--text-tertiary);
  }

  &__delete-btn--desktop {
    display: none;
    flex-shrink: 0;

    @media (max-width: $breakpoint-md) {
      display: none !important;
    }
  }

  &__item:hover &__delete-btn--desktop {
    display: inline-flex;
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

  &__item--table.is-swiped + &__delete-action {
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
