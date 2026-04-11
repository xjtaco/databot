<template>
  <div class="wf-config-web-search">
    <!-- Node name -->
    <el-form-item :label="t('workflow.config.nodeName')">
      <el-input v-model="nodeName" @change="handleNameChange" />
    </el-form-item>

    <!-- Params key-value editor -->
    <el-form-item :label="t('workflow.config.params')">
      <WfParamEditor v-model:params="params" />
    </el-form-item>

    <!-- Keywords -->
    <el-form-item :label="t('workflow.config.searchKeywords')">
      <div class="wf-config-web-search__keywords-row">
        <el-input
          v-model="keywords"
          :placeholder="t('workflow.config.searchKeywordsPlaceholder')"
          style="flex: 1"
          @change="handleConfigChange"
        />
        <WfVariableInsertButton :node-id="node.id" @insert="handleVariableInsert" />
      </div>
    </el-form-item>

    <!-- Search engine info -->
    <el-form-item>
      <div class="wf-config-web-search__info">
        {{ t('workflow.config.searchEngineInfo') }}
      </div>
    </el-form-item>

    <!-- Output variable -->
    <el-form-item :label="t('workflow.config.outputVariable')">
      <el-input
        v-model="outputVar"
        :placeholder="t('workflow.config.outputVariablePlaceholder')"
        @change="handleConfigChange"
      />
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorkflowStore } from '@/stores';
import type { WorkflowNodeInfo, WebSearchNodeConfig, ParamDefinition } from '@/types/workflow';
import WfParamEditor from './WfParamEditor.vue';
import WfVariableInsertButton from './WfVariableInsertButton.vue';

const props = defineProps<{
  node: WorkflowNodeInfo;
}>();

const { t } = useI18n();
const store = useWorkflowStore();

const config = computed(() => props.node.config as WebSearchNodeConfig);

const nodeName = ref(props.node.name);
const params = ref<Record<string, string | ParamDefinition>>({ ...config.value.params });
const keywords = ref(config.value.keywords);
const outputVar = ref(config.value.outputVariable);

watch(
  () => props.node.id,
  () => {
    const cfg = props.node.config as WebSearchNodeConfig;
    nodeName.value = props.node.name;
    params.value = { ...cfg.params };
    keywords.value = cfg.keywords;
    outputVar.value = cfg.outputVariable;
  }
);

watch(params, syncParams, { deep: true });

function syncParams(): void {
  const cfg: WebSearchNodeConfig = {
    ...config.value,
    params: { ...params.value },
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}

function handleNameChange(): void {
  store.updateNodeConfig(props.node.id, { name: nodeName.value });
}

function handleVariableInsert(template: string): void {
  keywords.value += template;
  handleConfigChange();
}

function handleConfigChange(): void {
  const cfg: WebSearchNodeConfig = {
    nodeType: 'web_search',
    params: { ...params.value },
    keywords: keywords.value,
    outputVariable: outputVar.value,
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-config-web-search {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__keywords-row {
    display: flex;
    gap: $spacing-xs;
    width: 100%;
  }

  &__info {
    padding: $spacing-xs $spacing-sm;
    font-size: $font-size-xs;
    color: $text-muted;
    background-color: $bg-elevated;
    border: 1px solid $border-dark;
    border-radius: $radius-sm;
  }
}
</style>
