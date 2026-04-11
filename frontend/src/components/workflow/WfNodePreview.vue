<template>
  <div class="wf-node-preview">
    <button class="wf-node-preview__header" @click="showDrawer = true">
      <span class="wf-node-preview__title">{{ t('workflow.preview.title') }}</span>
      <span class="wf-node-preview__status" :class="`is-${nodeRun.status}`">
        {{ t(`workflow.execution.${nodeRun.status}`) }}
      </span>
    </button>

    <el-drawer v-model="showDrawer" direction="btt" size="50%" :title="t('workflow.preview.title')">
      <div class="wf-node-preview__body">
        <!-- Error message -->
        <div v-if="nodeRun.errorMessage" class="wf-node-preview__error">
          {{ nodeRun.errorMessage }}
        </div>

        <!-- SQL preview: table + csv file -->
        <template v-else-if="nodeType === 'sql'">
          <template v-if="sqlPreview">
            <div class="wf-node-preview__table-wrapper">
              <table class="wf-node-preview__table">
                <thead>
                  <tr>
                    <th v-for="col in sqlPreview.columns" :key="col">{{ col }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in sqlPreview.rows" :key="idx">
                    <td v-for="col in sqlPreview.columns" :key="col">{{ row[col] ?? '' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <span v-if="sqlPreview.totalRows > 0" class="wf-node-preview__row-count">
              {{ t('workflow.preview.totalRows', { n: sqlPreview.totalRows }) }}
            </span>
          </template>
          <template v-if="fileOutputs.length > 0">
            <div class="wf-node-preview__file-list">
              <div v-for="file in fileOutputs" :key="file.field" class="wf-node-preview__file-item">
                <span class="wf-node-preview__file-name">{{ file.displayName }}</span>
                <el-button size="small" @click="openFilePreview(file)">
                  <Eye :size="14" />
                  <span>{{ t('workflow.preview.previewFile') }}</span>
                </el-button>
              </div>
            </div>
          </template>
        </template>

        <!-- Python preview: stdout/result + file outputs -->
        <template v-else-if="nodeType === 'python'">
          <template v-if="pythonPreview">
            <div class="wf-node-preview__section-title">
              {{ t('workflow.preview.pythonOutput') }}
            </div>
            <pre class="wf-node-preview__code">{{ pythonPreview }}</pre>
          </template>
          <template v-if="fileOutputs.length > 0">
            <div class="wf-node-preview__file-list">
              <div v-for="file in fileOutputs" :key="file.field" class="wf-node-preview__file-item">
                <span class="wf-node-preview__file-name">{{ file.displayName }}</span>
                <el-button size="small" @click="openFilePreview(file)">
                  <Eye :size="14" />
                  <span>{{ t('workflow.preview.previewFile') }}</span>
                </el-button>
              </div>
            </div>
          </template>
        </template>

        <!-- LLM preview: JSON output -->
        <template v-else-if="nodeType === 'llm' && llmPreview">
          <div class="wf-node-preview__section-title">{{ t('workflow.preview.llmOutput') }}</div>
          <pre class="wf-node-preview__code">{{ llmPreview }}</pre>
        </template>

        <!-- Email preview -->
        <template v-else-if="nodeType === 'email' && emailPreviewData">
          <div class="wf-node-preview__section-title">{{ t('workflow.preview.emailOutput') }}</div>
          <pre class="wf-node-preview__code">{{ emailPreviewData }}</pre>
        </template>

        <!-- Branch preview -->
        <div v-else-if="nodeType === 'branch' && nodeRun.outputs" class="preview-section">
          <div class="preview-label">{{ t('workflow.preview.branchResult') }}</div>
          <el-tag :type="nodeRun.outputs.result ? 'success' : 'danger'">
            {{ nodeRun.outputs.result ? t('workflow.branch.yes') : t('workflow.branch.no') }}
          </el-tag>
        </div>

        <!-- Web Search preview -->
        <div v-else-if="nodeType === 'web_search' && nodeRun.outputs" class="preview-section">
          <div class="preview-label">{{ t('workflow.preview.webSearchOutput') }}</div>
          <div>
            {{ t('workflow.preview.totalResults', { n: nodeRun.outputs.totalResults ?? 0 }) }}
          </div>
        </div>

        <!-- TypedOutputValue file preview -->
        <template v-else-if="typedFileOutputs.length > 0">
          <div
            v-for="output in typedFileOutputs"
            :key="output.field"
            class="wf-node-preview__file-output"
          >
            <div class="wf-node-preview__section-title">{{ output.field }}</div>
            <div class="wf-node-preview__file-row">
              <span class="wf-node-preview__file-path">{{ output.value }}</span>
              <button
                class="wf-node-preview__file-toggle"
                @click="toggleFileExpand(output.field, output.value)"
              >
                <ChevronUp v-if="expandedFiles.has(output.field)" :size="14" />
                <ChevronDown v-else :size="14" />
              </button>
            </div>
            <pre v-if="expandedFiles.has(output.field)" class="wf-node-preview__code">{{
              fileContents.get(output.field) ?? output.value
            }}</pre>
          </div>
        </template>
      </div>
    </el-drawer>

    <el-dialog
      v-model="fileDialogVisible"
      :title="`${t('workflow.preview.filePreview')} - ${fileDialogTitle}`"
      width="70%"
      destroy-on-close
    >
      <div class="wf-node-preview__file-dialog">
        <img
          v-if="fileDialogType === 'imageFile'"
          :src="fileDialogImageSrc"
          class="wf-node-preview__file-image"
        />
        <div
          v-else-if="fileDialogType === 'markdownFile'"
          class="wf-node-preview__file-markdown markdown-content"
          v-html="renderedMarkdown"
        ></div>
        <div
          v-else-if="fileDialogType === 'csvFile' && csvDialogData"
          class="wf-node-preview__table-wrapper wf-node-preview__table-wrapper--dialog"
        >
          <table class="wf-node-preview__table">
            <thead>
              <tr>
                <th v-for="col in csvDialogData.columns" :key="col">{{ col }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in csvDialogData.rows" :key="idx">
                <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <pre v-else class="wf-node-preview__code wf-node-preview__code--dialog">{{
          fileDialogContent
        }}</pre>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronDown, ChevronUp, Eye } from 'lucide-vue-next';
import { http } from '@/utils';
import { renderMarkdown } from '@/utils/markdown';
import type { WorkflowNodeRunInfo, WorkflowNodeType, TypedOutputValue } from '@/types/workflow';

interface SqlPreview {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

const props = defineProps<{
  nodeRun: WorkflowNodeRunInfo;
  nodeType: WorkflowNodeType;
}>();

const FILE_OUTPUT_TYPES = new Set(['filePath', 'csvFile', 'markdownFile', 'jsonFile', 'imageFile']);

interface FilePreviewResponse {
  content: string;
  path: string;
}

const { t } = useI18n();
const showDrawer = ref(false);
const expandedFiles = ref(new Set<string>());
const fileContents = reactive(new Map<string, string>());

// File preview dialog state
const fileDialogVisible = ref(false);
const fileDialogTitle = ref('');
const fileDialogContent = ref('');
const fileDialogType = ref('');
const fileDialogImageSrc = ref('');
const renderedMarkdown = computed(() => renderMarkdown(fileDialogContent.value));

function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

interface CsvData {
  columns: string[];
  rows: string[][];
}

const csvDialogData = computed((): CsvData | null => {
  if (fileDialogType.value !== 'csvFile' || !fileDialogContent.value.trim()) return null;
  const lines = fileDialogContent.value.replace(/\r\n?/g, '\n').trim().split('\n');
  if (lines.length === 0) return null;
  const columns = parseCsvRow(lines[0]);
  const rows = lines
    .slice(1)
    .filter((l) => l.trim())
    .map(parseCsvRow);
  return { columns, rows };
});

interface FileOutputEntry {
  field: string;
  displayName: string;
  value: string;
  type: string;
}

const fileOutputs = computed((): FileOutputEntry[] => {
  if (!props.nodeRun.outputs) return [];
  const results: FileOutputEntry[] = [];
  for (const [field, raw] of Object.entries(props.nodeRun.outputs)) {
    if (
      raw !== null &&
      typeof raw === 'object' &&
      'type' in raw &&
      'value' in raw &&
      typeof (raw as TypedOutputValue).type === 'string' &&
      FILE_OUTPUT_TYPES.has((raw as TypedOutputValue).type) &&
      typeof (raw as TypedOutputValue).value === 'string'
    ) {
      const typed = raw as TypedOutputValue;
      const displayName = typed.value.split('/').pop() ?? field;
      results.push({ field, displayName, value: typed.value, type: typed.type });
    }
  }
  return results;
});

async function openFilePreview(file: FileOutputEntry): Promise<void> {
  fileDialogTitle.value = file.displayName;
  fileDialogType.value = file.type;

  if (file.type === 'imageFile') {
    fileDialogImageSrc.value = `/api/workflows/file-raw?path=${encodeURIComponent(file.value)}`;
    fileDialogContent.value = '';
  } else {
    fileDialogImageSrc.value = '';
    try {
      const response = await http.get<FilePreviewResponse>(
        `/workflows/file-preview?path=${encodeURIComponent(file.value)}`
      );
      fileDialogContent.value = response.content;
    } catch {
      fileDialogContent.value = file.value;
    }
  }
  fileDialogVisible.value = true;
}

async function toggleFileExpand(field: string, filePath: string): Promise<void> {
  const next = new Set(expandedFiles.value);
  if (next.has(field)) {
    next.delete(field);
    expandedFiles.value = next;
    return;
  }
  next.add(field);
  expandedFiles.value = next;
  if (!fileContents.has(field)) {
    try {
      const response = await http.get<FilePreviewResponse>(
        `/workflows/file-preview?path=${encodeURIComponent(filePath)}`
      );
      fileContents.set(field, response.content);
    } catch {
      fileContents.set(field, filePath);
    }
  }
}

const sqlPreview = computed((): SqlPreview | null => {
  if (props.nodeType !== 'sql' || !props.nodeRun.outputs) return null;
  const outputs = props.nodeRun.outputs;
  const rows = (outputs.previewData ?? outputs.rows ?? outputs.result ?? []) as Record<
    string,
    unknown
  >[];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const columns = (outputs.columns as string[]) ?? Object.keys(rows[0]);
  const totalRows = (outputs.totalRows ?? rows.length) as number;
  return {
    columns,
    rows,
    totalRows,
  };
});

const pythonPreview = computed((): string | null => {
  if (props.nodeType !== 'python' || !props.nodeRun.outputs) return null;
  const outputs = props.nodeRun.outputs;
  const stdout = outputs.stdout as string | undefined;
  const result = outputs.result;
  if (stdout) return stdout;
  if (result !== undefined) return JSON.stringify(result, null, 2);
  return null;
});

const llmPreview = computed((): string | null => {
  if (props.nodeType !== 'llm' || !props.nodeRun.outputs) return null;
  return JSON.stringify(props.nodeRun.outputs, null, 2);
});

const emailPreviewData = computed((): string | null => {
  if (props.nodeType !== 'email' || !props.nodeRun.outputs) return null;
  return JSON.stringify(props.nodeRun.outputs, null, 2);
});

interface FileOutput {
  field: string;
  value: string;
}

const typedFileOutputs = computed((): FileOutput[] => {
  if (!props.nodeRun.outputs) return [];
  const results: FileOutput[] = [];
  for (const [field, raw] of Object.entries(props.nodeRun.outputs)) {
    if (
      raw !== null &&
      typeof raw === 'object' &&
      'type' in raw &&
      'value' in raw &&
      typeof (raw as TypedOutputValue).type === 'string' &&
      FILE_OUTPUT_TYPES.has((raw as TypedOutputValue).type) &&
      typeof (raw as TypedOutputValue).value === 'string'
    ) {
      results.push({ field, value: (raw as TypedOutputValue).value });
    }
  }
  return results;
});
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-node-preview {
  background-color: $bg-deeper;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: $spacing-sm $spacing-md;
    cursor: pointer;
    background: none;
    border: none;
    border-top: 1px solid $border-dark;
    transition: background-color $transition-fast;

    &:hover {
      background-color: $bg-elevated;
    }
  }

  &__title {
    font-size: $font-size-xs;
    font-weight: $font-weight-semibold;
    color: $text-muted;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__status {
    font-size: $font-size-xs;
    font-weight: $font-weight-medium;

    &.is-completed {
      color: $success;
    }

    &.is-failed {
      color: $error;
    }

    &.is-running {
      color: $warning;
    }

    &.is-pending,
    &.is-skipped,
    &.is-cancelled {
      color: $text-muted;
    }
  }

  &__body {
    padding: $spacing-sm $spacing-md;
  }

  &__error {
    padding: $spacing-sm;
    font-family: $font-family-mono;
    font-size: $font-size-xs;
    color: $error;
    background-color: $error-tint;
    border-radius: $radius-sm;
  }

  &__section-title {
    margin-bottom: $spacing-xs;
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__table-wrapper {
    max-height: 400px;
    overflow: auto;
    border: 1px solid $border-dark;
    border-radius: $radius-sm;
  }

  &__table {
    width: 100%;
    font-family: $font-family-mono;
    font-size: $font-size-xs;
    border-collapse: collapse;

    th,
    td {
      max-width: 150px;
      padding: 4px 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: left;
      white-space: nowrap;
      border-bottom: 1px solid $border-dark;
    }

    th {
      font-weight: $font-weight-medium;
      color: $text-secondary-color;
      background-color: $bg-elevated;
    }

    td {
      color: $text-primary-color;
    }

    tr:last-child td {
      border-bottom: none;
    }
  }

  &__row-count {
    display: block;
    margin-top: $spacing-xs;
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__code {
    max-height: 200px;
    padding: $spacing-sm;
    margin: 0;
    overflow-y: auto;
    font-family: $font-family-mono;
    font-size: $font-size-xs;
    color: $text-primary-color;
    word-break: break-all;
    white-space: pre-wrap;
    background-color: $bg-elevated;
    border-radius: $radius-sm;
  }

  &__file-output {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
    margin-bottom: $spacing-sm;
  }

  &__file-row {
    display: flex;
    gap: $spacing-xs;
    align-items: center;
    padding: $spacing-xs $spacing-sm;
    background-color: $bg-elevated;
    border: 1px solid $border-dark;
    border-radius: $radius-sm;
  }

  &__file-path {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: $font-family-mono;
    font-size: $font-size-xs;
    color: $text-primary-color;
    white-space: nowrap;
  }

  &__file-toggle {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    color: $text-muted;
    cursor: pointer;
    background: none;
    border: none;
    border-radius: $radius-sm;
    transition: background-color $transition-fast;

    &:hover {
      background-color: $bg-deeper;
    }
  }

  &__file-list {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
    margin-top: $spacing-sm;
  }

  &__file-item {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-xs $spacing-sm;
    background-color: $bg-elevated;
    border: 1px solid $border-dark;
    border-radius: $radius-sm;

    .el-button {
      display: flex;
      gap: $spacing-xs;
      align-items: center;
    }
  }

  &__file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: $font-family-mono;
    font-size: $font-size-xs;
    color: $text-primary-color;
    white-space: nowrap;
  }

  &__file-dialog {
    // Scrolling handled by el-dialog__body; no extra scroll container here
  }

  &__file-image {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 0 auto;
  }

  &__file-markdown {
    padding: $spacing-md;
  }

  &__table-wrapper--dialog {
    max-height: 60vh;
  }

  &__code--dialog {
    // Scrolling handled by el-dialog__body
  }
}

.preview-section {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.preview-label {
  font-size: $font-size-xs;
  color: $text-muted;
}
</style>
