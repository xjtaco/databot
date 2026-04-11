<template>
  <el-drawer
    :model-value="visible"
    :title="fileName"
    direction="rtl"
    size="864px"
    class="markdown-viewer-drawer"
    @update:model-value="$emit('update:visible', $event)"
    @close="handleClose"
  >
    <template #header>
      <div class="markdown-viewer-drawer__header">
        <span class="markdown-viewer-drawer__title">{{ fileName }}</span>
        <div class="markdown-viewer-drawer__actions">
          <el-button v-if="!isEditing" type="primary" size="small" plain @click="isEditing = true">
            {{ t('knowledge.editContent') }}
          </el-button>
          <template v-else>
            <el-button size="small" @click="cancelEdit">
              {{ t('common.cancel') }}
            </el-button>
            <el-button type="primary" size="small" :loading="isSaving" @click="handleSave">
              {{ t('common.save') }}
            </el-button>
          </template>
        </div>
      </div>
    </template>

    <div v-if="isLoadingContent" class="markdown-viewer-drawer__loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      {{ t('common.loading') }}
    </div>

    <template v-else>
      <div
        v-if="!isEditing"
        class="markdown-viewer-drawer__content markdown-body"
        v-html="renderedContent"
      ></div>
      <el-input
        v-else
        v-model="editContent"
        type="textarea"
        class="markdown-viewer-drawer__editor"
        :autosize="{ minRows: 20 }"
        resize="none"
      />
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Loading } from '@element-plus/icons-vue';
import { useKnowledgeContent } from '@/composables/useKnowledgeContent';

const props = defineProps<{
  visible: boolean;
  fileId: string | null;
  fileName: string;
}>();

defineEmits<{
  'update:visible': [value: boolean];
}>();

const { t } = useI18n();
const {
  isLoadingContent,
  isEditing,
  isSaving,
  editContent,
  renderedContent,
  loadContent,
  handleSave,
  cancelEdit,
  resetState,
} = useKnowledgeContent(toRef(props, 'fileId'));

watch(
  () => props.fileId,
  async (newId) => {
    if (newId) {
      await loadContent(newId);
    }
  }
);

watch(
  () => props.visible,
  (val) => {
    if (val && props.fileId) {
      loadContent(props.fileId);
    }
  }
);

function handleClose(): void {
  resetState();
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.markdown-viewer-drawer {
  &__header {
    display: flex;
    gap: $spacing-md;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  &__title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: $font-weight-semibold;
    white-space: nowrap;
  }

  &__actions {
    display: flex;
    flex-shrink: 0;
    gap: $spacing-xs;
    align-items: center;
  }

  &__loading {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    justify-content: center;
    padding: $spacing-xl;
    color: var(--text-tertiary);
  }

  &__content {
    padding: $spacing-xl $content-padding-x;
    line-height: 1.7;

    :deep(h1),
    :deep(h2),
    :deep(h3) {
      font-family: $font-family-serif;
    }

    :deep(ul) {
      list-style: disc;

      li::marker {
        color: var(--accent);
      }
    }

    overflow-wrap: break-word;

    :deep(pre) {
      padding: $spacing-md;
      overflow-x: auto;
      border-radius: $radius-md;
    }

    :deep(img) {
      max-width: 100%;
    }

    :deep(table) {
      width: 100%;
      border-collapse: collapse;
    }

    :deep(th),
    :deep(td) {
      padding: $spacing-xs $spacing-sm;
      border: 1px solid var(--border-primary);
    }
  }

  &__editor {
    :deep(.el-textarea__inner) {
      min-height: 400px !important;
      font-family: Consolas, Monaco, 'Courier New', monospace;
      font-size: $font-size-sm;
      line-height: 1.6;
    }
  }
}
</style>
