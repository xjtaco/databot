/**
 * Docker exec wrapper for executing commands in sandbox containers
 */

import { spawn, ChildProcess } from 'child_process';
import logger from '../../utils/logger';
import { SandboxContainerError } from '../../errors/types';
import { checkContainerRunning, isDockerAvailable } from './containerHealthCheck';

/** Maximum output size in bytes (2KB) */
const MAX_OUTPUT_BYTES = 2048;

/**
 * Truncate output if it exceeds the maximum size
 * @param output The output string to truncate
 * @returns Truncated output with suffix if needed
 */
function truncateOutput(output: string): string {
  if (!output || output === '(empty)') {
    return output;
  }

  const bytes = Buffer.byteLength(output, 'utf8');
  if (bytes <= MAX_OUTPUT_BYTES) {
    return output;
  }

  // Truncate by bytes, not characters
  const buffer = Buffer.from(output, 'utf8');
  const truncated = buffer.subarray(0, MAX_OUTPUT_BYTES).toString('utf8');
  return truncated + '\n...(truncated)';
}

export interface DockerExecOptions {
  containerName: string;
  command: string;
  workDir: string;
  user: string;
  timeout: number;
}

export interface DockerExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  error?: string;
  timedOut?: boolean;
}

/**
 * Execute a command inside a Docker container using docker exec
 * @param options Docker execution options
 * @returns Execution result with stdout, stderr, exit code, and signal
 * @throws SandboxContainerError if Docker CLI is not available
 */
export async function executeInContainer(options: DockerExecOptions): Promise<DockerExecResult> {
  const { containerName, command, workDir, user, timeout } = options;

  // Check if Docker is available
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    throw new SandboxContainerError('Docker CLI is not available');
  }

  // Check if the container is running
  const containerStatus = await checkContainerRunning(containerName);
  if (!containerStatus.running) {
    return {
      success: false,
      stdout: '(empty)',
      stderr: containerStatus.error || `Container ${containerName} is not running`,
      exitCode: null,
      signal: null,
      error: containerStatus.error || `Container ${containerName} is not running`,
    };
  }

  return new Promise((resolve, reject) => {
    // Build docker exec command arguments
    const args = ['exec', '-w', workDir, '-u', user, containerName, 'bash', '-c', command];

    logger.debug(`Executing in container: docker ${args.join(' ')}`);

    const child: ChildProcess = spawn('docker', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    // Collect stdout
    if (child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
    }

    // Collect stderr
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }

    // Handle spawn errors
    child.on('error', (err: Error) => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      reject(new SandboxContainerError(`Failed to spawn docker exec: ${err.message}`));
    });

    // Set timeout
    timeoutId = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
        logger.warn(`Docker exec timed out after ${timeout}ms, command: ${command}`);
      } catch (err) {
        logger.debug(`Failed to kill docker exec process: ${String(err)}`);
      }
    }, timeout);

    child.on('close', (code: number | null, signal: string | null) => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      if (timedOut) {
        resolve({
          success: false,
          stdout: truncateOutput(stdout || '(empty)'),
          stderr: truncateOutput(stderr || '(empty)'),
          exitCode: null,
          signal: 'SIGTERM',
          error: `Command timed out after ${timeout}ms`,
          timedOut: true,
        });
      } else {
        resolve({
          success: code === 0,
          stdout: truncateOutput(stdout || '(empty)'),
          stderr: truncateOutput(stderr || '(empty)'),
          exitCode: code,
          signal: signal,
        });
      }
    });
  });
}
