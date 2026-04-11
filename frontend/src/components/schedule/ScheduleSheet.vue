<template>
  <Teleport to="body">
    <Transition name="schedule-sheet">
      <div v-if="visible" class="schedule-sheet-overlay" @click.self="handleClose">
        <div class="schedule-sheet">
          <div class="schedule-sheet__handle"></div>
          <div class="schedule-sheet__header">
            <h3 class="schedule-sheet__title">
              {{ editing ? t('schedule.editSchedule') : t('schedule.newSchedule') }}
            </h3>
          </div>
          <div class="schedule-sheet__body">
            <ScheduleForm ref="formRef" :editing="editing" />
          </div>
          <div class="schedule-sheet__footer">
            <el-button @click="handleClose">
              {{ t('common.cancel') }}
            </el-button>
            <el-button
              class="schedule-sheet__btn"
              type="primary"
              :loading="submitting"
              @click="handleSubmit"
            >
              {{ editing ? t('common.save') : t('schedule.createSchedule') }}
            </el-button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
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

function handleClose(): void {
  emit('update:visible', false);
  store.closeForm();
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
    handleClose();
  } catch {
    ElMessage.error(t('common.failed'));
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.schedule-sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: $z-index-modal;
  display: flex;
  align-items: flex-end;
  background: rgb(0 0 0 / 50%);
}

.schedule-sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  background: $bg-card;
  border-radius: 24px 24px 0 0;

  &__handle {
    width: 40px;
    height: 4px;
    margin: $spacing-sm auto 0;
    background: $border-elevated;
    border-radius: 2px;
  }

  &__header {
    padding: $spacing-md $spacing-md 0;
  }

  &__title {
    margin: 0;
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
  }

  &__body {
    flex: 1;
    padding: $spacing-md;
    overflow-y: auto;
  }

  &__footer {
    display: flex;
    gap: $spacing-sm;
    justify-content: flex-end;
    padding: $spacing-md;
    padding-bottom: max($spacing-md, env(safe-area-inset-bottom, 0px));
    border-top: 1px solid $border-dark;
  }
}

// Transition
.schedule-sheet-enter-active,
.schedule-sheet-leave-active {
  transition: opacity $transition-normal;

  .schedule-sheet {
    transition: transform $transition-normal;
  }
}

.schedule-sheet-enter-from,
.schedule-sheet-leave-to {
  opacity: 0;

  .schedule-sheet {
    transform: translateY(100%);
  }
}
</style>
