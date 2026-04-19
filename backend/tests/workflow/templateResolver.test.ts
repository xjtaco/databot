import { describe, it, expect } from 'vitest';
import {
  resolveTemplate,
  resolveParamsTemplates,
  extractParamNames,
  findUnresolvedTemplates,
  flattenResultField,
} from '../../src/workflow/templateResolver';
import { ParamDefinition } from '../../src/workflow/workflow.types';

describe('templateResolver', () => {
  describe('resolveTemplate', () => {
    it('should replace simple node.field reference', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        ['query_results', { csvPath: '/tmp/output.csv', totalRows: 42 }],
      ]);
      const result = resolveTemplate('File at {{query_results.csvPath}}', outputs);
      expect(result).toBe('File at /tmp/output.csv');
    });

    it('should replace multiple references', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        ['params', { start: '2026-01-01', end: '2026-03-01' }],
      ]);
      const result = resolveTemplate(
        "SELECT * WHERE date BETWEEN '{{params.start}}' AND '{{params.end}}'",
        outputs
      );
      expect(result).toBe("SELECT * WHERE date BETWEEN '2026-01-01' AND '2026-03-01'");
    });

    it('should leave unresolved references as-is', () => {
      const outputs = new Map<string, Record<string, unknown>>();
      const result = resolveTemplate('Value: {{missing.field}}', outputs);
      expect(result).toBe('Value: {{missing.field}}');
    });

    it('should handle nested field paths', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        ['analysis', { result: { summary: 'data looks good' } }],
      ]);
      const result = resolveTemplate('Summary: {{analysis.result.summary}}', outputs);
      expect(result).toBe('Summary: data looks good');
    });

    it('should handle deeply nested field paths (3+ levels)', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        ['python_node', { result: { analysis: { metrics: { accuracy: 95.6 } } } }],
      ]);
      const result = resolveTemplate(
        'Accuracy: {{python_node.result.analysis.metrics.accuracy}}',
        outputs
      );
      expect(result).toBe('Accuracy: 95.6');
    });

    it('should return original template when intermediate field is null', () => {
      const outputs = new Map<string, Record<string, unknown>>([['node', { result: null }]]);
      const result = resolveTemplate('{{node.result.summary}}', outputs);
      expect(result).toBe('{{node.result.summary}}');
    });

    it('should return original template when intermediate field is undefined', () => {
      const outputs = new Map<string, Record<string, unknown>>([['node', { result: undefined }]]);
      const result = resolveTemplate('{{node.result.summary}}', outputs);
      expect(result).toBe('{{node.result.summary}}');
    });

    it('should return original template when final field is undefined', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        ['node', { result: { exists: 'yes' } }],
      ]);
      const result = resolveTemplate('{{node.result.missing}}', outputs);
      expect(result).toBe('{{node.result.missing}}');
    });

    it('should return original template when intermediate value is primitive', () => {
      const outputs = new Map<string, Record<string, unknown>>([['node', { result: 42 }]]);
      const result = resolveTemplate('{{node.result.subfield}}', outputs);
      expect(result).toBe('{{node.result.subfield}}');
    });

    it('should return original template when intermediate value is string', () => {
      const outputs = new Map<string, Record<string, unknown>>([['node', { result: 'a string' }]]);
      const result = resolveTemplate('{{node.result.subfield}}', outputs);
      expect(result).toBe('{{node.result.subfield}}');
    });

    it('should auto-extract TypedOutputValue at intermediate levels', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        [
          'node',
          {
            result: { value: '{"summary":"ok","detail":"fine"}', type: 'json' },
          },
        ],
      ]);
      const result = resolveTemplate('{{node.result}}', outputs);
      expect(result).toBe('{"summary":"ok","detail":"fine"}');
    });

    it('should auto-extract TypedOutputValue with object value at intermediate levels', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        [
          'node',
          {
            result: { value: { summary: 'ok', detail: 'fine' }, type: 'json' },
          },
        ],
      ]);
      const result = resolveTemplate('{{node.result.summary}}', outputs);
      expect(result).toBe('ok');
    });

    it('should auto-extract TypedOutputValue at final level', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        [
          'node',
          {
            result: { data: { value: 'extracted', type: 'text' } },
          },
        ],
      ]);
      const result = resolveTemplate('{{node.result.data}}', outputs);
      expect(result).toBe('extracted');
    });

    it('should cascade through object TypedOutputValue then plain object then string TypedOutputValue', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        [
          'node',
          {
            result: {
              value: { inner: { name: { value: 'alice', type: 'text' } } },
              type: 'json',
            },
          },
        ],
      ]);
      const result = resolveTemplate('{{node.result.inner.name}}', outputs);
      expect(result).toBe('alice');
    });

    it('should cascade through object TypedOutputValue then plain object to primitive field', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        [
          'node',
          {
            result: {
              value: { inner: { score: 98.5 } },
              type: 'json',
            },
          },
        ],
      ]);
      const result = resolveTemplate('{{node.result.inner.score}}', outputs);
      expect(result).toBe('98.5');
    });

    it('should cascade through string TypedOutputValue at first level then plain object', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        [
          'node',
          {
            csvPath: { value: '/data/output.csv', type: 'csvFile' },
            totalRows: { value: '100', type: 'text' },
          },
        ],
      ]);
      const result = resolveTemplate('{{node.csvPath}}', outputs);
      expect(result).toBe('/data/output.csv');
    });

    it('should return JSON when cascading ends at an object TypedOutputValue', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        [
          'node',
          {
            result: {
              value: { payload: { value: { a: 1, b: 2 }, type: 'json' } },
              type: 'json',
            },
          },
        ],
      ]);
      const result = resolveTemplate('{{node.result.payload}}', outputs);
      expect(result).toBe('{"a":1,"b":2}');
    });

    it('should cascade through multiple object TypedOutputValue layers', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        [
          'node',
          {
            level1: {
              value: {
                level2: {
                  value: {
                    level3: {
                      value: 'deep',
                      type: 'text',
                    },
                  },
                  type: 'json',
                },
              },
              type: 'json',
            },
          },
        ],
      ]);
      const result = resolveTemplate('{{node.level1.level2.level3}}', outputs);
      expect(result).toBe('deep');
    });

    it('should cascade into object TypedOutputValue and access deep nested field', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        [
          'node',
          {
            result: {
              value: {
                analysis: {
                  metrics: { accuracy: 0.95, recall: 0.88 },
                  summary: { value: 'report ready', type: 'text' },
                },
              },
              type: 'json',
            },
          },
        ],
      ]);
      expect(resolveTemplate('{{node.result.analysis.metrics.accuracy}}', outputs)).toBe('0.95');
      expect(resolveTemplate('{{node.result.analysis.summary}}', outputs)).toBe('report ready');
    });

    it('should serialize non-string values as JSON', () => {
      const outputs = new Map<string, Record<string, unknown>>([['data', { count: 42 }]]);
      const result = resolveTemplate('Count: {{data.count}}', outputs);
      expect(result).toBe('Count: 42');
    });

    it('should serialize object values as JSON', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        ['data', { info: { a: 1, b: 2 } }],
      ]);
      const result = resolveTemplate('Info: {{data.info}}', outputs);
      expect(result).toBe('Info: {"a":1,"b":2}');
    });

    it('should handle reference without field path', () => {
      const outputs = new Map<string, Record<string, unknown>>([['data', { key: 'value' }]]);
      const result = resolveTemplate('Data: {{data}}', outputs);
      expect(result).toBe('Data: {"key":"value"}');
    });

    it('should handle template with no variables', () => {
      const outputs = new Map<string, Record<string, unknown>>();
      const result = resolveTemplate('No variables here', outputs);
      expect(result).toBe('No variables here');
    });

    it('should handle empty template', () => {
      const outputs = new Map<string, Record<string, unknown>>();
      const result = resolveTemplate('', outputs);
      expect(result).toBe('');
    });

    it('should handle whitespace in template variable names', () => {
      const outputs = new Map<string, Record<string, unknown>>([['params', { name: 'test' }]]);
      const result = resolveTemplate('{{ params.name }}', outputs);
      expect(result).toBe('test');
    });

    it('auto-extracts value from TypedOutputValue in node outputs', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        ['sql_node', { csvPath: { value: '/data/output.csv', type: 'csvFile' } }],
      ]);
      const result = resolveTemplate('File: {{sql_node.csvPath}}', outputs);
      expect(result).toBe('File: /data/output.csv');
    });
  });

  describe('resolveParamsTemplates', () => {
    it('should resolve all values in a params record', () => {
      const params = {
        start_date: '{{params.start}}',
        end_date: '{{params.end}}',
        static: 'no-change',
      };
      const outputs = new Map<string, Record<string, unknown>>([
        ['params', { start: '2026-01-01', end: '2026-03-01' }],
      ]);
      const result = resolveParamsTemplates(params, outputs);
      expect(result).toEqual({
        start_date: { value: '2026-01-01', type: 'text' },
        end_date: { value: '2026-03-01', type: 'text' },
        static: { value: 'no-change', type: 'text' },
      });
    });

    it('should handle empty params', () => {
      const outputs = new Map<string, Record<string, unknown>>();
      const result = resolveParamsTemplates({}, outputs);
      expect(result).toEqual({});
    });
  });

  describe('resolveParamsTemplates with ParamDefinition', () => {
    const nodeOutputs = new Map<string, Record<string, unknown>>([
      ['sql_node', { csvPath: '/data/output.csv', totalRows: 100 }],
    ]);

    it('resolves templates in ParamDefinition values', () => {
      const params: Record<string, string | ParamDefinition> = {
        file: { value: '{{sql_node.csvPath}}', type: 'text' as const },
        password: { value: 'static-secret', type: 'password' as const },
      };
      const result = resolveParamsTemplates(params, nodeOutputs);
      expect(result).toEqual({
        file: { value: '/data/output.csv', type: 'text' },
        password: { value: 'static-secret', type: 'password' },
      });
    });

    it('handles legacy string params (backward compat)', () => {
      const params = { host: 'localhost', file: '{{sql_node.csvPath}}' };
      const result = resolveParamsTemplates(params, nodeOutputs);
      expect(result).toEqual({
        host: { value: 'localhost', type: 'text' },
        file: { value: '/data/output.csv', type: 'text' },
      });
    });
  });

  describe('findUnresolvedTemplates', () => {
    it('should return empty array for string without templates', () => {
      expect(findUnresolvedTemplates('no templates here')).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(findUnresolvedTemplates('')).toEqual([]);
    });

    it('should find a single unresolved template', () => {
      expect(findUnresolvedTemplates('path: {{node.result.file}}')).toEqual(['node.result.file']);
    });

    it('should find multiple unresolved templates', () => {
      const result = findUnresolvedTemplates('{{a.x}} and {{b.y}} and {{c.z}}');
      expect(result).toEqual(['a.x', 'b.y', 'c.z']);
    });

    it('should trim whitespace from variable names', () => {
      expect(findUnresolvedTemplates('{{ node.field }}')).toEqual(['node.field']);
    });

    it('should return duplicates when same template appears multiple times', () => {
      const result = findUnresolvedTemplates('{{a.x}} then {{a.x}}');
      expect(result).toEqual(['a.x', 'a.x']);
    });
  });

  describe('extractParamNames', () => {
    it('should extract param names from template', () => {
      const template =
        "SELECT * WHERE date >= '{{params.start_date}}' AND region = '{{params.region}}'";
      const result = extractParamNames(template);
      expect(result).toContain('start_date');
      expect(result).toContain('region');
      expect(result).toHaveLength(2);
    });

    it('should return empty for template with no params', () => {
      const result = extractParamNames('SELECT * FROM table');
      expect(result).toEqual([]);
    });

    it('should ignore non-params references', () => {
      const result = extractParamNames('{{query.result}} and {{params.name}}');
      expect(result).toEqual(['name']);
    });

    it('should deduplicate param names', () => {
      const result = extractParamNames('{{params.x}} and {{params.x}} again');
      expect(result).toEqual(['x']);
    });
  });

  describe('flattenResultField', () => {
    it('should promote result fields to top level', () => {
      const record = {
        result: { ecommerce_summary: 'good', tiktok_summary: 'bad' },
        csvPath: '/tmp/data.csv',
        stderr: '',
      };
      const flattened = flattenResultField(record);
      expect(flattened['ecommerce_summary']).toBe('good');
      expect(flattened['tiktok_summary']).toBe('bad');
      expect(flattened['result']).toEqual({ ecommerce_summary: 'good', tiktok_summary: 'bad' });
      expect(flattened['csvPath']).toBe('/tmp/data.csv');
    });

    it('should not overwrite existing top-level fields', () => {
      const record = {
        result: { csvPath: '/result/path.csv', summary: 'text' },
        csvPath: '/node/path.csv',
        stderr: '',
      };
      const flattened = flattenResultField(record);
      expect(flattened['csvPath']).toBe('/node/path.csv');
      expect(flattened['summary']).toBe('text');
    });

    it('should return record unchanged when result is null', () => {
      const record = { result: null, stderr: '' };
      expect(flattenResultField(record)).toBe(record);
    });

    it('should return record unchanged when result is undefined', () => {
      const record = { result: undefined, stderr: '' };
      expect(flattenResultField(record)).toBe(record);
    });

    it('should return record unchanged when result is a string', () => {
      const record = { result: 'plain text', stderr: '' };
      expect(flattenResultField(record)).toBe(record);
    });

    it('should return record unchanged when result is an array', () => {
      const record = { result: [1, 2, 3], stderr: '' };
      expect(flattenResultField(record)).toBe(record);
    });

    it('should return record unchanged when result is a boolean (branch node)', () => {
      const record = { result: true };
      expect(flattenResultField(record)).toBe(record);
    });

    it('should not mutate the original record', () => {
      const record = { result: { key: 'value' }, stderr: '' };
      flattenResultField(record);
      expect('key' in record).toBe(false);
    });

    it('should handle deeply nested result fields', () => {
      const record = {
        result: { analysis: { metrics: { accuracy: 0.95 } } },
        stderr: '',
      };
      const flattened = flattenResultField(record);
      expect(flattened['analysis']).toEqual({ metrics: { accuracy: 0.95 } });
    });
  });

  describe('resolveTemplate with flattened result fields', () => {
    it('should resolve {{node.field}} directly when field is inside result', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        [
          'data_summary',
          flattenResultField({
            result: { ecommerce_summary: 'sales up 20%', tiktok_summary: 'ctr 3.5%' },
            stderr: '',
          }),
        ],
      ]);
      expect(resolveTemplate('{{data_summary.ecommerce_summary}}', outputs)).toBe('sales up 20%');
      expect(resolveTemplate('{{data_summary.tiktok_summary}}', outputs)).toBe('ctr 3.5%');
    });

    it('should still resolve {{node.result.field}} after flattening', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        [
          'data_summary',
          flattenResultField({
            result: { ecommerce_summary: 'sales up 20%' },
            stderr: '',
          }),
        ],
      ]);
      expect(resolveTemplate('{{data_summary.result.ecommerce_summary}}', outputs)).toBe(
        'sales up 20%'
      );
    });

    it('should resolve direct field and result.field identically', () => {
      const outputs = new Map<string, Record<string, unknown>>([
        [
          'analysis',
          flattenResultField({
            result: { score: 95.6 },
            stderr: '',
          }),
        ],
      ]);
      const direct = resolveTemplate('{{analysis.score}}', outputs);
      const viaResult = resolveTemplate('{{analysis.result.score}}', outputs);
      expect(direct).toBe(viaResult);
    });
  });
});
