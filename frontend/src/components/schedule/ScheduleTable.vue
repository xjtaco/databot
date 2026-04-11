<template>
  <el-table
    :data="schedules"
    class="schedule-table"
    :row-class-name="rowClassName"
    :empty-text="t('common.noData')"
  >
    <!-- Status -->
    <el-table-column :label="t('schedule.table.status')" width="120">
      <template #default="{ row }">
        <span class="schedule-table__status" :class="statusClass(row)">
          <span class="schedule-table__status-dot"></span>
          {{ statusLabel(row) }}
        </span>
      </template>
    </el-table-column>

    <!-- Task Name -->
    <el-table-column :label="t('schedule.table.taskName')" min-width="180">
      <template #default="{ row }">
        <div class="schedule-table__task">
          <span class="schedule-table__task-name">{{ row.name }}</span>
          <span v-if="row.description" class="schedule-table__task-desc">
            {{ row.description }}
          </span>
        </div>
      </template>
    </el-table-column>

    <!-- Workflow -->
    <el-table-column :label="t('schedule.table.workflow')" min-width="140">
      <template #default="{ row }">
        <span class="schedule-table__workflow">
          <Workflow :size="14" />
          {{ row.workflowName }}
        </span>
      </template>
    </el-table-column>

    <!-- Schedule -->
    <el-table-column :label="t('schedule.table.schedule')" min-width="140">
      <template #default="{ row }">
        <span class="schedule-table__schedule">
          <Timer :size="14" />
          {{ row.cronExpr }}
        </span>
      </template>
    </el-table-column>

    <!-- Last Run -->
    <el-table-column :label="t('schedule.table.lastRun')" min-width="160">
      <template #default="{ row }">
        <template v-if="row.lastRunAt">
          <span class="schedule-table__last-run">{{ formatDate(row.lastRunAt) }}</span>
        </template>
        <span v-else class="schedule-table__no-run">—</span>
      </template>
    </el-table-column>

    <!-- Creator -->
    <el-table-column :label="t('common.creator')" min-width="100">
      <template #default="{ row }">
        {{ row.creatorName || '—' }}
      </template>
    </el-table-column>

    <!-- Actions -->
    <el-table-column :label="t('schedule.table.actions')" width="120" align="center">
      <template #default="{ row }">
        <div class="schedule-table__actions">
          <el-tooltip :content="t('common.edit')" placement="top">
            <el-button size="small" circle @click="emit('edit', row.id)">
              <Pencil :size="14" />
            </el-button>
          </el-tooltip>
          <el-tooltip :content="t('common.delete')" placement="top">
            <el-button size="small" type="danger" circle @click="emit('delete', row)">
              <Trash2 :size="14" />
            </el-button>
          </el-tooltip>
        </div>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Workflow, Timer, Pencil, Trash2 } from 'lucide-vue-next';
import type { ScheduleListItem } from '@/types/schedule';

defineProps<{
  schedules: ScheduleListItem[];
}>();

const emit = defineEmits<{
  edit: [id: string];
  delete: [schedule: ScheduleListItem];
}>();

const { t } = useI18n();

function statusClass(row: ScheduleListItem): string {
  if (!row.enabled) return 'schedule-table__status--paused';
  if (row.lastRunStatus === 'failed') return 'schedule-table__status--failed';
  return 'schedule-table__status--active';
}

function statusLabel(row: ScheduleListItem): string {
  if (!row.enabled) return t('schedule.status.paused');
  if (row.lastRunStatus === 'failed') return t('schedule.status.failed');
  return t('schedule.status.active');
}

function rowClassName({ row }: { row: ScheduleListItem; rowIndex: number }): string {
  return row.enabled ? '' : 'schedule-table__row--paused';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.schedule-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: var(--bg-secondary);
  --el-table-row-hover-bg-color: var(--bg-elevated);
  --el-table-border-color: var(--border-primary);
  --el-table-text-color: var(--text-primary);
  --el-table-header-text-color: var(--text-tertiary);

  :deep(.el-table__header th.el-table__cell) {
    font-weight: 400;
  }

  :deep(.el-table__body tr:last-child td) {
    border-bottom: none;
  }

  :deep(.el-table__inner-wrapper::before) {
    display: none;
  }

  :deep(.schedule-table__row--paused td) {
    opacity: 0.5;
  }

  &__status {
    display: inline-flex;
    gap: $spacing-xs;
    align-items: center;
    font-size: $font-size-sm;
  }

  &__status-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: $radius-full;
  }

  &__status--active &__status-dot {
    background: $success;
  }

  &__status--active {
    color: $success;
  }

  &__status--paused &__status-dot {
    background: $text-muted;
  }

  &__status--paused {
    color: $text-muted;
  }

  &__status--failed &__status-dot {
    background: $error;
  }

  &__status--failed {
    color: $error;
  }

  &__task {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__task-name {
    font-weight: $font-weight-medium;
    color: $text-primary-color;
  }

  &__task-desc {
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__workflow {
    display: inline-flex;
    gap: $spacing-xs;
    align-items: center;
    font-size: $font-size-sm;
    color: $text-secondary-color;
  }

  &__schedule {
    display: inline-flex;
    gap: $spacing-xs;
    align-items: center;
    font-family: $font-family-mono;
    font-size: $font-size-sm;
    color: $text-secondary-color;
  }

  &__last-run {
    font-size: $font-size-sm;
    color: $text-secondary-color;
  }

  &__no-run {
    color: $text-muted;
  }

  &__actions {
    display: flex;
    gap: $spacing-xs;
    justify-content: center;
  }
}
</style>
