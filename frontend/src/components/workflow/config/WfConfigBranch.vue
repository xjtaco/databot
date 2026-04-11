<template>
  <div class="wf-config-branch">
    <el-form-item :label="t('workflow.config.nodeName')">
      <el-input v-model="nodeName" @change="handleNameChange" />
    </el-form-item>

    <el-form-item :label="t('workflow.config.branchField')">
      <div class="wf-config-branch__field-row">
        <el-input
          v-model="field"
          :placeholder="t('workflow.config.branchFieldPlaceholder')"
          style="flex: 1"
          @change="handleConfigChange"
        />
        <WfVariableInsertButton :node-id="node.id" @insert="handleVariableInsert" />
      </div>
      <div class="wf-config-branch__hint">
        <el-tooltip :content="t('workflow.config.branchTruthyHint')" placement="top" :width="280">
          <el-icon><InfoFilled /></el-icon>
        </el-tooltip>
        <span class="wf-config-branch__hint-text">{{
          t('workflow.config.branchTruthyShort')
        }}</span>
      </div>
    </el-form-item>

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
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { InfoFilled } from '@element-plus/icons-vue';
import { useWorkflowStore } from '@/stores';
import type { WorkflowNodeInfo, BranchNodeConfig } from '@/types/workflow';
import WfVariableInsertButton from './WfVariableInsertButton.vue';

const props = defineProps<{
  node: WorkflowNodeInfo;
}>();

const { t } = useI18n();
const store = useWorkflowStore();

const config = () => props.node.config as BranchNodeConfig;

const nodeName = ref(props.node.name);
const field = ref(config().field);
const outputVar = ref(config().outputVariable);

watch(
  () => props.node.id,
  () => {
    const cfg = props.node.config as BranchNodeConfig;
    nodeName.value = props.node.name;
    field.value = cfg.field;
    outputVar.value = cfg.outputVariable;
  }
);

function handleNameChange(): void {
  store.updateNodeConfig(props.node.id, { name: nodeName.value });
}

function handleVariableInsert(template: string): void {
  field.value = template;
  handleConfigChange();
}

function handleConfigChange(): void {
  const cfg: BranchNodeConfig = {
    nodeType: 'branch',
    field: field.value,
    outputVariable: outputVar.value,
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-config-branch {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__field-row {
    display: flex;
    gap: $spacing-xs;
    width: 100%;
  }

  &__hint {
    display: flex;
    gap: 4px;
    align-items: center;
    margin-top: 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    cursor: default;
  }

  &__hint-text {
    opacity: 0.85;
  }
}
</style>
