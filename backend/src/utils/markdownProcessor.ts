/**
 * Shared markdown processing utilities for file-to-markdown conversion.
 * Used by OutputMdTool and the markdown node executor.
 */

import path from 'path';
import { ToolExecutionError } from '../errors/types';

/** Maximum file size for replacement (5MB) */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Regex pattern for extracting file placeholders from markdown content */
export const PLACEHOLDER_REGEX = /<!--\s*\{([^}]+)\}\s*-->/g;

/** Supported image extensions and their MIME types */
const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

/** Forbidden path patterns for security */
const FORBIDDEN_PATH_PATTERNS = ['..', '/etc/', '/sys/', '/proc/'];

/** Valid Plotly trace types */
const VALID_PLOTLY_TRACE_TYPES = new Set([
  'scatter',
  'bar',
  'pie',
  'heatmap',
  'histogram',
  'box',
  'violin',
  'scatter3d',
  'surface',
  'choropleth',
  'scattergeo',
  'sunburst',
  'treemap',
  'funnel',
  'waterfall',
  'indicator',
  'table',
  'scatterpolar',
  'barpolar',
  'candlestick',
  'ohlc',
  'sankey',
  'parcoords',
  'parcats',
  'carpet',
  'contour',
  'densitymapbox',
  'scattermapbox',
  'choroplethmapbox',
  'icicle',
]);

interface PlotlyTrace {
  type?: string;
  [key: string]: unknown;
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

/**
 * Convert CSV string content to a GitHub-flavored Markdown table.
 * Returns an empty string for empty input.
 */
export function csvToMarkdownTable(csvContent: string): string {
  const lines = csvContent.trim().split('\n');

  if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
    return '';
  }

  const rows = lines.map((line) => parseCSVLine(line));

  if (rows.length === 0 || rows[0].length === 0) {
    return '';
  }

  const headers = rows[0];
  const separator = headers.map(() => '---');
  const dataRows = rows.slice(1);

