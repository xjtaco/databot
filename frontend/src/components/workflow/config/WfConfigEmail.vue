<template>
  <div class="wf-config-email">
    <!-- Node name -->
    <el-form-item :label="t('workflow.config.nodeName')">
      <el-input v-model="nodeName" @change="handleNameChange" />
    </el-form-item>

    <!-- Recipients (to) -->
    <el-form-item :label="t('workflow.config.emailTo')">
      <el-input
        v-model="toField"
        :placeholder="t('workflow.config.emailToPlaceholder')"
        @change="handleConfigChange"
      />
    </el-form-item>

    <!-- Subject -->
    <el-form-item :label="t('workflow.config.emailSubject')">
      <div class="wf-config-email__subject-row">
        <el-input
          v-model="subject"
          :placeholder="t('workflow.config.emailSubjectPlaceholder')"
          style="flex: 1"
          @change="handleConfigChange"
        />
        <WfVariableInsertButton :node-id="node.id" @insert="handleSubjectVariableInsert" />
      </div>
    </el-form-item>

    <!-- Content source radio -->
    <el-form-item :label="t('workflow.config.emailContentSource')">
      <el-radio-group v-model="contentSource" @change="handleConfigChange">
        <el-radio value="inline">{{ t('workflow.config.emailContentInline') }}</el-radio>
        <el-radio value="upstream">{{ t('workflow.config.emailContentUpstream') }}</el-radio>
      </el-radio-group>
    </el-form-item>

    <!-- Inline: CodeMirror markdown editor -->
    <el-form-item v-if="contentSource === 'inline'" :label="t('workflow.config.emailBody')">
      <div class="wf-config-email__toolbar">
        <WfVariableInsertButton :node-id="node.id" @insert="handleBodyVariableInsert" />
      </div>
      <div class="wf-config-email__editor">
        <Codemirror
          ref="cmRef"
          v-model="body"
          :extensions="extensions"
          :style="{ height: '150px' }"
          @update:model-value="handleConfigChange"
        />
      </div>
    </el-form-item>

    <!-- Upstream: select field from upstream nodes -->
    <el-form-item
      v-if="contentSource === 'upstream'"
      :label="t('workflow.config.emailUpstreamField')"
    >
      <el-select v-model="upstreamField" @change="handleConfigChange">
        <el-option
          v-for="field in upstreamOptions"
          :key="field.value"
          :label="field.label"
          :value="field.value"
        />
      </el-select>
    </el-form-item>

    <!-- Send as HTML checkbox -->
    <el-form-item>
      <el-checkbox v-model="isHtml" @change="handleConfigChange">
        {{ t('workflow.config.emailIsHtml') }}
      </el-checkbox>
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
import { Codemirror } from 'vue-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { useWorkflowStore } from '@/stores';
import type {
  WorkflowNodeInfo,
  EmailNodeConfig,
  WorkflowNodeRunInfo,
  OutputValueType,
} from '@/types/workflow';
import type { CmEditorView } from '@/types/codemirror';
import WfVariableInsertButton from './WfVariableInsertButton.vue';

const MARKDOWN_OUTPUT_TYPES: OutputValueType[] = ['markdownFile', 'text'];

interface UpstreamOption {
  label: string;
  value: string;
}

const props = defineProps<{
  node: WorkflowNodeInfo;
}>();

const { t } = useI18n();
const store = useWorkflowStore();

const cmRef = ref<InstanceType<typeof Codemirror> | null>(null);
const extensions = computed(() => [markdown(), oneDark]);

const config = computed(() => props.node.config as EmailNodeConfig);

const nodeName = ref(props.node.name);
const toField = ref(config.value.to);
const subject = ref(config.value.subject);
const contentSource = ref<'inline' | 'upstream'>(config.value.contentSource);
const body = ref(config.value.body ?? '');
const upstreamField = ref(config.value.upstreamField ?? '');
const isHtml = ref(config.value.isHtml ?? true);
const outputVar = ref(config.value.outputVariable);

// ── Upstream field discovery ──────────────────────────────────────────────────

