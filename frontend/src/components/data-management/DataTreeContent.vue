<template>
  <div class="data-management__tree-body">
    <template v-if="activeTab === 'data'">
      <DataFilesFolder
        :title="t('sidebar.dataFiles')"
        :folder-icon="FileSpreadsheet"
        :tables="fileTables"
        :empty-text="t('sidebar.noFiles')"
        @table-select="$emit('tableSelect', $event)"
        @table-delete="$emit('tableDelete', $event)"
      >
        <template #header-actions>
          <FileUploadButton class="folder-action-btn" />
        </template>
      </DataFilesFolder>

      <DataFilesFolder
        :title="t('sidebar.databases')"
        :folder-icon="Database"
        :datasources="datasources"
        :empty-text="t('sidebar.noDatabases')"
        @table-select="$emit('tableSelect', $event)"
        @table-delete="$emit('tableDelete', $event)"
        @datasource-delete="
          (id: string, type: DatabaseDatasourceType) => $emit('datasourceDelete', id, type)
        "
        @datasource-edit="$emit('datasourceEdit', $event)"
      >
        <template #header-actions>
          <SQLiteUploadButton class="folder-action-btn" />
          <DatabaseConnectionButton class="folder-action-btn" />
        </template>
      </DataFilesFolder>
    </template>

    <template v-else-if="activeTab === 'knowledge'">
      <KnowledgeFolderSection
        :folders="folders"
        @folder-delete="$emit('folderDelete', $event)"
        @file-select="(id: string, name: string) => $emit('fileSelect', id, name)"
        @file-delete="$emit('fileDelete', $event)"
        @file-move="(fileId: string, folderId: string) => $emit('fileMove', fileId, folderId)"
        @folder-move="
          (folderId: string, targetParentId: string | null) =>
            $emit('folderMove', folderId, targetParentId)
        "
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { FileSpreadsheet, Database } from 'lucide-vue-next';
import DataFilesFolder from '@/components/sidebar/DataFilesFolder.vue';
import FileUploadButton from '@/components/sidebar/FileUploadButton.vue';
import SQLiteUploadButton from '@/components/sidebar/SQLiteUploadButton.vue';
import DatabaseConnectionButton from '@/components/sidebar/DatabaseConnectionButton.vue';
import KnowledgeFolderSection from '@/components/sidebar/KnowledgeFolderSection.vue';
import type { TableMetadata, DatasourceWithTables, DatabaseDatasourceType } from '@/types/datafile';
import type { KnowledgeFolder } from '@/types/knowledge';

defineProps<{
  activeTab: 'data' | 'knowledge';
  fileTables: TableMetadata[];
  datasources: DatasourceWithTables[];
  folders: KnowledgeFolder[];
}>();

defineEmits<{
  tableSelect: [id: string];
  tableDelete: [id: string];
  datasourceDelete: [id: string, type: DatabaseDatasourceType];
  datasourceEdit: [id: string];
  folderDelete: [id: string];
  fileSelect: [id: string, name: string];
  fileDelete: [id: string];
  fileMove: [fileId: string, folderId: string];
  folderMove: [folderId: string, targetParentId: string | null];
}>();

const { t } = useI18n();
</script>
