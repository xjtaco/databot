<template>
  <div class="audit-filter" :class="{ 'audit-filter--mobile': isMobile }">
    <!-- ═══ Desktop Filters ═══ -->
    <template v-if="!isMobile">
      <div class="audit-filter__row">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          :start-placeholder="t('auditLog.filters.timeRange')"
          :end-placeholder="t('auditLog.filters.timeRange')"
          value-format="YYYY-MM-DD"
          class="audit-filter__date-picker"
          @change="handleDateChange"
        />

        <el-select
          v-model="localUserId"
          :placeholder="t('auditLog.filters.allUsers')"
          clearable
          filterable
          class="audit-filter__select"
          @change="handleUserChange"
        >
          <el-option v-for="user in users" :key="user.id" :label="user.username" :value="user.id" />
        </el-select>

        <el-select
          v-model="localCategory"
          :placeholder="t('auditLog.filters.allCategories')"
          clearable
          class="audit-filter__select"
          @change="handleCategoryChange"
        >
          <el-option
            v-for="cat in categoryOptions"
            :key="cat.value"
            :label="cat.label"
            :value="cat.value"
          />
        </el-select>

        <el-select
          v-model="localAction"
          :placeholder="t('auditLog.filters.allActions')"
          clearable
          class="audit-filter__select"
          @change="handleActionChange"
        >
          <el-option
            v-for="act in filteredActions"
            :key="act.action"
            :label="t(`auditLog.actions.${act.action}`)"
            :value="act.action"
          />
        </el-select>

        <el-input
          v-model="localKeyword"
          :placeholder="t('auditLog.filters.keywordPlaceholder')"
          clearable
          class="audit-filter__keyword"
          @keyup.enter="handleQuery"
        />

        <div class="audit-filter__buttons">
          <el-button type="primary" @click="handleQuery">
            {{ t('auditLog.filters.query') }}
          </el-button>
          <el-button @click="handleReset">
            {{ t('auditLog.filters.reset') }}
          </el-button>
          <el-button @click="handleExport">
            {{ t('auditLog.filters.export') }}
          </el-button>
        </div>
      </div>
    </template>

    <!-- ═══ Mobile Filters ═══ -->
    <template v-else>
      <div class="audit-filter__mobile-row">
        <el-input
          v-model="localKeyword"
          :placeholder="t('auditLog.filters.keywordPlaceholder')"
          clearable
          class="audit-filter__mobile-keyword"
          @keyup.enter="handleQuery"
        />
        <el-button type="primary" size="small" @click="handleQuery">
          {{ t('auditLog.filters.query') }}
        </el-button>
        <el-button size="small" @click="handleExport">
          {{ t('auditLog.filters.export') }}
        </el-button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AuditActionItem } from '@/types/auditLog';
import type { UserRecord } from '@/types/user';
import * as userApi from '@/api/user';

const props = defineProps<{
  isMobile?: boolean;
  actionTypes: AuditActionItem[];
}>();

const emit = defineEmits<{
  query: [
    filters: {
      startDate: string;
      endDate: string;
      userId: string;
      category: string;
      action: string;
      keyword: string;
    },
  ];
  reset: [];
  export: [];
}>();

const { t } = useI18n();

const dateRange = ref<[string, string] | null>(null);
const localUserId = ref('');
const localCategory = ref('');
const localAction = ref('');
const localKeyword = ref('');
const users = ref<UserRecord[]>([]);

const categoryOptions = computed(() => {
  const categories = [
    'auth',
    'user_management',
    'datasource',
    'workflow',
    'knowledge',
    'system_config',
  ];
  return categories.map((cat) => ({
    value: cat,
    label: t(`auditLog.categories.${cat}`),
  }));
});

const filteredActions = computed(() => {
  if (!localCategory.value) return props.actionTypes;
  return props.actionTypes.filter((a) => a.category === localCategory.value);
});

onMounted(async () => {
  try {
    const result = await userApi.listUsers(1, 100);
    users.value = result.users;
  } catch {
    // Silently fail — operator dropdown will be empty
  }
});

function handleDateChange(): void {
  // no-op, applied on query
}

function handleUserChange(): void {
  // no-op, applied on query
}

function handleCategoryChange(): void {
  localAction.value = '';
}

function handleActionChange(): void {
  // no-op, applied on query
}

function handleQuery(): void {
  emit('query', {
    startDate: dateRange.value?.[0] ?? '',
    endDate: dateRange.value?.[1] ?? '',
    userId: localUserId.value,
    category: localCategory.value,
    action: localAction.value,
    keyword: localKeyword.value,
  });
}

function handleReset(): void {
  dateRange.value = null;
  localUserId.value = '';
  localCategory.value = '';
  localAction.value = '';
  localKeyword.value = '';
  emit('reset');
}

function handleExport(): void {
  // Apply current filters before exporting
  emit('query', {
    startDate: dateRange.value?.[0] ?? '',
    endDate: dateRange.value?.[1] ?? '',
    userId: localUserId.value,
    category: localCategory.value,
    action: localAction.value,
    keyword: localKeyword.value,
  });
  emit('export');
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.audit-filter {
  flex-shrink: 0;

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

  &__row {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-sm;
    align-items: center;
    margin-bottom: $spacing-md;
  }

  &__date-picker {
    width: 260px;
  }

  &__select {
    width: 160px;
  }

  &__keyword {
    width: 180px;
  }

  &__buttons {
    display: flex;
    gap: $spacing-xs;
    margin-left: auto;
  }

  // Mobile
  &--mobile {
    padding: $spacing-sm $spacing-sm 0;
  }

  &__mobile-row {
    display: flex;
    gap: $spacing-xs;
    align-items: center;
  }

  &__mobile-keyword {
    flex: 1;
  }
}
</style>
