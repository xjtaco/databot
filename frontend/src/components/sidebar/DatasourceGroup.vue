<template>
  <div class="datasource-group">
    <!-- Datasource header with swipe wrapper -->
    <div class="datasource-group__header-wrapper">
      <div
        class="datasource-group__header"
        :class="{ 'is-swiped': swipedDatasourceId === datasource.id }"
        @click="handleHeaderClick"
        @pointerdown="handleDatasourcePointerDown($event, datasource.id)"
        @pointermove="handleDatasourcePointerMove"
        @pointerup="handleDatasourcePointerUp"
        @pointercancel="handleDatasourcePointerUp"
      >
        <el-icon class="datasource-group__arrow" :class="{ 'is-expanded': isExpanded }">
          <ArrowRight />
        </el-icon>
        <Database :size="16" />
        <span class="datasource-group__name">{{ datasource.database || datasource.name }}</span>
        <span class="datasource-group__count">{{ datasource.tables.length }}</span>
        <el-button
          v-if="
            datasource.type !== 'sqlite' && datasource.type !== 'csv' && datasource.type !== 'excel'
          "
          type="primary"
          :icon="Edit"
          size="small"
          circle
          plain
          class="datasource-group__action-btn datasource-group__action-btn--desktop"
          @click.stop="emit('edit', datasource.id)"
        />
        <el-button
          type="danger"
          :icon="Delete"
          size="small"
          circle
          plain
          class="datasource-group__delete-btn datasource-group__delete-btn--desktop"
          @click.stop="handleDeleteEmit"
        />
      </div>
      <div class="datasource-group__delete-action" @click.stop="handleSwipeDelete">
        <el-icon><Delete /></el-icon>
      </div>
    </div>

    <!-- Tables under this datasource -->
    <transition name="folder">
      <div v-if="isExpanded" class="datasource-group__tables">
        <div
          v-for="table in datasource.tables"
          :key="table.id"
          class="datasource-group__item-wrapper"
        >
          <div
            class="datasource-group__item"
            :class="{ 'is-swiped': swipedTableId === table.id }"
            @click="handleTableClick(table.id)"
            @pointerdown="handleTablePointerDown($event, table.id)"
            @pointermove="handleTablePointerMove"
            @pointerup="handleTablePointerUp"
            @pointercancel="handleTablePointerUp"
          >
            <File :size="16" />
            <div class="datasource-group__item-info">
              <span class="datasource-group__item-name">{{ table.displayName }}</span>
              <span class="datasource-group__item-meta">{{
                formatRelativeTime(table.updatedAt)
              }}</span>
            </div>
            <el-button
              type="danger"
              :icon="Delete"
              size="small"
              circle
              plain
              class="datasource-group__delete-btn datasource-group__delete-btn--desktop"
              @click.stop="emit('tableDelete', table.id)"
            />
          </div>
          <div
            class="datasource-group__delete-action"
            @click.stop="handleTableSwipeDelete(table.id)"
          >
            <el-icon><Delete /></el-icon>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ArrowRight, Delete, Edit } from '@element-plus/icons-vue';
import { File, Database } from 'lucide-vue-next';
import type { DatasourceWithTables, DatabaseDatasourceType } from '@/types/datafile';
import { formatRelativeTime } from '@/utils/time';
import { useSwipeGesture } from '@/composables/useSwipeGesture';

const props = defineProps<{
  datasource: DatasourceWithTables;
}>();

const emit = defineEmits<{
  (e: 'tableSelect', id: string): void;
  (e: 'tableDelete', id: string): void;
  (e: 'delete', id: string, type: DatabaseDatasourceType): void;
  (e: 'edit', id: string): void;
}>();

const isExpanded = ref(false);

const {
  swipedId: swipedDatasourceId,
  isSwiping: isDatasourceSwiping,
  handlePointerDown: handleDatasourcePointerDown,
  handlePointerMove: handleDatasourcePointerMove,
  handlePointerUp: handleDatasourcePointerUp,
} = useSwipeGesture();

const {
  swipedId: swipedTableId,
  isSwiping: isTableSwiping,
  handlePointerDown: handleTablePointerDown,
  handlePointerMove: handleTablePointerMove,
  handlePointerUp: handleTablePointerUp,
} = useSwipeGesture();

function handleHeaderClick(): void {
  if (isDatasourceSwiping()) return;

  if (swipedDatasourceId.value !== null && swipedDatasourceId.value !== props.datasource.id) {
    swipedDatasourceId.value = null;
    return;
  }
  if (swipedDatasourceId.value === props.datasource.id) {
    swipedDatasourceId.value = null;
    return;
  }

  isExpanded.value = !isExpanded.value;
}

function emitDelete(): void {
  const { type } = props.datasource;
  if (type === 'csv' || type === 'excel') return;
  emit('delete', props.datasource.id, type);
}

function handleDeleteEmit(): void {
  emitDelete();
}

function handleSwipeDelete(): void {
  swipedDatasourceId.value = null;
  emitDelete();
}

function handleTableClick(tableId: string): void {
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

function handleTableSwipeDelete(tableId: string): void {
  swipedTableId.value = null;
  emit('tableDelete', tableId);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.datasource-group {
  margin-bottom: $spacing-xs;

  &__header-wrapper {
    position: relative;
    overflow: hidden;
    border-radius: $radius-md;
  }

  &__header {
    position: relative;
    z-index: 1;
    display: flex;
    gap: $spacing-xs;
    align-items: center;
    min-width: 0;
    padding: $spacing-xs $spacing-sm;
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

    &:hover .datasource-group__delete-btn--desktop,
    &:hover .datasource-group__action-btn--desktop {
      opacity: 1;
    }

    &.is-swiped {
      transform: translateX(-60px);
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
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: var(--text-primary);
    white-space: nowrap;
  }

  &__count {
    padding: 2px 6px;
    font-size: $font-size-xs;
    color: var(--text-tertiary);
    background-color: var(--bg-tertiary);
    border-radius: $radius-full;
  }

  &__tables {
    padding-left: $spacing-lg;
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
    gap: $spacing-xs;
    align-items: center;
    padding: $spacing-sm $spacing-sm;
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

    :deep(.el-icon) {
      flex-shrink: 0;
      color: var(--text-secondary);
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
    font-size: $font-size-sm;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  &__item-meta {
    margin-top: 2px;
    font-size: 11px;
    color: var(--text-tertiary);
  }

  &__delete-btn--desktop,
  &__action-btn--desktop {
    display: none;
    flex-shrink: 0;

    @media (max-width: $breakpoint-md) {
      display: none !important;
    }
  }

  &__header:hover &__delete-btn--desktop,
  &__header:hover &__action-btn--desktop {
    display: inline-flex;
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

  &__header.is-swiped + &__delete-action,
  &__item.is-swiped + &__delete-action {
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