function getUpstreamNodeIds(currentNodeId: string): string[] {
  const wf = store.editorWorkflow;
  if (!wf) return [];

  const visited = new Set<string>();
  const queue: string[] = [currentNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    for (const edge of wf.edges) {
      if (edge.targetNodeId === nodeId && !visited.has(edge.sourceNodeId)) {
        visited.add(edge.sourceNodeId);
        queue.push(edge.sourceNodeId);
      }
    }
  }

  return [...visited];
}

function getNodeUpstreamOptions(nodeId: string): UpstreamOption[] {
  const wf = store.editorWorkflow;
  if (!wf) return [];

  const node = wf.nodes.find((n) => n.id === nodeId);
  if (!node) return [];

  // Try to get typed output fields from last run
  const lastRun = store.lastRunDetail;
  if (lastRun) {
    const nodeRun: WorkflowNodeRunInfo | undefined = lastRun.nodeRuns.find(
      (nr) => nr.nodeId === nodeId
    );
    if (nodeRun?.outputs) {
      const options: UpstreamOption[] = [];
      for (const [fieldName, value] of Object.entries(nodeRun.outputs)) {
        let fieldType: OutputValueType | 'unknown' = 'unknown';
        if (
          value !== null &&
          typeof value === 'object' &&
          'type' in value &&
          typeof (value as { type: unknown }).type === 'string'
        ) {
          fieldType = (value as { type: OutputValueType }).type;
        }
        if (
          fieldType === 'unknown' ||
          MARKDOWN_OUTPUT_TYPES.includes(fieldType as OutputValueType)
        ) {
          options.push({
            label: `${node.name}.${fieldName}`,
            value: `{{${node.name}.${fieldName}}}`,
          });
        }
      }
      return options;
    }
  }

  // Fallback: use outputVariable from config as a single field
  const outVar = node.config.outputVariable;
  if (outVar) {
    return [
      {
        label: `${node.name}.${outVar}`,
        value: `{{${node.name}.${outVar}}}`,
      },
    ];
  }

  return [];
}

const upstreamOptions = computed<UpstreamOption[]>(() => {
  const upstreamIds = getUpstreamNodeIds(props.node.id);
  return upstreamIds.flatMap((id) => getNodeUpstreamOptions(id));
});

// ── Store sync ────────────────────────────────────────────────────────────────

watch(
  () => props.node.id,
  () => {
    const cfg = props.node.config as EmailNodeConfig;
    nodeName.value = props.node.name;
    toField.value = cfg.to;
    subject.value = cfg.subject;
    contentSource.value = cfg.contentSource;
    body.value = cfg.body ?? '';
    upstreamField.value = cfg.upstreamField ?? '';
    isHtml.value = cfg.isHtml;
    outputVar.value = cfg.outputVariable;
  }
);

function handleSubjectVariableInsert(template: string): void {
  subject.value += template;
  handleConfigChange();
}

function handleBodyVariableInsert(template: string): void {
  const view = (cmRef.value as unknown as { view: CmEditorView } | null)?.view;
  if (view) {
    const cursor = view.state.selection.main.head;
    view.dispatch({ changes: { from: cursor, insert: template } });
    body.value = view.state.doc.toString();
    handleConfigChange();
  } else {
    body.value += template;
    handleConfigChange();
  }
}

function handleNameChange(): void {
  store.updateNodeConfig(props.node.id, { name: nodeName.value });
}

function handleConfigChange(): void {
  const cfg: EmailNodeConfig = {
    nodeType: 'email',
    to: toField.value,
    subject: subject.value,
    contentSource: contentSource.value,
    body: contentSource.value === 'inline' ? body.value : undefined,
    upstreamField: contentSource.value === 'upstream' ? upstreamField.value : undefined,
    isHtml: isHtml.value,
    outputVariable: outputVar.value,
  };
  store.updateNodeConfig(props.node.id, { config: cfg });
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-config-email {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &__subject-row {
    display: flex;
    gap: $spacing-xs;
    width: 100%;
  }

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
