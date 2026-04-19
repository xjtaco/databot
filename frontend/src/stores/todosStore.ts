import { defineStore } from 'pinia';
import { computed, reactive } from 'vue';
import type { TodoItem } from '@/types';

export type TodoScope = 'chat' | 'workflow-copilot' | 'debug-copilot';

export interface TodoStats {
  count: number;
  completed: number;
  inProgress: number;
  pending: number;
  cancelled: number;
}

interface TodoScopeState {
  todos: TodoItem[];
  stats: TodoStats;
  isExpanded: boolean;
  lastUpdated: number;
}

function createEmptyStats(): TodoStats {
  return {
    count: 0,
    completed: 0,
    inProgress: 0,
    pending: 0,
    cancelled: 0,
  };
}

function createEmptyScopeState(): TodoScopeState {
  return {
    todos: [],
    stats: createEmptyStats(),
    isExpanded: false,
    lastUpdated: 0,
  };
}

export const useTodosStore = defineStore('todos', () => {
  const scopes = reactive<Record<TodoScope, TodoScopeState>>({
    chat: createEmptyScopeState(),
    'workflow-copilot': createEmptyScopeState(),
    'debug-copilot': createEmptyScopeState(),
  });

  const todos = computed(() => scopes.chat.todos);
  const stats = computed(() => scopes.chat.stats);
  const isExpanded = computed(() => scopes.chat.isExpanded);
  const lastUpdated = computed(() => scopes.chat.lastUpdated);
  const hasTodos = computed(() => scopes.chat.todos.length > 0);
  const currentTask = computed(() => getCurrentTask('chat'));
  const progressText = computed(() => getProgressText('chat'));

  function updateTodos(
    newTodos: TodoItem[],
    newStats: Partial<TodoStats>,
    scope: TodoScope = 'chat'
  ) {
    const state = scopes[scope];
    state.todos = newTodos;
    state.stats = {
      count: newStats.count ?? newTodos.length,
      completed: newStats.completed ?? 0,
      inProgress: newStats.inProgress ?? 0,
      pending: newStats.pending ?? 0,
      cancelled: newStats.cancelled ?? 0,
    };
    state.lastUpdated = Date.now();
  }

  function toggleExpanded(scope: TodoScope = 'chat') {
    scopes[scope].isExpanded = !scopes[scope].isExpanded;
  }

  function setExpanded(value: boolean, scope: TodoScope = 'chat') {
    scopes[scope].isExpanded = value;
  }

  function clear(scope: TodoScope = 'chat') {
    scopes[scope] = createEmptyScopeState();
  }

  function getTodos(scope: TodoScope = 'chat'): TodoItem[] {
    return scopes[scope].todos;
  }

  function getStats(scope: TodoScope = 'chat'): TodoStats {
    return scopes[scope].stats;
  }

  function getIsExpanded(scope: TodoScope = 'chat'): boolean {
    return scopes[scope].isExpanded;
  }

  function getLastUpdated(scope: TodoScope = 'chat'): number {
    return scopes[scope].lastUpdated;
  }

  function hasTodosFor(scope: TodoScope = 'chat'): boolean {
    return scopes[scope].todos.length > 0;
  }

  function getCurrentTask(scope: TodoScope = 'chat'): TodoItem | undefined {
    return scopes[scope].todos.find((t) => t.status === 'in_progress');
  }

  function getProgressText(scope: TodoScope = 'chat'): string {
    const scopeStats = scopes[scope].stats;
    return `${scopeStats.completed}/${scopeStats.count}`;
  }

  return {
    scopes,
    todos,
    stats,
    isExpanded,
    lastUpdated,
    hasTodos,
    currentTask,
    progressText,
    updateTodos,
    toggleExpanded,
    setExpanded,
    clear,
    getTodos,
    getStats,
    getIsExpanded,
    getLastUpdated,
    hasTodosFor,
    getCurrentTask,
    getProgressText,
  };
});
