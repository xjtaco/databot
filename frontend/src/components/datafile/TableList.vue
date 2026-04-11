<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Delete, Document } from '@element-plus/icons-vue';
import { ConfirmDialog } from '@/components/common';
import { useDatafileStore } from '@/stores';
import { formatRelativeTime } from '@/utils/time';

const { t } = useI18n();
const datafileStore = useDatafileStore();

const emit = defineEmits<{
  (e: 'select', id: string): void;
}>();

const tables = computed(() => datafileStore.tables);
const isLoading = computed(() => datafileStore.isLoading);

onMounted(() => {
  datafileStore.fetchTables();
});

function handleSelect(id: string): void {
  emit('select', id);
}

const showDeleteConfirm = ref(false);
const pendingDeleteId = ref<string | null>(null);
const isDeleting = ref(false);

function handleDelete(id: string, event: Event): void {
  event.stopPropagation();
  pendingDeleteId.value = id;
  showDeleteConfirm.value = true;
}

async function confirmDelete(): Promise<void> {
  if (!pendingDeleteId.value) return;
  isDeleting.value = true;
  try {
    await datafileStore.deleteTable(pendingDeleteId.value);
    ElMessage.success(t('datafile.deleteSuccess'));
    showDeleteConfirm.value = false;
    pendingDeleteId.value = null;
  } catch {
    ElMessage.error(t('datafile.deleteError'));
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <div class="table-list">
    <div class="list-header">
      <span class="title">{{ t('datafile.dataTables') }}</span>
      <span class="count">({{ tables.length }})</span>
    </div>

    <div v-if="isLoading" class="loading-state">
      <el-icon class="is-loading"><loading /></el-icon>
    </div>

    <div v-else-if="tables.length === 0" class="empty-state">
      {{ t('datafile.noDataTables') }}
    </div>

    <div v-else class="table-items">
      <div
        v-for="table in tables"
        :key="table.id"
        class="table-item"
        @click="handleSelect(table.id)"
      >
        <el-icon class="item-icon"><Document /></el-icon>
        <div class="item-content">
          <div class="item-name">{{ table.displayName }}</div>
          <div class="item-meta">{{ formatRelativeTime(table.updatedAt) }}</div>
        </div>
        <el-button
          type="danger"
          :icon="Delete"
          size="small"
          circle
          plain
          class="delete-btn"
          @click="(e: Event) => handleDelete(table.id, e)"
        />
      </div>
    </div>
    <ConfirmDialog
      v-model:visible="showDeleteConfirm"
      :title="t('common.warning')"
      :message="t('datafile.deleteConfirm')"
      type="danger"
      :confirm-text="t('common.delete')"
      :loading="isDeleting"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped lang="scss">
.table-list {
  padding: 8px;
}

.list-header {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 8px 4px;
  font-size: 14px;
}

.title {
  font-weight: 600;
}

.count {
  color: var(--el-text-color-secondary);
}

.loading-state,
.empty-state {
  padding: 20px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.table-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.table-item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.table-item:hover {
  background-color: var(--el-fill-color-light);
}

.item-icon {
  font-size: 16px;
  color: var(--el-text-color-secondary);
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.item-meta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.delete-btn {
  opacity: 0;
  transition: opacity 0.2s;
}

.table-item:hover .delete-btn {
  opacity: 1;
}
</style>
