<template>
  <div class="audit-log-page" :class="{ 'audit-log-page--mobile': isMobile }">
    <!-- ═══ Desktop Header ═══ -->
    <template v-if="!isMobile">
      <div class="audit-log-page__title-bar">
        <h2 class="audit-log-page__title">{{ t('auditLog.title') }}</h2>
        <p class="audit-log-page__description">{{ t('auditLog.description') }}</p>
      </div>
      <AuditLogFilterPanel
        :action-types="store.actionTypes"
        @query="handleQuery"
        @reset="handleReset"
        @export="handleExport"
      />
    </template>

    <!-- ═══ Mobile Header ═══ -->
    <template v-else>
      <div class="audit-log-page__mobile-header">
        <button class="audit-log-page__back-btn" @click="$emit('back')">
          <ArrowLeft :size="18" />
        </button>
        <span class="audit-log-page__mobile-title">{{ t('auditLog.title') }}</span>
      </div>
      <AuditLogFilterPanel
        :action-types="store.actionTypes"
        is-mobile
        @query="handleQuery"
        @reset="handleReset"
        @export="handleExport"
      />
    </template>

    <!-- ═══ Body ═══ -->
    <div class="audit-log-page__body">
      <!-- Desktop: Table -->
      <el-table
        v-if="!isMobile"
        v-loading="store.isLoading"
        :data="store.logs"
        class="audit-log-page__table"
      >
        <el-table-column :label="t('auditLog.table.time')" width="170">
          <template #default="{ row }">
            <span class="audit-log-page__date">{{ formatDate(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="username" :label="t('auditLog.table.operator')" width="120" />
        <el-table-column :label="t('auditLog.table.category')" width="120">
          <template #default="{ row }">
            <el-tag :type="getCategoryColor(row.category)" size="small">
              {{ t(`auditLog.categories.${row.category}`) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('auditLog.table.action')" width="140">
          <template #default="{ row }">
            {{ t(`auditLog.actions.${row.action}`) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('auditLog.table.details')" min-width="260">
          <template #default="{ row }">
            <span class="audit-log-page__detail">{{ renderDetail(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('auditLog.table.ipAddress')" width="140">
          <template #default="{ row }">
            {{ row.ipAddress || '—' }}
          </template>
        </el-table-column>
      </el-table>

      <!-- Mobile: Card List -->
      <div v-else class="audit-log-page__card-list">
        <div v-if="store.isLoading" v-loading="true" class="audit-log-page__loading"></div>
        <template v-else-if="store.logs.length > 0">
          <div v-for="log in store.logs" :key="log.id" class="audit-log-page__card">
            <div class="audit-log-page__card-header">
              <el-tag :type="getCategoryColor(log.category)" size="small">
                {{ t(`auditLog.categories.${log.category}`) }}
              </el-tag>
              <span class="audit-log-page__card-time">{{ formatDate(log.createdAt) }}</span>
            </div>
            <div class="audit-log-page__card-action">
              {{ t(`auditLog.actions.${log.action}`) }}
            </div>
            <div class="audit-log-page__card-detail">{{ renderDetail(log) }}</div>
            <div class="audit-log-page__card-footer">
              <span>{{ log.username }}</span>
              <span v-if="log.ipAddress">{{ log.ipAddress }}</span>
            </div>
          </div>
        </template>
        <div v-else class="audit-log-page__empty">{{ t('auditLog.table.noData') }}</div>
      </div>

      <!-- Pagination -->
      <div v-if="store.totalPages > 1" class="audit-log-page__pagination">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="store.pageSize"
          :total="store.total"
          layout="prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import AuditLogFilterPanel from './AuditLogFilterPanel.vue';
import { useAuditLogStore } from '@/stores';
import type { AuditLogEntry } from '@/types/auditLog';

defineProps<{
  isMobile?: boolean;
}>();

defineEmits<{
  back: [];
}>();

const { t } = useI18n();
const store = useAuditLogStore();

const currentPage = ref(1);

type TagType = 'success' | 'warning' | 'primary' | 'info' | 'danger';

const categoryColors: Record<string, TagType> = {
  auth: 'danger',
  user_management: 'primary',
  datasource: 'success',
  workflow: 'warning',
  knowledge: 'info',
  system_config: 'info',
};

function getCategoryColor(category: string): TagType {
  return categoryColors[category] ?? 'info';
}

function renderDetail(log: AuditLogEntry): string {
  const key = `auditLog.details.${log.action}`;
  const params = (log.params ?? {}) as Record<string, unknown>;
  const flatParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    flatParams[k] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
  }
  return t(key, flatParams);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function handleQuery(filters: {
  startDate: string;
  endDate: string;
  userId: string;
  category: string;
  action: string;
  keyword: string;
}): void {
  store.setDateRange(filters.startDate, filters.endDate);
  store.setUserId(filters.userId);
  store.selectedCategory = filters.category;
  store.selectedAction = filters.action;
  store.keyword = filters.keyword;
  store.page = 1;
  currentPage.value = 1;
  store.fetchLogs();
}

function handleReset(): void {
  store.resetFilters();
  currentPage.value = 1;
  store.fetchLogs();
}

async function handleExport(): Promise<void> {
  try {
    await store.doExport();
    ElMessage.success(t('auditLog.exportSuccess'));
  } catch {
    ElMessage.error(t('auditLog.exportFailed'));
  }
}

function handlePageChange(page: number): void {
  store.setPage(page);
  store.fetchLogs();
}

onMounted(() => {
  store.fetchLogs();
  store.fetchActions();
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/console' as console;

.audit-log-page {
  @include console.console-scroll-page;
  @include console.console-desktop-padding;

  &--mobile {
    padding: 0;
  }

  // Override Element Plus to match dark theme
  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper) {
    background-color: $bg-elevated;
    box-shadow: 0 0 0 1px $border-dark inset;
  }

  :deep(.el-input__inner),
  :deep(.el-select__input) {
    color: $text-primary-color;
  }

  &__title-bar {
    @include console.console-title-stack;

    margin-bottom: 0;
  }

  &__title {
    @include console.console-title;
  }

  &__description {
    @include console.console-description;
  }

  &__body {
    flex: 1;
    min-height: 0;
  }

  // Table dark theme
  &__table {
    @include console.console-table;
  }

  &__date {
    font-size: $font-size-sm;
    color: $text-secondary-color;
  }

  &__detail {
    font-size: $font-size-sm;
    color: $text-secondary-color;
  }

  &__pagination {
    display: flex;
    justify-content: center;
    padding: $spacing-lg 0;
  }

  // Mobile header
  &__mobile-header {
    @include console.console-mobile-header;
  }

  &__mobile-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-md;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
    white-space: nowrap;
  }

  &__back-btn {
    @include console.console-icon-button;
  }

  // Mobile card list
  &__card-list {
    padding: $spacing-sm;
  }

  &__loading {
    min-height: 200px;
  }

  &__card {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
    padding: $spacing-sm;
    margin-bottom: $spacing-sm;
    background-color: $bg-elevated;
    border: 1px solid $border-dark;
    border-radius: $radius-md;
  }

  &__card-header {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    justify-content: space-between;
  }

  &__card-time {
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__card-action {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $text-primary-color;
  }

  &__card-detail {
    font-size: $font-size-sm;
    color: $text-secondary-color;
  }

  &__card-footer {
    display: flex;
    gap: $spacing-md;
    align-items: center;
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__empty {
    padding: $spacing-xl;
    font-size: $font-size-sm;
    color: $text-muted;
    text-align: center;
  }
}
</style>
