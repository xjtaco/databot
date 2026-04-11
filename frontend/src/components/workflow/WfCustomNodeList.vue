<template>
  <div class="wf-custom-node-list">
    <!-- Header -->
    <div class="wf-custom-node-list__header">
      <div class="wf-custom-node-list__header-left">
        <el-input
          v-model="searchQuery"
          :placeholder="t('workflow.customNode.search')"
          :prefix-icon="Search"
          clearable
          class="wf-custom-node-list__search"
        />
      </div>
      <div class="wf-custom-node-list__header-right">
        <el-tooltip :content="t('workflow.customNode.importNodes')" :disabled="!isMobile">
          <el-button :icon="Upload" @click="triggerImportFile">
            <template v-if="!isMobile">{{ t('workflow.customNode.importNodes') }}</template>
          </el-button>
        </el-tooltip>
        <input
          ref="importFileInput"
          type="file"
          accept=".json,.zip"
          style="display: none"
          @change="handleImportFileChange"
        />
        <el-tooltip :content="t('workflow.customNode.exportSelected')" :disabled="!isMobile">
          <el-button
            :icon="Download"
            :disabled="selectedIds.length === 0"
            @click="handleBatchExport"
          >
            <template v-if="!isMobile">{{ t('workflow.customNode.exportSelected') }}</template>
          </el-button>
        </el-tooltip>
        <el-button type="primary" :icon="Plus" @click="showCreateDialog = true">
          <template v-if="!isMobile">{{ t('workflow.customNode.newNode') }}</template>
        </el-button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="filteredTemplates.length === 0" class="wf-custom-node-list__empty">
      <p>{{ t('workflow.customNode.empty') }}</p>
    </div>

    <!-- Desktop Table -->
    <el-table
      v-else-if="!isMobile"
      :data="filteredTemplates"
      class="wf-custom-node-list__table"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="40" />
      <el-table-column :label="t('workflow.name')" min-width="120" show-overflow-tooltip>
        <template #default="{ row }: { row: CustomNodeTemplateInfo }">
          <span class="wf-custom-node-list__name">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.description')" min-width="120" show-overflow-tooltip>
        <template #default="{ row }: { row: CustomNodeTemplateInfo }">
          <span class="wf-custom-node-list__desc">{{ row.description ?? '\u2014' }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.list.status')" width="120">
        <template #default="{ row }: { row: CustomNodeTemplateInfo }">
          <span
            class="wf-custom-node-list__type-badge"
            :style="{ backgroundColor: badgeBg(row.type), color: NODE_COLORS[row.type] }"
          >
            {{ t(`workflow.nodeTypes.${row.type}`) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.list.updatedAt')" width="120">
        <template #default="{ row }: { row: CustomNodeTemplateInfo }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('common.creator')" min-width="100">
        <template #default="{ row }: { row: CustomNodeTemplateInfo }">
          {{ row.creatorName || '—' }}
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.list.actions')" width="120" align="center" fixed="right">
        <template #default="{ row }: { row: CustomNodeTemplateInfo }">
          <div class="wf-custom-node-list__actions">
            <el-tooltip :content="t('workflow.customNode.edit')" placement="top">
              <el-button size="small" :icon="EditIcon" circle @click="emit('edit', row.id)" />
            </el-tooltip>
            <el-tooltip :content="t('workflow.customNode.delete')" placement="top">
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
    <div v-else class="wf-custom-node-list__cards">
      <div v-for="tpl in filteredTemplates" :key="tpl.id" class="wf-custom-node-list__card">
        <div class="wf-custom-node-list__card-header">
          <el-checkbox
            :model-value="selectedIds.includes(tpl.id)"
            @change="toggleMobileSelection(tpl.id)"
          />
          <span class="wf-custom-node-list__card-name">{{ tpl.name }}</span>
          <span
            class="wf-custom-node-list__type-badge"
            :style="{ backgroundColor: badgeBg(tpl.type), color: NODE_COLORS[tpl.type] }"
          >
            {{ t(`workflow.nodeTypes.${tpl.type}`) }}
          </span>
        </div>
        <p class="wf-custom-node-list__card-desc">{{ tpl.description ?? '\u2014' }}</p>
        <div class="wf-custom-node-list__card-meta">
          <span>{{ formatDate(tpl.createdAt) }}</span>
          <span v-if="tpl.creatorName">{{ t('common.creator') }}: {{ tpl.creatorName }}</span>
        </div>
        <div class="wf-custom-node-list__card-actions">
          <el-tooltip :content="t('workflow.customNode.edit')" placement="top">
            <el-button size="small" :icon="EditIcon" circle @click="emit('edit', tpl.id)" />
          </el-tooltip>
          <el-tooltip :content="t('workflow.customNode.delete')" placement="top">
            <el-button
              size="small"
              type="danger"
              :icon="DeleteIcon"
              circle
              @click="handleDelete(tpl.id)"
            />
          </el-tooltip>
        </div>
      </div>
    </div>
  </div>

  <ImportResultDialog
    :visible="showImportResultDialog"
    :results="importResults"
    @close="showImportResultDialog = false"
  />

  <ConfirmDialog
    v-model:visible="showDeleteConfirm"
    :title="t('common.warning')"
    :message="t('workflow.customNode.deleteConfirm')"
    type="danger"
    :confirm-text="t('common.delete')"
    :loading="isDeletingTemplate"
    @confirm="confirmDelete"
  />

  <!-- Create Node Template Dialog -->
  <el-dialog
    v-model="showCreateDialog"
    :title="t('workflow.customNode.createDialogTitle')"
    width="420px"
    @close="resetCreateForm"
  >
    <el-form label-position="top">
      <el-form-item :label="t('workflow.customNode.nodeType')" required>
        <div class="wf-custom-node-list__type-grid">
          <button
            v-for="nt in nodeTypeOptions"
            :key="nt.type"
            class="wf-custom-node-list__type-option"
            :class="{ 'is-selected': createForm.type === nt.type }"
            :disabled="nt.disabled"
            type="button"
            @click="createForm.type = nt.type"
          >
            <component :is="nt.icon" :size="18" :style="{ color: NODE_COLORS[nt.type] }" />
            <span>{{ t(`workflow.nodeTypes.${nt.type}`) }}</span>
          </button>
        </div>
      </el-form-item>
      <el-form-item :label="t('workflow.customNode.saveName')" required>
        <el-input v-model="createForm.name" />
      </el-form-item>
      <el-form-item :label="t('workflow.customNode.saveDesc')">
        <el-input v-model="createForm.description" type="textarea" :rows="3" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
      <el-button
        type="primary"
        :disabled="!createForm.type || !createForm.name.trim()"
        :loading="isCreating"
        @click="confirmCreate"
      >
        {{ t('common.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import {
  Search,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Upload,
  Download,
  Plus,
} from '@element-plus/icons-vue';
import { Database, Code, Sparkles, Mail, Search as SearchIcon } from 'lucide-vue-next';
import { useWorkflowStore, useGlobalConfigStore } from '@/stores';
import { useResponsive } from '@/composables/useResponsive';
import { NODE_COLORS } from '@/constants/workflow';
import * as workflowApi from '@/api/workflow';
import ImportResultDialog from './ImportResultDialog.vue';
import { ConfirmDialog } from '@/components/common';
import type { WorkflowNodeType, CustomNodeTemplateInfo, ImportResultItem } from '@/types/workflow';

const { t } = useI18n();
const store = useWorkflowStore();
const globalConfigStore = useGlobalConfigStore();
const { isMobile } = useResponsive();

const emit = defineEmits<{
  edit: [templateId: string];
  create: [];
}>();

const searchQuery = ref('');
const selectedIds = ref<string[]>([]);
const importFileInput = ref<HTMLInputElement | null>(null);
const importResults = ref<ImportResultItem[]>([]);
const showImportResultDialog = ref(false);

// ── Create dialog ────────────────────────────────
const showCreateDialog = ref(false);
const isCreating = ref(false);
const createForm = ref<{ type: WorkflowNodeType | null; name: string; description: string }>({
  type: null,
  name: '',
  description: '',
});

const nodeTypeOptions = computed(() => [
  { type: 'sql' as WorkflowNodeType, icon: Database, disabled: false },
  { type: 'python' as WorkflowNodeType, icon: Code, disabled: false },
  { type: 'llm' as WorkflowNodeType, icon: Sparkles, disabled: !globalConfigStore.isLLMConfigured },
  { type: 'email' as WorkflowNodeType, icon: Mail, disabled: !globalConfigStore.isSmtpConfigured },
  {
    type: 'web_search' as WorkflowNodeType,
    icon: SearchIcon,
    disabled: !globalConfigStore.isWebSearchConfigured,
  },
]);

function resetCreateForm(): void {
  createForm.value = { type: null, name: '', description: '' };
}

async function confirmCreate(): Promise<void> {
  if (!createForm.value.type || !createForm.value.name.trim()) return;
  isCreating.value = true;
  try {
    const defaultConfigs: Record<string, unknown> = {
      sql: {
        nodeType: 'sql',
        datasourceId: '',
        params: {},
        sql: 'SELECT * FROM ',
        outputVariable: 'result',
      },
      python: {
        nodeType: 'python',
        params: {},
        script: '# params dict contains upstream node outputs\n\nresult = {"status": "ok"}',
        outputVariable: 'result',
      },
      llm: { nodeType: 'llm', params: {}, prompt: '', outputVariable: 'result' },
      email: {
        nodeType: 'email',
        to: '',
        subject: '',
        contentSource: 'inline',
        body: '',
        isHtml: true,
        outputVariable: 'email_result',
      },
      web_search: {
        nodeType: 'web_search',
        params: {},
        keywords: '',
        outputVariable: 'search_result',
      },
    };
    const created = await workflowApi.createTemplate({
      name: createForm.value.name.trim(),
      description: createForm.value.description.trim() || undefined,
      type: createForm.value.type,
      config: defaultConfigs[createForm.value.type] as never,
    });
    await store.fetchTemplates();
    showCreateDialog.value = false;
    resetCreateForm();
    ElMessage.success(t('common.success'));
    emit('edit', created.id);
  } catch {
    ElMessage.error(t('common.failed'));
  } finally {
    isCreating.value = false;
  }
}

const filteredTemplates = computed(() => {
  if (!searchQuery.value) return store.customTemplates;
  const q = searchQuery.value.toLowerCase();
  return store.customTemplates.filter(
    (tpl) =>
      tpl.name.toLowerCase().includes(q) ||
      (tpl.description && tpl.description.toLowerCase().includes(q))
  );
});

onMounted(async () => {
  await store.fetchTemplates();
});

function badgeBg(type: WorkflowNodeType): string {
  const color = NODE_COLORS[type];
  return color + '1A'; // ~10% opacity hex suffix
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString();
}

const showDeleteConfirm = ref(false);
const pendingDeleteId = ref<string | null>(null);
const isDeletingTemplate = ref(false);

function handleDelete(id: string): void {
  pendingDeleteId.value = id;
  showDeleteConfirm.value = true;
}

async function confirmDelete(): Promise<void> {
  if (!pendingDeleteId.value) return;
  isDeletingTemplate.value = true;
  try {
    await store.removeTemplate(pendingDeleteId.value);
    ElMessage.success(t('common.success'));
    showDeleteConfirm.value = false;
    pendingDeleteId.value = null;
  } catch {
    ElMessage.error(t('common.failed'));
  } finally {
    isDeletingTemplate.value = false;
  }
}

function handleSelectionChange(selection: CustomNodeTemplateInfo[]): void {
  selectedIds.value = selection.map((s) => s.id);
}

function toggleMobileSelection(id: string): void {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) selectedIds.value.splice(idx, 1);
  else selectedIds.value.push(id);
}

function triggerImportFile(): void {
  importFileInput.value?.click();
}

async function handleImportFileChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  try {
    const results = await store.importTemplates(file);
    if (results.length === 0) {
      ElMessage.warning(t('workflow.customNode.noValidTemplates'));
    } else {
      importResults.value = results;
      showImportResultDialog.value = true;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'no_valid_files') {
      ElMessage.warning(t('workflow.customNode.noValidTemplates'));
    } else {
      ElMessage.error(t('common.failed'));
    }
  }
  target.value = '';
}

async function handleBatchExport(): Promise<void> {
  try {
    await store.batchExportTemplates(selectedIds.value);
    ElMessage.success(t('common.success'));
  } catch {
    ElMessage.error(t('common.failed'));
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-custom-node-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;

  &__header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  &__header-left {
    display: flex;
    gap: 8px;
  }

  &__header-right {
    display: flex;
    gap: 8px;
  }

  &__search {
    width: 240px;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 0;
    color: var(--text-secondary);
  }

  &__name {
    font-weight: 500;
    color: var(--text-primary);
  }

  &__desc {
    color: var(--text-secondary);
  }

  &__type-badge {
    display: inline-block;
    padding: 2px 8px;
    font-size: 12px;
    font-weight: 500;
    border-radius: 10px;
  }

  &__actions {
    display: flex;
    flex-wrap: nowrap;
    gap: 4px;
  }

  // ── Table Overrides (dark theme) ──────────────────────
  &__table {
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
  &__cards {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__card {
    padding: 14px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: 8px;

    &-header {
      display: flex;
      gap: $spacing-sm;
      align-items: center;
      margin-bottom: 6px;
    }

    &-name {
      flex: 1;
      font-weight: 600;
      color: var(--text-primary);
    }

    &-desc {
      margin-bottom: 8px;
      font-size: 13px;
      color: var(--text-secondary);
    }

    &-meta {
      display: flex;
      gap: 12px;
      margin-bottom: 10px;
      font-size: 12px;
      color: var(--text-tertiary);
    }

    &-actions {
      display: flex;
      gap: 8px;
      padding-top: 10px;
      border-top: 1px solid var(--border-primary);
    }
  }

  // ── Create Dialog Type Grid ──────────────────────
  &__type-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__type-option {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 8px 12px;
    font-size: 13px;
    color: var(--text-primary);
    cursor: pointer;
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    transition: all 0.15s;

    &:hover:not(:disabled) {
      background: var(--bg-elevated);
      border-color: var(--accent);
    }

    &.is-selected {
      background: var(--bg-elevated);
      border-color: var(--accent);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.35;
    }
  }
}
</style>
