/**
 * Grep Tool for searching file contents using regular expressions
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { Tool, ToolRegistry } from './tools';
import { JSONSchemaObject, ToolParams, ToolResult, ToolName } from './types';
import logger from '../../utils/logger';
import fastGlob from 'fast-glob';
import { ToolExecutionError } from '../../errors/types';
import { sanitizeBase64 } from './contentSanitizer';

interface MatchResult {
  file: string;
  line: number;
  content: string;
}

export class GrepTool extends Tool {
  /** Maximum number of matches returned to prevent excessive token consumption */
  private static readonly MAX_MATCHES = 100;
  /** Maximum displayed length per matched line; longer lines are trimmed around the match */
  private static readonly MAX_LINE_LENGTH = 200;
  /** Characters to show before and after the match when trimming long lines */
  private static readonly CONTEXT_CHARS = 80;

  name = ToolName.Grep;
  description =
    'Search file contents in a specified directory using a regular expression pattern. Returns up to 100 matches. Use specific patterns and file filters to narrow results. Supports file wildcards to limit search scope.';
  parameters: JSONSchemaObject = {
    type: 'object',
    required: ['pattern', 'path'],
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for in files.',
      },
      path: { type: 'string', description: 'Directory to search in' },
      include: {
        type: 'string',
        description: 'File pattern to include in the search (e.g., "*.py", "*.{md,ini}")',
      },
    },
  };

  /**
   * Trim a long line to show only the region around the match.
   * Returns the original line if it is within MAX_LINE_LENGTH.
   */
  private trimLine(line: string, matchIndex: number, matchLength: number): string {
    if (line.length <= GrepTool.MAX_LINE_LENGTH) return line;

    const matchEnd = matchIndex + matchLength;
    const start = Math.max(0, matchIndex - GrepTool.CONTEXT_CHARS);
    const end = Math.min(line.length, matchEnd + GrepTool.CONTEXT_CHARS);

    const trimmedChars = line.length - (end - start);
    if (trimmedChars === 0) return line;

    const prefix = start > 0 ? '...' : '';
    const suffix = end < line.length ? '...' : '';
    return `${prefix}${line.slice(start, end)}${suffix} [truncated ${trimmedChars} chars]`;
  }

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
    if (params.path === undefined || params.path === null || typeof params.path !== 'string') {
      return false;
    }
    // include is optional - undefined is allowed (will use default)
    // but if provided (not undefined), it must be a string (null is not acceptable)
    if (params.include !== undefined) {
      if (params.include === null || typeof params.include !== 'string') {
        return false;
      }
    }
    return true;
  }

  /**
   * Search file contents in a specified directory using a regular expression pattern.
   * @param pattern: Regular expression pattern to search for in files
   * @param path: Directory path to search in
   * @param include: Optional file pattern to include in the search (e.g., "*.py", "*.{md,ini}")
   * @returns Formatted search results (string)
   * @throws ToolExecutionError if execution fails
   */
  async execute(params: ToolParams): Promise<ToolResult> {
    const pattern = params.pattern as string;
    const path = params.path as string;
    const include = (params.include as string) || '**/*';

    // Validate parameters
    if (!this.validate(params)) {
      throw new ToolExecutionError('Invalid parameters');
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

      // Validate regex pattern
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, 'g');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new ToolExecutionError(
          `Invalid regex pattern: ${errorMessage}`,
          error instanceof Error ? error : undefined
        );
      }

      // Use fast-glob to find matching files
      const files = await fastGlob(include, {
        cwd: searchPath,
        absolute: true,
        onlyFiles: true,
        dot: false,
      });

      if (files.length === 0) {
        logger.info(`GrepTool found no files for pattern '${include}' in '${searchPath}'`);
        return {
          success: true,
          data: '',
          metadata: {
            parameters: params,
          },
        };
      }

      // Search each file for matches (stop early when limit reached)
      const matches: MatchResult[] = [];
      let truncated = false;
      for (const filePath of files) {
        if (matches.length >= GrepTool.MAX_MATCHES) {
          truncated = true;
          break;
        }
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            // Sanitize base64 blobs before matching so positions are
            // correct for trimLine and the output stays clean.
            const line = sanitizeBase64(lines[i]);
            regex.lastIndex = 0; // Reset regex state
            const execResult = regex.exec(line);
            if (execResult) {
              matches.push({
                file: filePath,
                line: i + 1, // Line numbers are 1-indexed
                content: this.trimLine(line, execResult.index, execResult[0].length),
              });
              if (matches.length >= GrepTool.MAX_MATCHES) {
                truncated = true;
                break;
              }
            }
          }
        } catch (error) {
          // Skip files that can't be read (e.g., binary files, permission issues)
          logger.debug(
            `Skipping file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Format results
      if (matches.length === 0) {
        return {
          success: true,
          data: '',
          metadata: {
            parameters: params,
          },
        };
      }

      // Format output similar to grep: "file:line:content"
      let formattedResults = matches
        .map((match) => `${match.file}:${match.line}:${match.content}`)
        .join('\n');

      if (truncated) {
        formattedResults +=
          `\n\n---\n` +
          `**Note**: Results truncated at ${GrepTool.MAX_MATCHES} matches. ` +
          `Use a more specific pattern or narrower file filter (include) to refine results.`;
      }

      logger.info(
        `GrepTool found ${matches.length} match(es) for pattern '${pattern}' in '${searchPath}' (truncated: ${truncated})`
      );

      return {
        success: true,
        data: formattedResults,
        metadata: {
          parameters: params,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`GrepTool execution failed:`, errorMessage);
      if (error instanceof ToolExecutionError) {
        throw error;
      }
      throw new ToolExecutionError(errorMessage, error instanceof Error ? error : undefined);
    }
  }
}

// Register the grep tool instance
ToolRegistry.register(new GrepTool());
