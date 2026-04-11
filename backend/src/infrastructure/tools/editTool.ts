/**
 * Edit Tools for file manipulation and text processing
 */

import { promises as fs } from 'fs';
import { Tool, ToolRegistry } from './tools';
import { JSONSchemaObject, ToolParams, ToolResult, ToolName } from './types';
import logger from '../../utils/logger';
import { ToolExecutionError } from '../../errors/types';
import { validateFilePath } from '../../utils/pathSecurity';

export class EditTool extends Tool {
  name = ToolName.Edit;
  description = `Replace text within a file.
By default, only the first match is replaced, but you can set expected_replacements to replace multiple occurrences at once.
To ensure precise targeting, sufficient context must be provided. Before performing replacement, always use the \`{ToolName.ReadFile}\` tool to view the current file content.
Required parameter specifications:
1. file_path must be an absolute path, otherwise an error will occur.
2. old_string must be the **exact literal** of the text to be replaced (including all spaces, indentation, newlines, and surrounding code).
3. new_string must be the **exact literal** to replace old_string (also including all spaces, indentation, newlines, and surrounding code), ensuring the replaced code is correct and idiomatic.
4. Never escape old_string or new_string, as this would violate the "exact literal" requirement.
5. new_string and old_string cannot be the same, otherwise an error will occur.
**Important**: Failure to meet any of the above will cause the tool to fail.
**Especially critical**: old_string must uniquely identify the section to be modified. Include at least 3 lines of context before and after the target text, and strictly maintain consistent indentation and spacing. If the string matches multiple locations or matches incompletely, the tool will fail.
**Multiple replacements**: Set expected_replacements to the number of replacements you expect. The tool will replace all text exactly matching old_string at once, so ensure the replacement count matches your expectation.`;
  parameters: JSONSchemaObject = {
    properties: {
      file_path: {
        description: "Absolute path of the file to modify, must start with '/'.",
        type: 'string',
      },
      old_string: {
        description:
          'The **exact literal** text to be replaced (do not escape). By default only the first match is replaced. Include at least 3 lines of context before and after the target text, maintaining strict indentation and spacing consistency. Set expected_replacements for multiple replacements. If the string is not an exact literal (e.g., escaped) or matching fails, the tool will error.',
        type: 'string',
      },
      new_string: {
        description:
          'The **exact literal** text to replace `old_string` with (do not escape). Must provide text exactly as expected in the final result, ensuring the replaced code is correct and idiomatic.',
        type: 'string',
      },
      expected_replacements: {
        type: 'number',
        description:
          'Expected number of replacements; defaults to 1 if not specified. Set this parameter when multiple matches need to be replaced at once.',
        minimum: 1,
      },
    },
    required: ['file_path', 'old_string', 'new_string'],
    type: 'object',
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
      params.old_string === undefined ||
      params.old_string === null ||
      typeof params.old_string !== 'string'
    ) {
      return false;
    }
    if (
      params.new_string === undefined ||
      params.new_string === null ||
      typeof params.new_string !== 'string'
    ) {
      return false;
    }
    if (
      params.expected_replacements !== undefined &&
      typeof params.expected_replacements !== 'number'
    ) {
      return false;
    }
    return true;
  }

  /**
   * Replace text content in a specified file.
   * @param file_path: Absolute path of the file to modify
   * @param old_string: The exact literal text to be replaced
   * @param new_string: The exact literal text to replace old_string with
   * @param expected_replacements: Expected number of replacements, defaults to 1
   * @returns Success message including replacement count and file path
   * @throws ToolExecutionError if execution fails
   */
  async execute(params: ToolParams): Promise<ToolResult> {
    const filePath = params.file_path as string;
    const oldString = params.old_string as string;
    const newString = params.new_string as string;
    const expectedReplacements = (params.expected_replacements as number) ?? 1;

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

    // Check if old_string and new_string are the same
    if (oldString === newString) {
      throw new ToolExecutionError('old_string and new_string cannot be the same');
    }

    // Check if old_string is empty
    if (oldString.length === 0) {
      throw new ToolExecutionError('old_string cannot be empty');
    }

    try {
      // Read file content
      let content: string;
      try {
        content = await fs.readFile(normalizedFilePath, 'utf-8');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new ToolExecutionError(
          `Failed to read file: ${errorMessage}`,
          error instanceof Error ? error : undefined
        );
      }

      // Count occurrences of old_string
      const actualReplacements = this.countOccurrences(content, oldString);

      // Verify match count
      if (actualReplacements === 0) {
        throw new ToolExecutionError(
          'old_string not found in file. Please ensure the exact string (including whitespace) is present.'
        );
      }

      if (actualReplacements < expectedReplacements) {
        throw new ToolExecutionError(
          `Expected ${expectedReplacements} replacement(s) but only found ${actualReplacements} occurrence(s) of old_string in the file.`
        );
      }

      // Perform replacement (use split and join to replace all occurrences)
      const newContent = content.split(oldString).join(newString);

      // Write back to file
      try {
        await fs.writeFile(normalizedFilePath, newContent, 'utf-8');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new ToolExecutionError(
          `Failed to write file: ${errorMessage}`,
          error instanceof Error ? error : undefined
        );
      }

      logger.info(
        `Successfully replaced ${actualReplacements} occurrence(s) in file: ${normalizedFilePath}`
      );

      return {
        success: true,
        data: `Successfully replaced ${actualReplacements} occurrence(s) in file: ${normalizedFilePath}`,
        metadata: {
          parameters: params,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`EditTool execution failed:`, errorMessage);
      if (error instanceof ToolExecutionError) {
        throw error;
      }
      throw new ToolExecutionError(errorMessage, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Count occurrences of a substring in a string
   * Note: This counts overlapping occurrences, which is the desired behavior
   * for exact string matching
   */
  private countOccurrences(content: string, search: string): number {
    if (search.length === 0) {
      return 0;
    }

    let count = 0;
    let position = 0;

    while ((position = content.indexOf(search, position)) !== -1) {
      count++;
      position += search.length;
    }

    return count;
  }
}

// Register the edit tool instance
ToolRegistry.register(new EditTool());
