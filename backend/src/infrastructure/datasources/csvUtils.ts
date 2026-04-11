import { QueryResult } from './types';

/**
 * Convert query result to CSV format string.
 * Extracted from sqlTool.ts for shared use by workflow SQL executor.
 */
export function queryResultToCSV(result: QueryResult): string {
  const { rows, fields } = result;

  if (rows.length === 0) {
    return fields.map((f) => f.name).join(',') + '\n';
  }

  // Header row
  const headers = fields.map((f) => f.name);
  const csvRows: string[] = [headers.join(',')];

  // Data rows
  for (const row of rows) {
    const values = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) {
        return '';
      }
      const stringValue = String(value);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}
