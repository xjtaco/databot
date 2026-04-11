import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { TodoItem } from '@/types';

export interface TodoStats {
  count: number;
  completed: number;
  inProgress: number;
  pending: number;
  cancelled: number;
}

export const useTodosStore = defineStore('todos', () => {
  const todos = ref<TodoItem[]>([]);
  const stats = ref<TodoStats>({
    count: 0,
    completed: 0,
    inProgress: 0,
    pending: 0,
    cancelled: 0,
  });
  const isExpanded = ref(false);
  const lastUpdated = ref<number>(0);

  const hasTodos = computed(() => todos.value.length > 0);
  const currentTask = computed(() => todos.value.find((t) => t.status === 'in_progress'));
  const progressText = computed(() => `${stats.value.completed}/${stats.value.count}`);

  function updateTodos(newTodos: TodoItem[], newStats: Partial<TodoStats>) {
    todos.value = newTodos;
    stats.value = {
      count: newStats.count ?? newTodos.length,
      completed: newStats.completed ?? 0,
      inProgress: newStats.inProgress ?? 0,
      pending: newStats.pending ?? 0,
      cancelled: newStats.cancelled ?? 0,
    };
    lastUpdated.value = Date.now();
  }

  function toggleExpanded() {
    isExpanded.value = !isExpanded.value;
  }

  function clear() {
    todos.value = [];
    stats.value = {
      count: 0,
      completed: 0,
      inProgress: 0,
      pending: 0,
      cancelled: 0,
    };
    isExpanded.value = false;
    lastUpdated.value = 0;
  }

  return {
    todos,
    stats,
    isExpanded,
    lastUpdated,
    hasTodos,
    currentTask,
    progressText,
    updateTodos,
    toggleExpanded,
    clear,
  };
});
