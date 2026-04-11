<template>
  <div class="wf-history" :class="{ 'wf-history--mobile': isMobile }">
    <!-- Header -->
    <div class="wf-history__header">
      <button class="wf-history__back-btn" @click="emit('back')">
        <ArrowLeft :size="18" />
      </button>
      <h2 class="wf-history__title">{{ workflowName }} — {{ t('workflow.history.title') }}</h2>
    </div>

    <!-- Filters -->
    <div class="wf-history__filters">
      <el-select v-model="store.historyStatusFilter" class="wf-history__status-filter">
        <el-option :label="t('workflow.history.filterAll')" value="all" />
        <el-option :label="t('workflow.status.completed')" value="completed" />
        <el-option :label="t('workflow.status.failed')" value="failed" />
        <el-option :label="t('workflow.status.running')" value="running" />
        <el-option :label="t('workflow.status.pending')" value="pending" />
        <el-option :label="t('workflow.status.cancelled')" value="cancelled" />
        <el-option :label="t('workflow.status.skipped')" value="skipped" />
      </el-select>
      <el-date-picker
        v-model="store.historyDateRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        :start-placeholder="t('workflow.history.dateRange')"
        :end-placeholder="t('workflow.history.dateRange')"
        clearable
        class="wf-history__date-filter"
      />
    </div>

    <!-- Error state -->
    <div v-if="loadError" class="wf-history__error">
      <p>{{ t('workflow.history.loadError') }}</p>
      <el-button type="primary" size="small" @click="reload">
        {{ t('workflow.history.retry') }}
      </el-button>
    </div>

    <!-- Desktop: Table -->
    <template v-else-if="!isMobile && store.historyRuns.length > 0">
      <el-table
        v-loading="store.historyLoading"
        :data="store.historyRuns"
        row-key="id"
        class="wf-history__table"
        @expand-change="handleExpandChange"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div v-if="store.expandedRunLoading === row.id" class="wf-history__node-loading">
              <el-skeleton :rows="3" animated />
            </div>
            <div v-else-if="store.expandedRunDetails.get(row.id)" class="wf-history__node-list">
              <div
                v-for="nr in store.expandedRunDetails.get(row.id)!.nodeRuns"
                :key="nr.id"
                class="wf-history__node-item"
              >
                <div class="wf-history__node-header">
                  <span :class="['wf-status-badge', 'wf-status-badge--' + nr.status]">{{
                    t(`workflow.status.${nr.status}`)
                  }}</span>
                  <span class="wf-history__node-name">{{ nr.nodeName ?? nr.nodeId }}</span>
                  <span class="wf-history__node-duration">
                    {{ nr.startedAt ? formatDuration(nr.startedAt, nr.completedAt) : '--' }}
                  </span>
                </div>
                <div v-if="nr.errorMessage" class="wf-history__node-error">
                  {{ nr.errorMessage }}
                </div>
                <details v-if="nr.inputs" class="wf-history__node-io">
                  <summary>{{ t('workflow.history.inputs') }}</summary>
                  <pre>{{ JSON.stringify(nr.inputs, null, 2) }}</pre>
                </details>
                <details v-if="nr.outputs" class="wf-history__node-io">
                  <summary>{{ t('workflow.history.outputs') }}</summary>
                  <pre>{{ JSON.stringify(nr.outputs, null, 2) }}</pre>
                </details>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('workflow.history.status')" width="120">
          <template #default="{ row }">
            <span :class="['wf-status-badge', 'wf-status-badge--' + row.status]">
              {{ t(`workflow.status.${row.status}`) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column :label="t('workflow.history.startedAt')" width="180">
          <template #default="{ row }">
            {{ new Date(row.startedAt).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column :label="t('workflow.history.duration')" width="120">
          <template #default="{ row }">
            {{ formatDuration(row.startedAt, row.completedAt) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('workflow.history.errorMessage')">
          <template #default="{ row }">
            <span v-if="row.errorMessage" class="wf-history__error-text">
              {{ row.errorMessage }}
            </span>
            <span v-else class="wf-history__no-error">—</span>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- Mobile: Cards -->
    <div
      v-else-if="isMobile && store.historyRuns.length > 0"
      v-loading="store.historyLoading"
      class="wf-history__cards"
    >
      <div
        v-for="run in store.historyRuns"
        :key="run.id"
        class="wf-history__card"
        @click="toggleMobileExpand(run.id)"
      >
        <div class="wf-history__card-header">
          <span :class="['wf-status-badge', 'wf-status-badge--' + run.status]">
            {{ t(`workflow.status.${run.status}`) }}
          </span>
          <span class="wf-history__card-time">
            {{ new Date(run.startedAt).toLocaleString() }}
          </span>
        </div>
        <div class="wf-history__card-meta">
          <span
            >{{ t('workflow.history.duration') }}:
            {{ formatDuration(run.startedAt, run.completedAt) }}</span
          >
        </div>
        <div v-if="run.errorMessage" class="wf-history__card-error">
          {{ run.errorMessage }}
        </div>
        <!-- Expanded node details -->
        <div v-if="mobileExpandedId === run.id" class="wf-history__card-nodes">
          <div v-if="store.expandedRunLoading === run.id" class="wf-history__node-loading">
            <el-skeleton :rows="2" animated />
          </div>
          <template v-else-if="store.expandedRunDetails.get(run.id)">
            <div
              v-for="nr in store.expandedRunDetails.get(run.id)!.nodeRuns"
              :key="nr.id"
              class="wf-history__node-item"
            >
              <div class="wf-history__node-header">
                <span :class="['wf-status-badge', 'wf-status-badge--' + nr.status]">
                  {{ t(`workflow.status.${nr.status}`) }}
                </span>
                <span class="wf-history__node-name">{{ nr.nodeName ?? nr.nodeId }}</span>
                <span class="wf-history__node-duration">
                  {{ nr.startedAt ? formatDuration(nr.startedAt, nr.completedAt) : '--' }}
                </span>
              </div>
              <div v-if="nr.errorMessage" class="wf-history__node-error">
                {{ nr.errorMessage }}
              </div>
              <details v-if="nr.inputs" class="wf-history__node-io">
                <summary>{{ t('workflow.history.inputs') }}</summary>
                <pre>{{ JSON.stringify(nr.inputs, null, 2) }}</pre>
              </details>
              <details v-if="nr.outputs" class="wf-history__node-io">
                <summary>{{ t('workflow.history.outputs') }}</summary>
                <pre>{{ JSON.stringify(nr.outputs, null, 2) }}</pre>
              </details>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <el-empty
      v-if="!store.historyLoading && !loadError && store.historyRuns.length === 0"
      :description="t('workflow.history.noRuns')"
    />

    <!-- Pagination -->
    <div v-if="store.historyTotal > 0" class="wf-history__pagination">
      <el-pagination
        v-model:current-page="store.historyPage"
        v-model:page-size="store.historyPageSize"
        :total="store.historyTotal"
        :page-sizes="[10, 20, 50]"
        :small="isMobile"
        layout="total, sizes, prev, pager, next"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft } from 'lucide-vue-next';
import { useWorkflowStore } from '@/stores/workflowStore';
import { formatDuration } from '@/utils/time';
import type { WorkflowRunInfo } from '@/types/workflow';

const props = defineProps<{
  workflowId: string;
  workflowName: string;
  isMobile?: boolean;
}>();

const emit = defineEmits<{
  back: [];
}>();

const { t } = useI18n();
const store = useWorkflowStore();
const loadError = ref(false);
const mobileExpandedId = ref<string | null>(null);

async function reload(): Promise<void> {
  loadError.value = false;
  try {
    await store.fetchHistoryRuns(props.workflowId);
  } catch {
    loadError.value = true;
  }
}

onMounted(() => {
  reload();
});

// Reset to page 1 and re-fetch when filters change
watch([() => store.historyStatusFilter, () => store.historyDateRange], () => {
  store.historyPage = 1;
  reload();
});

// Re-fetch when page or pageSize change (not filters — handled above)
watch([() => store.historyPage, () => store.historyPageSize], () => {
  reload();
});

function handleExpandChange(row: WorkflowRunInfo, expandedRows: WorkflowRunInfo[]): void {
  const isExpanding = expandedRows.some((r) => r.id === row.id);
  if (isExpanding) {
    store.fetchRunDetailForHistory(props.workflowId, row.id);
  }
}

function toggleMobileExpand(runId: string): void {
  if (mobileExpandedId.value === runId) {
    mobileExpandedId.value = null;
  } else {
    mobileExpandedId.value = runId;
    store.fetchRunDetailForHistory(props.workflowId, runId);
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-history {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: $spacing-lg;
  overflow-y: auto;

  &--mobile {
    padding: $spacing-md;
  }

  &__header {
    display: flex;
    gap: $spacing-md;
    align-items: center;
    margin-bottom: $spacing-lg;
  }

  &__back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    color: $text-muted;
    cursor: pointer;
    background: none;
    border: none;
    border-radius: $radius-md;
    transition: all $transition-fast;

    &:hover {
      color: $text-secondary-color;
      background-color: $bg-elevated;
    }
  }

  &__title {
    margin: 0;
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
  }

  &__filters {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-md;
    margin-bottom: $spacing-lg;
  }

  &__status-filter {
    width: 160px;
  }

  &__date-filter {
    width: 280px;
  }

  &__error {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-xl;
    color: $text-muted;
  }

  &__table {
    flex: 1;

    // Force dark theme on all El-Table internals
    :deep(.el-table__header-wrapper th),
    :deep(.el-table__header-wrapper th.el-table__cell) {
      color: $text-secondary-color !important;
      background-color: $bg-deeper !important;
      border-bottom-color: $border-dark !important;
    }

    :deep(.el-table__body-wrapper) {
      background-color: $bg-card;
    }

    :deep(.el-table__row) {
      background-color: $bg-card;

      td.el-table__cell {
        color: $text-primary-color;
        background-color: $bg-card !important;
        border-bottom-color: $border-dark !important;
      }

      &:hover td.el-table__cell {
        background-color: $bg-elevated !important;
      }
    }

    :deep(.el-table__expand-icon) {
      color: $text-muted;
    }

    :deep(.el-table__empty-block) {
      background-color: $bg-card;
    }

    :deep(&.el-table),
    :deep(&.el-table__inner-wrapper) {
      background-color: $bg-card;
    }

    :deep(::before) {
      background-color: $border-dark !important;
    }
  }

  &__pagination {
    display: flex;
    justify-content: center;
    padding-top: $spacing-lg;

    :deep(.el-pagination) {
      --el-pagination-bg-color: transparent;
      --el-pagination-text-color: #{$text-secondary-color};
      --el-pagination-button-disabled-color: #{$text-muted};
      --el-pagination-hover-color: #{$accent};
    }
  }

  &__node-loading {
    padding: $spacing-md;
    background-color: $bg-card;
  }

  // Override El-Table expanded row background
  :deep(.el-table__expanded-cell) {
    padding: 0 !important;
    background-color: $bg-card !important;
  }

  &__node-list {
    padding: $spacing-sm $spacing-lg;
    background-color: $bg-card;
  }

  &__node-item {
    padding: $spacing-sm 0;
    border-bottom: 1px solid $border-dark;

    &:last-child {
      border-bottom: none;
    }
  }

  &__node-header {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
  }

  &__node-name {
    font-weight: $font-weight-medium;
    color: $text-primary-color;
  }

  &__node-duration {
    margin-left: auto;
    font-size: $font-size-sm;
    color: $text-muted;
  }

  &__node-error {
    padding: $spacing-xs 0;
    font-size: $font-size-sm;
    color: #ef4444;
  }

  &__node-io {
    margin-top: $spacing-xs;
    font-size: $font-size-sm;

    summary {
      color: $text-secondary-color;
      cursor: pointer;
      user-select: none;
    }

    pre {
      max-height: 200px;
      padding: $spacing-sm;
      margin: $spacing-xs 0;
      overflow: auto;
      font-size: 12px;
      color: $text-secondary-color;
      background: $bg-deeper;
      border-radius: $radius-sm;
    }
  }

  &__error-text {
    font-size: $font-size-sm;
    color: #ef4444;
  }

  &__no-error {
    color: $text-muted;
  }

  &__cards {
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
  }

  &__card {
    padding: $spacing-md;
    cursor: pointer;
    background: $bg-elevated;
    border: 1px solid $border-dark;
    border-radius: $radius-md;
    transition: border-color $transition-fast;

    &:active {
      border-color: $border-elevated;
    }
  }

  &__card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $spacing-xs;
  }

  &__card-time {
    font-size: $font-size-sm;
    color: $text-muted;
  }

  &__card-meta {
    margin-bottom: $spacing-xs;
    font-size: $font-size-sm;
    color: $text-secondary-color;
  }

  &__card-error {
    margin-bottom: $spacing-sm;
    font-size: $font-size-sm;
    color: #ef4444;
  }

  &__card-nodes {
    padding-top: $spacing-sm;
    margin-top: $spacing-sm;
    border-top: 1px solid $border-dark;
  }
}

.wf-status-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  border-radius: 9999px;

  &--completed {
    color: #22c55e;
    background-color: rgb(34 197 94 / 10%);
  }

  &--failed {
    color: #ef4444;
    background-color: rgb(239 68 68 / 10%);
  }

  &--running,
  &--pending {
    color: #3b82f6;
    background-color: rgb(59 130 246 / 10%);
  }

  &--skipped {
    color: #f97316;
    background-color: rgb(249 115 22 / 10%);
  }

  &--cancelled,
  &--none {
    color: #6b7280;
    background-color: rgb(107 114 128 / 10%);
  }
}
</style>
