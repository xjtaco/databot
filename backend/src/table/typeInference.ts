import { FieldDataType, FieldDataTypeValues } from './table.types';

const SAMPLE_SIZE = 100;
const TYPE_THRESHOLD = 0.8;

const BOOLEAN_VALUES = new Set(['true', 'false', '1', '0', 'yes', 'no', 't', 'f', 'y', 'n']);

const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
  /^\d{4}\/\d{2}\/\d{2}$/, // YYYY/MM/DD
  /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
  /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY or MM/DD/YYYY
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO 8601
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, // YYYY-MM-DD HH:mm:ss
  /^\d{4}年\d{1,2}月\d{1,2}日$/, // Chinese format
];

function isBoolean(value: string): boolean {
  return BOOLEAN_VALUES.has(value.toLowerCase().trim());
}

function isDatetime(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Check against known patterns
  for (const pattern of DATE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  // Try to parse as date
  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) {
    // Make sure it's not just a number
    if (isNaN(Number(trimmed))) {
      return true;
    }
  }

  return false;
}

function isNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Handle numbers with commas as thousand separators
  const normalized = trimmed.replace(/,/g, '');
  const num = Number(normalized);
  return !isNaN(num) && isFinite(num);
}

function inferTypeForValue(value: string): FieldDataType | null {
  const trimmed = value.trim();

  // Skip empty values
  if (!trimmed) return null;

  // Check in order of specificity: boolean -> datetime -> number -> string
  if (isBoolean(trimmed)) {
    return FieldDataTypeValues.BOOLEAN;
  }

  if (isDatetime(trimmed)) {
    return FieldDataTypeValues.DATETIME;
  }

  if (isNumber(trimmed)) {
    return FieldDataTypeValues.NUMBER;
  }

  return FieldDataTypeValues.STRING;
}

export function inferColumnType(values: string[]): FieldDataType {
  // Take sample of values
  const sample = values.slice(0, SAMPLE_SIZE);

  const typeCounts: Record<FieldDataType, number> = {
    [FieldDataTypeValues.STRING]: 0,
    [FieldDataTypeValues.NUMBER]: 0,
    [FieldDataTypeValues.BOOLEAN]: 0,
    [FieldDataTypeValues.DATETIME]: 0,
  };

  let nonEmptyCount = 0;

  for (const value of sample) {
    const type = inferTypeForValue(value);
    if (type !== null) {
      typeCounts[type]++;
      nonEmptyCount++;
    }
  }

  // If all values are empty, default to string
  if (nonEmptyCount === 0) {
    return FieldDataTypeValues.STRING;
  }

  // Find the most common type
  let maxType: FieldDataType = FieldDataTypeValues.STRING;
  let maxCount = 0;

  for (const [type, count] of Object.entries(typeCounts)) {
    if (count > maxCount) {
      maxCount = count;
      maxType = type as FieldDataType;
    }
  }

  // Check if the max type meets the threshold
  const ratio = maxCount / nonEmptyCount;
  if (ratio >= TYPE_THRESHOLD) {
    return maxType;
  }

  // Default to string if no clear winner
  return FieldDataTypeValues.STRING;
}
