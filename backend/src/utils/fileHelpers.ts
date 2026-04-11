import * as fs from 'fs';
import * as path from 'path';

/**
 * Get today's date as a directory name in YYYY-MM-DD format.
 */
export function getTodayDateDir(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get the basename of a file (everything before the last dot).
 */
export function getFileBasename(originalName: string): string {
  const lastDot = originalName.lastIndexOf('.');
  if (lastDot === -1) return originalName;
  return originalName.slice(0, lastDot);
}

/**
 * Get the file extension (including the dot), lowercased.
 */
export function getFileExtension(originalName: string): string {
  const lastDot = originalName.lastIndexOf('.');
  if (lastDot === -1) return '';
  return originalName.slice(lastDot).toLowerCase();
}

/**
 * Find a unique filename in the given directory by appending _1, _2, etc. if needed.
 * Uses synchronous existence checks (suitable for sequential file saves).
 */
export function getUniqueFilename(directory: string, basename: string, extension: string): string {
  let filename = `${basename}${extension}`;
  let counter = 1;

  while (fs.existsSync(path.join(directory, filename))) {
    filename = `${basename}_${counter}${extension}`;
    counter++;
  }

  return filename;
}
