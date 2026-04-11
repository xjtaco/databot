<template>
  <div class="file-upload-button">
    <input
      ref="fileInput"
      type="file"
      accept=".csv,.xls,.xlsx"
      class="file-upload-button__input"
      @change="handleFileChange"
    />
    <IconButton
      :title="uploading ? t('sidebar.uploading') : t('sidebar.uploadTooltip')"
      :disabled="uploading"
      @click="triggerFileSelect"
    >
      <LoaderCircle v-if="uploading" :size="18" class="is-loading" />
      <Upload v-else :size="18" />
    </IconButton>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Upload, LoaderCircle } from 'lucide-vue-next';
import IconButton from '@/components/common/IconButton.vue';
import { useDatafileStore } from '@/stores';

const ALLOWED_EXTENSIONS = ['.csv', '.xls', '.xlsx'];

const { t } = useI18n();
const datafileStore = useDatafileStore();
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);

function triggerFileSelect(): void {
  fileInput.value?.click();
}

function isValidFileType(filename: string): boolean {
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(extension);
}

async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  if (!isValidFileType(file.name)) {
    ElMessage.error(t('sidebar.invalidFileType'));
    input.value = '';
    return;
  }

  uploading.value = true;

  try {
    await datafileStore.uploadFile(file);
    ElMessage.success(t('sidebar.uploadSuccess'));
  } catch {
    ElMessage.error(t('sidebar.uploadFailed'));
  } finally {
    uploading.value = false;
    input.value = '';
  }
}
</script>

<style scoped lang="scss">
.file-upload-button {
  &__input {
    display: none;
  }

  .is-loading {
    animation: rotate 1s linear infinite;
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
