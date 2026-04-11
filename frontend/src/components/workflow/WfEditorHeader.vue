<template>
  <div class="wf-editor-header">
    <div class="wf-editor-header__left">
      <button class="wf-editor-header__back-btn" @click="$emit('back')">
        <ArrowLeft :size="18" />
      </button>
      <el-input
        v-if="store.editorWorkflow"
        v-model="workflowName"
        class="wf-editor-header__title-input"
        @change="handleNameChange"
      />
      <el-input
        v-if="store.editorWorkflow"
        v-model="workflowDesc"
        size="small"
        class="wf-editor-header__desc-input"
        :placeholder="t('workflow.descriptionPlaceholder')"
        @change="handleDescChange"
      />
    </div>
    <div class="wf-editor-header__right">
      <el-button :loading="isSaving" @click="handleSave">
        <Save :size="14" />
        {{ t('workflow.save') }}
      </el-button>
      <el-button type="primary" :loading="store.isExecuting" @click="$emit('run')">
        <Play :size="14" />
        {{ t('workflow.run') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, Save, Play } from 'lucide-vue-next';
import { useWorkflowStore } from '@/stores';

defineProps<{
  isSaving?: boolean;
}>();

const emit = defineEmits<{
  back: [];
  save: [];
  run: [];
}>();

const { t } = useI18n();
const store = useWorkflowStore();

const workflowName = ref(store.editorWorkflow?.name ?? '');
const workflowDesc = ref(store.editorWorkflow?.description ?? '');

watch(
  () => store.editorWorkflow?.name,
  (name) => {
    if (name !== undefined) {
      workflowName.value = name;
    }
  }
);

watch(
  () => store.editorWorkflow?.description,
  (desc) => {
    workflowDesc.value = desc ?? '';
  }
);

function handleNameChange(): void {
  if (!store.editorWorkflow) return;
  store.updateWorkflowName(workflowName.value);
}

function handleDescChange(): void {
  if (!store.editorWorkflow) return;
  store.updateWorkflowDescription(workflowDesc.value);
}

function handleSave(): void {
  emit('save');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  min-height: 48px;
  padding: 0 $spacing-md;
  background-color: $bg-sidebar;
  border-bottom: 1px solid $border-dark;

  &__left {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    min-width: 0;
  }

  &__back-btn {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: $text-muted;
    cursor: pointer;
    background: none;
    border: none;
    border-radius: $radius-sm;
    transition: all $transition-fast;

    &:hover {
      color: $text-secondary-color;
      background-color: $bg-elevated;
    }
  }

  &__title-input {
    max-width: 240px;

    :deep(.el-input__wrapper) {
      padding: 0 $spacing-xs;
      background-color: transparent;
      box-shadow: none;

      .el-input__inner {
        font-size: $font-size-md;
        font-weight: $font-weight-semibold;
        color: $text-primary-color;
      }

      &:hover {
        box-shadow: 0 0 0 1px $border-elevated;
      }

      &.is-focus {
        box-shadow: 0 0 0 1px $accent;
      }
    }
  }

  &__desc-input {
    max-width: 200px;

    :deep(.el-input__wrapper) {
      padding: 0 $spacing-xs;
      background-color: transparent;
      box-shadow: none;

      .el-input__inner {
        font-size: $font-size-xs;
        color: $text-muted;
      }

      &:hover {
        box-shadow: 0 0 0 1px $border-elevated;
      }

      &.is-focus {
        box-shadow: 0 0 0 1px $accent;
      }
    }
  }

  &__badge {
    flex-shrink: 0;
  }

  &__right {
    display: flex;
    flex-shrink: 0;
    gap: $spacing-sm;
    align-items: center;
  }
}
</style>
