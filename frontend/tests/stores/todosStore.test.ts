import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTodosStore } from '@/stores/todosStore';

describe('todosStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should have empty todos array', () => {
      const store = useTodosStore();
      expect(store.todos).toEqual([]);
    });

    it('should have zero stats', () => {
      const store = useTodosStore();
      expect(store.stats).toEqual({
        count: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        cancelled: 0,
      });
    });

    it('should have isExpanded as false', () => {
      const store = useTodosStore();
      expect(store.isExpanded).toBe(false);
    });

    it('should have hasTodos as false when empty', () => {
      const store = useTodosStore();
      expect(store.hasTodos).toBe(false);
    });
  });

  describe('updateTodos', () => {
    it('should update todos and stats', () => {
      const store = useTodosStore();
      const todos = [
        { content: 'Task 1', activeForm: 'Task 1', status: 'completed' as const },
        { content: 'Task 2', activeForm: 'Task 2', status: 'in_progress' as const },
        { content: 'Task 3', activeForm: 'Task 3', status: 'pending' as const },
      ];

      store.updateTodos(todos, {
        count: 3,
        completed: 1,
        inProgress: 1,
        pending: 1,
        cancelled: 0,
      });

      expect(store.todos).toEqual(todos);
      expect(store.stats.count).toBe(3);
      expect(store.stats.completed).toBe(1);
      expect(store.stats.inProgress).toBe(1);
      expect(store.stats.pending).toBe(1);
      expect(store.hasTodos).toBe(true);
    });

    it('should update lastUpdated timestamp', () => {
      const store = useTodosStore();
      const before = Date.now();

      store.updateTodos([{ content: 'Task 1', activeForm: 'Task 1', status: 'pending' }], {
        count: 1,
        completed: 0,
        inProgress: 0,
        pending: 1,
        cancelled: 0,
      });

      expect(store.lastUpdated).toBeGreaterThanOrEqual(before);
    });

    it('should replace existing todos', () => {
      const store = useTodosStore();

      store.updateTodos([{ content: 'Task 1', activeForm: 'Task 1', status: 'pending' }], {
        count: 1,
        completed: 0,
        inProgress: 0,
        pending: 1,
        cancelled: 0,
      });

      store.updateTodos(
        [
          { content: 'New Task 1', activeForm: 'New Task 1', status: 'completed' },
          { content: 'New Task 2', activeForm: 'New Task 2', status: 'pending' },
        ],
        { count: 2, completed: 1, inProgress: 0, pending: 1, cancelled: 0 }
      );

      expect(store.todos).toHaveLength(2);
      expect(store.todos[0].content).toBe('New Task 1');
    });

    it('should use todo length as count if not provided', () => {
      const store = useTodosStore();
      const todos = [
        { content: 'Task 1', activeForm: 'Task 1', status: 'pending' as const },
        { content: 'Task 2', activeForm: 'Task 2', status: 'pending' as const },
      ];

      store.updateTodos(todos, {});

      expect(store.stats.count).toBe(2);
    });
  });

  describe('toggleExpanded', () => {
    it('should toggle isExpanded', () => {
      const store = useTodosStore();
      expect(store.isExpanded).toBe(false);

      store.toggleExpanded();
      expect(store.isExpanded).toBe(true);

      store.toggleExpanded();
      expect(store.isExpanded).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all todos and reset stats', () => {
      const store = useTodosStore();

      store.updateTodos([{ content: 'Task 1', activeForm: 'Task 1', status: 'pending' }], {
        count: 1,
        completed: 0,
        inProgress: 0,
        pending: 1,
        cancelled: 0,
      });
      store.toggleExpanded();

      store.clear();

      expect(store.todos).toHaveLength(0);
      expect(store.stats.count).toBe(0);
      expect(store.isExpanded).toBe(false);
      expect(store.lastUpdated).toBe(0);
      expect(store.hasTodos).toBe(false);
    });
  });

  describe('currentTask getter', () => {
    it('should return the in_progress task', () => {
      const store = useTodosStore();

      store.updateTodos(
        [
          { content: 'Task 1', activeForm: 'Task 1', status: 'completed' },
          { content: 'Task 2', activeForm: 'Task 2', status: 'in_progress' },
          { content: 'Task 3', activeForm: 'Task 3', status: 'pending' },
        ],
        { count: 3, completed: 1, inProgress: 1, pending: 1, cancelled: 0 }
      );

      expect(store.currentTask).toEqual({
        content: 'Task 2',
        activeForm: 'Task 2',
        status: 'in_progress',
      });
    });

    it('should return undefined if no in_progress task', () => {
      const store = useTodosStore();

      store.updateTodos(
        [
          { content: 'Task 1', activeForm: 'Task 1', status: 'completed' },
          { content: 'Task 2', activeForm: 'Task 2', status: 'pending' },
        ],
        { count: 2, completed: 1, inProgress: 0, pending: 1, cancelled: 0 }
      );

      expect(store.currentTask).toBeUndefined();
    });

    it('should return undefined when todos is empty', () => {
      const store = useTodosStore();
      expect(store.currentTask).toBeUndefined();
    });
  });

  describe('progressText getter', () => {
    it('should return completed/count format', () => {
      const store = useTodosStore();

      store.updateTodos(
        [
          { content: 'Task 1', activeForm: 'Task 1', status: 'completed' },
          { content: 'Task 2', activeForm: 'Task 2', status: 'completed' },
          { content: 'Task 3', activeForm: 'Task 3', status: 'in_progress' },
          { content: 'Task 4', activeForm: 'Task 4', status: 'pending' },
          { content: 'Task 5', activeForm: 'Task 5', status: 'pending' },
        ],
        { count: 5, completed: 2, inProgress: 1, pending: 2, cancelled: 0 }
      );

      expect(store.progressText).toBe('2/5');
    });

    it('should return 0/0 when empty', () => {
      const store = useTodosStore();
      expect(store.progressText).toBe('0/0');
    });
  });

  describe('all todo statuses', () => {
    it('should handle all status types', () => {
      const store = useTodosStore();

      store.updateTodos(
        [
          { content: 'Task 1', activeForm: 'Task 1', status: 'completed' },
          { content: 'Task 2', activeForm: 'Task 2', status: 'in_progress' },
          { content: 'Task 3', activeForm: 'Task 3', status: 'pending' },
          { content: 'Task 4', activeForm: 'Task 4', status: 'cancelled' },
        ],
        { count: 4, completed: 1, inProgress: 1, pending: 1, cancelled: 1 }
      );

      expect(store.stats.completed).toBe(1);
      expect(store.stats.inProgress).toBe(1);
      expect(store.stats.pending).toBe(1);
      expect(store.stats.cancelled).toBe(1);
    });
  });
});
