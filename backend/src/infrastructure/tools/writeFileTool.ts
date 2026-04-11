/**
 * WriteFile Tool for writing content to files in the local filesystem
 */

import { promises as fs } from 'fs';
import { Tool, ToolRegistry } from './tools';
import { JSONSchemaObject, ToolParams, ToolResult, ToolName } from './types';
import logger from '../../utils/logger';
import { ToolExecutionError } from '../../errors/types';
import { validateFilePath } from '../../utils/pathSecurity';

export class WriteFileTool extends Tool {
  name = ToolName.WriteFile;
  description = 'Write content to a specified file in the local filesystem.';

  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description:
          "Absolute path of the file to write (e.g., '/home/user/project/file.txt'). Relative paths are not supported; an absolute path must be provided.",
      },
      content: {
        type: 'string',
        description: 'The content to write to the file.',
      },
    },
    required: ['file_path', 'content'],
  };

  /**
   * Validate tool parameters
   */
  validate(params: ToolParams): boolean {
    if (
      params.file_path === undefined ||
      params.file_path === null ||
      typeof params.file_path !== 'string'
    ) {
      return false;
    }

    if (
      params.content === undefined ||
      params.content === null ||
      typeof params.content !== 'string'
    ) {
      return false;
    }

    if (params.file_path.trim() === '') {
      return false;
    }

    return true;
  }

  /**
   * Write content to a specified file.
   * @param file_path: Absolute path of the file to write
   * @param content: The content to write to the file
   * @returns Success message indicating whether a new file was created or an existing file was overwritten
   * @throws ToolExecutionError if execution fails
   */
  async execute(params: ToolParams): Promise<ToolResult> {
    const filePath = params.file_path as string;
    const content = params.content as string;

    // Validate parameters
    if (!this.validate(params)) {
      throw new ToolExecutionError('Invalid parameters');
    }

    // Validate file path security (absolute path, no forbidden patterns, within work folder)
    const pathValidation = validateFilePath(filePath);
    if (!pathValidation.valid) {
      throw new ToolExecutionError(pathValidation.error!);
    }
    const normalizedFilePath = pathValidation.normalizedPath;

    try {
      // Check if file already exists to provide appropriate feedback
      let fileExists = false;
      try {
        const stat = await fs.stat(normalizedFilePath);
        fileExists = stat.isFile();
      } catch {
        // File doesn't exist, which is fine
        fileExists = false;
      }

      // Ensure the directory exists
      const directory = normalizedFilePath.substring(0, normalizedFilePath.lastIndexOf('/'));
      if (directory) {
        try {
          await fs.mkdir(directory, { recursive: true });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new ToolExecutionError(
            `Failed to create directory: ${errorMessage}`,
            error instanceof Error ? error : undefined
          );
        }
      }

      // Write content to file
      try {
        await fs.writeFile(normalizedFilePath, content, 'utf-8');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new ToolExecutionError(
          `Failed to write file: ${errorMessage}`,
          error instanceof Error ? error : undefined
        );
      }

      const action = fileExists ? 'overwrote existing file' : 'created new file';

      logger.info(`WriteFileTool ${action}: ${normalizedFilePath}`);

      return {
        success: true,
        data: `Successfully wrote file: ${normalizedFilePath} (${action})`,
        metadata: {
          parameters: params,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`WriteFileTool execution failed:`, errorMessage);

      if (error instanceof ToolExecutionError) {
        throw error;
      }
      throw new ToolExecutionError(errorMessage, error instanceof Error ? error : undefined);
    }
  }
}

// Register the write file tool instance
ToolRegistry.register(new WriteFileTool());
