import { Base64Summary, summarizeBase64String } from './contentSanitizer';

const DEFAULT_TEXT_LIMIT = 500;
const DEFAULT_TEXT_PREVIEW = 160;
const DEFAULT_ARRAY_LIMIT = 5;

type SanitizedPrimitive = string | number | boolean | null;

type SanitizedValue =
  | SanitizedPrimitive
  | SanitizedValue[]
  | {
      [key: string]: SanitizedValue | SummaryEnvelope;
    };

interface SummaryEnvelope {
  _summary: TextSummary | Base64Summary | ArraySummary;
  items?: SanitizedValue[];
}

interface TextSummary {
  kind: 'text';
  chars: number;
  preview: string;
}

interface ArraySummary {
  kind: 'array';
  totalItems: number;
  keptItems: number;
}

interface RootSanitizedInfo {
  applied: true;
  reasons: string[];
}

function summarizeText(value: string): SummaryEnvelope {
  return {
    _summary: {
      kind: 'text',
      chars: value.length,
      preview: value.slice(0, DEFAULT_TEXT_PREVIEW),
    },
  };
}

function summarizeArray(
  items: unknown[],
  visit: (value: unknown) => SanitizedValue,
  reasons: Set<string>
): SummaryEnvelope {
  reasons.add('array_truncated');

  return {
    _summary: {
      kind: 'array',
      totalItems: items.length,
      keptItems: DEFAULT_ARRAY_LIMIT,
    },
    items: items.slice(0, DEFAULT_ARRAY_LIMIT).map((item) => visit(item)),
  };
}

function visit(value: unknown, reasons: Set<string>): SanitizedValue | SummaryEnvelope {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const base64Summary = summarizeBase64String(value);
    if (base64Summary) {
      reasons.add('base64');
      return { _summary: base64Summary };
    }

    if (value.length > DEFAULT_TEXT_LIMIT) {
      reasons.add('large_text');
      return summarizeText(value);
    }

    return value;
  }

  if (typeof value !== 'object') {
    return value as number | boolean;
  }

  if (Array.isArray(value)) {
    if (value.length <= DEFAULT_ARRAY_LIMIT) {
      return value.map((item) => visit(item, reasons));
    }

    return summarizeArray(value, (item) => visit(item, reasons), reasons);
  }

  const output: Record<string, SanitizedValue | SummaryEnvelope> = {};

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const sanitized = visit(nested, reasons);
    output[key] = sanitized;
  }

  return output;
}

export function sanitizeForLlm(value: unknown): unknown {
  const reasons = new Set<string>();
  const sanitized = visit(value, reasons);
  const isRootObject = value !== null && typeof value === 'object' && !Array.isArray(value);

  if (
    reasons.size === 0 ||
    sanitized === null ||
    typeof sanitized !== 'object' ||
    Array.isArray(sanitized) ||
    !isRootObject
  ) {
    return sanitized;
  }

  return {
    _sanitized: {
      applied: true,
      reasons: Array.from(reasons),
    } satisfies RootSanitizedInfo,
    ...(sanitized as Record<string, unknown>),
  };
}
