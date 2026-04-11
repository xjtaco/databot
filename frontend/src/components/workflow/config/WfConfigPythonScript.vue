<template>
  <div class="wf-config-python">
    <!-- Node name -->
    <el-form-item :label="t('workflow.config.nodeName')">
      <el-input v-model="nodeName" @change="handleNameChange" />
    </el-form-item>

    <!-- Params key-value editor -->
    <el-form-item :label="t('workflow.config.params')">
      <WfParamEditor v-model:params="params" />
    </el-form-item>

    <!-- Python code editor -->
    <el-form-item :label="t('workflow.config.pythonCode')">
      <div class="wf-config-python__toolbar">
        <WfVariableInsertButton :node-id="node.id" @insert="handleVariableInsert" />
      </div>
      <div class="wf-config-python__editor">
        <Codemirror
          ref="cmRef"
          v-model="scriptCode"
          :extensions="extensions"
          :style="{ height: '200px' }"
          @update:model-value="handleScriptChange"
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
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { useWorkflowStore } from '@/stores';
import type { WorkflowNodeInfo, PythonNodeConfig, ParamDefinition } from '@/types/workflow';
import type { CmEditorView } from '@/types/codemirror';
import WfParamEditor from './WfParamEditor.vue';
import WfVariableInsertButton from './WfVariableInsertButton.vue';

const props = defineProps<{
  node: WorkflowNodeInfo;
}>();

const { t } = useI18n();
const store = useWorkflowStore();

const cmRef = ref<InstanceType<typeof Codemirror> | null>(null);
const extensions = computed(() => [python(), oneDark]);

const config = computed(() => props.node.config as PythonNodeConfig);

const nodeName = ref(props.node.name);
const params = ref<Record<string, string | ParamDefinition>>({ ...config.value.params });
const scriptCode = ref(config.value.script);
const outputVar = ref(config.value.outputVariable);

watch(
  () => props.node.id,
  () => {
    const cfg = props.node.config as PythonNodeConfig;
    nodeName.value = props.node.name;
    params.value = { ...cfg.params };
    scriptCode.value = cfg.script;
    outputVar.value = cfg.outputVariable;
  }
);

function handleNameChange(): void {
  store.updateNodeConfig(props.node.id, { name: nodeName.value });
}

function syncParams(): void {
  const cfg: PythonNodeConfig = {
    ...config.value,
    params: { ...params.value },
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}

watch(params, syncParams, { deep: true });

function handleScriptChange(value: string): void {
  const cfg: PythonNodeConfig = {
    ...config.value,
    script: value,
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}

function handleVariableInsert(template: string): void {
  const view = (cmRef.value as unknown as { view: CmEditorView } | null)?.view;
  if (view) {
    const cursor = view.state.selection.main.head;
    view.dispatch({ changes: { from: cursor, insert: template } });
    handleScriptChange(view.state.doc.toString());
  } else {
    scriptCode.value += template;
    handleScriptChange(scriptCode.value);
  }
}

function handleOutputChange(): void {
  const cfg: PythonNodeConfig = {
    ...config.value,
    outputVariable: outputVar.value,
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-config-python {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__toolbar {
    display: flex;
    gap: $spacing-xs;
    align-items: center;
    margin-bottom: $spacing-xs;
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
