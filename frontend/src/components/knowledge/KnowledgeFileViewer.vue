<template>
  <div class="knowledge-file-viewer">
    <div class="knowledge-file-viewer__header">
      <el-button :icon="ArrowLeft" text @click="$emit('back')">
        {{ t('common.back') }}
      </el-button>
      <span class="knowledge-file-viewer__title">{{ fileName }}</span>
      <div class="knowledge-file-viewer__actions">
        <template v-if="isEditing">
          <el-button size="small" @click="cancelEdit">
            {{ t('common.cancel') }}
          </el-button>
          <el-button type="primary" size="small" :loading="isSaving" @click="handleSave">
            {{ t('common.save') }}
          </el-button>
        </template>
        <el-button v-else type="primary" size="small" plain @click="isEditing = true">
          {{ t('knowledge.editContent') }}
        </el-button>
      </div>
    </div>

    <div v-if="isLoadingContent" class="knowledge-file-viewer__loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      {{ t('common.loading') }}
    </div>

    <template v-else>
      <div
        v-if="!isEditing"
        class="knowledge-file-viewer__content markdown-body"
        v-html="renderedContent"
      ></div>
      <el-input
        v-else
        v-model="editContent"
        type="textarea"
        class="knowledge-file-viewer__editor"
        :autosize="{ minRows: 20 }"
        resize="none"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, Loading } from '@element-plus/icons-vue';
import { useKnowledgeContent } from '@/composables/useKnowledgeContent';

const props = defineProps<{
  fileId: string | null;
  fileName: string;
}>();

defineEmits<{
  back: [];
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
} = useKnowledgeContent(toRef(props, 'fileId'));

watch(
  () => props.fileId,
  async (newId) => {
    if (newId) {
      await loadContent(newId);
    }
  },
  { immediate: true }
);
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.knowledge-file-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--dialog-bg);

  &__header {
    display: flex;
    gap: $spacing-md;
    align-items: center;
    min-height: 48px;
    padding: $spacing-sm $spacing-md;
    border-bottom: 1px solid var(--dialog-border);
  }

  &__title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: $font-weight-semibold;
    color: var(--text-primary);
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
    flex: 1;
    padding: $spacing-xl $content-padding-x;
    overflow: auto;
    line-height: 1.7;
    overflow-wrap: break-word;

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
    flex: 1;
    padding: $spacing-md;

    :deep(.el-textarea__inner) {
      min-height: 400px !important;
      font-family: Consolas, Monaco, 'Courier New', monospace;
      font-size: $font-size-sm;
      line-height: 1.6;
    }
  }
}
</style>
