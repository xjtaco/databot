/**
 * TodosWriter Tool for managing and displaying task lists
 */

import { Tool, ToolRegistry } from './tools';
import { JSONSchemaObject, ToolParams, ToolResult, ToolName } from './types';
import logger from '../../utils/logger';
import { ToolExecutionError } from '../../errors/types';

/**
 * Todo item interface
 */
interface TodoItem {
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

/**
 * TodosWriter - Manage and display task progress
 * Helps track complex tasks by maintaining a todo list
 */
export class TodosWriter extends Tool {
  name = ToolName.TodosWriter;
  description = `Manage subtask lists for tracking complex multi-step tasks. Each todo item has: content (task description in imperative form), activeForm (present continuous form shown during execution), and status (pending, in_progress, completed, cancelled). Only one task can be in_progress at a time. Send the complete list on each call (full replacement).`;

  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: 'Complete list of todo items, which will replace the existing list.',
        items: {
          type: 'object',
          description: 'A single todo item.',
          properties: {
            content: {
              type: 'string',
              description: 'Task description in imperative form.',
            },
            activeForm: {
              type: 'string',
              description: 'Present continuous form shown during execution.',
            },
            status: {
              type: 'string',
              description: 'Current status of the task.',
              enum: ['pending', 'in_progress', 'completed', 'cancelled'],
            },
          },
          required: ['content', 'activeForm', 'status'],
        },
      },
    },
    required: ['todos'],
  };

  /**
   * Validate tool parameters
   */
  validate(params: ToolParams): boolean {
    // Check if todos exists and is an array
    if (params.todos === undefined || params.todos === null || !Array.isArray(params.todos)) {
      return false;
    }

    // Check each todo item
    const todos = params.todos as unknown[];
    for (const todo of todos) {
      if (typeof todo !== 'object' || todo === null) {
        return false;
      }

      const todoItem = todo as Record<string, unknown>;

      // Check content
      if (
        todoItem.content === undefined ||
        todoItem.content === null ||
        typeof todoItem.content !== 'string'
      ) {
        return false;
      }

      // Check content is not empty
      if (todoItem.content.trim() === '') {
        return false;
      }

      // Check activeForm
      if (
        todoItem.activeForm === undefined ||
        todoItem.activeForm === null ||
        typeof todoItem.activeForm !== 'string'
      ) {
        return false;
      }

      // Check activeForm is not empty
      if (todoItem.activeForm.trim() === '') {
        return false;
      }

      // Check status
      if (
        todoItem.status === undefined ||
        todoItem.status === null ||
        typeof todoItem.status !== 'string'
      ) {
        return false;
      }

      // Check status is valid
      const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(todoItem.status)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Process the todo list and return a summary.
   * @param params Tool parameters containing todos array
   * @returns Simple success string with statistics in metadata
   * @throws ToolExecutionError if execution fails
   */
  async execute(params: ToolParams): Promise<ToolResult> {
    const todos = params.todos as TodoItem[];

    // Validate parameters
    if (!this.validate(params)) {
      throw new ToolExecutionError('Invalid parameters');
    }

    try {
      // Validate that only one task is in_progress
      const inProgressCount = todos.filter((t) => t.status === 'in_progress').length;
      if (inProgressCount > 1) {
        throw new ToolExecutionError(
          `Only one subtask can be in in_progress status, currently ${inProgressCount} are in progress`
        );
      }

      // Calculate statistics
      const completed = todos.filter((t) => t.status === 'completed').length;
      const pending = todos.filter((t) => t.status === 'pending').length;
      const cancelled = todos.filter((t) => t.status === 'cancelled').length;

      logger.info(
        `TodosWriter executed: ${todos.length} tasks (completed: ${completed}, in_progress: ${inProgressCount}, pending: ${pending}, cancelled: ${cancelled})`
      );

      return {
        success: true,
        data: 'Todos updated successfully.',
        metadata: {
          parameters: params,
          todos: todos,
          count: todos.length,
          completed,
          inProgress: inProgressCount,
          pending,
          cancelled,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`TodosWriter execution failed:`, errorMessage);

      if (error instanceof ToolExecutionError) {
        throw error;
      }
      throw new ToolExecutionError(errorMessage, error instanceof Error ? error : undefined);
    }
  }
}

// Register the todos writer tool instance
ToolRegistry.register(new TodosWriter());