  const tableLines = [
    `| ${headers.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...dataRows.map((row) => `| ${row.join(' | ')} |`),
  ];

  return tableLines.join('\n');
}

/**
 * Validate a Plotly JSON string.
 * Returns true if the JSON represents a valid Plotly figure, false otherwise.
 */
export function validatePlotlyJson(json: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return false;
  }

  const figure = parsed as Record<string, unknown>;

  if (!('data' in figure) || !Array.isArray(figure.data)) {
    return false;
  }
  if (figure.data.length === 0) {
    return false;
  }

  for (let i = 0; i < figure.data.length; i++) {
    const trace = figure.data[i] as PlotlyTrace;
    if (!trace || typeof trace !== 'object' || Array.isArray(trace)) {
      return false;
    }
    if (trace.type !== undefined) {
      if (typeof trace.type !== 'string' || !VALID_PLOTLY_TRACE_TYPES.has(trace.type)) {
        return false;
      }
    }
  }

  if ('layout' in figure && figure.layout !== undefined) {
    if (typeof figure.layout !== 'object' || Array.isArray(figure.layout)) {
      return false;
    }
  }

  return true;
}

/**
 * Convert a Buffer containing a validated Plotly JSON to a fenced code block.
 * Throws ToolExecutionError if the content is not valid Plotly JSON.
 */
function plotlyBufferToCodeBlock(content: Buffer): string {
  const jsonStr = content.toString('utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new ToolExecutionError('File is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ToolExecutionError('Plotly JSON must be an object');
  }

  const figure = parsed as Record<string, unknown>;

  if (!('data' in figure) || !Array.isArray(figure.data)) {
    throw new ToolExecutionError('Plotly JSON missing required "data" array');
  }
  if (figure.data.length === 0) {
    throw new ToolExecutionError('Plotly JSON "data" array must not be empty');
  }

  for (let i = 0; i < figure.data.length; i++) {
    const trace = figure.data[i] as PlotlyTrace;
    if (!trace || typeof trace !== 'object' || Array.isArray(trace)) {
      throw new ToolExecutionError(`Plotly data[${i}] must be an object`);
    }
    if (trace.type !== undefined) {
      if (typeof trace.type !== 'string' || !VALID_PLOTLY_TRACE_TYPES.has(trace.type)) {
        throw new ToolExecutionError(
          `Plotly data[${i}].type "${String(trace.type)}" is not a valid Plotly trace type`
        );
      }
    }
  }

  if ('layout' in figure && figure.layout !== undefined) {
    if (typeof figure.layout !== 'object' || Array.isArray(figure.layout)) {
      throw new ToolExecutionError('Plotly JSON "layout" must be an object');
    }
  }

  return '```plotly\n' + jsonStr + '\n```';
}

/**
 * Convert an image file Buffer to a base64 data URI Markdown image tag.
 */
export function imageToBase64DataUri(content: Buffer, filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = IMAGE_MIME_TYPES[ext] ?? 'application/octet-stream';
  const base64 = content.toString('base64');
  return `![image](data:${mimeType};base64,${base64})`;
}

/**
 * Validate a file path against forbidden patterns and size limits.
 * Throws ToolExecutionError if the path is forbidden.
 */
export function validateFilePath(filePath: string): void {
  const hasForbiddenPattern = FORBIDDEN_PATH_PATTERNS.some((pattern) => filePath.includes(pattern));
  if (hasForbiddenPattern) {
    throw new ToolExecutionError(
      `File path contains forbidden pattern: ${filePath}. Paths cannot contain '..', '/etc/', '/sys/', or '/proc/'`
    );
  }
}

/**
 * Get the file processor for a given file path based on extension.
 * Returns null for unsupported file types.
 */
function getFileProcessor(filePath: string): ((content: Buffer, fp: string) => string) | null {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.csv') {
    return (content: Buffer) => csvToMarkdownTable(content.toString('utf-8'));
  }

  if (ext === '.json') {
    return (content: Buffer) => plotlyBufferToCodeBlock(content);
  }

  if (IMAGE_MIME_TYPES[ext] !== undefined) {
    return imageToBase64DataUri;
  }

  return null;
}

/**
 * Extract file paths from <!-- {/path/to/file} --> placeholders in content.
 */
export function extractPlaceholders(content: string): string[] {
  const placeholders: string[] = [];
  // Reset lastIndex since PLACEHOLDER_REGEX is module-level with /g flag
  const regex = /<!--\s*\{([^}]+)\}\s*-->/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    placeholders.push(match[1].trim());
  }
  return placeholders;
}

/**
 * Process file placeholders in markdown content synchronously.
 *
 * Accepts either a Map of file path → Buffer (performs in-memory replacement)
 * or a plain string array (no replacement, returns content unchanged).
 *
 * For each entry in a Map, if the content has a matching placeholder
 * `<!-- {filePath} -->`, it is replaced with the processed output for that
 * file type (CSV → table, JSON → plotly block, image → base64 data URI).
 * Files with unsupported extensions are left as-is (placeholder not replaced).
 *
 * @param content - Markdown string that may contain file placeholders
 * @param filesOrMap - Map of file path → Buffer, or array of file paths (no-op)
 * @returns Markdown string with placeholders replaced
 */
export function processFilePlaceholders(
  content: string,
  filesOrMap: string[] | Map<string, Buffer>
): string {
  // Array form: no Buffer content provided, nothing to replace
  if (Array.isArray(filesOrMap)) {
    return content;
  }

  let processedContent = content;

  for (const [filePath, fileBuffer] of filesOrMap) {
    const processor = getFileProcessor(filePath);
    if (!processor) {
      continue;
    }

    const replacement = processor(fileBuffer, filePath);
    const escapedPath = filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const placeholderRegex = new RegExp(`<!--\\s*\\{${escapedPath}\\}\\s*-->`, 'g');
    processedContent = processedContent.replace(placeholderRegex, replacement);
  }

  return processedContent;
}
