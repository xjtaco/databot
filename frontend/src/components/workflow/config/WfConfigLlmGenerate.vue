<template>
  <div class="wf-config-llm">
    <!-- Node name -->
    <el-form-item :label="t('workflow.config.nodeName')">
      <el-input v-model="nodeName" @change="handleNameChange" />
    </el-form-item>

    <!-- Params key-value editor -->
    <el-form-item :label="t('workflow.config.params')">
      <WfParamEditor v-model:params="params" />
    </el-form-item>

    <!-- Prompt textarea -->
    <el-form-item :label="t('workflow.config.prompt')">
      <div class="wf-config-llm__toolbar">
        <WfVariableInsertButton :node-id="node.id" @insert="handleVariableInsert" />
      </div>
      <el-input
        v-model="prompt"
        type="textarea"
        :rows="8"
        :placeholder="t('workflow.config.promptPlaceholder')"
        @change="handlePromptChange"
      />
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
import { useWorkflowStore } from '@/stores';
import type { WorkflowNodeInfo, LlmNodeConfig, ParamDefinition } from '@/types/workflow';
import WfParamEditor from './WfParamEditor.vue';
import WfVariableInsertButton from './WfVariableInsertButton.vue';

const props = defineProps<{
  node: WorkflowNodeInfo;
}>();

const { t } = useI18n();
const store = useWorkflowStore();

const config = computed(() => props.node.config as LlmNodeConfig);

const nodeName = ref(props.node.name);
const params = ref<Record<string, string | ParamDefinition>>({ ...config.value.params });
const prompt = ref(config.value.prompt);
const outputVar = ref(config.value.outputVariable);

watch(
  () => props.node.id,
  () => {
    const cfg = props.node.config as LlmNodeConfig;
    nodeName.value = props.node.name;
    params.value = { ...cfg.params };
    prompt.value = cfg.prompt;
    outputVar.value = cfg.outputVariable;
  }
);

function handleNameChange(): void {
  store.updateNodeConfig(props.node.id, { name: nodeName.value });
}

function syncParams(): void {
  const cfg: LlmNodeConfig = {
    ...config.value,
    params: { ...params.value },
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}

watch(params, syncParams, { deep: true });

function handlePromptChange(): void {
  const cfg: LlmNodeConfig = {
    ...config.value,
    prompt: prompt.value,
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}

function handleVariableInsert(template: string): void {
  prompt.value += template;
  handlePromptChange();
}

function handleOutputChange(): void {
  const cfg: LlmNodeConfig = {
    ...config.value,
    outputVariable: outputVar.value,
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-config-llm {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__toolbar {
    display: flex;
    gap: $spacing-xs;
    align-items: center;
    margin-bottom: $spacing-xs;
  }
}
</style>
