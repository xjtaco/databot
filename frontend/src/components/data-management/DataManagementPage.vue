<template>
  <div class="data-management" :class="{ 'data-management--mobile': isMobile }">
    <!-- Mobile: drawer for tree, main body for detail -->
    <template v-if="isMobile">
      <div v-if="!selectedItem" class="data-management__mobile-header">
        <el-button :icon="ArrowLeft" text @click="$emit('back')">
          {{ t('common.back') }}
        </el-button>
        <span class="data-management__mobile-title">{{ t('sidebar.dataManagement') }}</span>
        <el-button text @click="mobileDrawerOpen = true">
          <Menu :size="20" />
        </el-button>
      </div>

      <div class="data-management__detail-panel">
        <template v-if="selectedItem?.type === 'table'">
          <TableDetail :table-id="selectedItem.id" @back="handleDetailBack" />
        </template>
        <template v-else-if="selectedItem?.type === 'knowledgeFile'">
          <KnowledgeFileViewer
            :file-id="selectedItem.id"
            :file-name="selectedItem.name ?? ''"
            @back="handleDetailBack"
          />
        </template>
        <div v-else class="data-management__empty-state">
          <Database :size="48" class="data-management__empty-icon" />
          <span>{{ t('dataManagement.emptyState') }}</span>
        </div>
      </div>

      <el-drawer
        v-model="mobileDrawerOpen"
        direction="ltr"
        size="85%"
        :show-close="false"
        class="data-management__drawer"
      >
        <template #header>
          <div class="data-management__tabs">
            <button
              class="data-management__tab"
              :class="{ 'is-active': activeTab === 'data' }"
              @click="activeTab = 'data'"
            >
              <HardDrive :size="18" />
              <span>{{ t('sidebar.dataManagement') }}</span>
            </button>
            <button
              class="data-management__tab"
              :class="{ 'is-active': activeTab === 'knowledge' }"
              @click="activeTab = 'knowledge'"
            >
              <BookOpen :size="18" />
              <span>{{ t('sidebar.knowledgeBase') }}</span>
            </button>
          </div>
        </template>

        <DataTreeContent
          :active-tab="activeTab"
          :file-tables="fileTables"
          :datasources="datasources"
          :folders="knowledgeStore.folderTree"
          @table-select="handleTableSelect"
          @table-delete="handleTableDelete"
          @datasource-delete="handleDatasourceDelete"
          @datasource-edit="handleDatasourceEdit"
          @folder-delete="handleKnowledgeFolderDelete"
          @file-select="handleKnowledgeFileSelect"
          @file-delete="handleKnowledgeFileDelete"
          @file-move="handleKnowledgeFileMove"
          @folder-move="handleKnowledgeFolderMove"
        />
      </el-drawer>
    </template>

    <!-- Desktop: side-by-side layout -->
    <template v-else>
      <div class="data-management__tree-panel">
        <div class="data-management__tree-header">
          <div class="data-management__tabs">
            <button
              class="data-management__tab"
              :class="{ 'is-active': activeTab === 'data' }"
              @click="activeTab = 'data'"
            >
              <HardDrive :size="18" />
              <span>{{ t('sidebar.dataManagement') }}</span>
            </button>
            <button
              class="data-management__tab"
              :class="{ 'is-active': activeTab === 'knowledge' }"
              @click="activeTab = 'knowledge'"
            >
              <BookOpen :size="18" />
              <span>{{ t('sidebar.knowledgeBase') }}</span>
            </button>
          </div>
        </div>
        <DataTreeContent
          :active-tab="activeTab"
          :file-tables="fileTables"
          :datasources="datasources"
          :folders="knowledgeStore.folderTree"
          @table-select="handleTableSelect"
          @table-delete="handleTableDelete"
          @datasource-delete="handleDatasourceDelete"
          @datasource-edit="handleDatasourceEdit"
          @folder-delete="handleKnowledgeFolderDelete"
          @file-select="handleKnowledgeFileSelect"
          @file-delete="handleKnowledgeFileDelete"
          @file-move="handleKnowledgeFileMove"
          @folder-move="handleKnowledgeFolderMove"
        />
      </div>

      <div class="data-management__detail-panel">
        <template v-if="selectedItem?.type === 'table'">
          <TableDetail :table-id="selectedItem.id" @back="handleDetailBack" />
        </template>
        <template v-else-if="selectedItem?.type === 'knowledgeFile'">
          <KnowledgeFileViewer
            :file-id="selectedItem.id"
            :file-name="selectedItem.name ?? ''"
            @back="handleDetailBack"
          />
        </template>
        <div v-else class="data-management__empty-state">
          <Database :size="48" class="data-management__empty-icon" />
          <span>{{ t('dataManagement.emptyState') }}</span>
        </div>
      </div>
    </template>

    <ConfirmDialog
      v-model:visible="showDeleteConfirm"
      :title="t('common.warning')"
      :message="deleteConfirmMessage"
      type="danger"
      :confirm-text="t('common.delete')"
      :loading="isDeleting"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />

    <DatabaseConnectionDialog
      v-model="showDatasourceEditDialog"
      :edit-datasource="editingDatasource"
      @success="handleDatasourceEditSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Database, HardDrive, BookOpen, Menu } from 'lucide-vue-next';
