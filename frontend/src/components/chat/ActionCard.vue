<template>
  <div
    :class="[
      'action-card',
      `action-card--${card.payload.riskLevel}`,
      `action-card--${card.status}`,
    ]"
  >
    <!-- Header with badges -->
    <div class="action-card__header">
      <span
        class="action-card__risk-badge"
        :class="`action-card__risk-badge--${card.payload.riskLevel}`"
      >
        {{ riskLabel }}
      </span>
      <span class="action-card__status-badge" :class="`action-card__status-badge--${card.status}`">
        <span v-if="card.status === 'running'" class="action-card__status-spinner"></span>
        {{ statusLabel }}
      </span>
    </div>

    <!-- Title and summary -->
    <div class="action-card__title">{{ card.payload.title }}</div>
    <div class="action-card__summary">{{ card.payload.summary }}</div>

    <!-- Params -->
    <div v-if="hasParams" class="action-card__params">
      <div class="action-card__section-title">{{ t('chat.actionCard.params') }}</div>
      <div v-for="(value, key) in displayParams" :key="key" class="action-card__param">
        <span class="action-card__param-key">{{ key }}</span>
        <span class="action-card__param-value">{{ String(value) }}</span>
      </div>
    </div>

    <!-- Copilot prompt -->
    <div v-if="card.payload.copilotPrompt" class="action-card__copilot-prompt">
      <div class="action-card__section-title">{{ t('chat.actionCard.copilotPrompt') }}</div>
      <div class="action-card__prompt-text">{{ card.payload.copilotPrompt }}</div>
    </div>

    <!-- Result/Error -->
    <div v-if="card.status === 'succeeded' && card.resultSummary" class="action-card__result">
      {{ card.resultSummary }}
    </div>
    <div v-if="card.status === 'failed'" class="action-card__error">
      {{ card.error || card.resultSummary || t('common.error') }}
    </div>

    <!-- Inline Form (editing state) -->
    <component
      :is="formComponent"
      v-if="card.status === 'editing' && formComponent"
      :payload="card.payload"
      class="action-card__inline-form"
      @submit="handleFormSubmit"
      @cancel="handleFormCancel"
    />

    <!-- Actions -->
    <div v-if="showActions" class="action-card__actions">
      <!-- Danger confirmation input -->
      <template v-if="card.payload.riskLevel === 'danger' && card.status === 'confirming'">
        <el-input
          v-model="dangerConfirmText"
          size="small"
          :placeholder="t('chat.actionCard.dangerConfirm', { name: card.payload.title })"
          class="action-card__danger-input"
        />
        <el-button
          size="small"
          type="danger"
          :disabled="dangerConfirmText !== card.payload.title"
          @click="handleConfirm"
        >
          {{ t('chat.actionCard.confirm') }}
        </el-button>
      </template>

      <!-- Confirm required: show cancel + confirm -->
      <template v-else-if="card.payload.confirmRequired && card.status === 'proposed'">
        <el-button size="small" @click="handleCancel">
          {{ t('chat.actionCard.cancel') }}
        </el-button>
        <el-button size="small" type="primary" @click="handleConfirm">
          {{ t('chat.actionCard.confirm') }}
        </el-button>
      </template>

      <!-- No confirm required: just confirm/open button -->
      <template v-else>
        <el-button size="small" type="primary" @click="handleConfirm">
          {{ t('chat.actionCard.confirm') }}
        </el-button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { executeAction } from './actionCards';
import type { ChatActionCard, CardStatus } from '@/types/actionCard';

// Lazy-loaded inline form components (async, no top-level await)
const InlineDataCreateForm = () => import('./actionCards/forms/InlineDataCreateForm.vue');
const InlineFileUploadForm = () => import('./actionCards/forms/InlineFileUploadForm.vue');
const InlineKnowledgeFolderForm = () => import('./actionCards/forms/InlineKnowledgeFolderForm.vue');
const InlineKnowledgeFileForm = () => import('./actionCards/forms/InlineKnowledgeFileForm.vue');
const InlineScheduleForm = () => import('./actionCards/forms/InlineScheduleForm.vue');

