<template>
  <div class="wf-list-view">
    <!-- Page Title -->
    <div class="wf-list-title">
      <div class="wf-list-title__text">
        <h2 class="wf-list-title__heading">{{ t('workflow.title') }}</h2>
        <p class="wf-list-title__desc">{{ t('workflow.pageDescription') }}</p>
      </div>
    </div>

    <el-tabs v-model="store.activeTab" class="wf-list-tabs">
      <el-tab-pane :label="t('workflow.tabs.workflows')" name="workflows">
        <!-- Header Bar -->
        <div class="wf-list-header">
          <div class="wf-list-header__left">
            <el-input
              v-model="store.searchQuery"
              :placeholder="t('workflow.list.search')"
              :prefix-icon="Search"
              clearable
              class="wf-list-search"
            />
            <el-select v-model="store.statusFilter" class="wf-list-filter">
              <el-option :label="t('workflow.list.filterAll')" value="all" />
              <el-option :label="t('workflow.status.completed')" value="completed" />
              <el-option :label="t('workflow.status.failed')" value="failed" />
              <el-option :label="t('workflow.status.running')" value="running" />
              <el-option :label="t('workflow.list.neverRun')" value="never_run" />
            </el-select>
          </div>
          <div class="wf-list-header__right">
            <el-tooltip :content="t('workflow.list.importWorkflow')" :disabled="!props.isMobile">
              <el-button :icon="Upload" @click="triggerImportFile">
                <template v-if="!props.isMobile">{{ t('workflow.list.importWorkflow') }}</template>
              </el-button>
            </el-tooltip>
            <input
              ref="importFileInput"
              type="file"
              accept=".json,.zip"
              style="display: none"
              @change="handleImportFileChange"
            />
            <el-tooltip :content="t('workflow.list.exportSelected')" :disabled="!props.isMobile">
              <el-button
                :icon="Download"
                :disabled="selectedIds.length === 0"
                @click="handleBatchExport"
              >
                <template v-if="!props.isMobile">{{ t('workflow.list.exportSelected') }}</template>
              </el-button>
            </el-tooltip>
            <el-button type="primary" :icon="Plus" @click="showCreateDialog = true">
              <template v-if="!props.isMobile">{{ t('workflow.newWorkflow') }}</template>
            </el-button>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="store.isLoading" class="wf-list-loading"></div>

        <!-- Error State -->
        <div v-else-if="loadError" class="wf-list-empty">
          <p>{{ loadError }}</p>
          <el-button type="primary" style="margin-top: 12px" @click="retryLoad">
            {{ t('workflow.execution.retry') }}
          </el-button>
        </div>

        <!-- Empty State -->
        <div v-else-if="store.filteredWorkflows.length === 0" class="wf-list-empty">
          <p>{{ t('workflow.list.empty') }}</p>
          <p class="wf-list-empty__hint">{{ t('workflow.list.emptyHint') }}</p>
        </div>

        <!-- Desktop Table -->
        <el-table
          v-else-if="!props.isMobile"
          ref="tableRef"
          :data="store.filteredWorkflows"
          class="wf-list-table"
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" width="40" />
          <el-table-column :label="t('workflow.name')" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="wf-list-name" @click="emit('edit', row.id)">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('workflow.description')" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="wf-list-desc">{{ row.description ?? '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('workflow.list.nodeCount')" width="80" align="center">
            <template #default="{ row }">{{ row.nodeCount }}</template>
          </el-table-column>
          <el-table-column :label="t('workflow.list.status')" width="100">
            <template #default="{ row }">
              <span
                :class="['wf-status-badge', 'wf-status-badge--' + (row.lastRunStatus ?? 'none')]"
              >
                {{ statusLabel(row.lastRunStatus) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.creator')" min-width="100">
            <template #default="{ row }">
              <span class="wf-list__creator">{{ row.creatorName || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('workflow.list.updatedAt')" width="100">
            <template #default="{ row }">
              {{ formatRelativeTime(row.updatedAt) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="t('workflow.list.actions')"
            width="210"
            align="center"
            fixed="right"
          >
            <template #default="{ row }">
              <div class="wf-list-actions">
                <el-tooltip :content="t('workflow.list.edit')" placement="top">
                  <el-button size="small" :icon="EditIcon" circle @click="emit('edit', row.id)" />
                </el-tooltip>
                <el-tooltip :content="t('workflow.run')" placement="top">
                  <el-button
                    size="small"
                    :icon="VideoPlay"
                    circle
                    :loading="runningId === row.id"
                    @click="handleRun(row.id)"
                  />
                </el-tooltip>
                <el-tooltip :content="t('workflow.list.clone')" placement="top">
                  <el-button size="small" :icon="CopyDocument" circle @click="handleClone(row)" />
                </el-tooltip>
                <el-tooltip :content="t('workflow.history.title')" placement="top">
                  <el-button size="small" :icon="Clock" circle @click="emit('history', row.id)" />
                </el-tooltip>
                <el-tooltip :content="t('common.delete')" placement="top">
                  <el-button
                    size="small"
                    type="danger"
                    :icon="DeleteIcon"
                    circle
                    @click="handleDelete(row.id)"
                  />
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <!-- Mobile Cards -->
        <div v-else class="wf-list-cards">
          <div v-for="wf in store.filteredWorkflows" :key="wf.id" class="wf-list-card">
            <div class="wf-list-card__header">
              <el-checkbox
                :model-value="selectedIds.includes(wf.id)"
                @change="toggleMobileSelection(wf.id)"
              />
              <span class="wf-list-card__name">{{ wf.name }}</span>
              <span
                :class="['wf-status-badge', 'wf-status-badge--' + (wf.lastRunStatus ?? 'none')]"
              >
                {{ statusLabel(wf.lastRunStatus) }}
              </span>
            </div>
            <p class="wf-list-card__desc">{{ wf.description ?? '—' }}</p>
            <div class="wf-list-card__meta">
              <span>{{ t('workflow.mobile.nodeCount', { n: wf.nodeCount }) }}</span>
              <span>{{ formatRelativeTime(wf.updatedAt) }}</span>
              <span v-if="wf.creatorName">{{ t('common.creator') }}: {{ wf.creatorName }}</span>
            </div>
            <div class="wf-list-card__actions">
              <el-tooltip :content="t('workflow.list.edit')" placement="top">
                <el-button size="small" :icon="EditIcon" circle @click="emit('edit', wf.id)" />
              </el-tooltip>
              <el-tooltip :content="t('workflow.run')" placement="top">
                <el-button
                  size="small"
                  :icon="VideoPlay"
                  circle
                  :loading="runningId === wf.id"
                  @click="handleRun(wf.id)"
                />
              </el-tooltip>
              <el-tooltip :content="t('workflow.list.clone')" placement="top">
                <el-button size="small" :icon="CopyDocument" circle @click="handleClone(wf)" />
              </el-tooltip>
              <el-tooltip :content="t('workflow.history.title')" placement="top">
                <el-button size="small" :icon="Clock" circle @click="emit('history', wf.id)" />
              </el-tooltip>
              <el-tooltip :content="t('common.delete')" placement="top">
                <el-button
                  size="small"
                  type="danger"
                  :icon="DeleteIcon"
                  circle
                  @click="handleDelete(wf.id)"
                />
              </el-tooltip>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('workflow.tabs.customNodes')" name="customNodes">
        <WfCustomNodeList @edit="handleEditTemplate" @create="handleCreateTemplate" />
      </el-tab-pane>
    </el-tabs>

    <!-- Create Dialog -->
    <el-dialog
      v-model="showCreateDialog"
      :title="t('workflow.newWorkflow')"
      width="420px"
      @closed="resetCreateForm"
    >
      <el-form label-position="top" @submit.prevent="handleCreateConfirm">
        <el-form-item :label="t('workflow.name')" required>
          <el-input v-model="createName" :placeholder="t('workflow.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('workflow.description')">
          <el-input
            v-model="createDescription"
            type="textarea"
            :placeholder="t('workflow.descriptionPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :disabled="!createName.trim()" @click="handleCreateConfirm">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Run Params Dialog -->
    <el-dialog v-model="showRunParamsDialog" :title="t('workflow.runParams.title')" width="480px">
      <p>{{ t('workflow.runParams.description') }}</p>
      <el-form>
        <el-form-item v-for="param in detectedRunParams" :key="param" :label="param">
          <el-input v-model="runParamsValues[param]" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRunParamsDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="confirmRun">
          {{ t('workflow.runParams.startRun') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Import Result Dialog -->
    <ImportResultDialog
      :visible="showImportResult"
      :results="importResults"
      @close="showImportResult = false"
    />

    <ConfirmDialog
      v-model:visible="showDeleteConfirm"
      :title="t('common.warning')"
      :message="t('workflow.deleteConfirm')"
      type="danger"
      :confirm-text="t('common.delete')"
      :loading="isDeletingWorkflow"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import type { TableInstance } from 'element-plus';
import {
  Search,
  Plus,
  Edit as EditIcon,
  VideoPlay,
  CopyDocument,
  Download,
  Upload,
  Delete as DeleteIcon,
  Clock,
} from '@element-plus/icons-vue';
import { useWorkflowStore } from '@/stores/workflowStore';
import * as workflowApi from '@/api/workflow';
import type {
  WorkflowListItem,
  WorkflowNodeInfo,
  ExecutionStatus,
  ImportResultItem,
} from '@/types/workflow';
import ImportResultDialog from './ImportResultDialog.vue';
import WfCustomNodeList from './WfCustomNodeList.vue';
import { ConfirmDialog } from '@/components/common';

const props = defineProps<{
  isMobile?: boolean;
}>();

const { t } = useI18n();
const store = useWorkflowStore();
const tableRef = ref<TableInstance>();

// ── Selection ────────────────────────────────────────────
const selectedIds = ref<string[]>([]);

function handleSelectionChange(rows: WorkflowListItem[]): void {
  selectedIds.value = rows.map((r) => r.id);
}

function toggleMobileSelection(id: string): void {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1);
  } else {
    selectedIds.value.push(id);
  }
}

// ── Import ──────────────────────────────────────────────
const importFileInput = ref<HTMLInputElement>();
const showImportResult = ref(false);
const importResults = ref<ImportResultItem[]>([]);

function triggerImportFile(): void {
  importFileInput.value?.click();
}

async function handleImportFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const results = await store.handleImportFile(file);
    importResults.value = results;
    showImportResult.value = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'no_valid_files') {
      ElMessage.warning(t('workflow.list.importNoValidFiles'));
    } else {
      ElMessage.error(t('workflow.list.importInvalidFormat'));
    }
  } finally {
    // Reset file input so same file can be selected again
    input.value = '';
  }
}

async function handleBatchExport(): Promise<void> {
  if (selectedIds.value.length === 0) return;
  try {
    await store.batchExportWorkflows(selectedIds.value);
  } catch {
    ElMessage.error(t('common.failed'));
  }
}

// ── Error State ──────────────────────────────────────────
const loadError = ref<string | null>(null);

async function retryLoad(): Promise<void> {
  loadError.value = null;
  try {
    await store.fetchWorkflows();
  } catch {
    loadError.value = t('common.failed');
  }
}

const emit = defineEmits<{
  edit: [id: string];
  created: [id: string];
  history: [id: string];
  editTemplate: [templateId: string];
  createTemplate: [];
}>();

function handleEditTemplate(templateId: string): void {
  emit('editTemplate', templateId);
}

function handleCreateTemplate(): void {
  emit('createTemplate');
}

// ── Create Dialog ────────────────────────────────────────
const showCreateDialog = ref(false);
const createName = ref('');
const createDescription = ref('');

function resetCreateForm(): void {
  createName.value = '';
  createDescription.value = '';
}

async function handleCreateConfirm(): Promise<void> {
  const name = createName.value.trim();
  if (!name) return;
  try {
    const id = await store.createWorkflow(name, createDescription.value.trim() || undefined);
    showCreateDialog.value = false;
    resetCreateForm();
    emit('created', id);
  } catch {
    ElMessage.error(t('common.failed'));
  }
}

// ── Status Badge ─────────────────────────────────────────
function statusLabel(status: ExecutionStatus | null): string {
  if (!status) return t('workflow.list.neverRun');
  return t(`workflow.status.${status}`);
}

// ── Run from List ────────────────────────────────────────
const runningId = ref<string | null>(null);
const showRunParamsDialog = ref(false);
const detectedRunParams = ref<string[]>([]);
const runParamsValues = reactive<Record<string, string>>({});
let pendingRunId = '';

async function handleRun(id: string): Promise<void> {
  runningId.value = id;
  try {
    const detail = await workflowApi.getWorkflow(id);
    const params = extractParams(detail.nodes);

    if (params.length > 0) {
      detectedRunParams.value = params;
      for (const key of Object.keys(runParamsValues)) {
        delete runParamsValues[key];
      }
      for (const p of params) {
        runParamsValues[p] = '';
      }
      pendingRunId = id;
      showRunParamsDialog.value = true;
    } else {
      await workflowApi.startWorkflow(id);
      ElMessage.success(t('workflow.run'));
      await store.fetchWorkflows();
    }
  } catch {
    ElMessage.error(t('common.failed'));
  } finally {
    runningId.value = null;
  }
}

async function confirmRun(): Promise<void> {
  showRunParamsDialog.value = false;
  try {
    await workflowApi.startWorkflow(pendingRunId, runParamsValues);
    ElMessage.success(t('workflow.run'));
    await store.fetchWorkflows();
  } catch {
    ElMessage.error(t('common.failed'));
  }
}

function extractParams(nodes: WorkflowNodeInfo[]): string[] {
  const paramSet = new Set<string>();
  const regex = /\{\{params\.(\w+)\}\}/g;
  for (const node of nodes) {
    const configStr = JSON.stringify(node.config);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(configStr)) !== null) {
      paramSet.add(match[1]);
    }
  }
  return Array.from(paramSet);
}

// ── Clone ────────────────────────────────────────────────
async function handleClone(wf: WorkflowListItem): Promise<void> {
  try {
    const newName = wf.name + t('workflow.list.cloneSuffix');
    await store.cloneWorkflow(wf.id, newName);
    ElMessage.success(t('workflow.list.cloneSuccess'));
  } catch {
    ElMessage.error(t('common.failed'));
  }
}

// ── Delete ───────────────────────────────────────────────
const showDeleteConfirm = ref(false);
const pendingDeleteId = ref<string | null>(null);
const isDeletingWorkflow = ref(false);

function handleDelete(id: string): void {
  pendingDeleteId.value = id;
  showDeleteConfirm.value = true;
}

async function confirmDelete(): Promise<void> {
  if (!pendingDeleteId.value) return;
  isDeletingWorkflow.value = true;
  try {
    await store.removeWorkflow(pendingDeleteId.value);
    ElMessage.success(t('workflow.deleteSuccess'));
    showDeleteConfirm.value = false;
    pendingDeleteId.value = null;
  } catch {
    ElMessage.error(t('common.failed'));
  } finally {
    isDeletingWorkflow.value = false;
  }
}

// ── Time Formatting ──────────────────────────────────────
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? '<1m' : `${diffMins}m`;
    }
    return `${diffHours}h`;
  }
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}
</script>

