import { describe, expect, it } from 'vitest';
import {
  RAW_OUTPUT_TEMPLATE_WARNING,
  buildNodeTemplateFieldSummary,
  buildTemplateFieldSummary,
  formatRawOutputTemplateDiagnostics,
} from '../../src/workflow/templateFields';
import { WorkflowNodeType } from '../../src/workflow/workflow.types';

describe('templateFields', () => {
  it('lists own defined fields and excludes sanitizer metadata', () => {
    const summary = buildTemplateFieldSummary({
      csvPath: '/tmp/out.csv',
      months: ['2026-01'],
      total_cost: 12,
      missing: undefined,
      _sanitized: { applied: true },
    });

    expect(summary).toEqual({
      fields: ['csvPath', 'months', 'total_cost'],
      hasRawOutput: false,
      needsUpstreamFix: false,
      warnings: [],
    });
  });

  it('marks raw_output as a structured template-field warning', () => {
    const summary = buildTemplateFieldSummary({
      csvPath: '/tmp/out.csv',
      stderr: '',
      raw_output: '{"months":["2026-01"]}',
    });

    expect(summary.fields).toEqual(['csvPath', 'stderr', 'raw_output']);
    expect(summary.hasRawOutput).toBe(true);
    expect(summary.needsUpstreamFix).toBe(true);
    expect(summary.warnings).toEqual([RAW_OUTPUT_TEMPLATE_WARNING]);
  });

  it('adds node identity and unique reference names', () => {
    const summary = buildNodeTemplateFieldSummary({
      node: {
        id: 'node-1',
        name: 'Process Ecommerce',
        type: WorkflowNodeType.Python,
        config: {
          nodeType: 'python',
          params: {},
          script: 'result = {"months": []}',
          outputVariable: 'Process Ecommerce',
        },
      },
      output: { months: ['2026-01'] },
    });

    expect(summary).toMatchObject({
      nodeId: 'node-1',
      nodeName: 'Process Ecommerce',
      nodeType: 'python',
      outputVariable: 'Process Ecommerce',
      fields: ['months'],
      hasRawOutput: false,
      needsUpstreamFix: false,
    });
    expect(summary.referenceNames).toEqual(['Process Ecommerce']);
  });

  it('formats raw-output diagnostics only when a node output has raw_output', () => {
    const message = formatRawOutputTemplateDiagnostics([
      { nodeName: 'ecommerce_monthly', output: { csvPath: '/tmp/out.csv', raw_output: 'printed only' } },
      { nodeName: 'tiktok_monthly', output: { csvPath: '/tmp/tiktok.csv', totalRows: 2 } },
    ]);

    expect(message).toContain(
      'Raw-output upstream nodes need fixes before downstream templates can reference computed fields:'
    );
    expect(message).toContain('needsUpstreamFix: true');
    expect(message).toContain('assign `result = {"months": value}`');
    expect(message).toContain('ecommerce_monthly');
    expect(message).not.toContain('tiktok_monthly');
  });

  it('returns an empty string when no node output has raw_output', () => {
    const message = formatRawOutputTemplateDiagnostics([
      { nodeName: 'ecommerce_monthly', output: { csvPath: '/tmp/out.csv' } },
      { nodeName: 'tiktok_monthly', output: { csvPath: '/tmp/tiktok.csv', totalRows: 2 } },
    ]);

    expect(message).toBe('');
  });
});
