import { describe, it, expect } from 'vitest';
import {
  resolveTemplate,
  resolveParamsTemplates,
  extractParamNames,
  findUnresolvedTemplates,
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
});
