<template>
  <div class="resource-action-card">
    <div class="resource-action-card__toolbar">
      <el-input
        v-model="query"
        class="resource-action-card__search-input"
        size="small"
        clearable
        :placeholder="t('chat.actionCards.resource.searchPlaceholder')"
        @keyup.enter="loadSections"
      />
      <el-button
        class="resource-action-card__search-button"
        size="small"
        :title="t('chat.actionCards.resource.search')"
        @click="loadSections"
      >
        <el-icon><Search /></el-icon>
      </el-button>
    </div>

    <div v-if="cardError" class="resource-action-card__error">
      {{ cardError }}
    </div>

    <section
      v-for="section in sectionStates"
      :key="section.key"
      class="resource-action-card__section"
    >
      <div class="resource-action-card__section-header">
        <span class="resource-action-card__section-title">{{ sectionTitle(section) }}</span>
        <span v-if="section.loading" class="resource-action-card__section-state">
          {{ t('common.loading') }}
        </span>
      </div>

      <div v-if="section.error" class="resource-action-card__error">
        {{ section.error }}
      </div>
      <div
        v-else-if="!section.loading && section.rows.length === 0"
        class="resource-action-card__empty"
      >
        {{ sectionEmptyText(section) }}
      </div>

      <div v-else class="resource-action-card__rows">
        <div
          v-for="row in section.rows"
          :key="rowStateKey(section, row)"
          class="resource-action-card__row"
        >
          <div class="resource-action-card__row-main">
            <div class="resource-action-card__row-title">{{ row.title }}</div>
            <div v-if="row.subtitle" class="resource-action-card__row-subtitle">
              {{ row.subtitle }}
            </div>
            <div v-if="row.meta.length > 0" class="resource-action-card__meta">
              <span
                v-for="item in row.meta"
                :key="`${row.id}:${item.label}:${item.value}`"
                class="resource-action-card__meta-item"
              >
                {{ t(item.label) }}: {{ item.value }}
              </span>
            </div>
            <div v-if="rowResults[rowStateKey(section, row)]" class="resource-action-card__result">
              {{ rowResults[rowStateKey(section, row)] }}
            </div>
            <div v-if="rowErrors[rowStateKey(section, row)]" class="resource-action-card__error">
              {{ rowErrors[rowStateKey(section, row)] }}
            </div>
            <InlineScheduleForm
              v-if="inlineEdit?.rowKey === rowStateKey(section, row)"
              class="resource-action-card__inline-form"
              :payload="inlineEdit.payload"
              @submit="(status, opts) => handleInlineScheduleSubmit(section, row, status, opts)"
              @cancel="closeInlineEdit"
            />
          </div>

          <div class="resource-action-card__row-side">
            <el-tag v-if="row.statusLabel" size="small" effect="plain">
              {{ t(row.statusLabel) }}
            </el-tag>
            <div class="resource-action-card__row-actions">
              <el-button
                v-for="action in row.actions"
                :key="action.key"
                size="small"
                circle
                :type="action.riskLevel === 'danger' ? 'danger' : 'primary'"
                :loading="runningActionKey === rowActionId(rowStateKey(section, row), action.key)"
                :disabled="runningActionKey !== null"
                :title="t(action.labelKey)"
                :data-action-key="action.key"
                @click="handleRowAction(section, row, action)"
              >
                <el-icon><component :is="iconComponent(action.icon)" /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <ConfirmDialog
      :visible="pendingConfirmation !== null"
      type="danger"
      :title="t('chat.actionCards.resource.confirmTitle')"
      :message="confirmationMessage"
      :confirm-text="t('chat.actionCards.common.confirm')"
      :cancel-text="t('chat.actionCards.common.cancel')"
      :loading="pendingConfirmation !== null && runningActionKey !== null"
      @update:visible="handleConfirmVisibleUpdate"
      @confirm="confirmPendingAction"
      @cancel="clearPendingConfirmation"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { Delete, Edit, Open, Search, TurnOff, VideoPlay, View } from '@element-plus/icons-vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import InlineScheduleForm from './forms/InlineScheduleForm.vue';
import type {
  ResourceActionKey,
  ResourceActionSpec,
  ResourceSectionSpec,
  UiActionCardPayload,
} from '@/types/actionCard';
import {
  getDefaultAllowedActions,
  getResourceAdapter,
  type ResourceActionResult,
  type ResourceRow,
  type ResourceRowAction,
} from './resourceAdapters';

const ROW_LIMIT = 10;

interface SectionState {
  key: string;
  resourceType: NonNullable<UiActionCardPayload['resourceType']>;
  titleKey: string;
  emptyKey: string;
  allowedActions: ResourceActionSpec[];
  rows: ResourceRow[];
  loading: boolean;
  error: string | null;
}

interface PendingConfirmation {
  section: SectionState;
  row: ResourceRow;
  action: ResourceRowAction;
}

interface InlineEditState {
  rowKey: string;
  payload: UiActionCardPayload;
}

