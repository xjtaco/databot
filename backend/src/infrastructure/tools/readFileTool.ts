/**
 * ReadFile Tool for reading text file contents with pagination support
 */

import { promises as fs } from 'fs';
import { Tool, ToolRegistry } from './tools';
import { JSONSchemaObject, ToolParams, ToolResult, ToolName } from './types';
import logger from '../../utils/logger';
import { ToolExecutionError } from '../../errors/types';
import { sanitizeBase64 } from './contentSanitizer';

interface ReadFileResultData {
  content: string;
  path: string;
  offset: number;
  limit: number;
  totalLines: number;
  linesRead: number;
  truncated: boolean;
}

export class ReadFileTool extends Tool {
  /**
   * Default maximum number of lines to read
   */
  private static readonly DEFAULT_LIMIT = 100;

  /**
   * Hard upper bound for lines to read, regardless of requested limit
   */
  private static readonly MAX_LIMIT = 500;

  /**
   * Maximum characters per line; longer lines are truncated with an indicator
   */
  private static readonly MAX_LINE_LENGTH = 500;

  name = ToolName.ReadFile;
  description =
    'Read and return the contents of a specified text file. If the file is large, the content will be truncated. The tool response will clearly indicate whether truncation occurred and provide details on how to use offset and limit parameters to read more file content.';

  parameters: JSONSchemaObject = {
    type: 'object',
    required: ['absolute_path'],
    properties: {
      absolute_path: {
        type: 'string',
        description:
          "Absolute path of the file to read (e.g., '/home/user/project/file.txt'). Relative paths are not supported; an absolute path must be provided.",
      },
      offset: {
        type: 'number',
        description:
          "Optional: 0-based line number (defaults to 0) from which to start reading. Used with 'limit' parameter for paginated reading of large files.",
      },
      limit: {
        type: 'number',
        description:
          "Optional: Maximum number of lines to read (defaults to 100, maximum 500). Used with 'offset' for paginated reading of large files.",
      },
    },
  };

  /**
   * Validate tool parameters
   */
  validate(params: ToolParams): boolean {
    if (
      params.absolute_path === undefined ||
      params.absolute_path === null ||
      typeof params.absolute_path !== 'string'
    ) {
      return false;
    }

    if (params.absolute_path.trim() === '') {
      return false;
    }

    // offset is optional, but if provided it must be a non-negative number
    if (params.offset !== undefined && (typeof params.offset !== 'number' || params.offset < 0)) {
      return false;
    }

    // limit is optional, but if provided it must be a positive number
    if (params.limit !== undefined && (typeof params.limit !== 'number' || params.limit <= 0)) {
      return false;
    }

    return true;
  }

  /**
   * Read the contents of a specified text file with pagination support.
   * @param absolute_path: Absolute path of the file to read
   * @param offset: 0-based line number (defaults to 0)
   * @param limit: Maximum number of lines to read (defaults to 100)
   * @returns File content, including truncation notice if truncated
   * @throws ToolExecutionError if execution fails
   */
  async execute(params: ToolParams): Promise<ToolResult> {
    const absolutePath = params.absolute_path as string;
    const offset = params.offset !== undefined ? (params.offset as number) : 0;
    const limit = Math.min(
      params.limit !== undefined ? (params.limit as number) : ReadFileTool.DEFAULT_LIMIT,
      ReadFileTool.MAX_LIMIT
    );

    // Validate parameters
    if (!this.validate(params)) {
      throw new ToolExecutionError('Invalid parameters');
    }

    try {
      // Check if file exists
      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(absolutePath);
      } catch {
        throw new ToolExecutionError(`File does not exist: ${absolutePath}`);
      }

      // Check if it's a file (not a directory)
      if (!stat.isFile()) {
        throw new ToolExecutionError(`Path is not a file: ${absolutePath}`);
      }

      // Read file content
      const fileContent = await fs.readFile(absolutePath, 'utf-8');

      // Split into lines
      // Handle empty files: if content is empty, we have 0 lines
      // Otherwise, split by newline (handles both LF and CRLF)
      let lines: string[];
      if (fileContent === '') {
        lines = [];
      } else {
        lines = fileContent.split(/\r?\n/);
      }
      const totalLines = lines.length;

      // Validate offset is within range
      if (offset >= totalLines) {
        return {
          success: true,
          data: {
            content: '',
            path: absolutePath,
            offset,
            limit,
            totalLines,
            linesRead: 0,
            truncated: false,
          } as ReadFileResultData,
          metadata: {
            parameters: params,
          },
        };
      }

      // Calculate the range of lines to read
      const endLine = Math.min(offset + limit, totalLines);
      const selectedLines = lines.slice(offset, endLine);

      // Replace long base64 blobs with placeholders before length truncation
      // so that sanitised lines are less likely to exceed MAX_LINE_LENGTH.
      const sanitizedLines = selectedLines.map(sanitizeBase64);

      // Truncate individual long lines to prevent excessive token consumption
      const processedLines = sanitizedLines.map((line) =>
        line.length > ReadFileTool.MAX_LINE_LENGTH
          ? `${line.slice(0, ReadFileTool.MAX_LINE_LENGTH)}... [truncated ${line.length - ReadFileTool.MAX_LINE_LENGTH} chars]`
          : line
      );

      // Join lines back together with newline separators
      const content = processedLines.join('\n');

      // Check if content was truncated
      const truncated = endLine < totalLines;
      const linesRead = selectedLines.length;

      // Build result
      const resultData: ReadFileResultData = {
        content,
        path: absolutePath,
        offset,
        limit,
        totalLines,
        linesRead,
        truncated,
      };

      // If truncated, add truncation notice
      if (truncated) {
        const nextOffset = endLine;
        const truncationNotice =
          `\n\n---\n` +
          `**Important**: File content has been truncated.\n` +
          `Status: Showing lines ${offset + 1}–${endLine} of ${totalLines} total.\n` +
          `Action: To continue reading, use the \`offset\` and \`limit\` parameters in subsequent calls. ` +
          `For example, to read the next portion of the file, use \`offset\`: ${nextOffset}.\n` +
          `--- File Content (Truncated) ---`;

        resultData.content = content + truncationNotice;
      }

      logger.info(
        `ReadFileTool read ${linesRead} line(s) from '${absolutePath}' (offset: ${offset}, limit: ${limit}, total: ${totalLines}, truncated: ${truncated})`
      );

      return {
        success: true,
        data: resultData,
        metadata: {
          parameters: params,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`ReadFileTool execution failed:`, errorMessage);

      if (error instanceof ToolExecutionError) {
        throw error;
      }
      throw new ToolExecutionError(errorMessage, error instanceof Error ? error : undefined);
    }
  }
}

// Register the read file tool instance
ToolRegistry.register(new ReadFileTool());
