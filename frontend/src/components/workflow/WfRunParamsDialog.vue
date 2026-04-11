<template>
  <el-dialog
    :model-value="visible"
    :title="t('workflow.runParams.title')"
    width="480px"
    @update:model-value="handleVisibleChange"
  >
    <p class="wf-run-params__description">{{ t('workflow.runParams.description') }}</p>
    <el-form label-position="top">
      <el-form-item v-for="param in params" :key="param" :label="param">
        <el-input v-model="paramValues[param]" :placeholder="param" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleVisibleChange(false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="handleConfirm">
        {{ t('workflow.runParams.startRun') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  visible: boolean;
  params: string[];
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  confirm: [params: Record<string, string>];
}>();

const { t } = useI18n();

const paramValues = reactive<Record<string, string>>({});

watch(
  () => props.params,
  (newParams) => {
    for (const key of Object.keys(paramValues)) {
      if (!newParams.includes(key)) {
        delete paramValues[key];
      }
    }
    for (const param of newParams) {
      if (!(param in paramValues)) {
        paramValues[param] = '';
      }
    }
  },
  { immediate: true }
);

function handleVisibleChange(val: boolean): void {
  emit('update:visible', val);
}

function handleConfirm(): void {
  const result: Record<string, string> = {};
  for (const param of props.params) {
    result[param] = paramValues[param] ?? '';
  }
  emit('confirm', result);
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.wf-run-params__description {
  margin: 0 0 $spacing-md;
  font-size: $font-size-sm;
  color: $text-secondary-color;
}
</style>