import { ConfirmDialog } from '@/components/common';
import DataTreeContent from './DataTreeContent.vue';
import DatabaseConnectionDialog from '@/components/sidebar/DatabaseConnectionDialog.vue';
import { TableDetail } from '@/components/datafile';
import KnowledgeFileViewer from '@/components/knowledge/KnowledgeFileViewer.vue';
import { useDatafileStore, useKnowledgeStore } from '@/stores';
import type { DatasourceMetadata, DatabaseDatasourceType } from '@/types/datafile';

interface SelectedItem {
  type: 'table' | 'knowledgeFile';
  id: string;
  name?: string;
}

const props = defineProps<{
  isMobile?: boolean;
}>();

defineEmits<{
  back: [];
}>();

const { t } = useI18n();
const datafileStore = useDatafileStore();
const knowledgeStore = useKnowledgeStore();

// Tab & selection state
const activeTab = ref<'data' | 'knowledge'>('data');
const selectedItem = ref<SelectedItem | null>(null);
const mobileDrawerOpen = ref(props.isMobile === true);

// Delete confirmation state
const showDeleteConfirm = ref(false);
const pendingDeleteId = ref<string | null>(null);
const pendingDeleteType = ref<'table' | 'datasource' | 'knowledgeFolder' | 'knowledgeFile'>(
  'table'
);
const pendingDeleteDatasourceType = ref<DatabaseDatasourceType>('sqlite');
const isDeleting = ref(false);

// Datasource edit state
const showDatasourceEditDialog = ref(false);
const editingDatasource = ref<DatasourceMetadata | null>(null);

// Computed
const fileTables = computed(() =>
  datafileStore.tables.filter((t) => t.type === 'csv' || t.type === 'excel')
);

const datasources = computed(() => datafileStore.datasources);

const deleteConfirmMessage = computed(() => {
  switch (pendingDeleteType.value) {
    case 'datasource':
      return t('datafile.deleteDatasourceConfirm');
    case 'knowledgeFolder':
      return t('knowledge.deleteFolderConfirm');
    case 'knowledgeFile':
      return t('knowledge.deleteFileConfirm');
    default:
      return t('datafile.deleteConfirm');
  }
});

onMounted(() => {
  datafileStore.fetchTables();
  datafileStore.fetchDatasources();
  knowledgeStore.fetchFolderTree();
});

// Table handlers
function handleTableSelect(id: string): void {
  selectedItem.value = { type: 'table', id };
  if (props.isMobile) mobileDrawerOpen.value = false;
}

function handleTableDelete(id: string): void {
  pendingDeleteId.value = id;
  pendingDeleteType.value = 'table';
  showDeleteConfirm.value = true;
}

function handleDatasourceDelete(id: string, type: DatabaseDatasourceType): void {
  pendingDeleteId.value = id;
  pendingDeleteType.value = 'datasource';
  pendingDeleteDatasourceType.value = type;
  showDeleteConfirm.value = true;
}

function handleDatasourceEdit(id: string): void {
  const datasource = datafileStore.datasources.find((ds) => ds.id === id);
  if (datasource) {
    editingDatasource.value = datasource;
    showDatasourceEditDialog.value = true;
  }
}

function handleDatasourceEditSuccess(): void {
  editingDatasource.value = null;
}

// Knowledge handlers
function handleKnowledgeFolderDelete(id: string): void {
  pendingDeleteId.value = id;
  pendingDeleteType.value = 'knowledgeFolder';
  showDeleteConfirm.value = true;
}

function handleKnowledgeFileSelect(id: string, name: string): void {
  selectedItem.value = { type: 'knowledgeFile', id, name };
  if (props.isMobile) mobileDrawerOpen.value = false;
}

function handleKnowledgeFileDelete(id: string): void {
  pendingDeleteId.value = id;
  pendingDeleteType.value = 'knowledgeFile';
  showDeleteConfirm.value = true;
}

async function handleKnowledgeFileMove(fileId: string, folderId: string): Promise<void> {
  try {
    await knowledgeStore.moveFile(fileId, folderId);
    ElMessage.success(t('knowledge.moveSuccess'));
  } catch {
    ElMessage.error(t('common.failed'));
  }
}

