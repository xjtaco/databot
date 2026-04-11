<template>
  <div v-if="schedules.length === 0" class="schedule-cards__empty">
    <p>{{ t('common.noData') }}</p>
  </div>
  <div v-else class="schedule-cards">
    <div
      v-for="item in schedules"
      :key="item.id"
      class="schedule-card"
      :class="{ 'schedule-card--paused': !item.enabled }"
    >
      <div class="schedule-card__header">
        <div class="schedule-card__title-row">
          <span class="schedule-card__status-dot" :class="statusDotClass(item)"></span>
          <span class="schedule-card__name">{{ item.name }}</span>
        </div>
        <div class="schedule-card__actions">
          <el-button size="small" circle @click="emit('edit', item.id)">
            <Pencil :size="14" />
          </el-button>
          <el-button size="small" type="danger" circle @click="emit('delete', item)">
            <Trash2 :size="14" />
          </el-button>
        </div>
      </div>

      <div class="schedule-card__meta">
        <span class="schedule-card__workflow">
          <Workflow :size="12" />
          {{ item.workflowName }}
        </span>
        <span v-if="item.creatorName" class="schedule-card__creator">
          <User :size="12" />
          {{ item.creatorName }}
        </span>
      </div>

      <div class="schedule-card__footer">
        <span class="schedule-card__schedule">
          <Timer :size="12" />
          {{ item.cronExpr }}
        </span>
        <span v-if="item.lastRunAt" class="schedule-card__last-run">
          {{ formatDate(item.lastRunAt) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Workflow, Timer, Pencil, Trash2, User } from 'lucide-vue-next';
import type { ScheduleListItem } from '@/types/schedule';

defineProps<{
  schedules: ScheduleListItem[];
}>();

const emit = defineEmits<{
  edit: [id: string];
  delete: [schedule: ScheduleListItem];
}>();

const { t } = useI18n();

function statusDotClass(row: ScheduleListItem): string {
  if (!row.enabled) return 'schedule-card__status-dot--paused';
  if (row.lastRunStatus === 'failed') return 'schedule-card__status-dot--failed';
  return 'schedule-card__status-dot--active';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.schedule-cards {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: $spacing-2xl 0;
    color: $text-muted;
  }
}

.schedule-card {
  padding: $spacing-md;
  background: $bg-card;
  border: 1px solid $border-dark;
  border-radius: $radius-md;
  transition: opacity $transition-fast;

  &--paused {
    opacity: 0.5;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $spacing-sm;
  }

  &__title-row {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
  }

  &__status-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: $radius-full;

    &--active {
      background: $success;
    }

    &--paused {
      background: $text-muted;
    }

    &--failed {
      background: $error;
    }
  }

  &__name {
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
  }

  &__actions {
    display: flex;
    gap: $spacing-xs;
  }

  &__meta {
    margin-bottom: $spacing-sm;
  }

  &__workflow {
    display: inline-flex;
    gap: $spacing-xs;
    align-items: center;
    font-size: $font-size-xs;
    color: $text-secondary-color;
  }

  &__creator {
    display: inline-flex;
    gap: $spacing-xs;
    align-items: center;
    margin-top: $spacing-xs;
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__schedule {
    display: inline-flex;
    gap: $spacing-xs;
    align-items: center;
    font-family: $font-family-mono;
  }

  &__last-run {
    color: $text-muted;
  }
}
</style>
