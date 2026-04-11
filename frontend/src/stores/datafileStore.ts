import { defineStore } from 'pinia';
import { ref } from 'vue';
import type {
  TableMetadata,
  TableWithColumns,
  UpdateTableInput,
  DatasourceWithTables,
  DatabaseDatasourceType,
  PreviewData,
} from '@/types/datafile';
import type { SqliteUploadResult } from '@/api/datafile';
import * as datafileApi from '@/api/datafile';
import * as datasourceApi from '@/api/datasource';
import type {
  DatabaseConnectionConfig,
  TestConnectionResult,
  DatasourceResult,
} from '@/api/datasource';
import { useAsyncAction } from '@/composables/useAsyncAction';

export const useDatafileStore = defineStore('datafile', () => {
  const tables = ref<TableMetadata[]>([]);
  const datasources = ref<DatasourceWithTables[]>([]);
  const currentTable = ref<TableWithColumns | null>(null);
  const dictionaryContent = ref<string>('');
  const previewData = ref<PreviewData | null>(null);

  const { isLoading, error, wrapAction } = useAsyncAction();

  const uploadFile = wrapAction(async (file: File): Promise<string[]> => {
    const result = await datafileApi.uploadFile(file);
    await fetchTables();
    return result.tableIds;
  });

  const fetchTables = wrapAction(async (): Promise<void> => {
    const result = await datafileApi.listTables();
    tables.value = result.tables;
  });

  const fetchDatasources = wrapAction(async (): Promise<void> => {
    const result = await datafileApi.listDatasources();
    datasources.value = result.datasources;
  });

  const fetchTable = wrapAction(async (id: string): Promise<void> => {
    previewData.value = null;
    const result = await datafileApi.getTable(id);
    currentTable.value = result.table;
  });

  const fetchDictionaryContent = wrapAction(async (id: string): Promise<void> => {
    const result = await datafileApi.getDictionaryContent(id);
    dictionaryContent.value = result.content;
  });

  const updateTable = wrapAction(async (id: string, input: UpdateTableInput): Promise<void> => {
    const result = await datafileApi.updateTable(id, input);
    currentTable.value = result.table;
    await fetchTables();
  });

  const deleteTable = wrapAction(async (id: string): Promise<void> => {
    await datafileApi.deleteTable(id);
    if (currentTable.value?.id === id) {
      currentTable.value = null;
    }
    await fetchTables();
  });

  function clearCurrentTable(): void {
    currentTable.value = null;
    dictionaryContent.value = '';
    previewData.value = null;
  }

  async function fetchPreviewData(tableId: string, limit?: number): Promise<PreviewData> {
    const result = await datafileApi.getTablePreview(tableId, limit);
    previewData.value = result;
    return result;
  }

  const uploadSqliteFile = wrapAction(async (file: File): Promise<SqliteUploadResult> => {
    const result = await datafileApi.uploadSqliteFile(file);
    await fetchTables();
    await fetchDatasources();
    return result;
  });

  const deleteDatasource = wrapAction(
    async (id: string, type: DatabaseDatasourceType): Promise<void> => {
      if (type === 'sqlite') {
        await datafileApi.deleteDatasource(id);
      } else {
        await datasourceApi.deleteDatasource(id);
      }
      if (currentTable.value?.datasourceId === id) {
        currentTable.value = null;
      }
      await fetchTables();
      await fetchDatasources();
    }
  );

  const testDatasourceConnection = wrapAction(
    async (config: DatabaseConnectionConfig): Promise<TestConnectionResult> => {
      return await datasourceApi.testConnection(config);
    }
  );

  const createDatasource = wrapAction(
    async (config: DatabaseConnectionConfig): Promise<DatasourceResult> => {
      const result = await datasourceApi.createDatasource(config);
      await fetchTables();
      await fetchDatasources();
      return result;
    }
  );

  const updateDatasource = wrapAction(
    async (id: string, config: DatabaseConnectionConfig): Promise<DatasourceResult> => {
      const result = await datasourceApi.updateDatasource(id, config);
      if (currentTable.value?.datasourceId === id) {
        currentTable.value = null;
      }
      await fetchTables();
      await fetchDatasources();
      return result;
    }
  );

  return {
    tables,
    datasources,
    currentTable,
    dictionaryContent,
    isLoading,
    error,
    uploadFile,
    uploadSqliteFile,
    fetchTables,
    fetchDatasources,
    fetchTable,
    fetchDictionaryContent,
    updateTable,
    deleteTable,
    deleteDatasource,
    clearCurrentTable,
    previewData,
    fetchPreviewData,
    testDatasourceConnection,
    createDatasource,
    updateDatasource,
  };
});
