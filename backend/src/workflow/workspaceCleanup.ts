import { promises as fs } from 'fs';
import { join } from 'path';
import { config as appConfig } from '../base/config';
import logger from '../utils/logger';

const WORKFLOW_DIR_PREFIX = 'wf_';

/**
 * Clean up old workflow workspace folders.
 * Only removes directories with the workflow prefix (wf_*) older than 30 days.
 */
export async function cleanupWorkspaces(): Promise<void> {
  const workFolder = appConfig.work_folder;

  try {
    await fs.access(workFolder);
  } catch {
    return; // Work folder doesn't exist yet
  }

  const cutoff = Date.now() - appConfig.workspaceCleanup.maxAgeMs;
  let cleaned = 0;

  try {
    const entries = await fs.readdir(workFolder, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith(WORKFLOW_DIR_PREFIX)) continue;

      const dirPath = join(workFolder, entry.name);
      try {
        const stat = await fs.stat(dirPath);
        if (stat.mtimeMs < cutoff) {
          await fs.rm(dirPath, { recursive: true, force: true });
          cleaned++;
        }
      } catch (err) {
        logger.warn('Failed to clean workspace directory', {
          path: dirPath,
          error: String(err),
        });
      }
    }

    if (cleaned > 0) {
      logger.info('Workspace cleanup completed', { removedCount: cleaned });
    }
  } catch (err) {
    logger.error('Workspace cleanup failed', { error: String(err) });
  }
}

let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic workspace cleanup.
 * Should be called once at server startup.
 */
export function startWorkspaceCleanup(): void {
  // Run once at startup (delayed slightly to not block boot)
  cleanupTimeout = setTimeout(() => {
    cleanupWorkspaces().catch((err) => {
      logger.error('Initial workspace cleanup failed', { error: String(err) });
    });
  }, 5000);

  // Run periodically
  const intervalMs = appConfig.workspaceCleanup.intervalMs;
  cleanupInterval = setInterval(() => {
    cleanupWorkspaces().catch((err) => {
      logger.error('Periodic workspace cleanup failed', { error: String(err) });
    });
  }, intervalMs);

  logger.info('Workspace cleanup scheduled', {
    intervalHours: intervalMs / (60 * 60 * 1000),
    retentionDays: appConfig.workspaceCleanup.maxAgeMs / (24 * 60 * 60 * 1000),
  });
}

/**
 * Stop periodic workspace cleanup.
 * Should be called during graceful shutdown.
 */
export function stopWorkspaceCleanup(): void {
  if (cleanupTimeout) {
    clearTimeout(cleanupTimeout);
    cleanupTimeout = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
