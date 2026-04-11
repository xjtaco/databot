<template>
  <el-dialog
    :model-value="visible"
    :title="t('workflow.list.importResultTitle')"
    width="520px"
    @close="emit('close')"
  >
    <el-table :data="results" style="width: 100%">
      <el-table-column :label="t('workflow.list.importResultName')" min-width="160">
        <template #default="{ row }">{{ row.originalName }}</template>
      </el-table-column>
      <el-table-column :label="t('workflow.list.importResultStatus')" min-width="200">
        <template #default="{ row }">
          <span
            v-if="row.result && !row.result.renamed"
            class="import-status import-status--success"
          >
            {{ t('workflow.list.importSuccess') }}
          </span>
          <span
            v-else-if="row.result && row.result.renamed"
            class="import-status import-status--renamed"
          >
            {{ t('workflow.list.importRenamed', { name: row.result.name }) }}
          </span>
          <span v-else class="import-status import-status--error">
            {{ t('workflow.list.importFailed', { error: row.error ?? '' }) }}
          </span>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button type="primary" @click="emit('close')">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ImportResultItem } from '@/types/workflow';

defineProps<{
  visible: boolean;
  results: ImportResultItem[];
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
</script>

<style scoped lang="scss">
.import-status {
  font-size: 13px;
}

.import-status--success {
  color: var(--success);
}

.import-status--renamed {
  color: var(--warning);
}

.import-status--error {
  color: var(--error);
}
</style>
