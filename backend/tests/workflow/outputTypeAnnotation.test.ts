import { describe, it, expect, vi } from 'vitest';

// Mock all transitive dependencies of executionEngine
vi.mock('../../src/utils/logger', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('fs', () => ({ mkdirSync: vi.fn(), readFileSync: vi.fn() }));
vi.mock('../../src/base/config', () => ({ config: { work_folder: '/tmp/test-work' } }));
vi.mock('../../src/workflow/dagValidator', () => ({
  topologicalSort: vi.fn(),
  getUpstreamNodes: vi.fn(),
  getDownstreamNodes: vi.fn(),
}));
vi.mock('../../src/workflow/templateResolver', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/workflow/templateResolver')>();
  return {
    resolveTemplate: vi.fn((s: string) => s),
    resolveParamsTemplates: vi.fn((p: unknown) => p),
    findUnresolvedTemplates: original.findUnresolvedTemplates,
  };
});
vi.mock('../../src/workflow/nodeExecutors', () => ({ getNodeExecutor: vi.fn() }));
vi.mock('../../src/workflow/workflow.repository', () => ({
  findWorkflowById: vi.fn(),
  findRunById: vi.fn(),
  createRun: vi.fn(),
  createNodeRunsBatch: vi.fn(),
  updateNodeRun: vi.fn(),
  updateRunStatus: vi.fn(),
  getRunWorkFolder: vi.fn(),
}));
vi.mock('crypto', () => ({
  randomBytes: vi.fn((size: number) => Buffer.alloc(size)),
}));

import { annotateOutputTypes } from '../../src/workflow/executionEngine';

describe('annotateOutputTypes', () => {
  it('wraps SQL csvPath as csvFile TypedOutputValue', () => {
    const output = { csvPath: '/data/out.csv', totalRows: 10, columns: ['a'], previewData: [] };
    const result = annotateOutputTypes('sql', output);
    expect(result.csvPath).toEqual({ value: '/data/out.csv', type: 'csvFile' });
    expect(result.totalRows).toBe(10);
  });

  it('wraps Python csvPath if present', () => {
    const output = { result: { key: 'val' }, csvPath: '/data/py.csv', stderr: '' };
    const result = annotateOutputTypes('python', output);
    expect(result.csvPath).toEqual({ value: '/data/py.csv', type: 'csvFile' });
    expect(result.result).toEqual({ key: 'val' });
  });

  it('leaves LLM output unchanged', () => {
    const output = { result: { text: 'hello' }, rawResponse: 'hello' };
    const result = annotateOutputTypes('llm', output);
    expect(result).toEqual(output);
  });

  it('annotates file paths in Python result dict with file: prefix', () => {
    const output = {
      result: {
        chart_path: '/tmp/test-work/wf_abc/chart.png',
        report_path: '/tmp/test-work/wf_abc/report.md',
        count: 42,
      },
      stderr: '',
    };
    const result = annotateOutputTypes('python', output);
    expect(result['file:chart_path']).toEqual({
      value: '/tmp/test-work/wf_abc/chart.png',
      type: 'imageFile',
    });
    expect(result['file:report_path']).toEqual({
      value: '/tmp/test-work/wf_abc/report.md',
      type: 'markdownFile',
    });
    expect(result.result).toEqual({
      chart_path: '/tmp/test-work/wf_abc/chart.png',
      report_path: '/tmp/test-work/wf_abc/report.md',
      count: 42,
    });
  });

  it('infers correct file types by extension', () => {
    const output = {
      result: {
        csv_file: '/tmp/test-work/wf_abc/data.csv',
        json_file: '/tmp/test-work/wf_abc/config.json',
        jpg_file: '/tmp/test-work/wf_abc/photo.jpg',
        txt_file: '/tmp/test-work/wf_abc/notes.txt',
      },
      stderr: '',
    };
    const result = annotateOutputTypes('python', output);
    expect(result['file:csv_file']).toEqual({
      value: '/tmp/test-work/wf_abc/data.csv',
      type: 'csvFile',
    });
    expect(result['file:json_file']).toEqual({
      value: '/tmp/test-work/wf_abc/config.json',
      type: 'jsonFile',
    });
    expect(result['file:jpg_file']).toEqual({
      value: '/tmp/test-work/wf_abc/photo.jpg',
      type: 'imageFile',
    });
    expect(result['file:txt_file']).toEqual({
      value: '/tmp/test-work/wf_abc/notes.txt',
      type: 'filePath',
    });
  });

  it('ignores non-workfolder paths in Python result', () => {
    const output = {
      result: { external: '/usr/local/data.csv', count: 5 },
      stderr: '',
    };
    const result = annotateOutputTypes('python', output);
    expect(result['file:external']).toBeUndefined();
  });

  it('does not scan result for non-python node types', () => {
    const output = {
      result: { path: '/tmp/test-work/wf_abc/file.csv' },
      rawResponse: 'hello',
    };
    const result = annotateOutputTypes('llm', output);
    expect(result['file:path']).toBeUndefined();
  });
});