const formComponentMap: Record<string, () => Promise<{ default: Component }>> = {
  'data:datasource_create': InlineDataCreateForm,
  'data:file_upload': InlineFileUploadForm,
  'knowledge:folder_create': InlineKnowledgeFolderForm,
  'knowledge:folder_rename': InlineKnowledgeFolderForm,
  'knowledge:folder_move': InlineKnowledgeFolderForm,
  'knowledge:folder_delete': InlineKnowledgeFolderForm,
  'knowledge:file_upload': InlineKnowledgeFileForm,
  'knowledge:file_move': InlineKnowledgeFileForm,
  'knowledge:file_delete': InlineKnowledgeFileForm,
  'schedule:create': InlineScheduleForm,
  'schedule:update': InlineScheduleForm,
  'schedule:delete': InlineScheduleForm,
};

const props = defineProps<{ card: ChatActionCard }>();

const emit = defineEmits<{
  statusChange: [id: string, status: CardStatus, opts?: { resultSummary?: string; error?: string }];
}>();

const { t } = useI18n();
const dangerConfirmText = ref('');

const riskLabel = computed(() => {
  const level = props.card.payload.riskLevel;
  const capitalized = level.charAt(0).toUpperCase() + level.slice(1);
  return t(`chat.actionCard.risk${capitalized}`);
});

const statusLabel = computed(() => t(`chat.actionCard.${props.card.status}`));

const displayParams = computed(() => {
  const params = { ...props.card.payload.params };
  delete params.copilotPrompt;
  return Object.keys(params).length > 0 ? params : null;
});

const hasParams = computed(() => displayParams.value !== null);

const showActions = computed(() => {
  return props.card.status === 'proposed' || props.card.status === 'confirming';
});

const formComponent = computed<Component | null>(() => {
  const key = `${props.card.payload.domain}:${props.card.payload.action}`;
  const loader = formComponentMap[key];
  return loader ? defineAsyncComponent(loader) : null;
});

