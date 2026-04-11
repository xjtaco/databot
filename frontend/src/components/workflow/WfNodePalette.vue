<template>
  <div class="wf-node-palette">
    <div class="wf-node-palette__header">
      <span class="wf-node-palette__title">{{ t('workflow.nodePalette') }}</span>
    </div>

    <div class="wf-node-palette__body">
      <!-- Built-in nodes -->
      <div class="wf-node-palette__section">
        <span class="wf-node-palette__section-title">{{ t('workflow.builtInNodes') }}</span>
        <WfPaletteItem type="sql" :label="t('workflow.nodeTypes.sql')" :color="NODE_COLORS.sql">
          <Database :size="16" />
        </WfPaletteItem>
        <WfPaletteItem
          type="python"
          :label="t('workflow.nodeTypes.python')"
          :color="NODE_COLORS.python"
        >
          <Code :size="16" />
        </WfPaletteItem>
        <WfPaletteItem
          type="llm"
          :label="t('workflow.nodeTypes.llm')"
          :color="NODE_COLORS.llm"
          :disabled="!globalConfigStore.isLLMConfigured"
          :disabled-reason="t('workflow.nodeDisabled.llm')"
        >
          <Sparkles :size="16" />
        </WfPaletteItem>
        <WfPaletteItem
          type="email"
          :label="t('workflow.nodeTypes.email')"
          :color="NODE_COLORS.email"
          :disabled="!globalConfigStore.isSmtpConfigured"
          :disabled-reason="t('workflow.nodeDisabled.smtp')"
        >
          <Mail :size="16" />
        </WfPaletteItem>
        <WfPaletteItem
          type="branch"
          :label="t('workflow.nodeTypes.branch')"
          :color="NODE_COLORS.branch"
        >
          <GitBranch :size="16" />
        </WfPaletteItem>
        <WfPaletteItem
          type="web_search"
          :label="t('workflow.nodeTypes.web_search')"
          :color="NODE_COLORS.web_search"
          :disabled="!globalConfigStore.isWebSearchConfigured"
          :disabled-reason="t('workflow.nodeDisabled.webSearch')"
        >
          <Search :size="16" />
        </WfPaletteItem>
      </div>

      <!-- Custom nodes -->
      <div v-if="store.customTemplates.length > 0" class="wf-node-palette__section">
        <span class="wf-node-palette__section-title">{{ t('workflow.customNodes') }}</span>
        <WfPaletteItem
          v-for="tmpl in store.customTemplates"
          :key="tmpl.id"
          :type="tmpl.type"
          :label="tmpl.name"
          :color="NODE_COLORS[tmpl.type]"
          :template-id="tmpl.id"
          :disabled="isNodeTypeDisabled(tmpl.type)"
          :disabled-reason="getDisabledReason(tmpl.type)"
        >
          <Database v-if="tmpl.type === 'sql'" :size="16" />
          <Code v-else-if="tmpl.type === 'python'" :size="16" />
          <Sparkles v-else-if="tmpl.type === 'llm'" :size="16" />
          <Mail v-else-if="tmpl.type === 'email'" :size="16" />
          <GitBranch v-else-if="tmpl.type === 'branch'" :size="16" />
          <Search v-else-if="tmpl.type === 'web_search'" :size="16" />
        </WfPaletteItem>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Database, Code, Sparkles, Mail, GitBranch, Search } from 'lucide-vue-next';
import { useWorkflowStore, useGlobalConfigStore } from '@/stores';
import { NODE_COLORS } from '@/constants/workflow';
import type { WorkflowNodeType } from '@/types/workflow';
import WfPaletteItem from './WfPaletteItem.vue';

const { t } = useI18n();
const store = useWorkflowStore();
const globalConfigStore = useGlobalConfigStore();

function isNodeTypeDisabled(type: WorkflowNodeType): boolean {
  if (type === 'llm') return !globalConfigStore.isLLMConfigured;
  if (type === 'email') return !globalConfigStore.isSmtpConfigured;
  if (type === 'web_search') return !globalConfigStore.isWebSearchConfigured;
  return false;
}

function getDisabledReason(type: WorkflowNodeType): string {
  if (type === 'llm') return t('workflow.nodeDisabled.llm');
  if (type === 'email') return t('workflow.nodeDisabled.smtp');
  if (type === 'web_search') return t('workflow.nodeDisabled.webSearch');
  return '';
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

$palette-width: 200px;

.wf-node-palette {
  display: flex;
  flex-direction: column;
  width: $palette-width;
  min-width: $palette-width;
  height: 100%;
  background-color: $bg-sidebar;
  border-right: 1px solid $border-dark;

  &__header {
    display: flex;
    align-items: center;
    height: 48px;
    min-height: 48px;
    padding: 0 $spacing-md;
    border-bottom: 1px solid $border-dark;
  }

  &__title {
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
  }

  &__body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: $spacing-md;
    padding: $spacing-sm;
    overflow-y: auto;
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
  }

  &__section-title {
    padding: $spacing-xs $spacing-sm;
    font-size: $font-size-xs;
    font-weight: $font-weight-medium;
    color: $text-muted;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}
</style>
