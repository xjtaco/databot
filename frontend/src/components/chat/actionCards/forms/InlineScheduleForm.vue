<template>
  <div class="inline-schedule-form">
    <!-- Create / Update: render ScheduleForm -->
    <template v-if="payload.action === 'create' || payload.action === 'update'">
      <div
        v-if="payload.action === 'update' && !editingSchedule"
        class="inline-schedule-form__loading"
      >
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>{{ t('common.loading') }}</span>
      </div>

      <template v-else>
        <ScheduleForm ref="scheduleFormRef" :editing="editingSchedule" />

        <div class="inline-schedule-form__actions">
          <el-button type="primary" size="small" :loading="submitting" @click="handleSubmit">
            {{ payload.action === 'create' ? t('schedule.submit') : t('schedule.save') }}
          </el-button>
          <el-button size="small" @click="emit('cancel')">
            {{ t('common.cancel') }}
          </el-button>
        </div>
      </template>
    </template>

    <!-- Delete: warning + confirm button -->
    <template v-else-if="payload.action === 'delete'">
      <div class="inline-schedule-form__delete">
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          :description="t('schedule.deleteWarning')"
        />
        <div class="inline-schedule-form__actions">
          <el-button type="danger" size="small" :loading="submitting" @click="handleDelete">
            {{ submitting ? t('schedule.deleting') : t('common.delete') }}
          </el-button>
          <el-button size="small" @click="emit('cancel')">
            {{ t('common.cancel') }}
          </el-button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Loading } from '@element-plus/icons-vue';
import { useScheduleStore, useWorkflowStore } from '@/stores';
import ScheduleForm from '@/components/schedule/ScheduleForm.vue';
import type { UiActionCardPayload } from '@/types/actionCard';

const props = defineProps<{
  payload: UiActionCardPayload;
  requestConfirmation?: () => Promise<boolean>;
}>();

const emit = defineEmits<{
  submit: [status: 'succeeded' | 'failed', opts?: { resultSummary?: string; error?: string }];
  cancel: [];
}>();

const { t } = useI18n();
const scheduleStore = useScheduleStore();
const workflowStore = useWorkflowStore();

const scheduleFormRef = ref<InstanceType<typeof ScheduleForm> | null>(null);
const submitting = ref(false);

const scheduleId = computed(() => {
  const id = props.payload.params.scheduleId ?? props.payload.params.id;
  return typeof id === 'string' ? id : '';
});

onMounted(async () => {
  workflowStore.fetchWorkflows();

  if (props.payload.action === 'update' && scheduleId.value) {
    await scheduleStore.loadEditingSchedule(scheduleId.value);
  }
});

const editingSchedule = computed(() => scheduleStore.editingSchedule);

async function handleSubmit(): Promise<void> {
  if (submitting.value) return;

  const form = scheduleFormRef.value;
  if (!form) return;

  const input = form.getSubmitInput();
  if (!input) return;

  submitting.value = true;
  try {
    if (!(await confirmIfNeeded())) return;
    if (props.payload.action === 'create') {
      await scheduleStore.createSchedule(input);
      emit('submit', 'succeeded', { resultSummary: t('schedule.createSuccess') });
    } else if (props.payload.action === 'update' && scheduleId.value) {
      await scheduleStore.updateSchedule(scheduleId.value, input);
      emit('submit', 'succeeded', { resultSummary: t('schedule.updateSuccess') });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    emit('submit', 'failed', { error: message });
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(): Promise<void> {
  if (submitting.value) return;

  if (!scheduleId.value) return;

  submitting.value = true;
  try {
    if (!(await confirmIfNeeded())) return;
    await scheduleStore.deleteSchedule(scheduleId.value);
    emit('submit', 'succeeded', { resultSummary: t('schedule.deleteSuccess') });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    emit('submit', 'failed', { error: message });
  } finally {
    submitting.value = false;
  }
}

async function confirmIfNeeded(): Promise<boolean> {
  if (props.payload.confirmationMode !== 'modal') {
    return true;
  }

  return props.requestConfirmation ? props.requestConfirmation() : true;
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.inline-schedule-form {
  &__loading {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    padding: $spacing-md 0;
    font-size: $font-size-sm;
    color: $text-secondary-color;
  }

  &__delete {
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
  }

  &__actions {
    display: flex;
    gap: $spacing-sm;
    justify-content: flex-end;
    margin-top: $spacing-md;
  }
}
</style>
