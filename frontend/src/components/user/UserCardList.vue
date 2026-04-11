<template>
  <div v-if="users.length === 0" class="user-cards__empty">
    <p>{{ t('common.noData') }}</p>
  </div>
  <div v-else class="user-cards">
    <div v-for="user in users" :key="user.id" class="user-card">
      <div class="user-card__header">
        <div class="user-card__title-row">
          <span
            class="user-card__status-dot"
            :class="user.locked ? 'user-card__status-dot--locked' : 'user-card__status-dot--active'"
          ></span>
          <span class="user-card__name">{{ user.username }}</span>
          <span v-if="user.role === 'admin'" class="user-card__role">{{ t('user.admin') }}</span>
        </div>
        <div class="user-card__actions">
          <el-button size="small" circle @click="emit('edit', user)">
            <Pencil :size="14" />
          </el-button>
          <template v-if="user.role !== 'admin'">
            <el-button
              size="small"
              circle
              :type="user.locked ? 'success' : 'warning'"
              @click="emit('toggleLock', user)"
            >
              <LockKeyhole v-if="!user.locked" :size="14" />
              <LockKeyholeOpen v-else :size="14" />
            </el-button>
            <el-button size="small" type="danger" circle @click="emit('delete', user)">
              <Trash2 :size="14" />
            </el-button>
          </template>
        </div>
      </div>

      <div class="user-card__meta">
        <span v-if="user.name" class="user-card__detail">
          <UserIcon :size="12" />
          {{ user.name }}
        </span>
        <span class="user-card__detail">
          <Mail :size="12" />
          {{ user.email }}
        </span>
      </div>

      <div class="user-card__footer">
        <span
          class="user-card__status-text"
          :class="user.locked ? 'user-card__status-text--locked' : ''"
        >
          {{ user.locked ? t('user.locked') : t('user.active') }}
        </span>
        <span class="user-card__date">{{ formatDate(user.createdAt) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import {
  Pencil,
  Trash2,
  LockKeyhole,
  LockKeyholeOpen,
  User as UserIcon,
  Mail,
} from 'lucide-vue-next';
import type { UserRecord } from '@/types/user';

defineProps<{
  users: UserRecord[];
}>();

const emit = defineEmits<{
  edit: [user: UserRecord];
  toggleLock: [user: UserRecord];
  delete: [user: UserRecord];
}>();

const { t } = useI18n();

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.user-cards {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  padding: $spacing-sm;

  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: $spacing-2xl 0;
    color: $text-muted;
  }
}

.user-card {
  padding: $spacing-md;
  background: $bg-card;
  border: 1px solid $border-dark;
  border-radius: $radius-md;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $spacing-sm;
  }

  &__title-row {
    display: flex;
    gap: $spacing-sm;
    align-items: center;
  }

  &__status-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: $radius-full;

    &--active {
      background: $success;
    }

    &--locked {
      background: $error;
    }
  }

  &__name {
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    color: $text-primary-color;
  }

  &__role {
    padding: 1px 6px;
    font-size: $font-size-xs;
    color: $accent;
    background: rgba($accent, 0.1);
    border-radius: $radius-sm;
  }

  &__actions {
    display: flex;
    gap: $spacing-xs;
  }

  &__meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: $spacing-sm;
  }

  &__detail {
    display: inline-flex;
    gap: $spacing-xs;
    align-items: center;
    font-size: $font-size-xs;
    color: $text-secondary-color;
  }

  &__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__status-text {
    color: $success;

    &--locked {
      color: $error;
    }
  }

  &__date {
    color: $text-muted;
  }
}
</style>
