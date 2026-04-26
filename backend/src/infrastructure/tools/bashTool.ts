/**
 * Bash tool for executing shell commands in Docker sandbox container
 */

import { Tool, ToolRegistry } from './tools';
import { ToolParams, BashResultData, JSONSchemaObject, ToolName, ToolResult } from './types';
import logger from '../../utils/logger';
import { SandboxContainerError, ToolExecutionError } from '../../errors/types';
import { config } from '../../base/config';
import { executeInContainer } from '../sandbox';

/**
 * BashTool - Execute shell commands via docker exec in sandbox container
 * Commands are executed in the configured sandbox container using bash -c
 */
export class BashTool extends Tool {
  name = ToolName.Bash;
  description = `
  This tool executes the given shell command via bash -c <command> in a Docker sandbox container.
  Commands are executed in the foreground only; background processes (using &) are not supported.
  Stdout and stderr output exceeding 2KB will be truncated.
  Returns the following information:
  Command: The command that was executed.
  Directory: The directory where the command was executed, shown as \`(root)\` if it's the root directory.
  Stdout: Standard output stream content, may be \`(empty)\` if no output, \`(truncated)\` suffix if over 2KB.
  Stderr: Standard error stream content, may be \`(empty)\` if no output, \`(truncated)\` suffix if over 2KB.
  Error: Error reported by the execution, \`(none)\` if no error.
  Exit Code: Exit code, \`(none)\` if terminated by signal.
  Signal: Signal number received, \`(none)\` if no signal.
  `;

  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      directory: {
        type: 'string',
        description:
          'Working directory for command execution (optional, defaults to sandbox default workdir)',
      },
      timeout: {
        type: 'integer',
        description: 'Command timeout in seconds (optional, defaults to config sandbox timeout)',
      },
    },
    required: ['command'],
  };

  /**
   * Validate tool parameters
   */
  validate(params: ToolParams): boolean {
    if (
      params.command === undefined ||
      params.command === null ||
      typeof params.command !== 'string'
    ) {
      return false;
    }
    if (params.directory !== undefined && typeof params.directory !== 'string') {
      return false;
    }
    if (
      params.timeout !== undefined &&
      (typeof params.timeout !== 'number' || params.timeout <= 0)
    ) {
      return false;
    }
    return true;
  }

  /**
   * Execute the given shell command in sandbox container.
   * @param params Tool parameters containing command and optional directory
   * @returns ToolResult containing execution results
   * @throws ToolExecutionError if execution fails
   * @throws SandboxContainerError if Docker CLI is not available
   */
  async execute(params: ToolParams): Promise<ToolResult> {
    const command = params.command as string;
    const directory = params.directory as string | undefined;
    // Convert timeout from seconds to milliseconds, fallback to config (already in ms)
    const timeoutMs =
      params.timeout !== undefined ? (params.timeout as number) * 1000 : config.sandbox.timeout;

    // Validate parameters
    if (!this.validate(params)) {
      throw new ToolExecutionError('Invalid parameters');
    }

    const workDir = directory || config.sandbox.defaultWorkDir;

    // Initialize result data structure
    const resultData: BashResultData = {
      command,
      directory: workDir === '/' ? '(root)' : workDir,
      stdout: '',
      stderr: '',
      error: '(none)',
      exitCode: null,
      signal: null,
    };

    // Check if this is a background command (ends with &)
    const isBackground = /&\s*$/.test(command.trim());
    if (isBackground) {
      // Background processes are not supported in sandbox mode
      logger.warn('Background processes are not supported in sandbox mode');
      resultData.stdout = '(background processes not supported in sandbox)';
      resultData.stderr = '(background processes not supported in sandbox)';
      resultData.error = 'Background processes are not supported in sandbox mode';
      return {
        success: false,
        data: resultData,
        metadata: {
          parameters: params,
        },
      };
    }

    try {
      const result = await executeInContainer({
        containerName: config.sandbox.containerName,
        command,
        workDir,
        user: config.sandbox.user,
        timeout: timeoutMs,
      });

      resultData.stdout = result.stdout;
      resultData.stderr = result.stderr;
      resultData.exitCode = result.exitCode;
      resultData.signal = result.signal;

      if (result.error) {
        resultData.error = result.error;
      } else if (!result.success) {
        const stderrPreview = result.stderr ? result.stderr.slice(0, 500) : '(no stderr)';
        resultData.error = `Exit code ${String(result.exitCode ?? 'unknown')}: ${stderrPreview}`;
      }

      return {
        success: result.success,
        data: resultData,
        metadata: {
          parameters: params,
        },
      };
    } catch (error) {
      // Re-throw SandboxContainerError as-is
      if (error instanceof SandboxContainerError) {
        throw error;
      }
      throw new ToolExecutionError(
        `Sandbox execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// Register the bash tool instance
ToolRegistry.register(new BashTool());
