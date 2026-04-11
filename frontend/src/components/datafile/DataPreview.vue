<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PreviewData } from '@/types/datafile';
import { useDatafileStore } from '@/stores';

const { t } = useI18n();
const datafileStore = useDatafileStore();

const props = defineProps<{
  tableId: string;
}>();

const isLoading = ref(false);
const errorMsg = ref<string | null>(null);
const previewData = ref<PreviewData | null>(null);
const limit = ref(20);

const limitOptions = [
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
];

async function loadPreview(): Promise<void> {
  isLoading.value = true;
  errorMsg.value = null;
  try {
    previewData.value = await datafileStore.fetchPreviewData(props.tableId, limit.value);
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => props.tableId,
  () => {
    previewData.value = null;
    loadPreview();
  },
  { immediate: true }
);

watch(limit, () => {
  loadPreview();
});
</script>

<template>
  <div class="data-preview">
    <div v-if="errorMsg" class="preview-error">
      <span>{{ t('datafile.previewError') }}: {{ errorMsg }}</span>
    </div>
    <template v-else>
      <div class="preview-toolbar">
        <span v-if="previewData" class="total-rows">
          {{ t('datafile.totalRows') }}: {{ previewData.totalRows }}
        </span>
        <span v-else class="total-rows">&nbsp;</span>
        <div class="limit-selector">
          <span class="limit-label">{{ t('datafile.previewRows') }}</span>
          <el-select v-model="limit" size="small" class="limit-select">
            <el-option
              v-for="opt in limitOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>
      </div>
      <div v-loading="isLoading" class="preview-table-wrapper">
        <el-table
          v-if="previewData && previewData.rows.length > 0"
          :data="previewData.rows"
          border
          size="small"
          class="preview-table"
        >
          <el-table-column
            v-for="col in previewData.columns"
            :key="col"
            :prop="col"
            :label="col"
            min-width="120"
            show-overflow-tooltip
          />
        </el-table>
        <div v-else-if="previewData && previewData.rows.length === 0" class="preview-empty">
          {{ t('datafile.noPreviewData') }}
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.data-preview {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.total-rows {
  font-size: $font-size-xs;
  color: $text-secondary-color;
}

.limit-selector {
  display: flex;
  gap: $spacing-xs;
  align-items: center;
}

.limit-label {
  font-size: $font-size-xs;
  color: $text-secondary-color;
}

.limit-select {
  width: 80px;
}

.preview-table-wrapper {
  min-height: 200px;
}

.preview-table {
  :deep(.el-table__header th) {
    font-size: 11px;
    font-weight: $font-weight-semibold;
    color: $text-muted;
    letter-spacing: 0.5px;
    background: $bg-elevated;
  }

  :deep(.el-table__body td) {
    font-family: $font-family-dm-mono, 'PingFang SC', 'Microsoft YaHei', sans-serif;
    font-size: $font-size-xs;
  }
}

.preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  font-size: $font-size-sm;
  color: $text-secondary-color;
}

.preview-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  font-size: $font-size-sm;
  color: $error;
}
</style>
