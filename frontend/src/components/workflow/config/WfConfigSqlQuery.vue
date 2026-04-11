<template>
  <div class="wf-config-sql">
    <!-- Node name -->
    <el-form-item :label="t('workflow.config.nodeName')">
      <el-input v-model="nodeName" @change="handleNameChange" />
    </el-form-item>

    <!-- Datasource select -->
    <el-form-item :label="t('workflow.config.datasource')">
      <el-select
        v-model="datasourceId"
        :placeholder="t('workflow.config.selectDatasource')"
        @change="handleDatasourceChange"
      >
        <el-option v-for="ds in datasources" :key="ds.id" :label="ds.name" :value="ds.id" />
      </el-select>
    </el-form-item>

    <!-- Params key-value editor -->
    <el-form-item :label="t('workflow.config.params')">
      <WfParamEditor v-model:params="params" />
    </el-form-item>

    <!-- SQL editor -->
    <el-form-item :label="t('workflow.config.sql')">
      <div class="wf-config-sql__toolbar">
        <el-button size="small" @click="handleFormat">
          <AlignLeft :size="14" />
          <span>{{ t('workflow.config.formatSql') }}</span>
        </el-button>
        <WfVariableInsertButton :node-id="node.id" @insert="handleVariableInsert" />
      </div>
      <div class="wf-config-sql__editor">
        <Codemirror
          ref="cmRef"
          v-model="sqlCode"
          :extensions="extensions"
          :style="{ height: '200px' }"
          @update:model-value="handleSqlChange"
        />
      </div>
    </el-form-item>

    <!-- Output variable -->
    <el-form-item :label="t('workflow.config.outputVariable')">
      <el-input
        v-model="outputVar"
        :placeholder="t('workflow.config.outputVariablePlaceholder')"
        @change="handleOutputChange"
      />
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Codemirror } from 'vue-codemirror';
import { sql } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { format as formatSql } from 'sql-formatter';
import { AlignLeft } from 'lucide-vue-next';
import { useWorkflowStore, useDatafileStore } from '@/stores';
import WfParamEditor from './WfParamEditor.vue';
import WfVariableInsertButton from './WfVariableInsertButton.vue';
import type { WorkflowNodeInfo, SqlNodeConfig, ParamDefinition } from '@/types/workflow';
import type { TableSourceType } from '@/types/datafile';
import type { CmEditorView } from '@/types/codemirror';

const props = defineProps<{
  node: WorkflowNodeInfo;
}>();

const { t } = useI18n();
const store = useWorkflowStore();
const datafileStore = useDatafileStore();

const cmRef = ref<InstanceType<typeof Codemirror> | null>(null);
const extensions = computed(() => [sql(), oneDark]);

const datasources = computed(() => datafileStore.datasources);

const config = computed(() => props.node.config as SqlNodeConfig);

const nodeName = ref(props.node.name);
const datasourceId = ref(config.value.datasourceId);
const params = ref<Record<string, string | ParamDefinition>>({ ...config.value.params });
const sqlCode = ref(config.value.sql);
const outputVar = ref(config.value.outputVariable);

watch(
  () => props.node.id,
  () => {
    const cfg = props.node.config as SqlNodeConfig;
    nodeName.value = props.node.name;
    datasourceId.value = cfg.datasourceId;
    params.value = { ...cfg.params };
    sqlCode.value = cfg.sql;
    outputVar.value = cfg.outputVariable;
  }
);

function syncParams(): void {
  const cfg: SqlNodeConfig = {
    ...config.value,
    params: { ...params.value },
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}

watch(params, syncParams, { deep: true });

function handleNameChange(): void {
  store.updateNodeConfig(props.node.id, { name: nodeName.value });
}

function handleDatasourceChange(): void {
  const cfg: SqlNodeConfig = {
    ...config.value,
    datasourceId: datasourceId.value,
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}

function handleSqlChange(value: string): void {
  const cfg: SqlNodeConfig = {
    ...config.value,
    sql: value,
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}

function getSqlLanguage(dsType: TableSourceType | undefined): 'postgresql' | 'mysql' | 'sqlite' {
  if (dsType === 'mysql') return 'mysql';
  if (dsType === 'sqlite') return 'sqlite';
  return 'postgresql';
}

function handleFormat(): void {
  const ds = datasources.value.find((d) => d.id === datasourceId.value);
  const language = getSqlLanguage(ds?.type);
  sqlCode.value = formatSql(sqlCode.value, { language });
  handleSqlChange(sqlCode.value);
}

function handleVariableInsert(template: string): void {
  const view = (cmRef.value as unknown as { view: CmEditorView } | null)?.view;
  if (view) {
    const cursor = view.state.selection.main.head;
    view.dispatch({ changes: { from: cursor, insert: template } });
    handleSqlChange(view.state.doc.toString());
  } else {
    sqlCode.value += template;
    handleSqlChange(sqlCode.value);
  }
}

function handleOutputChange(): void {
  const cfg: SqlNodeConfig = {
    ...config.value,
    outputVariable: outputVar.value,
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-config-sql {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__toolbar {
    display: flex;
    gap: $spacing-xs;
    align-items: center;
    margin-bottom: $spacing-xs;

    .el-button {
      display: flex;
      gap: $spacing-xs;
      align-items: center;
    }
  }

  &__editor {
    width: 100%;
    overflow: hidden;
    border: 1px solid $border-dark;
    border-radius: $radius-sm;

    :deep(.cm-editor) {
      font-family: $font-family-mono;
      font-size: $font-size-xs;
    }
  }
}
</style>
