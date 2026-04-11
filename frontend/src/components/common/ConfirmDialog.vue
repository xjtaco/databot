<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { WarningFilled, Delete, InfoFilled } from '@element-plus/icons-vue';

export type ConfirmDialogType = 'warning' | 'danger' | 'info';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    title: string;
    message: string;
    type?: ConfirmDialogType;
    confirmText?: string;
    cancelText?: string;
    loading?: boolean;
  }>(),
  {
    type: 'warning',
    confirmText: '',
    cancelText: '',
    loading: false,
  }
);

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
});

const iconComponent = computed(() => {
  switch (props.type) {
    case 'danger':
      return Delete;
    case 'info':
      return InfoFilled;
    default:
      return WarningFilled;
  }
});

const iconClass = computed(() => `icon-${props.type}`);

const confirmButtonType = computed(() => {
  return props.type === 'danger' ? 'danger' : 'primary';
});

function handleConfirm(): void {
  if (props.loading) return;
  emit('confirm');
}

function handleCancel(): void {
  if (props.loading) return;
  emit('cancel');
  dialogVisible.value = false;
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.visible || props.loading) return;

  if (event.key === 'Escape') {
    handleCancel();
  } else if (event.key === 'Enter') {
    handleConfirm();
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    width="400px"
    class="confirm-dialog"
    destroy-on-close
  >
    <div class="confirm-content">
      <div class="confirm-icon" :class="iconClass">
        <el-icon :size="24">
          <component :is="iconComponent" />
        </el-icon>
      </div>
      <div class="confirm-text">
        <h3 class="confirm-title">{{ title }}</h3>
        <p class="confirm-message">{{ message }}</p>
      </div>
    </div>

    <template #footer>
      <el-button :disabled="loading" @click="handleCancel">
        {{ cancelText || $t('common.cancel') }}
      </el-button>
      <el-button
        :type="confirmButtonType"
        :loading="loading"
        :disabled="loading"
        @click="handleConfirm"
      >
        {{ confirmText || $t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.confirm-content {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
  align-items: center;
  text-align: center;
}

.confirm-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: $spacing-lg;

  &.icon-warning {
    color: var(--warning);
    background-color: var(--warning-tint);
  }

  &.icon-danger {
    color: var(--error);
    background-color: var(--error-tint);
  }

  &.icon-info {
    color: var(--accent);
    background-color: var(--accent-tint10);
  }
}

.confirm-text {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  align-items: center;
}

.confirm-title {
  margin: 0;
  font-size: $font-size-md;
  font-weight: $font-weight-semibold;
  line-height: $line-height-tight;
  color: var(--text-primary);
}

.confirm-message {
  max-width: 320px;
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-secondary);
  overflow-wrap: break-word;
  white-space: pre-wrap;
}
</style>
