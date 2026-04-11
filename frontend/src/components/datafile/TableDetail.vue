<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Loading } from '@element-plus/icons-vue';
import { useDatafileStore } from '@/stores';
import type { ColumnMetadata, UpdateTableInput, UpdateColumnInput } from '@/types/datafile';
import ColumnEditor from './ColumnEditor.vue';
import DictionaryPreview from './DictionaryPreview.vue';
import DataPreview from './DataPreview.vue';

const { t } = useI18n();
const datafileStore = useDatafileStore();

const props = defineProps<{
  tableId: string | null;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
}>();

const activeTab = ref('columns');
const isEditing = ref(false);
const editedDisplayName = ref('');
const editedDescription = ref('');
const pendingColumnUpdates = ref<Map<string, UpdateColumnInput>>(new Map());

const table = computed(() => datafileStore.currentTable);
const dictionaryContent = computed(() => datafileStore.dictionaryContent);
const isLoading = computed(() => datafileStore.isLoading);

watch(
  () => props.tableId,
  async (id) => {
    if (id !== null) {
      activeTab.value = 'columns';
      await datafileStore.fetchTable(id);
      resetEditing();
    }
  },
  { immediate: true }
);

watch(activeTab, async (tab) => {
  if (tab === 'dictionary' && props.tableId !== null) {
    await datafileStore.fetchDictionaryContent(props.tableId);
  }
});

function resetEditing(): void {
  isEditing.value = false;
  editedDisplayName.value = table.value?.displayName || '';
  editedDescription.value = table.value?.description || '';
  pendingColumnUpdates.value.clear();
}

function startEditing(): void {
  editedDisplayName.value = table.value?.displayName || '';
  editedDescription.value = table.value?.description || '';
  isEditing.value = true;
}

function cancelEditing(): void {
  resetEditing();
}

function handleColumnUpdate(column: ColumnMetadata): void {
  const existing = pendingColumnUpdates.value.get(column.id) || { id: column.id };
  pendingColumnUpdates.value.set(column.id, {
    ...existing,
    displayName: column.displayName,
    description: column.description,
    dataType: column.dataType,
  });
}

async function saveChanges(): Promise<void> {
  if (!props.tableId) return;

  const input: UpdateTableInput = {};

  if (editedDisplayName.value !== table.value?.displayName) {
    input.displayName = editedDisplayName.value;
  }

  if (editedDescription.value !== table.value?.description) {
    input.description = editedDescription.value;
  }

  if (pendingColumnUpdates.value.size > 0) {
    input.columns = Array.from(pendingColumnUpdates.value.values());
  }

  if (Object.keys(input).length === 0) {
    isEditing.value = false;
    return;
  }

  try {
    await datafileStore.updateTable(props.tableId, input);
    ElMessage.success(t('datafile.updateSuccess'));
    resetEditing();
  } catch {
    ElMessage.error(t('datafile.updateError'));
  }
}

function handleBack(): void {
  datafileStore.clearCurrentTable();
  emit('back');
}
</script>

<template>
  <div class="table-detail">
    <div class="detail-header">
      <el-button :icon="ArrowLeft" text @click="handleBack">
        {{ t('common.back') }}
      </el-button>

      <div class="header-actions">
        <template v-if="isEditing">
          <el-button size="small" @click="cancelEditing">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" size="small" :loading="isLoading" @click="saveChanges">
            {{ t('common.save') }}
          </el-button>
        </template>
        <el-button v-else type="primary" size="small" @click="startEditing">
          {{ t('common.edit') }}
        </el-button>
      </div>
    </div>

    <div v-if="!table" class="loading-state">
      <el-icon v-if="isLoading" class="is-loading"><loading /></el-icon>
      <span v-else>{{ t('datafile.tableNotFound') }}</span>
    </div>

    <div v-else class="detail-content">
      <div class="table-info">
        <el-form label-width="120px">
          <el-form-item :label="t('datafile.displayName')">
            <el-input v-if="isEditing" v-model="editedDisplayName" />
            <span v-else>{{ table.displayName }}</span>
          </el-form-item>
          <el-form-item :label="t('datafile.physicalName')">
            <span>{{ table.physicalName }}</span>
          </el-form-item>
          <el-form-item :label="t('datafile.description')">
            <el-input v-if="isEditing" v-model="editedDescription" type="textarea" :rows="2" />
            <span v-else>{{ table.description || '-' }}</span>
          </el-form-item>
        </el-form>
      </div>

      <el-tabs v-model="activeTab" class="detail-tabs">
        <el-tab-pane :label="t('datafile.columnList')" name="columns">
          <ColumnEditor
            :columns="table.columns"
            :editable="isEditing"
            @update="handleColumnUpdate"
          />
        </el-tab-pane>
        <el-tab-pane :label="t('datafile.dataDictionary')" name="dictionary">
          <DictionaryPreview :content="dictionaryContent" :loading="isLoading" />
        </el-tab-pane>
        <el-tab-pane :label="t('datafile.dataPreview')" name="preview">
          <DataPreview v-if="table && activeTab === 'preview'" :table-id="table.id" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.table-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--dialog-bg);
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $spacing-sm $spacing-md;
  background: var(--dialog-bg);
  border-bottom: 1px solid var(--dialog-border);
}

.header-actions {
  display: flex;
  gap: $spacing-sm;
}

.loading-state {
  display: flex;
  gap: $spacing-sm;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-secondary);
}

.detail-content {
  flex: 1;
  padding: $spacing-md;
  overflow: auto;

  @media (max-width: $breakpoint-md) {
    padding: $spacing-sm;
  }
}

.table-info {
  padding: $spacing-md;
  margin-bottom: $spacing-lg;
  background: var(--dialog-card-bg);
  border: 1px solid var(--dialog-border);
  border-radius: $radius-md;

  @media (max-width: $breakpoint-md) {
    padding: $spacing-sm;
    margin-bottom: $spacing-md;
  }

  :deep(.el-form-item__label) {
    color: var(--text-secondary);
  }

  :deep(.el-form-item__content) {
    color: var(--text-primary);
  }

  // Mobile: vertical form layout with left-aligned labels
  @media (max-width: $breakpoint-md) {
    :deep(.el-form-item) {
      flex-direction: column;
      margin-bottom: $spacing-sm;
    }

    :deep(.el-form-item__label) {
      justify-content: flex-start;
      width: 100% !important;
      padding: 0 0 $spacing-xs;
      text-align: left;
    }

    :deep(.el-form-item__content) {
      margin-left: 0 !important;
    }
  }
}

.detail-tabs {
  flex: 1;

  :deep(.el-tabs__header) {
    margin-bottom: $spacing-md;
  }

  :deep(.el-tabs__nav-wrap::after) {
    background-color: var(--dialog-border);
  }

  :deep(.el-tabs__item) {
    color: var(--text-secondary);
    transition: color $transition-fast;

    &:hover {
      color: var(--text-primary);
    }

    &.is-active {
      color: var(--accent);
    }
  }

  :deep(.el-tabs__active-bar) {
    background-color: var(--accent);
  }
}
</style>
