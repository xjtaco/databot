/**
 * Container health check utilities for sandbox execution
 */

import { spawn } from 'child_process';
import logger from '../../utils/logger';

export interface ContainerStatus {
  running: boolean;
  containerId?: string;
  error?: string;
}

/**
 * Check if a Docker container is running
 * @param containerName The name of the container to check
 * @returns ContainerStatus with running state and optional container ID
 */
export async function checkContainerRunning(containerName: string): Promise<ContainerStatus> {
  return new Promise((resolve) => {
    const child = spawn('docker', ['inspect', '-f', '{{.State.Running}}', containerName], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', (err: Error) => {
      logger.error(`Failed to spawn docker inspect: ${err.message}`);
      resolve({
        running: false,
        error: `Docker CLI not available: ${err.message}`,
      });
    });

    child.on('close', (code: number | null) => {
      if (code === 0 && stdout.trim() === 'true') {
        resolve({
          running: true,
          containerId: containerName,
        });
      } else {
        const errorMsg = stderr.trim() || `Container ${containerName} is not running`;
        logger.warn(`Container health check failed: ${errorMsg}`);
        resolve({
          running: false,
          error: errorMsg,
        });
      }
    });
  });
}

/**
 * Check if Docker CLI is available
 * @returns true if docker command is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('docker', ['version', '--format', '{{.Server.Version}}'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.on('error', () => {
      resolve(false);
    });

    child.on('close', (code: number | null) => {
      resolve(code === 0);
    });
  });
}
