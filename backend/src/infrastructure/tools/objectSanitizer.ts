import { Base64Summary, summarizeBase64String } from './contentSanitizer';

const DEFAULT_TEXT_LIMIT = 500;
const DEFAULT_TEXT_PREVIEW = 160;
const DEFAULT_ARRAY_LIMIT = 5;
const DEFAULT_MAX_DEPTH = 8;

type SanitizationReason =
  | 'large_text'
  | 'base64'
  | 'array_truncated'
  | 'non_plain_object'
  | 'unsupported_value'
  | 'circular_reference'
  | 'max_depth';

export interface SanitizedTextSummary {
  kind: 'text';
  chars: number;
  preview: string;
}

export interface SanitizedArraySummary {
  kind: 'array';
  totalItems: number;
  keptItems: number;
}

export interface SanitizedUnsupportedSummary {
  kind: 'unsupported';
  valueType: string;
  reason: Exclude<SanitizationReason, 'large_text' | 'base64' | 'array_truncated'>;
}

export type SanitizedSummary = Base64Summary | SanitizedTextSummary | SanitizedArraySummary | SanitizedUnsupportedSummary;

export interface SanitizedSummaryEnvelope {
  _summary: SanitizedSummary;
  items?: SanitizedValue[];
}

export interface SanitizedRootMetadata {
  applied: true;
  reasons: SanitizationReason[];
}

export type SanitizedValue =
  | string
  | number
  | boolean
  | null
  | SanitizedValue[]
  | {
      [key: string]: SanitizedValue | SanitizedSummaryEnvelope | SanitizedRootResult;
    };

export interface SanitizedRootResult {
  _sanitized: SanitizedRootMetadata;
  [key: string]: SanitizedValue | SanitizedSummaryEnvelope | SanitizedRootResult;
}

type PlainObject = Record<string, unknown>;

interface TraversalContext {
  reasons: Set<SanitizationReason>;
  visiting: WeakSet<object>;
}

function isPlainObject(value: object): value is PlainObject {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function describeValueType(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value !== 'object') {
    return typeof value;
  }

  return Object.prototype.toString.call(value).slice(8, -1);
}

function summarizeUnsupported(value: unknown, reason: SanitizedUnsupportedSummary['reason']): SanitizedSummaryEnvelope {
  return {
    _summary: {
      kind: 'unsupported',
      valueType: describeValueType(value),
      reason,
    },
  };
}

function summarizeText(value: string): SanitizedSummaryEnvelope {
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
  ctx: TraversalContext,
  depth: number
): SanitizedSummaryEnvelope {
  ctx.reasons.add('array_truncated');

  return {
    _summary: {
      kind: 'array',
      totalItems: items.length,
      keptItems: DEFAULT_ARRAY_LIMIT,
    },
    items: items.slice(0, DEFAULT_ARRAY_LIMIT).map((item) => visit(item, ctx, depth + 1)),
  };
}

function visit(value: unknown, ctx: TraversalContext, depth: number): SanitizedValue | SanitizedSummaryEnvelope {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    ctx.reasons.add('unsupported_value');
    return summarizeUnsupported(value, 'unsupported_value');
  }

  if (typeof value === 'string') {
    const base64Summary = summarizeBase64String(value);
    if (base64Summary) {
      ctx.reasons.add('base64');
      return { _summary: base64Summary };
    }

    if (value.length > DEFAULT_TEXT_LIMIT) {
      ctx.reasons.add('large_text');
      return summarizeText(value);
    }

    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') {
    ctx.reasons.add('unsupported_value');
    return summarizeUnsupported(value, 'unsupported_value');
  }

  if (depth >= DEFAULT_MAX_DEPTH) {
    ctx.reasons.add('max_depth');
    return summarizeUnsupported(value, 'max_depth');
  }

  if (Array.isArray(value)) {
    if (ctx.visiting.has(value)) {
      ctx.reasons.add('circular_reference');
      return summarizeUnsupported(value, 'circular_reference');
    }

    ctx.visiting.add(value);
    try {
      if (value.length <= DEFAULT_ARRAY_LIMIT) {
        return value.map((item) => visit(item, ctx, depth + 1));
      }

      return summarizeArray(value, ctx, depth);
    } finally {
      ctx.visiting.delete(value);
    }
  }

  if (!isPlainObject(value)) {
    ctx.reasons.add('non_plain_object');
    return summarizeUnsupported(value, 'non_plain_object');
  }

  if (ctx.visiting.has(value)) {
    ctx.reasons.add('circular_reference');
    return summarizeUnsupported(value, 'circular_reference');
  }

  ctx.visiting.add(value);
  try {
    const output: Record<string, SanitizedValue | SanitizedSummaryEnvelope> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = visit(nested, ctx, depth + 1);
    }
    return output;
  } finally {
    ctx.visiting.delete(value);
  }
}

function isPlainObjectRoot(value: unknown): value is PlainObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && isPlainObject(value);
}

export function sanitizeForLlm(value: unknown): SanitizedValue | SanitizedSummaryEnvelope | SanitizedRootResult {
  const ctx: TraversalContext = {
    reasons: new Set<SanitizationReason>(),
    visiting: new WeakSet<object>(),
  };

  const sanitized = visit(value, ctx, 0);

  if (!isPlainObjectRoot(value) || ctx.reasons.size === 0) {
    return sanitized;
  }

  return {
    _sanitized: {
      applied: true,
      reasons: Array.from(ctx.reasons),
    },
    ...(sanitized as Record<string, SanitizedValue | SanitizedSummaryEnvelope>),
  };
}
