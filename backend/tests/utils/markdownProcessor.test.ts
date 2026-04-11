import { describe, it, expect } from 'vitest';
import {
  csvToMarkdownTable,
  validatePlotlyJson,
  processFilePlaceholders,
} from '../../src/utils/markdownProcessor';

describe('csvToMarkdownTable', () => {
  it('converts simple CSV to markdown table', () => {
    const csv = 'name,age\nAlice,30\nBob,25';
    const result = csvToMarkdownTable(csv);
    expect(result).toBe('| name | age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |');
  });

  it('converts single-column CSV to markdown table', () => {
    const csv = 'col\nval';
    const result = csvToMarkdownTable(csv);
    expect(result).toBe('| col |\n| --- |\n| val |');
  });

  it('returns empty string for empty CSV input', () => {
    const result = csvToMarkdownTable('');
    expect(result).toBe('');
  });

  it('handles CSV with only a header row', () => {
    const csv = 'col1,col2,col3';
    const result = csvToMarkdownTable(csv);
    expect(result).toBe('| col1 | col2 | col3 |\n| --- | --- | --- |');
  });

  it('handles quoted fields with commas inside', () => {
    const csv = 'name,value\n"Smith, John",42';
    const result = csvToMarkdownTable(csv);
    expect(result).toContain('| Smith, John | 42 |');
  });

  it('handles escaped double quotes inside quoted fields', () => {
    const csv = 'name,value\n"say ""hello""",1';
    const result = csvToMarkdownTable(csv);
    expect(result).toContain('say "hello"');
  });

  it('trims whitespace around field values', () => {
    const csv = ' col1 , col2 \n val1 , val2 ';
    const result = csvToMarkdownTable(csv);
    expect(result).toContain('| col1 | col2 |');
    expect(result).toContain('| val1 | val2 |');
  });
});

describe('validatePlotlyJson', () => {
  it('returns true for valid plotly JSON with scatter trace', () => {
    const json = JSON.stringify({
      data: [{ type: 'scatter', x: [1, 2, 3], y: [4, 5, 6] }],
      layout: { title: 'Test' },
    });
    expect(validatePlotlyJson(json)).toBe(true);
  });

  it('returns true for valid plotly JSON with bar trace', () => {
    const json = JSON.stringify({
      data: [{ type: 'bar', x: ['A', 'B'], y: [10, 20] }],
    });
    expect(validatePlotlyJson(json)).toBe(true);
  });

  it('returns true for trace without type (defaults to scatter)', () => {
    const json = JSON.stringify({
      data: [{ x: [1, 2], y: [3, 4] }],
    });
    expect(validatePlotlyJson(json)).toBe(true);
  });

  it('returns false for invalid JSON string', () => {
    expect(validatePlotlyJson('not valid json')).toBe(false);
  });

  it('returns false for JSON array instead of object', () => {
    expect(validatePlotlyJson(JSON.stringify([1, 2, 3]))).toBe(false);
  });

  it('returns false when data array is missing', () => {
    const json = JSON.stringify({ layout: { title: 'No data' } });
    expect(validatePlotlyJson(json)).toBe(false);
  });

  it('returns false when data array is empty', () => {
    const json = JSON.stringify({ data: [] });
    expect(validatePlotlyJson(json)).toBe(false);
  });

  it('returns false for invalid trace type', () => {
    const json = JSON.stringify({ data: [{ type: 'invalid_chart_type' }] });
    expect(validatePlotlyJson(json)).toBe(false);
  });

  it('returns false for non-object trace in data array', () => {
    const json = JSON.stringify({ data: ['not an object'] });
    expect(validatePlotlyJson(json)).toBe(false);
  });

  it('returns false for non-object layout', () => {
    const json = JSON.stringify({
      data: [{ type: 'scatter' }],
      layout: 'not an object',
    });
    expect(validatePlotlyJson(json)).toBe(false);
  });
});

describe('processFilePlaceholders', () => {
  it('replaces CSV placeholder with markdown table via Buffer map', () => {
    const csvContent = 'col1,col2\n1,2\n3,4';
    const filePath = '/tmp/test-data.csv';
    const fileMap = new Map<string, Buffer>([[filePath, Buffer.from(csvContent, 'utf-8')]]);
    const content = `# Report\n\n<!-- {${filePath}} -->`;
    const result = processFilePlaceholders(content, fileMap);
    expect(result).toContain('| col1 | col2 |');
    expect(result).toContain('| 1 | 2 |');
    expect(result).toContain('| 3 | 4 |');
  });

  it('returns content unchanged when files list is empty', () => {
    const content = '# Report\n\n<!-- {/some/file.csv} -->';
    const result = processFilePlaceholders(content, []);
    expect(result).toBe(content);
  });

  it('returns content unchanged when no placeholders match provided files', () => {
    const content = '# Report\n\nSome content without matching placeholders.';
    const result = processFilePlaceholders(content, []);
    expect(result).toBe(content);
  });
});
