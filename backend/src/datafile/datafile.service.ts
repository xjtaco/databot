import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { config } from '../base/config';
import { FileUploadError } from '../errors/types';
import logger from '../utils/logger';
import {
  getTodayDateDir,
  ensureDirectoryExists,
  getUniqueFilename,
  getFileBasename,
  getFileExtension,
} from '../utils/fileHelpers';

export interface UploadResult {
  originalName: string;
  savedFiles: string[];
  directory: string;
}

async function saveCsvFile(
  buffer: Buffer,
  originalName: string,
  directory: string
): Promise<string> {
  const basename = getFileBasename(originalName);
  const filename = getUniqueFilename(directory, basename, '.csv');
  const filePath = path.join(directory, filename);

  await fs.promises.writeFile(filePath, buffer);
  logger.info('CSV file saved', { filename, directory });

  return filename;
}

async function saveExcelFile(
  buffer: Buffer,
  originalName: string,
  directory: string
): Promise<string[]> {
  const savedFiles: string[] = [];
  const basename = getFileBasename(originalName);

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];

      // Check if sheet has any data - skip empty sheets to match metadata parsing behavior
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
      if (data.length === 0) {
        logger.debug('Skipping empty Excel sheet', { sheetName });
        continue;
      }

      // Check if sheet has valid header row
      const headerRow = data[0] as (string | number | undefined)[];
      if (!headerRow || headerRow.length === 0) {
        logger.debug('Skipping Excel sheet with no header', { sheetName });
        continue;
      }

      // Check if sheet has at least one non-empty column header
      const hasValidColumn = headerRow.some(
        (cell) => cell !== undefined && cell !== null && String(cell).trim() !== ''
      );
      if (!hasValidColumn) {
        logger.debug('Skipping Excel sheet with empty headers', { sheetName });
        continue;
      }

      const csvContent = XLSX.utils.sheet_to_csv(worksheet);

      // Only remove filesystem-unsafe characters, preserve Unicode (Chinese, etc.)
      const sanitizedSheetName = sheetName.replace(/[/\\:*?"<>|]/g, '_').trim();
      const sheetBasename = `${basename}_${sanitizedSheetName}`;
      const filename = getUniqueFilename(directory, sheetBasename, '.csv');
      const filePath = path.join(directory, filename);

      await fs.promises.writeFile(filePath, csvContent, 'utf-8');
      savedFiles.push(filename);

      logger.info('Excel sheet saved as CSV', { sheetName, filename, directory });
    }
  } catch (error) {
    throw new FileUploadError(
      'Failed to parse Excel file',
      { originalName },
      error instanceof Error ? error : undefined
    );
  }

  return savedFiles;
}

export async function processUploadedFile(
  buffer: Buffer,
  originalName: string
): Promise<UploadResult> {
  const directory = path.join(config.upload.directory, getTodayDateDir());
  ensureDirectoryExists(directory);

  const extension = getFileExtension(originalName);
  let savedFiles: string[];

  if (extension === '.csv') {
    const filename = await saveCsvFile(buffer, originalName, directory);
    savedFiles = [filename];
  } else if (extension === '.xls' || extension === '.xlsx') {
    savedFiles = await saveExcelFile(buffer, originalName, directory);
  } else {
    throw new FileUploadError(`Unsupported file extension: ${extension}`, { originalName });
  }

  const relativePath = path.relative(config.upload.directory, directory);

  return {
    originalName,
    savedFiles,
    directory: relativePath,
  };
}

export async function deleteUploadedFiles(directory: string, savedFiles: string[]): Promise<void> {
  const absoluteDirectory = path.join(config.upload.directory, directory);

  for (const filename of savedFiles) {
    const filePath = path.join(absoluteDirectory, filename);
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        logger.info('Deleted uploaded file', { filename, directory });
      }
    } catch (error) {
      logger.warn('Failed to delete file', { filename, error });
    }
  }

  // Try to remove directory if empty
  try {
    const files = await fs.promises.readdir(absoluteDirectory);
    if (files.length === 0) {
      await fs.promises.rmdir(absoluteDirectory);
      logger.info('Removed empty directory', { directory });
    }
  } catch {
    // Directory might not exist or not empty, ignore
  }
}
