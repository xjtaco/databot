<template>
  <div class="copilot-node-card">
    <div class="copilot-node-card__header" @click="toggleExpand">
      <span class="copilot-node-card__icon" :style="{ color: nodeColor }">
        <Database v-if="nodeType === 'sql'" :size="16" />
        <Code v-else-if="nodeType === 'python'" :size="16" />
        <Sparkles v-else-if="nodeType === 'llm'" :size="16" />
        <Mail v-else-if="nodeType === 'email'" :size="16" />
        <GitBranch v-else-if="nodeType === 'branch'" :size="16" />
        <Search v-else-if="nodeType === 'web_search'" :size="16" />
      </span>
      <span class="copilot-node-card__name">{{ nodeName }}</span>
      <span class="copilot-node-card__toggle">
        <ChevronUp v-if="isExpanded" :size="14" />
        <ChevronDown v-else :size="14" />
      </span>
      <button class="copilot-node-card__close" @click.stop="$emit('close')">
        <X :size="14" />
      </button>
    </div>

    <!-- Collapsed: summary -->
    <div v-if="!isExpanded" class="copilot-node-card__summary">
      {{ configSummary }}
    </div>

    <!-- Expanded: config editor -->
    <div v-else class="copilot-node-card__expanded">
      <WfConfigSqlQuery v-if="nodeType === 'sql'" :node="nodeObj" />
      <WfConfigPythonScript v-else-if="nodeType === 'python'" :node="nodeObj" />
      <WfConfigLlmGenerate v-else-if="nodeType === 'llm'" :node="nodeObj" />
      <WfConfigEmail v-else-if="nodeType === 'email'" :node="nodeObj" />
      <WfConfigBranch v-else-if="nodeType === 'branch'" :node="nodeObj" />
      <WfConfigWebSearch v-else-if="nodeType === 'web_search'" :node="nodeObj" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Database,
  Code,
  Sparkles,
  Mail,
  GitBranch,
  Search,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-vue-next';
import { NODE_COLORS } from '@/constants/workflow';
import type {
  NodeConfig,
  WorkflowNodeType,
  BranchNodeConfig,
  WebSearchNodeConfig,
} from '@/types/workflow';
import WfConfigSqlQuery from '../config/WfConfigSqlQuery.vue';
import WfConfigPythonScript from '../config/WfConfigPythonScript.vue';
import WfConfigLlmGenerate from '../config/WfConfigLlmGenerate.vue';
import WfConfigEmail from '../config/WfConfigEmail.vue';
import WfConfigBranch from '../config/WfConfigBranch.vue';
import WfConfigWebSearch from '../config/WfConfigWebSearch.vue';

const props = defineProps<{
  nodeId: string;
  nodeName: string;
  nodeType: string;
  config: NodeConfig;
}>();

defineEmits<{
  configUpdated: [nodeId: string, updates: Partial<NodeConfig>];
  close: [];
}>();

const isExpanded = ref(false);

function toggleExpand(): void {
  isExpanded.value = !isExpanded.value;
}

const nodeColor = computed(() => {
  const type = props.nodeType as WorkflowNodeType;
  return NODE_COLORS[type] ?? '#6b6b70';
});

const configSummary = computed((): string => {
  const cfg = props.config;
  switch (cfg.nodeType) {
    case 'sql':
      return cfg.sql.substring(0, 50);
    case 'python':
      return cfg.script.substring(0, 50);
    case 'llm':
      return cfg.prompt.substring(0, 50);
    case 'email':
      return cfg.to.substring(0, 50);
    case 'branch': {
      const bc = props.config as BranchNodeConfig;
      return (bc.field || '').substring(0, 50);
    }
    case 'web_search':
      return ((props.config as WebSearchNodeConfig).keywords || '').substring(0, 50);
    default:
      return '';
  }
});

const nodeObj = computed(() => ({
  id: props.nodeId,
  workflowId: '',
  name: props.nodeName,
  description: null,
  type: props.nodeType as WorkflowNodeType,
  config: props.config,
  positionX: 0,
  positionY: 0,
}));
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.copilot-node-card {
  margin: $spacing-sm 0;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: $radius-md;

  &__header {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-sm 12px;
    cursor: pointer;
    user-select: none;
    border-radius: $radius-md;
    transition: background-color $transition-fast;

    &:hover {
      background-color: rgb(0 0 0 / 4%);
    }
  }

  &__icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
  }

  &__name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: #1a1a1a;
    white-space: nowrap;
  }

  &__toggle {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    color: #6b6b70;
  }

  &__close {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    color: #6b6b70;
    cursor: pointer;
    background: none;
    border: none;
    border-radius: 50%;
    transition: all $transition-fast;

    &:hover {
      color: #1a1a1a;
      background-color: rgb(0 0 0 / 8%);
    }
  }

  &__summary {
    padding: 0 12px $spacing-sm;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-xs;
    color: #6b6b70;
    white-space: nowrap;
  }

  &__expanded {
    padding: $spacing-sm 12px;

    :deep(.el-form-item) {
      flex-direction: column;
      align-items: stretch;
      margin-bottom: $spacing-md;

      .el-form-item__label {
        justify-content: flex-start;
        height: auto;
        padding-bottom: 4px;
        font-size: $font-size-xs;
        line-height: 1.4;
        color: #6b6b70;
      }

      .el-form-item__content {
        flex: 1;
      }
    }
  }
}
</style>
