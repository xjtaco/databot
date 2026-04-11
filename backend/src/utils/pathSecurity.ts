/**
 * Path Security Utilities
 * Provides validation functions to ensure file paths are within allowed boundaries
 */

import { resolve, normalize } from 'path';
import { config } from '../base/config';

/**
 * Patterns that are forbidden in file paths for security reasons
 */
const FORBIDDEN_PATH_PATTERNS = ['..', '/etc/', '/sys/', '/proc/', '/dev/', '/boot/'];

/**
 * Result of path validation
 */
export interface PathValidationResult {
  valid: boolean;
  normalizedPath: string;
  error?: string;
}

/**
 * Check if a file path contains any forbidden patterns
 * @param filePath - The file path to check
 * @returns true if the path contains a forbidden pattern
 */
export function containsForbiddenPattern(filePath: string): boolean {
  return FORBIDDEN_PATH_PATTERNS.some((pattern) => filePath.includes(pattern));
}

/**
 * Check if a path is within the specified work folder
 * Uses proper path normalization to prevent path traversal attacks
 * @param filePath - The file path to check (should be normalized)
 * @param workFolder - The work folder boundary
 * @returns true if the path is within the work folder
 */
export function isPathWithinWorkFolder(filePath: string, workFolder: string): boolean {
  const normalizedPath = normalize(resolve(filePath));
  const normalizedWorkFolder = normalize(resolve(workFolder));

  // Ensure work folder path ends with separator for proper prefix matching
  // This prevents /app/workfolder-malicious from matching /app/workfolder
  const workFolderWithSep = normalizedWorkFolder.endsWith('/')
    ? normalizedWorkFolder
    : normalizedWorkFolder + '/';

  return normalizedPath === normalizedWorkFolder || normalizedPath.startsWith(workFolderWithSep);
}

/**
 * Validate a file path for security
 * Checks:
 * 1. Path must be absolute (starts with /)
 * 2. Path must not contain forbidden patterns (before normalization)
 * 3. Path must be within the work folder (after normalization)
 *
 * @param filePath - The file path to validate
 * @param workFolder - The work folder boundary (defaults to config.work_folder)
 * @returns Validation result with normalized path if valid
 */
export function validateFilePath(
  filePath: string,
  workFolder: string = config.work_folder
): PathValidationResult {
  // 1. Check absolute path
  if (!filePath.startsWith('/')) {
    return {
      valid: false,
      normalizedPath: filePath,
      error: 'file_path must be an absolute path starting with "/"',
    };
  }

  // 2. Check for forbidden patterns (on original path before normalization)
  if (containsForbiddenPattern(filePath)) {
    return {
      valid: false,
      normalizedPath: filePath,
      error: `File path contains forbidden pattern. Paths cannot contain '..', '/etc/', '/sys/', '/proc/', '/dev/', or '/boot/'`,
    };
  }

  // 3. Normalize path and check if within work folder
  const normalizedPath = normalize(resolve(filePath));

  if (!isPathWithinWorkFolder(normalizedPath, workFolder)) {
    return {
      valid: false,
      normalizedPath,
      error: `File path must be within the work folder: ${workFolder}`,
    };
  }

  return {
    valid: true,
    normalizedPath,
  };
}
