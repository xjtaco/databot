<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ColumnMetadata, FieldDataType } from '@/types/datafile';

const { t } = useI18n();

defineProps<{
  columns: ColumnMetadata[];
  editable?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update', column: ColumnMetadata): void;
}>();

const dataTypeOptions: { value: FieldDataType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'datetime', label: 'Datetime' },
];

function handleUpdate(column: ColumnMetadata): void {
  emit('update', column);
}

function getTypeBadgeClass(dataType: FieldDataType): string {
  switch (dataType) {
    case 'number':
      return 'type-badge--number';
    case 'datetime':
      return 'type-badge--datetime';
    case 'boolean':
      return 'type-badge--boolean';
    default:
      return 'type-badge--string';
  }
}
</script>

<template>
  <div class="column-editor">
    <div class="column-table">
      <div class="col-header-row">
        <div class="col-cell col-cell--name">{{ t('datafile.columnDisplayName') }}</div>
        <div class="col-cell col-cell--physical">{{ t('datafile.columnPhysicalName') }}</div>
        <div class="col-cell col-cell--type">{{ t('datafile.dataType') }}</div>
        <div class="col-cell col-cell--desc">{{ t('datafile.columnDescription') }}</div>
      </div>
      <div
        v-for="(col, index) in columns"
        :key="col.id"
        class="col-row"
        :class="{ 'col-row--last': index === columns.length - 1 }"
      >
        <div class="col-cell col-cell--name">
          <el-input
            v-if="editable"
            v-model="col.displayName"
            size="small"
            class="cell-input"
            @change="handleUpdate(col)"
          />
          <span v-else class="cell-text cell-text--primary">{{ col.displayName }}</span>
        </div>
        <div class="col-cell col-cell--physical">
          <span class="cell-text cell-text--mono">{{ col.physicalName }}</span>
        </div>
        <div class="col-cell col-cell--type">
          <el-select
            v-if="editable"
            v-model="col.dataType"
            size="small"
            class="cell-select"
            @change="handleUpdate(col)"
          >
            <el-option
              v-for="opt in dataTypeOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <span v-else class="type-badge" :class="getTypeBadgeClass(col.dataType)">
            {{ col.dataType }}
          </span>
        </div>
        <div class="col-cell col-cell--desc">
          <el-input
            v-if="editable"
            v-model="col.description"
            size="small"
            class="cell-input"
            @change="handleUpdate(col)"
          />
          <span v-else class="cell-text cell-text--muted">{{ col.description || '-' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.column-editor {
  width: 100%;

  @media (max-width: $breakpoint-md) {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}

.column-table {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: $bg-deeper;
  border: 1px solid $border-dark;
  border-radius: $radius-lg;

  @media (max-width: $breakpoint-md) {
    min-width: 580px;
  }
}

.col-header-row {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: $bg-elevated;

  .col-cell {
    font-size: 11px;
    font-weight: $font-weight-semibold;
    color: $text-muted;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  @media (max-width: $breakpoint-md) {
    gap: 8px;
    padding: 10px 12px;
  }
}

.col-row {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid $border-dark;
  transition: background-color $transition-fast;

  &:hover {
    background: rgba($bg-elevated, 0.5);
  }

  &--last {
    border-bottom: none;
  }

  @media (max-width: $breakpoint-md) {
    gap: 8px;
    padding: 10px 12px;
  }
}

.col-cell {
  display: flex;
  align-items: center;
  min-width: 0;

  &--name {
    flex-shrink: 0;
    width: 160px;

    @media (max-width: $breakpoint-md) {
      width: 120px;
    }
  }

  &--physical {
    flex-shrink: 0;
    width: 140px;

    @media (max-width: $breakpoint-md) {
      width: 110px;
    }
  }

  &--type {
    flex-shrink: 0;
    width: 100px;

    @media (max-width: $breakpoint-md) {
      width: 80px;
    }
  }

  &--desc {
    flex: 1;
    min-width: 120px;
  }
}

.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: $font-size-xs;
  white-space: nowrap;

  &--primary {
    font-weight: $font-weight-medium;
    color: $text-primary-color;
  }

  &--mono {
    font-family: $font-family-dm-mono;
    color: #8b8b90;
  }

  &--muted {
    color: $text-secondary-color;
  }
}

.type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: $font-weight-medium;
  border-radius: $radius-pill;

  &--string {
    color: $text-muted;
    background: rgba($text-muted, 0.094);
  }

  &--number {
    color: $accent;
    background: $accent-tint10;
  }

  &--datetime {
    color: $success;
    background: $success-tint;
  }

  &--boolean {
    color: $warning;
    background: $warning-tint;
  }
}

.cell-input {
  :deep(.el-input__wrapper) {
    background: transparent;
    box-shadow: 0 0 0 1px $border-dark inset;

    &:hover {
      box-shadow: 0 0 0 1px $border-elevated inset;
    }

    &.is-focus {
      box-shadow: 0 0 0 1px $accent inset;
    }
  }

  :deep(.el-input__inner) {
    font-size: $font-size-xs;
    color: $text-primary-color;
  }
}

.cell-select {
  width: 100%;

  :deep(.el-select__wrapper) {
    background: transparent;
    box-shadow: 0 0 0 1px $border-dark inset;

    &:hover {
      box-shadow: 0 0 0 1px $border-elevated inset;
    }

    &.is-focused {
      box-shadow: 0 0 0 1px $accent inset;
    }
  }
}
</style>
