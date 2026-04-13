import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSearchNodeExecutor } from '../../../src/workflow/nodeExecutors/webSearchNodeExecutor';
import type { WebSearchNodeConfig } from '../../../src/workflow/workflow.types';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('../../../src/globalConfig/globalConfig.service', () => ({
  getWebSearchConfig: vi.fn(),
}));

vi.mock('../../../src/infrastructure/tools/webSearch', () => ({
  createWebSearchProviderFromConfig: vi.fn(),
}));

import { getWebSearchConfig } from '../../../src/globalConfig/globalConfig.service';
import { createWebSearchProviderFromConfig } from '../../../src/infrastructure/tools/webSearch';

const mockGetConfig = vi.mocked(getWebSearchConfig);
const mockCreateProvider = vi.mocked(createWebSearchProviderFromConfig);

function makeContext(
  keywords: string,
  workFolder: string,
  nodeName = 'web_search_1',
  nodeId = 'n1'
) {
  const config: WebSearchNodeConfig = {
    nodeType: 'web_search',
    params: {},
    keywords,
    outputVariable: 'search_result',
  };
  return { workFolder, nodeId, nodeName, resolvedConfig: config };
}

describe('WebSearchNodeExecutor', () => {
  const executor = new WebSearchNodeExecutor();
  let workFolder: string;

  beforeEach(() => {
    workFolder = mkdtempSync(join(tmpdir(), 'wf-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(workFolder, { recursive: true, force: true });
  });

  it('should have type "web_search"', () => {
    expect(executor.type).toBe('web_search');
  });

  it('should search and write markdown file', async () => {
    mockGetConfig.mockResolvedValue({
      type: 'ali_iqs',
      apiKey: 'test-key',
      numResults: 3,
      timeout: 60,
    });
    mockCreateProvider.mockReturnValue({
      searchStructured: vi.fn().mockResolvedValue([
        { title: 'Result 1', url: 'https://example.com/1', snippet: 'First result' },
        { title: 'Result 2', url: 'https://example.com/2', snippet: 'Second result' },
      ]),
    } as never);

    const result = await executor.execute(makeContext('test query', workFolder));

    expect(result.totalResults).toBe(2);
    expect(result.markdownPath).toContain('web_search_1_search.md');
    expect(existsSync(result.markdownPath)).toBe(true);

    const content = readFileSync(result.markdownPath, 'utf-8');
    expect(content).toContain('test query');
    expect(content).toContain('Result 1');
    expect(content).toContain('https://example.com/1');
  });

  it('should use a readable fallback filename for Chinese node names', async () => {
    mockGetConfig.mockResolvedValue({
      type: 'ali_iqs',
      apiKey: 'test-key',
      numResults: 3,
      timeout: 60,
    });
    mockCreateProvider.mockReturnValue({
      searchStructured: vi
        .fn()
        .mockResolvedValue([
          { title: 'Result 1', url: 'https://example.com/1', snippet: 'First result' },
        ]),
    } as never);

    const result = await executor.execute(makeContext('test query', workFolder, '搜索节点'));

    expect(result.totalResults).toBe(1);
    expect(result.markdownPath).toBe(join(workFolder, 'web_search_results_n1.md'));
    expect(existsSync(result.markdownPath)).toBe(true);
  });

  it('should use the fallback filename for low-information sanitized node names', async () => {
    mockGetConfig.mockResolvedValue({
      type: 'ali_iqs',
      apiKey: 'test-key',
      numResults: 3,
      timeout: 60,
    });
    mockCreateProvider.mockReturnValue({
      searchStructured: vi
        .fn()
        .mockResolvedValue([
          { title: 'Result 1', url: 'https://example.com/1', snippet: 'First result' },
        ]),
    } as never);

    const result = await executor.execute(makeContext('test query', workFolder, '__1'));

    expect(result.markdownPath).toBe(join(workFolder, 'web_search_results_n1.md'));
    expect(existsSync(result.markdownPath)).toBe(true);
  });

  it('should not overwrite fallback output for two low-information nodes in one workFolder', async () => {
    mockGetConfig.mockResolvedValue({
      type: 'ali_iqs',
      apiKey: 'test-key',
      numResults: 3,
      timeout: 60,
    });
    mockCreateProvider.mockReturnValue({
      searchStructured: vi
        .fn()
        .mockResolvedValue([
          { title: 'Result 1', url: 'https://example.com/1', snippet: 'First result' },
        ]),
    } as never);

    const first = await executor.execute(makeContext('test query', workFolder, '__1', 'n1'));
    const second = await executor.execute(makeContext('test query', workFolder, '__2', 'n2'));

    expect(first.markdownPath).toBe(join(workFolder, 'web_search_results_n1.md'));
    expect(second.markdownPath).toBe(join(workFolder, 'web_search_results_n2.md'));
    expect(first.markdownPath).not.toBe(second.markdownPath);
    expect(existsSync(first.markdownPath)).toBe(true);
    expect(existsSync(second.markdownPath)).toBe(true);
  });

  it('should handle empty results', async () => {
    mockGetConfig.mockResolvedValue({
      type: 'ali_iqs',
      apiKey: 'test-key',
      numResults: 3,
      timeout: 60,
    });
    mockCreateProvider.mockReturnValue({
      searchStructured: vi.fn().mockResolvedValue([]),
    } as never);

    const result = await executor.execute(makeContext('no results query', workFolder));

    expect(result.totalResults).toBe(0);
    expect(existsSync(result.markdownPath)).toBe(true);
  });

  it('should throw on empty keywords', async () => {
    await expect(executor.execute(makeContext('', workFolder))).rejects.toThrow();
  });

  it('should throw when search API fails', async () => {
    mockGetConfig.mockResolvedValue({
      type: 'ali_iqs',
      apiKey: 'test-key',
      numResults: 3,
      timeout: 60,
    });
    mockCreateProvider.mockReturnValue({
      searchStructured: vi.fn().mockRejectedValue(new Error('API error')),
    } as never);

    await expect(executor.execute(makeContext('fail query', workFolder))).rejects.toThrow(
      'API error'
    );
  });
});