type InlineScheduleSubmitStatus = 'succeeded' | 'failed';

interface InlineScheduleSubmitOptions {
  resultSummary?: string;
  error?: string;
}

const props = defineProps<{
  payload: UiActionCardPayload;
}>();

const emit = defineEmits<{
  statusChange: [status: 'failed', opts?: { resultSummary?: string; error?: string }];
}>();

const { t } = useI18n();

const query = ref(initialQuery(props.payload));
const cardError = ref<string | null>(null);
const runningActionKey = ref<string | null>(null);
const pendingConfirmation = ref<PendingConfirmation | null>(null);
const inlineEdit = ref<InlineEditState | null>(null);
const rowResults = reactive<Record<string, string>>({});
const rowErrors = reactive<Record<string, string>>({});
const latestSectionRequestIds = new Map<string, number>();
let nextRequestId = 0;

const sectionStates = reactive<SectionState[]>(buildSectionStates(props.payload));

const confirmationMessage = computed(() => {
  if (!pendingConfirmation.value) return '';
  return [
    t('chat.actionCards.resource.confirmMessage'),
    pendingConfirmation.value.row.title,
    t(pendingConfirmation.value.action.labelKey),
  ].join(' ');
});

onMounted(() => {
  void loadSections();
});

function initialQuery(payload: UiActionCardPayload): string {
  if (payload.defaultQuery) return payload.defaultQuery;
  const firstSectionQuery = payload.resourceSections?.find(
    (section) => section.defaultQuery
  )?.defaultQuery;
  if (firstSectionQuery) return firstSectionQuery;

  for (const key of ['query', 'name', 'keyword', 'title']) {
    const value = payload.params[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return '';
}

function buildSectionStates(payload: UiActionCardPayload): SectionState[] {
  const sections = payload.resourceSections;
  if (sections && sections.length > 0) {
    return sections.map((section, index) => buildSectionState(section, index));
  }

  if (!payload.resourceType) {
    return [];
  }

  return [
    buildSectionState(
      {
        resourceType: payload.resourceType,
        titleKey: `chat.actionCards.resource.sections.${payload.resourceType}`,
        emptyKey: `chat.actionCards.resource.empty.${payload.resourceType}`,
        allowedActions: payload.allowedActions ?? getDefaultAllowedActions(payload.resourceType),
      },
      0
    ),
  ];
}

function buildSectionState(section: ResourceSectionSpec, index: number): SectionState {
  return {
    key: `${section.resourceType}:${index}`,
    resourceType: section.resourceType,
    titleKey: section.titleKey,
    emptyKey: section.emptyKey,
    allowedActions:
      section.allowedActions.length > 0
        ? section.allowedActions
        : getDefaultAllowedActions(section.resourceType),
    rows: [],
    loading: false,
    error: null,
  };
}

async function loadSections(): Promise<void> {
  cardError.value = null;
  if (sectionStates.length === 0) {
    cardError.value = t('chat.actionCards.resource.error.missingResourceType');
    emit('statusChange', 'failed', { error: cardError.value });
    return;
  }

  await Promise.all(sectionStates.map((section) => loadSection(section)));
}

async function loadSection(section: SectionState): Promise<void> {
  const requestId = beginSectionRequest(section);
  const requestQuery = query.value;
  section.loading = true;
  section.error = null;
  try {
    const adapter = getResourceAdapter(section.resourceType);
    const rows = await adapter.fetchRows({
      query: requestQuery,
      limit: ROW_LIMIT,
      allowedActions: section.allowedActions,
    });
    if (!isLatestSectionRequest(section, requestId)) return;
    section.rows = rows.slice(0, ROW_LIMIT);
  } catch (err: unknown) {
    if (!isLatestSectionRequest(section, requestId)) return;
    const message = err instanceof Error ? err.message : String(err);
    section.error = message;
  } finally {
    if (isLatestSectionRequest(section, requestId)) {
      section.loading = false;
    }
  }
}

function beginSectionRequest(section: SectionState): number {
  nextRequestId += 1;
  latestSectionRequestIds.set(section.key, nextRequestId);
  return nextRequestId;
}

function isLatestSectionRequest(section: SectionState, requestId: number): boolean {
  return latestSectionRequestIds.get(section.key) === requestId;
}

function sectionTitle(section: SectionState): string {
  return t(section.titleKey, { count: section.rows.length });
}

function sectionEmptyText(section: SectionState): string {
  return t(section.emptyKey);
}

function rowStateKey(section: SectionState, row: ResourceRow): string {
  return `${section.key}:${row.id}`;
}

function rowActionId(rowKey: string, actionKey: ResourceActionKey): string {
  return `${rowKey}:${actionKey}`;
}

function iconComponent(icon: ResourceRowAction['icon']): Component {
  const icons: Record<ResourceRowAction['icon'], Component> = {
    Delete,
    Edit,
    Open,
    TurnOff,
    VideoPlay,
    View,
  };
  return icons[icon];
}

async function handleRowAction(
  section: SectionState,
  row: ResourceRow,
  action: ResourceRowAction
): Promise<void> {
  if (action.confirmationMode === 'modal' || action.riskLevel === 'danger') {
    pendingConfirmation.value = { section, row, action };
    return;
  }

  await executeRowAction(section, row, action);
}

async function confirmPendingAction(): Promise<void> {
  if (!pendingConfirmation.value) return;
  const pending = pendingConfirmation.value;
  await executeRowAction(pending.section, pending.row, pending.action);
  pendingConfirmation.value = null;
}

function clearPendingConfirmation(): void {
  pendingConfirmation.value = null;
}

function handleConfirmVisibleUpdate(visible: boolean): void {
  if (!visible) {
    clearPendingConfirmation();
  }
}

async function executeRowAction(
  section: SectionState,
  row: ResourceRow,
  action: ResourceRowAction
): Promise<void> {
  const key = rowStateKey(section, row);
  const actionId = rowActionId(key, action.key);
  runningActionKey.value = actionId;
  rowErrors[key] = '';
  rowResults[key] = '';

  try {
    const result = await getResourceAdapter(row.rawType).executeAction(row, action.key);
    if (result.inlineForm?.kind === 'schedule_edit') {
      inlineEdit.value = {
        rowKey: key,
        payload: {
          ...props.payload,
          cardId: 'schedule.update',
          domain: 'schedule',
          action: 'update',
          presentationMode: 'inline_form',
          params: { scheduleId: row.id },
        },
      };
    } else {
      rowResults[key] = formatResult(result);
    }

    if (result.refresh) {
      await refreshSection(section.key);
    }
  } catch (err: unknown) {
    rowErrors[key] = err instanceof Error ? err.message : String(err);
  } finally {
    runningActionKey.value = null;
  }
}

function formatResult(result: ResourceActionResult): string {
  return t(result.summaryKey, result.summaryParams ?? {});
}

async function refreshSection(sectionKey: string): Promise<void> {
  const section = sectionStates.find((item) => item.key === sectionKey);
  if (section) {
    await loadSection(section);
  }
}

function closeInlineEdit(): void {
  inlineEdit.value = null;
}

async function handleInlineScheduleSubmit(
  section: SectionState,
  row: ResourceRow,
  status: InlineScheduleSubmitStatus,
  opts?: InlineScheduleSubmitOptions
): Promise<void> {
  const key = rowStateKey(section, row);
  rowErrors[key] = '';
  rowResults[key] = '';

  if (status === 'failed') {
    rowErrors[key] = opts?.error ?? opts?.resultSummary ?? t('common.error');
    return;
  }

  rowResults[key] = opts?.resultSummary ?? '';
  inlineEdit.value = null;
  await refreshSection(section.key);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.resource-action-card {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  margin-top: $spacing-md;

  &__toolbar {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
  }

  &__search-input {
    flex: 1;
    min-width: 0;
  }

  &__search-button {
    flex: 0 0 auto;
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
    padding-top: $spacing-sm;
    border-top: 1px solid var(--border-primary);
  }

  &__section-header {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    justify-content: space-between;
  }

  &__section-title {
    font-size: $font-size-xs;
    font-weight: $font-weight-semibold;
    color: var(--text-secondary);
  }

  &__section-state,
  &__empty {
    font-size: $font-size-xs;
    color: var(--text-muted);
  }

  &__rows {
    display: flex;
    flex-direction: column;
  }

  &__row {
    display: flex;
    gap: $spacing-sm;
    align-items: flex-start;
    justify-content: space-between;
    padding: $spacing-sm 0;
    border-bottom: 1px solid var(--border-primary);

    &:last-child {
      border-bottom: 0;
    }
  }

  &__row-main {
    flex: 1;
    min-width: 0;
  }

  &__row-title {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    line-height: $line-height-tight;
    color: var(--text-primary);
    overflow-wrap: break-word;
  }

  &__row-subtitle,
  &__meta {
    margin-top: 2px;
    font-size: $font-size-xs;
    line-height: $line-height-normal;
    color: var(--text-muted);
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px $spacing-sm;
  }

  &__row-side {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: $spacing-xs;
    align-items: flex-end;
  }

  &__row-actions {
    display: flex;
    gap: $spacing-xs;

    .el-button + .el-button {
      margin-left: 0;
    }
  }

  &__result {
    margin-top: $spacing-xs;
    font-size: $font-size-xs;
    line-height: $line-height-normal;
    color: $success;
    white-space: pre-line;
  }

  &__error {
    margin-top: $spacing-xs;
    font-size: $font-size-xs;
    line-height: $line-height-normal;
    color: var(--error);
    white-space: pre-line;
  }

  &__inline-form {
    padding-top: $spacing-sm;
    margin-top: $spacing-sm;
    border-top: 1px solid var(--border-primary);
  }
}

@media (width <= 640px) {
  .resource-action-card {
    &__row {
      flex-direction: column;
    }

    &__row-side {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }
  }
}
</style>
