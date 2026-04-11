<template>
  <div class="user-management-page" :class="{ 'user-management-page--mobile': isMobile }">
    <!-- ═══ Desktop Header ═══ -->
    <template v-if="!isMobile">
      <div class="user-management-page__title-bar">
        <h2 class="user-management-page__title">{{ t('user.management') }}</h2>
        <p class="user-management-page__description">{{ t('user.managementDesc') }}</p>
      </div>
      <div class="user-management-page__toolbar">
        <div class="user-management-page__toolbar-left">
          <el-input
            v-model="searchInput"
            :placeholder="t('user.searchPlaceholder')"
            :prefix-icon="Search"
            clearable
            class="user-management-page__search"
            @input="handleSearch"
          />
        </div>
        <el-button type="primary" @click="openCreateDialog">
          <Plus :size="16" />
          {{ t('user.createUser') }}
        </el-button>
      </div>
    </template>

    <!-- ═══ Mobile Header ═══ -->
    <template v-else>
      <div class="user-management-page__mobile-header">
        <button class="user-management-page__back-btn" @click="$emit('back')">
          <ArrowLeft :size="18" />
        </button>
        <span class="user-management-page__mobile-title">{{ t('user.management') }}</span>
        <button class="user-management-page__add-btn" @click="openCreateDialog">
          <Plus :size="18" />
        </button>
      </div>
      <div class="user-management-page__mobile-search">
        <el-input
          v-model="searchInput"
          :placeholder="t('user.searchPlaceholder')"
          :prefix-icon="Search"
          clearable
          @input="handleSearch"
        />
      </div>
    </template>

    <!-- ═══ Body ═══ -->
    <div class="user-management-page__body">
      <!-- Desktop: Table -->
      <el-table
        v-if="!isMobile"
        v-loading="store.isLoading"
        :data="store.users"
        class="user-management-page__table"
      >
        <el-table-column :label="t('user.status')" width="100">
          <template #default="{ row }">
            <span class="user-management-page__status" :class="statusClass(row)">
              <span class="user-management-page__status-dot"></span>
              {{ row.locked ? t('user.locked') : t('user.active') }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="username" :label="t('user.username')" min-width="140">
          <template #default="{ row }">
            <div class="user-management-page__user">
              <span class="user-management-page__user-name">{{ row.username }}</span>
              <span v-if="row.role === 'admin'" class="user-management-page__user-role">
                {{ t('user.admin') }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('user.name')" min-width="120">
          <template #default="{ row }">
            {{ row.name || '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="email" :label="t('user.email')" min-width="200" />
        <el-table-column :label="t('user.createdAt')" min-width="160">
          <template #default="{ row }">
            <span class="user-management-page__date">{{ formatDate(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('user.actions')" width="160" align="center">
          <template #default="{ row }">
            <div class="user-management-page__actions">
              <el-tooltip :content="t('common.edit')" placement="top">
                <el-button size="small" circle @click="openEditDialog(row)">
                  <Pencil :size="14" />
                </el-button>
              </el-tooltip>
              <template v-if="row.role !== 'admin'">
                <el-tooltip
                  :content="row.locked ? t('user.unlock') : t('user.lock')"
                  placement="top"
                >
                  <el-button
                    size="small"
                    circle
                    :type="row.locked ? 'success' : 'warning'"
                    @click="handleToggleLock(row)"
                  >
                    <LockKeyhole v-if="!row.locked" :size="14" />
                    <LockKeyholeOpen v-else :size="14" />
                  </el-button>
                </el-tooltip>
                <el-tooltip :content="t('common.delete')" placement="top">
                  <el-button size="small" type="danger" circle @click="handleDelete(row)">
                    <Trash2 :size="14" />
                  </el-button>
                </el-tooltip>
              </template>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- Mobile: Card List -->
      <UserCardList
        v-else
        :users="store.users"
        @edit="openEditDialog"
        @toggle-lock="handleToggleLock"
        @delete="handleDelete"
      />

      <div v-if="store.totalPages > 1" class="user-management-page__pagination">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="store.pageSize"
          :total="store.total"
          layout="prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </div>

    <!-- Create / Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEditMode ? t('user.editUser') : t('user.createUser')"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="dialogForm" :rules="dialogRules" label-width="100px">
        <el-form-item :label="t('user.username')" prop="username">
          <el-input
            v-model="dialogForm.username"
            :disabled="isEditMode"
            :placeholder="t('user.username')"
          />
        </el-form-item>
        <el-form-item :label="t('user.email')" prop="email">
          <el-input v-model="dialogForm.email" :placeholder="t('user.email')" />
        </el-form-item>
        <el-form-item :label="t('user.name')">
          <el-input v-model="dialogForm.name" :placeholder="t('user.name')" />
        </el-form-item>
        <el-form-item :label="t('user.gender')">
          <el-select v-model="dialogForm.gender" :placeholder="t('user.gender')" clearable>
            <el-option :label="t('user.genderOptions.male')" value="male" />
            <el-option :label="t('user.genderOptions.female')" value="female" />
            <el-option :label="t('user.genderOptions.other')" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('user.birthDate')">
          <el-date-picker
            v-model="dialogForm.birthDate"
            type="date"
            :placeholder="t('user.birthDate')"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleDialogSubmit">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Temp Password Dialog -->
    <el-dialog
      v-model="tempPasswordDialogVisible"
      :title="t('user.tempPasswordTitle')"
      width="420px"
    >
      <div class="user-management-page__temp-password">
        <p>
          {{ tempPasswordSent ? t('user.tempPasswordSmtpSent') : t('user.tempPasswordDesc') }}
        </p>
        <el-input v-if="!tempPasswordSent && tempPassword" :model-value="tempPassword" readonly>
          <template #append>
            <el-button @click="copyTempPassword">{{ t('chat.copy') }}</el-button>
          </template>
        </el-input>
      </div>
      <template #footer>
        <el-button type="primary" @click="tempPasswordDialogVisible = false">
          {{ t('common.close') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search } from '@element-plus/icons-vue';
import { ArrowLeft, Plus, Pencil, Trash2, LockKeyhole, LockKeyholeOpen } from 'lucide-vue-next';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import UserCardList from './UserCardList.vue';
import { useUserManagementStore } from '@/stores';
import type { UserRecord } from '@/types/user';

defineProps<{
  isMobile?: boolean;
}>();

defineEmits<{
  back: [];
}>();

const { t } = useI18n();
const store = useUserManagementStore();

const searchInput = ref('');
const currentPage = ref(1);

// Dialog state
const dialogVisible = ref(false);
const isEditMode = ref(false);
const editingUserId = ref('');
const submitting = ref(false);
const formRef = ref<FormInstance>();
const dialogForm = reactive({
  username: '',
  email: '',
  name: '',
  gender: '',
  birthDate: '',
});

const dialogRules: FormRules = {
  username: [
    { required: true, message: () => t('user.validation.usernameRequired'), trigger: 'blur' },
  ],
  email: [
    { required: true, message: () => t('user.validation.emailRequired'), trigger: 'blur' },
    { type: 'email', message: () => t('user.validation.emailInvalid'), trigger: 'blur' },
  ],
};

// Temp password dialog
const tempPasswordDialogVisible = ref(false);
const tempPassword = ref('');
const tempPasswordSent = ref(false);

onMounted(() => {
  store.fetchUsers();
});

function statusClass(row: UserRecord): string {
  return row.locked
    ? 'user-management-page__status--locked'
    : 'user-management-page__status--active';
}

function handleSearch(): void {
  store.setSearch(searchInput.value);
  currentPage.value = 1;
  store.fetchUsers();
}

function handlePageChange(page: number): void {
  store.setPage(page);
  store.fetchUsers();
}

function openCreateDialog(): void {
  isEditMode.value = false;
  editingUserId.value = '';
  dialogForm.username = '';
  dialogForm.email = '';
  dialogForm.name = '';
  dialogForm.gender = '';
  dialogForm.birthDate = '';
  dialogVisible.value = true;
}

function openEditDialog(user: UserRecord): void {
  isEditMode.value = true;
  editingUserId.value = user.id;
  dialogForm.username = user.username;
  dialogForm.email = user.email;
  dialogForm.name = user.name || '';
  dialogForm.gender = user.gender || '';
  dialogForm.birthDate = user.birthDate ? user.birthDate.split('T')[0] : '';
  dialogVisible.value = true;
}

async function handleDialogSubmit(): Promise<void> {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    if (isEditMode.value) {
      await store.updateUser(editingUserId.value, {
        name: dialogForm.name || undefined,
        gender: dialogForm.gender || undefined,
        birthDate: dialogForm.birthDate || null,
        email: dialogForm.email,
      });
      ElMessage.success(t('user.updateSuccess'));
    } else {
      const result = await store.createUser({
        username: dialogForm.username,
        email: dialogForm.email,
        name: dialogForm.name || undefined,
        gender: dialogForm.gender || undefined,
        birthDate: dialogForm.birthDate || undefined,
      });
      ElMessage.success(t('user.createSuccess'));

      if (!result.passwordSent && result.tempPassword) {
        tempPassword.value = result.tempPassword;
        tempPasswordSent.value = false;
        tempPasswordDialogVisible.value = true;
      } else if (result.passwordSent) {
        tempPassword.value = '';
        tempPasswordSent.value = true;
        tempPasswordDialogVisible.value = true;
      }
    }
    dialogVisible.value = false;
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    submitting.value = false;
  }
}

async function handleToggleLock(user: UserRecord): Promise<void> {
  const confirmMsg = user.locked
    ? t('user.unlockConfirm', { name: user.username })
    : t('user.lockConfirm', { name: user.username });

  try {
    await ElMessageBox.confirm(confirmMsg, t('common.warning'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
    });

    if (user.locked) {
      await store.unlockUser(user.id);
      ElMessage.success(t('user.unlockSuccess'));
    } else {
      await store.lockUser(user.id);
      ElMessage.success(t('user.lockSuccess'));
    }
  } catch {
    // User cancelled
  }
}

async function handleDelete(user: UserRecord): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('user.deleteConfirm', { name: user.username }),
      t('common.warning'),
      {
        type: 'error',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
      }
    );

    await store.deleteUser(user.id);
    ElMessage.success(t('user.deleteSuccess'));
  } catch {
    // User cancelled
  }
}

function copyTempPassword(): void {
  navigator.clipboard
    .writeText(tempPassword.value)
    .then(() => ElMessage.success(t('chat.copied')))
    .catch(() => ElMessage.error(t('chat.copyFailed')));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.user-management-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: $spacing-md $spacing-lg;
  overflow-y: auto;

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
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    gap: $spacing-xs;
    margin-bottom: $spacing-md;
  }

  &__title {
    margin: 0;
    font-size: $font-size-xl;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
  }

  &__description {
    margin: 0;
    font-size: $font-size-sm;
    color: $text-muted;
  }

  &__toolbar {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $spacing-md;
  }

  &__toolbar-left {
    display: flex;
    gap: $spacing-sm;
  }

  &__search {
    width: 240px;
  }

  &__body {
    flex: 1;
    min-height: 0;
  }

  // Table dark theme (matching ScheduleTable)
  &__table {
    --el-table-bg-color: transparent;
    --el-table-tr-bg-color: transparent;
    --el-table-header-bg-color: var(--bg-secondary);
    --el-table-row-hover-bg-color: var(--bg-elevated);
    --el-table-border-color: var(--border-primary);
    --el-table-text-color: var(--text-primary);
    --el-table-header-text-color: var(--text-tertiary);

    :deep(.el-table__header th.el-table__cell) {
      font-weight: 400;
    }

    :deep(.el-table__body tr:last-child td) {
      border-bottom: none;
    }

    :deep(.el-table__inner-wrapper::before) {
      display: none;
    }
  }

  // Status with dot
  &__status {
    display: inline-flex;
    gap: $spacing-xs;
    align-items: center;
    font-size: $font-size-sm;
  }

  &__status-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: $radius-full;
  }

  &__status--active &__status-dot {
    background: $success;
  }

  &__status--active {
    color: $success;
  }

  &__status--locked &__status-dot {
    background: $error;
  }

  &__status--locked {
    color: $error;
  }

  // Username + role badge
  &__user {
    display: flex;
    gap: $spacing-xs;
    align-items: center;
  }

  &__user-name {
    font-weight: $font-weight-medium;
    color: $text-primary-color;
  }

  &__user-role {
    padding: 1px 6px;
    font-size: $font-size-xs;
    color: $accent;
    background: rgba($accent, 0.1);
    border-radius: $radius-sm;
  }

  &__date {
    font-size: $font-size-sm;
    color: $text-secondary-color;
  }

  // Circle icon buttons for actions
  &__actions {
    display: flex;
    gap: $spacing-xs;
    justify-content: center;
  }

  &__pagination {
    display: flex;
    justify-content: center;
    padding: $spacing-lg 0;
  }

  // Mobile header
  &__mobile-header {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
    height: 48px;
    min-height: 48px;
    padding: 0 $spacing-sm;
    border-bottom: 1px solid $border-dark;
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
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    color: $text-muted;
    cursor: pointer;
    background: none;
    border: none;
    border-radius: $radius-md;
    transition: all $transition-fast;

    &:hover {
      color: $text-secondary-color;
      background-color: $bg-elevated;
    }
  }

  &__temp-password {
    display: flex;
    flex-direction: column;
    gap: $spacing-md;

    p {
      margin: 0;
      font-size: $font-size-sm;
      color: $text-secondary-color;
    }
  }
}
</style>