<style scoped lang="scss">
.wf-list-view {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 16px 24px;
  overflow-y: auto;

  // Override Element Plus input/select to match dark theme
  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper) {
    background-color: var(--bg-elevated);
    box-shadow: 0 0 0 1px var(--border-primary) inset;
  }

  :deep(.el-input__inner),
  :deep(.el-select__input) {
    color: var(--text-primary);
  }
}

.wf-list-tabs {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;

  :deep(.el-tabs__header) {
    margin-bottom: 16px;
  }

  :deep(.el-tabs__content) {
    flex: 1;
    overflow: visible;
  }

  :deep(.el-tab-pane) {
    height: 100%;
  }
}

.wf-list-title {
  display: flex;
  flex-shrink: 0;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;

  &__text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__heading {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__desc {
    margin: 0;
    font-size: 13px;
    color: var(--text-tertiary);
  }
}

.wf-list-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;

  &__left {
    display: flex;
    gap: 8px;
  }

  &__right {
    display: flex;
    gap: 8px;
  }
}

.wf-list-search {
  width: 240px;
}

.wf-list-filter {
  width: 120px;
}

.wf-list-loading {
  padding: 24px 0;
}

.wf-list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: var(--text-secondary);

  &__hint {
    margin-top: 8px;
    font-size: 13px;
    color: var(--text-tertiary);
  }
}