async function handleConfirm(): Promise<void> {
  if (props.card.payload.riskLevel === 'danger' && props.card.status === 'proposed') {
    emit('statusChange', props.card.id, 'confirming');
    return;
  }

  // If this card has an inline form, transition to editing
  if (formComponent.value && props.card.status === 'proposed') {
    emit('statusChange', props.card.id, 'editing');
    return;
  }

  // Direct execution (workflow/template create, navigation, etc.)
  emit('statusChange', props.card.id, 'running');
  try {
    const result = await executeAction(props.card.payload, {
      setStatus: (status) => emit('statusChange', props.card.id, status),
      setResult: (summary) =>
        emit('statusChange', props.card.id, 'succeeded', { resultSummary: summary }),
      setError: (error) => emit('statusChange', props.card.id, 'failed', { error }),
    });
    if (result.success) {
      emit('statusChange', props.card.id, 'succeeded', { resultSummary: result.summary });
    } else {
      emit('statusChange', props.card.id, 'failed', {
        resultSummary: result.summary,
        error: result.error,
      });
    }
  } catch (err) {
    emit('statusChange', props.card.id, 'failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function handleCancel(): void {
  emit('statusChange', props.card.id, 'cancelled');
}

function handleFormCancel(): void {
  emit('statusChange', props.card.id, 'cancelled');
}

function handleFormSubmit(
  status: 'succeeded' | 'failed',
  opts?: { resultSummary?: string; error?: string }
): void {
  emit('statusChange', props.card.id, status, opts);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.action-card {
  padding: $spacing-md;
  margin-top: $spacing-sm;
  background-color: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: $radius-lg;

  // Risk level color variants
  &--low {
    border-left: 3px solid $success;
  }

  &--medium {
    border-left: 3px solid $warning;
  }

  &--high {
    border-left: 3px solid $error;
  }

  &--danger {
    background-color: rgb(239 68 68 / 4%);
    border-left: 3px solid $error;
  }

  // Status variants
  &--running {
    .action-card__title::after {
      display: inline-block;
      width: 12px;
      height: 12px;
      margin-left: $spacing-sm;
      vertical-align: middle;
      content: '';
      border: 2px solid var(--accent);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
  }

  &--succeeded {
    .action-card__title::after {
      display: inline-block;
      margin-left: $spacing-sm;
      font-weight: $font-weight-bold;
      color: $success;
      content: '\2713';
    }
  }

  &--failed {
    .action-card__title::after {
      display: inline-block;
      margin-left: $spacing-sm;
      font-weight: $font-weight-bold;
      color: $error;
      content: '\2717';
    }
  }

  &--cancelled {
    opacity: 0.6;
  }

  &__header {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    margin-bottom: $spacing-sm;
  }

  &__risk-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    font-size: $font-size-xs;
    font-weight: $font-weight-medium;
    border-radius: $radius-pill;

    &--low {
      color: $success;
      background-color: $success-tint;
    }

    &--medium {
      color: $warning;
      background-color: $warning-tint;
    }

    &--high {
      color: $error;
      background-color: $error-tint;
    }

    &--danger {
      color: $error;
      background-color: rgb(239 68 68 / 18%);
    }
  }

  &__status-badge {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    font-size: $font-size-xs;
    color: var(--text-muted);

    &--proposed {
      color: var(--accent);
    }

    &--running {
      color: var(--accent);
    }

    &--succeeded {
      color: $success;
    }

    &--failed {
      color: $error;
    }

    &--cancelled {
      color: var(--text-muted);
    }

    &--confirming {
      color: $warning;
    }
  }

  &__status-spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--accent);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  &__title {
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: var(--text-primary);
  }

  &__summary {
    margin-top: $spacing-xs;
    font-size: $font-size-xs;
    line-height: $line-height-relaxed;
    color: var(--text-secondary);
  }

  &__params {
    padding: $spacing-sm;
    margin-top: $spacing-sm;
    background-color: var(--bg-control);
    border-radius: $radius-md;
  }

  &__section-title {
    margin-bottom: $spacing-xs;
    font-size: 11px;
    font-weight: $font-weight-medium;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__param {
    display: flex;
    gap: $spacing-sm;
    padding: 2px 0;
  }

  &__param-key {
    flex-shrink: 0;
    font-family: $font-family-dm-mono;
    font-size: 11px;
    color: var(--text-muted);
  }

  &__param-value {
    font-family: $font-family-dm-mono;
    font-size: 11px;
    color: var(--text-secondary);
    word-break: break-all;
  }

  &__copilot-prompt {
    padding: $spacing-sm;
    margin-top: $spacing-sm;
    background-color: var(--accent-tint10);
    border: 1px solid rgb(255 106 42 / 12%);
    border-radius: $radius-md;
  }

  &__prompt-text {
    font-size: $font-size-xs;
    font-style: italic;
    line-height: $line-height-relaxed;
    color: var(--text-secondary);
  }

  &__result {
    padding: $spacing-sm $spacing-md;
    margin-top: $spacing-sm;
    font-size: $font-size-xs;
    color: $success;
    background-color: $success-tint;
    border: 1px solid rgb(34 197 94 / 15%);
    border-radius: $radius-md;
  }

  &__error {
    padding: $spacing-sm $spacing-md;
    margin-top: $spacing-sm;
    font-size: $font-size-xs;
    color: var(--error);
    background-color: var(--error-bg);
    border: 1px solid rgb(239 68 68 / 15%);
    border-radius: $radius-md;
  }

  &__actions {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    margin-top: $spacing-md;
  }

  &__danger-input {
    flex: 1;
  }

  &__inline-form {
    padding-top: $spacing-sm;
    margin-top: $spacing-sm;
    border-top: 1px solid var(--border-primary);
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
