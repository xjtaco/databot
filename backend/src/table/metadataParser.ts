import * as XLSX from 'xlsx';
import * as iconv from 'iconv-lite';
import * as jschardet from 'jschardet';
import {
  ParsedTableMetadata,
  ParsedColumnMetadata,
  TableSourceType,
  TableSourceTypeValues,
} from './table.types';
import { inferColumnType } from './typeInference';
import { MetadataParseError } from '../errors/types';
import logger from '../utils/logger';

/**
 * Detect encoding and convert buffer to UTF-8 string for CSV files.
 * Chinese CSV files often use GBK/GB2312 encoding especially when created on Windows.
 */
export function convertToUtf8(buffer: Buffer): string {
  const detected = jschardet.detect(buffer);
  const encoding = detected.encoding || 'utf-8';

  logger.debug('CSV encoding detected', {
    encoding,
    confidence: detected.confidence,
  });

  // Common Chinese encodings that iconv-lite supports
  const normalizedEncoding = encoding.toLowerCase().replace(/-/g, '');

  // Map common encoding names
  let iconvEncoding = encoding;
  if (
    normalizedEncoding === 'gb2312' ||
    normalizedEncoding === 'gbk' ||
    normalizedEncoding === 'gb18030'
  ) {
    iconvEncoding = 'gbk';
  } else if (normalizedEncoding === 'big5') {
    iconvEncoding = 'big5';
  } else if (normalizedEncoding === 'shiftjis' || normalizedEncoding === 'sjis') {
    iconvEncoding = 'shift_jis';
  }

  if (iconv.encodingExists(iconvEncoding)) {
    return iconv.decode(buffer, iconvEncoding);
  }

  // Fallback to UTF-8
  return buffer.toString('utf-8');
}