async function handleKnowledgeFolderMove(
  folderId: string,
  targetParentId: string | null
): Promise<void> {
  try {
    await knowledgeStore.moveFolder(folderId, targetParentId);
    ElMessage.success(t('knowledge.moveSuccess'));
  } catch {
    ElMessage.error(t('common.failed'));
  }
}

// Detail navigation
function handleDetailBack(): void {
  selectedItem.value = null;
  datafileStore.clearCurrentTable();
  if (props.isMobile) {
    mobileDrawerOpen.value = true;
  }
}

// Delete confirmation
async function confirmDelete(): Promise<void> {
  if (pendingDeleteId.value === null || isDeleting.value) return;

  isDeleting.value = true;
  try {
    switch (pendingDeleteType.value) {
      case 'datasource':
        await datafileStore.deleteDatasource(
          pendingDeleteId.value,
          pendingDeleteDatasourceType.value
        );
        ElMessage.success(t('datafile.deleteDatasourceSuccess'));
        break;
      case 'knowledgeFolder':
        await knowledgeStore.deleteFolder(pendingDeleteId.value);
        ElMessage.success(t('knowledge.deleteFolderSuccess'));
        break;
      case 'knowledgeFile':
        await knowledgeStore.deleteFile(pendingDeleteId.value);
        ElMessage.success(t('knowledge.deleteFileSuccess'));
        break;
      default:
        await datafileStore.deleteTable(pendingDeleteId.value);
        ElMessage.success(t('datafile.deleteSuccess'));
        break;
    }

    // Clear selection if deleted item was being viewed
    if (
      selectedItem.value &&
      ((pendingDeleteType.value === 'table' && selectedItem.value.id === pendingDeleteId.value) ||
        (pendingDeleteType.value === 'knowledgeFile' &&
          selectedItem.value.id === pendingDeleteId.value))
    ) {
      selectedItem.value = null;
      mobileDrawerOpen.value = false;
    }
    if (
      pendingDeleteType.value === 'datasource' &&
      selectedItem.value?.type === 'table' &&
      datafileStore.currentTable?.datasourceId === pendingDeleteId.value
    ) {
      selectedItem.value = null;
      mobileDrawerOpen.value = false;
    }

    showDeleteConfirm.value = false;
    pendingDeleteId.value = null;
  } catch {
    ElMessage.error(t('common.failed'));
  } finally {
    isDeleting.value = false;
  }
}

function cancelDelete(): void {
  showDeleteConfirm.value = false;
  pendingDeleteId.value = null;
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/console' as console;

$data-tree-panel-width: 300px;

.data-management {
  @include console.console-page;

  flex-direction: row;

  &--mobile {
    flex-direction: column;

    .data-management__detail-panel {
      width: 100%;
      border-right: none;
    }
  }

  &__mobile-header {
    @include console.console-mobile-header;
  }

  &__mobile-title {
    flex: 1;
    font-size: $font-size-md;
    font-weight: $font-weight-semibold;
    color: var(--text-primary);
  }

  &__tree-panel {
    display: flex;
    flex-direction: column;
    width: $data-tree-panel-width;
    min-width: $data-tree-panel-width;
    height: 100%;
    background-color: var(--bg-secondary);
    border-right: 1px solid var(--border-primary);
  }

  &__tree-header {
    display: flex;
    align-items: center;
    min-height: 54px;
    padding: 0 $spacing-sm;
    border-bottom: 1px solid var(--border-primary);
  }

  &__tabs {
    display: flex;
    flex: 1;
    height: 100%;
  }

  &__tab {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
    height: 38px;
    padding: 0 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: var(--text-tertiary);
    white-space: nowrap;
    cursor: pointer;
    background: transparent;
    border: 1px solid transparent;
    border-radius: $radius-md;
    transition:
      color $transition-fast,
      background-color $transition-fast,
      border-color $transition-fast;

    &:hover:not(.is-active) {
      color: var(--text-secondary);
      background: var(--bg-control);
    }

    &.is-active {
      color: var(--accent);
      background: var(--accent-tint10);
      border-color: rgb(255 106 42 / 24%);
    }
  }

  &__tree-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $spacing-xs;
    padding: $spacing-sm;
    overflow-y: auto;
  }

  &__detail-panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    background:
      radial-gradient(circle at 70% 0%, rgb(255 106 42 / 4%), transparent 24%),
      var(--bg-console);
  }

  &__empty-state {
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: $font-size-sm;
    color: var(--text-tertiary);
  }

  &__empty-icon {
    opacity: 0.3;
  }
}

.folder-action-btn {
  margin-left: auto;
}
</style>
