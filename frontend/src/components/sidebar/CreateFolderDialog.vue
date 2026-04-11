<template>
  <el-dialog
    :model-value="visible"
    :title="t('knowledge.newFolder')"
    width="480px"
    @update:model-value="$emit('update:visible', $event)"
    @close="handleClose"
  >
    <form @submit.prevent="handleSubmit">
      <div class="create-folder-dialog__section">
        <div class="create-folder-dialog__label">{{ t('knowledge.selectParentFolder') }}</div>
        <FolderTreeSelector
          :folders="folders ?? []"
          :selected-folder-id="selectedParentId"
          @update:selected-folder-id="selectedParentId = $event"
        />
        <div v-if="pathBreadcrumb.length > 0" class="create-folder-dialog__path">
          {{ t('knowledge.currentPath') }}: {{ pathBreadcrumb.join(' / ') }}
        </div>
      </div>
      <div class="create-folder-dialog__section">
        <div class="create-folder-dialog__label">{{ t('knowledge.folderName') }}</div>
        <el-input
          ref="inputRef"
          v-model="folderName"
          :placeholder="t('knowledge.folderNamePlaceholder')"
          maxlength="255"
          @keyup.enter="handleSubmit"
        />
      </div>
    </form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">{{ t('common.cancel') }}</el-button>
      <el-button
        type="primary"
        :loading="loading"
        :disabled="!folderName.trim()"
        @click="handleSubmit"
      >
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { InputInstance } from 'element-plus';
import FolderTreeSelector from '@/components/knowledge/FolderTreeSelector.vue';
import { getFolderPath } from '@/utils/knowledge';
import type { KnowledgeFolder } from '@/types/knowledge';

const props = defineProps<{
  visible: boolean;
  parentId?: string;
  loading?: boolean;
  folders?: KnowledgeFolder[];
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  submit: [name: string, parentId?: string];
}>();

const { t } = useI18n();
const folderName = ref('');
const inputRef = ref<InputInstance>();
const selectedParentId = ref<string | null>(null);

const pathBreadcrumb = computed(() => getFolderPath(props.folders ?? [], selectedParentId.value));

watch(
  () => props.visible,
  (val) => {
    if (val) {
      folderName.value = '';
      selectedParentId.value = props.parentId ?? null;
      nextTick(() => {
        inputRef.value?.focus();
      });
    }
  }
);

function handleSubmit(): void {
  const name = folderName.value.trim();
  if (!name) return;
  emit('submit', name, selectedParentId.value ?? undefined);
}

function handleClose(): void {
  folderName.value = '';
  selectedParentId.value = null;
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.create-folder-dialog {
  &__section {
    margin-bottom: $spacing-md;

    &:last-of-type {
      margin-bottom: 0;
    }
  }

  &__label {
    margin-bottom: $spacing-sm;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: var(--text-primary);
  }

  &__path {
    margin-top: $spacing-xs;
    font-size: $font-size-xs;
    color: var(--text-tertiary);
  }
}
</style>