function sanitizeName(name: string): string {
  // Keep letters, numbers, underscores, and Chinese characters
  return name
    .replace(/[^\w\u4e00-\u9fff]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function getFileBasename(originalName: string): string {
  const lastDot = originalName.lastIndexOf('.');
  if (lastDot === -1) return originalName;
  return originalName.slice(0, lastDot);
}

function extractColumnValues(data: unknown[][], columnIndex: number): string[] {
  const values: string[] = [];
  // Skip header row (index 0), take up to 100 data rows
  for (let i = 1; i < Math.min(data.length, 101); i++) {
    const row = data[i];
    if (row && row[columnIndex] !== undefined && row[columnIndex] !== null) {
      values.push(String(row[columnIndex]));
    }
  }
  return values;
}

function parseSheetMetadata(
  data: unknown[][],
  displayName: string,
  physicalName: string,
  type: TableSourceType,
  dataFilePath: string
): ParsedTableMetadata | null {
  if (data.length === 0) {
    return null;
  }

  const headerRow = data[0] as (string | number | undefined)[];
  if (!headerRow || headerRow.length === 0) {
    return null;
  }

  const columns: ParsedColumnMetadata[] = [];
  const usedPhysicalNames = new Set<string>();

  for (let i = 0; i < headerRow.length; i++) {
    const headerValue = headerRow[i];
    if (headerValue === undefined || headerValue === null || String(headerValue).trim() === '') {
      continue;
    }

    const columnName = String(headerValue).trim();
    let physicalColumnName = sanitizeName(columnName) || `column_${i + 1}`;

    // Ensure unique physical name within the table
    if (usedPhysicalNames.has(physicalColumnName)) {
      let counter = 1;
      let uniqueName = `${physicalColumnName}_${counter}`;
      while (usedPhysicalNames.has(uniqueName)) {
        counter++;
        uniqueName = `${physicalColumnName}_${counter}`;
      }
      physicalColumnName = uniqueName;
    }
    usedPhysicalNames.add(physicalColumnName);

    const columnValues = extractColumnValues(data, i);
    const dataType = inferColumnType(columnValues);

    columns.push({
      displayName: columnName,
      physicalName: physicalColumnName,
      dataType,
      columnOrder: i,
    });
  }

  if (columns.length === 0) {
    return null;
  }

  return {
    displayName,
    physicalName,
    type,
    dataFilePath,
    columns,
  };
}

export function parseCsvMetadata(
  buffer: Buffer,
  originalName: string,
  savedFileName: string,
  directory: string
): ParsedTableMetadata {
  try {
    // Convert buffer to UTF-8 string with proper encoding detection
    const csvContent = convertToUtf8(buffer);
    const workbook = XLSX.read(csvContent, { type: 'string' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

    const basename = getFileBasename(originalName);
    const displayName = basename;
    const physicalName = sanitizeName(basename) || 'table';
    const dataFilePath = `${directory}/${savedFileName}`;

    const metadata = parseSheetMetadata(
      data,
      displayName,
      physicalName,
      TableSourceTypeValues.CSV,
      dataFilePath
    );

    if (!metadata) {
      throw new MetadataParseError('CSV file has no valid data', { originalName });
    }

    logger.info('CSV metadata parsed', {
      originalName,
      physicalName: metadata.physicalName,
      columnCount: metadata.columns.length,
    });

    return metadata;
  } catch (error) {
    if (error instanceof MetadataParseError) {
      throw error;
    }
    throw new MetadataParseError(
      'Failed to parse CSV metadata',
      { originalName },
      error instanceof Error ? error : undefined
    );
  }
}

export function parseExcelMetadata(
  buffer: Buffer,
  originalName: string,
  savedFiles: string[],
  directory: string
): ParsedTableMetadata[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const basename = getFileBasename(originalName);
    const results: ParsedTableMetadata[] = [];

    for (let i = 0; i < workbook.SheetNames.length; i++) {
      const sheetName = workbook.SheetNames[i];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

      const sanitizedSheetName = sanitizeName(sheetName);
      const displayName = `${basename}_${sheetName}`;
      const generatedPhysicalName = `${sanitizeName(basename)}_${sanitizedSheetName}`;
      const physicalName = generatedPhysicalName || `table_${i}`;

      // Find the corresponding saved file
      const savedFileName = savedFiles[i];
      if (!savedFileName) {
        continue;
      }

      const dataFilePath = `${directory}/${savedFileName}`;
      const metadata = parseSheetMetadata(
        data,
        displayName,
        physicalName,
        TableSourceTypeValues.EXCEL,
        dataFilePath
      );

      if (metadata) {
        results.push(metadata);
      }
    }

    if (results.length === 0) {
      throw new MetadataParseError('Excel file has no valid sheets', { originalName });
    }

    logger.info('Excel metadata parsed', {
      originalName,
      sheetCount: results.length,
    });

    return results;
  } catch (error) {
    if (error instanceof MetadataParseError) {
      throw error;
    }
    throw new MetadataParseError(
      'Failed to parse Excel metadata',
      { originalName },
      error instanceof Error ? error : undefined
    );
  }
}

export function parseFileMetadata(
  buffer: Buffer,
  originalName: string,
  savedFiles: string[],
  directory: string
): ParsedTableMetadata[] {
  const extension = originalName.slice(originalName.lastIndexOf('.')).toLowerCase();

  if (extension === '.csv') {
    const metadata = parseCsvMetadata(buffer, originalName, savedFiles[0], directory);
    return [metadata];
  } else if (extension === '.xls' || extension === '.xlsx') {
    return parseExcelMetadata(buffer, originalName, savedFiles, directory);
  }

  throw new MetadataParseError(`Unsupported file type: ${extension}`, { originalName });
}

/**
 * Parse CSV metadata in memory without requiring saved file info.
 * Returns metadata with empty dataFilePath (to be filled in during confirm).
 */
function parseCsvMetadataInMemory(buffer: Buffer, originalName: string): ParsedTableMetadata {
  try {
    const csvContent = convertToUtf8(buffer);
    const workbook = XLSX.read(csvContent, { type: 'string' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

    const basename = getFileBasename(originalName);
    const displayName = basename;
    const physicalName = sanitizeName(basename) || 'table';

    const metadata = parseSheetMetadata(
      data,
      displayName,
      physicalName,
      TableSourceTypeValues.CSV,
      '' // dataFilePath will be filled in during confirm
    );

    if (!metadata) {
      throw new MetadataParseError('CSV file has no valid data', { originalName });
    }

    logger.info('CSV metadata parsed in memory', {
      originalName,
      physicalName: metadata.physicalName,
      columnCount: metadata.columns.length,
    });

    return metadata;
  } catch (error) {
    if (error instanceof MetadataParseError) {
      throw error;
    }
    throw new MetadataParseError(
      'Failed to parse CSV metadata',
      { originalName },
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Parse Excel metadata in memory without requiring saved file info.
 * Returns metadata with empty dataFilePath (to be filled in during confirm).
 */
function parseExcelMetadataInMemory(buffer: Buffer, originalName: string): ParsedTableMetadata[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const basename = getFileBasename(originalName);
    const results: ParsedTableMetadata[] = [];

    for (let i = 0; i < workbook.SheetNames.length; i++) {
      const sheetName = workbook.SheetNames[i];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

      const sanitizedSheetName = sanitizeName(sheetName);
      const displayName = `${basename}_${sheetName}`;
      const generatedPhysicalName = `${sanitizeName(basename)}_${sanitizedSheetName}`;
      const physicalName = generatedPhysicalName || `table_${i}`;

      const metadata = parseSheetMetadata(
        data,
        displayName,
        physicalName,
        TableSourceTypeValues.EXCEL,
        '' // dataFilePath will be filled in during confirm
      );

      if (metadata) {
        results.push(metadata);
      }
    }

    if (results.length === 0) {
      throw new MetadataParseError('Excel file has no valid sheets', { originalName });
    }

    logger.info('Excel metadata parsed in memory', {
      originalName,
      sheetCount: results.length,
    });

    return results;
  } catch (error) {
    if (error instanceof MetadataParseError) {
      throw error;
    }
    throw new MetadataParseError(
      'Failed to parse Excel metadata',
      { originalName },
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Parse file metadata in memory without saving files.
 * Used for the parse step where we only need metadata preview.
 */
export function parseFileMetadataInMemory(
  buffer: Buffer,
  originalName: string
): ParsedTableMetadata[] {
  const extension = originalName.slice(originalName.lastIndexOf('.')).toLowerCase();

  if (extension === '.csv') {
    const metadata = parseCsvMetadataInMemory(buffer, originalName);
    return [metadata];
  } else if (extension === '.xls' || extension === '.xlsx') {
    return parseExcelMetadataInMemory(buffer, originalName);
  }

  throw new MetadataParseError(`Unsupported file type: ${extension}`, { originalName });
}