.wf-list-name {
  color: var(--accent);
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

.wf-list-desc {
  color: var(--text-secondary);
}

.wf-list__creator {
  font-size: 13px;
  color: var(--text-secondary);
}

.wf-list-actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
}

// ── Status Badge ──────────────────────────────────────
.wf-status-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 10px;

  &--completed {
    color: var(--success);
    background: var(--success-tint);
  }

  &--failed {
    color: var(--error);
    background: var(--error-tint);
  }

  &--running,
  &--pending {
    color: #3b82f6;
    background: rgb(59 130 246 / 10%);
  }

  &--skipped {
    color: var(--warning);
    background: var(--warning-tint);
  }

  &--cancelled,
  &--none {
    color: var(--text-tertiary);
    background: rgb(107 114 128 / 10%);
  }
}

// ── Table Overrides (dark theme) ──────────────────────
.wf-list-table {
  flex: 1;

  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: var(--bg-secondary);
  --el-table-row-hover-bg-color: var(--bg-elevated);
  --el-table-border-color: var(--border-primary);
  --el-table-text-color: var(--text-primary);
  --el-table-header-text-color: var(--text-tertiary);

  :deep(.el-table__header th.el-table__cell) {
    font-weight: 400;
  }

  :deep(.el-table__body tr:last-child td) {
    border-bottom: none;
  }

  :deep(.el-table__inner-wrapper::before) {
    display: none;
  }
}

// ── Mobile Cards ──────────────────────────────────────
.wf-list-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wf-list-card {
  padding: 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  &__name {
    font-weight: 600;
    color: var(--text-primary);
  }

  &__desc {
    margin-bottom: 8px;
    font-size: 13px;
    color: var(--text-secondary);
  }

  &__meta {
    display: flex;
    gap: 12px;
    margin-bottom: 10px;
    font-size: 12px;
    color: var(--text-tertiary);
  }

  &__actions {
    display: flex;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--border-primary);
  }
}
</style>
