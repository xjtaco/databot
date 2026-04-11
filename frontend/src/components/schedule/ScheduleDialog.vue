<template>
  <el-dialog
    :model-value="visible"
    :title="editing ? t('schedule.editSchedule') : t('schedule.newSchedule')"
    width="560px"
    @update:model-value="handleVisibleChange"
  >
    <ScheduleForm ref="formRef" :editing="editing" />

    <template #footer>
      <el-button @click="handleVisibleChange(false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        {{ editing ? t('common.save') : t('schedule.createSchedule') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useScheduleStore } from '@/stores/scheduleStore';
import type { ScheduleDetail } from '@/types/schedule';
import ScheduleForm from './ScheduleForm.vue';

defineProps<{
  visible: boolean;
  editing: ScheduleDetail | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const { t } = useI18n();
const store = useScheduleStore();
const formRef = ref<InstanceType<typeof ScheduleForm> | null>(null);
const submitting = ref(false);

function handleVisibleChange(val: boolean): void {
  emit('update:visible', val);
  if (!val) {
    store.closeForm();
  }
}

async function handleSubmit(): Promise<void> {
  const input = formRef.value?.getSubmitInput();
  if (!input) return;

  submitting.value = true;
  try {
    if (store.editingSchedule) {
      await store.updateSchedule(store.editingSchedule.id, input);
      ElMessage.success(t('schedule.updateSuccess'));
    } else {
      await store.createSchedule(input);
      ElMessage.success(t('schedule.createSuccess'));
    }
    handleVisibleChange(false);
  } catch {
    ElMessage.error(t('common.failed'));
  } finally {
    submitting.value = false;
  }
}
</script>
