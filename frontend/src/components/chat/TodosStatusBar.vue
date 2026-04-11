<template>
  <div v-if="hasTodos" class="todos-status" @click="toggleExpanded">
    <div class="todos-status__summary">
      <el-icon class="todos-status__icon" :class="{ spinning: hasInProgress }">
        <Loading v-if="hasInProgress" />
        <Finished v-else />
      </el-icon>
      <span class="todos-status__progress">{{ progressText }}</span>
      <span v-if="currentTask" class="todos-status__current">{{ currentTask.activeForm }}</span>
    </div>
  </div>

  <el-drawer v-model="isExpanded" :title="t('chat.todos.title')" direction="rtl" size="320px">
    <div class="todos-list">
      <div
        v-for="(todo, index) in todos"
        :key="index"
        class="todo-item"
        :class="`todo-item--${todo.status}`"
      >
        <el-icon class="todo-item__icon">
          <Check v-if="todo.status === 'completed'" />
          <Loading v-else-if="todo.status === 'in_progress'" class="spinning" />
          <Close v-else-if="todo.status === 'cancelled'" />
          <Clock v-else />
        </el-icon>
        <span class="todo-item__text">{{ todo.content }}</span>
      </div>
      <div v-if="todos.length === 0" class="todos-empty">
        {{ t('chat.todos.noTasks') }}
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Loading, Finished, Check, Close, Clock } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { useTodosStore } from '@/stores';
import { storeToRefs } from 'pinia';

const { t } = useI18n();
const todosStore = useTodosStore();

const { todos, isExpanded, hasTodos, currentTask, progressText } = storeToRefs(todosStore);
const { toggleExpanded } = todosStore;

const hasInProgress = computed(() => !!currentTask.value);
</script>

<style scoped lang="scss">
.todos-status {
  display: flex;
  align-items: center;
  padding: 4px 10px;
  cursor: pointer;
  background-color: var(--accent-tint10);
  border-radius: 100px;

  &__summary {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 11px;
    color: var(--accent);
  }

  &__icon {
    font-size: 14px;
    color: var(--accent);
  }

  &__progress {
    font-weight: 500;
  }

  &__current {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-secondary);
    white-space: nowrap;
  }
}

.todos-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
}

.todo-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 6px;

  &__icon {
    flex-shrink: 0;
    font-size: 16px;
  }

  &__text {
    font-size: 13px;
    line-height: 1.4;
    color: var(--text-secondary);
  }

  &--completed {
    .todo-item__icon {
      color: var(--success);
    }
  }

  &--in_progress {
    background-color: var(--accent-tint10);

    .todo-item__icon {
      color: var(--accent);
    }

    .todo-item__text {
      font-weight: 500;
      color: var(--text-primary);
    }
  }

  &--cancelled {
    opacity: 0.5;

    .todo-item__icon {
      color: var(--text-tertiary);
    }

    .todo-item__text {
      text-decoration: line-through;
    }
  }

  &--pending {
    .todo-item__icon {
      color: var(--text-tertiary);
    }

    .todo-item__text {
      color: var(--text-tertiary);
    }
  }
}

.todos-empty {
  padding: 24px;
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
