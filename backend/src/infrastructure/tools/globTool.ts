/**
 * Glob Tool for file pattern matching
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { Tool, ToolRegistry } from './tools';
import { JSONSchemaObject, ToolParams, ToolResult, ToolName } from './types';
import logger from '../../utils/logger';
import fastGlob from 'fast-glob';
import { ToolExecutionError } from '../../errors/types';

interface FileInfo {
  path: string;
  mtime: number;
}

export class GlobTool extends Tool {
  name = ToolName.Glob;
  description =
    'Efficiently find files matching a specific glob pattern (e.g., **/*.md), returning absolute paths sorted by modification time (newest first). Particularly useful for quickly locating files by name or path structure in large data dictionary repositories.';
  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The glob pattern to match, e.g., *.py, **/*.md, src/**/*.js',
      },
      path: {
        type: 'string',
        description: 'Directory path to search in (optional, defaults to current directory)',
        default: '.',
      },
    },
    required: ['pattern'],
  };

  /**
   * Validate tool parameters
   */
  validate(params: ToolParams): boolean {
    if (
      params.pattern === undefined ||
      params.pattern === null ||
      typeof params.pattern !== 'string'
    ) {
      return false;
    }
    // path is optional, but if provided it must be a string (null is not acceptable)
    if (params.path !== undefined && (params.path === null || typeof params.path !== 'string')) {
      return false;
    }
    return true;
  }

  /**
   * Asynchronously find files using a glob pattern and return a list of absolute paths sorted by modification time.
   * @param pattern: Glob pattern string supporting wildcards like *, ?, **, etc.
   * @param path: Directory path to search, defaults to current directory
   * @returns List of absolute file paths sorted by modification time in descending order (newest first)
   * @throws ToolExecutionError if execution fails
   */
  async execute(params: ToolParams): Promise<ToolResult> {
    const pattern = params.pattern as string;
    const path = (params.path as string) || '.';

    // Validate parameters
    if (!this.validate(params)) {
      throw new ToolExecutionError('Invalid parameters');
    }

    // Handle empty pattern - return empty array
    if (pattern.trim() === '') {
      return {
        success: true,
        data: [],
        metadata: {
          parameters: params,
        },
      };
    }

    try {
      // Resolve the search path to absolute path
      const searchPath = resolve(path);

      // Check if search path exists
      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(searchPath);
      } catch {
        throw new ToolExecutionError(`Path does not exist: ${searchPath}`);
      }

      // Check if it's a directory
      if (!stat.isDirectory()) {
        throw new ToolExecutionError(`Path is not a directory: ${searchPath}`);
      }

      // Use fast-glob to find matching files
      const files = await fastGlob(pattern, {
        cwd: searchPath,
        absolute: true,
        onlyFiles: true,
        // Ensure dot files are not excluded by default
        dot: false,
      });

      // Get modification times for all files
      const fileInfos: FileInfo[] = await Promise.all(
        files.map(async (filePath: string) => {
          try {
            const fileStat = await fs.stat(filePath);
            return {
              path: filePath,
              mtime: fileStat.mtimeMs,
            };
          } catch {
            // Skip files that can't be stated
            return {
              path: filePath,
              mtime: 0,
            };
          }
        })
      );

      // Sort by modification time (newest first)
      fileInfos.sort((a, b) => b.mtime - a.mtime);

      // Extract just the paths
      const resultPaths = fileInfos.map((f) => f.path);

      logger.info(
        `GlobTool found ${resultPaths.length} file(s) for pattern '${pattern}' in '${searchPath}'`
      );

      return {
        success: true,
        data: resultPaths,
        metadata: {
          parameters: params,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`GlobTool execution failed:`, errorMessage);
      if (error instanceof ToolExecutionError) {
        throw error;
      }
      throw new ToolExecutionError(errorMessage, error instanceof Error ? error : undefined);
    }
  }
}

// Register the glob tool instance
ToolRegistry.register(new GlobTool());
