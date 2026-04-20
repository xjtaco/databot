<template>
  <div class="schedule-page" :class="{ 'schedule-page--mobile': isMobile }">
    <!-- ═══ Desktop Header ═══ -->
    <template v-if="!isMobile">
      <div class="schedule-page__title-bar">
        <h2 class="schedule-page__title">{{ t('schedule.title') }}</h2>
        <p class="schedule-page__description">{{ t('schedule.description') }}</p>
      </div>
      <div class="schedule-page__toolbar">
        <div class="schedule-page__toolbar-left">
          <el-input
            v-model="store.searchQuery"
            :placeholder="t('common.search')"
            :prefix-icon="Search"
            clearable
            class="schedule-page__search"
          />
        </div>
        <el-button type="primary" @click="store.openCreateForm">
          <Plus :size="16" />
          {{ t('schedule.newSchedule') }}
        </el-button>
      </div>
    </template>

    <!-- ═══ Mobile Header ═══ -->
    <template v-else>
      <div class="schedule-page__mobile-header">
        <button class="schedule-page__back-btn" @click="emit('back')">
          <ArrowLeft :size="18" />
        </button>
        <span class="schedule-page__mobile-title">{{ t('schedule.title') }}</span>
        <button class="schedule-page__add-btn" @click="store.openCreateForm">
          <Plus :size="18" />
        </button>
      </div>
      <div class="schedule-page__mobile-search">
        <el-input
          v-model="store.searchQuery"
          :placeholder="t('common.search')"
          :prefix-icon="Search"
          clearable
        />
      </div>
    </template>

    <!-- ═══ Loading ═══ -->
    <div v-if="store.loading" class="schedule-page__loading"></div>

    <!-- ═══ Body ═══ -->
    <template v-else>
      <div class="schedule-page__body">
        <ScheduleTable
          v-if="!isMobile"
          :schedules="store.filteredSchedules"
          @edit="handleEdit"
          @delete="handleDelete"
        />
        <ScheduleCardList
          v-else
          :schedules="store.filteredSchedules"
          @edit="handleEdit"
          @delete="handleDelete"
        />
      </div>
    </template>

    <!-- ═══ Desktop Dialog ═══ -->
    <ScheduleDialog
      v-if="!isMobile"
      :visible="store.formVisible"
      :editing="store.editingSchedule"
      @update:visible="handleFormVisibleChange"
    />

    <!-- ═══ Mobile Sheet ═══ -->
    <ScheduleSheet
      v-if="isMobile"
      :visible="store.formVisible"
      :editing="store.editingSchedule"
      @update:visible="handleFormVisibleChange"
    />

    <ConfirmDialog
      v-model:visible="showDeleteConfirm"
      :title="t('common.warning')"
      :message="deleteConfirmMessage"
      type="danger"
      :confirm-text="t('common.delete')"
      :loading="isDeleting"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { Plus, ArrowLeft } from 'lucide-vue-next';
import { useScheduleStore } from '@/stores/scheduleStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import type { ScheduleListItem } from '@/types/schedule';
import ScheduleTable from './ScheduleTable.vue';
import ScheduleCardList from './ScheduleCardList.vue';
import ScheduleDialog from './ScheduleDialog.vue';
import ScheduleSheet from './ScheduleSheet.vue';
import { ConfirmDialog } from '@/components/common';

defineProps<{
  isMobile?: boolean;
}>();

const emit = defineEmits<{
  back: [];
}>();

const { t } = useI18n();
const store = useScheduleStore();
const workflowStore = useWorkflowStore();

onMounted(async () => {
  await Promise.all([store.fetchSchedules(), workflowStore.fetchWorkflows()]);
});

async function handleEdit(id: string): Promise<void> {
  try {
    await store.openEditForm(id);
  } catch {
    ElMessage.error(t('common.failed'));
  }
}

const showDeleteConfirm = ref(false);
const pendingDeleteSchedule = ref<ScheduleListItem | null>(null);
const isDeleting = ref(false);

function handleDelete(schedule: ScheduleListItem): void {
  pendingDeleteSchedule.value = schedule;
  showDeleteConfirm.value = true;
}

const deleteConfirmMessage = computed(() =>
  pendingDeleteSchedule.value
    ? t('schedule.confirmDelete', { name: pendingDeleteSchedule.value.name })
    : ''
);

async function confirmDelete(): Promise<void> {
  if (!pendingDeleteSchedule.value) return;
  isDeleting.value = true;
  try {
    await store.deleteSchedule(pendingDeleteSchedule.value.id);
    ElMessage.success(t('schedule.deleteSuccess'));
    showDeleteConfirm.value = false;
    pendingDeleteSchedule.value = null;
  } catch {
    ElMessage.error(t('common.failed'));
  } finally {
    isDeleting.value = false;
  }
}

function handleFormVisibleChange(val: boolean): void {
  if (!val) {
    store.closeForm();
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/console' as console;

.schedule-page {
  @include console.console-scroll-page;
  @include console.console-desktop-padding;

  &--mobile {
    padding: 0;
  }

  // Override Element Plus to match dark theme
  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper) {
    background-color: $bg-elevated;
    box-shadow: 0 0 0 1px $border-dark inset;
  }

  :deep(.el-input__inner),
  :deep(.el-select__input) {
    color: $text-primary-color;
  }

  &__title-bar {
    @include console.console-title-stack;

    margin-bottom: 0;
  }

  &__toolbar {
    @include console.console-toolbar;
  }

  &__toolbar-left {
    display: flex;
    gap: $spacing-sm;
  }

  &__search {
    width: 240px;
  }

  &__title {
    @include console.console-title;
  }

  &__description {
    @include console.console-description;
  }

  &__loading {
    padding: $spacing-lg 0;
  }

  &__body {
    flex: 1;
    min-height: 0;
  }

  // Mobile header
  &__mobile-header {
    @include console.console-mobile-header;
  }

  &__mobile-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: $font-size-md;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
    white-space: nowrap;
  }

  &__mobile-search {
    padding: $spacing-sm $spacing-sm 0;
  }

  &__back-btn,
  &__add-btn {
    @include console.console-icon-button;
  }
}
</style>
