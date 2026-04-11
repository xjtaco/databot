import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSearchNodeExecutor } from '../../../src/workflow/nodeExecutors/webSearchNodeExecutor';
import type { WebSearchNodeConfig } from '../../../src/workflow/workflow.types';
import { mkdtempSync, existsSync, readFileSync } from 'fs';
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

function makeContext(keywords: string, workFolder: string) {
  const config: WebSearchNodeConfig = {
    nodeType: 'web_search',
    params: {},
    keywords,
    outputVariable: 'search_result',
  };
  return { workFolder, nodeId: 'n1', nodeName: 'web_search_1', resolvedConfig: config };
}

describe('WebSearchNodeExecutor', () => {
  const executor = new WebSearchNodeExecutor();
  let workFolder: string;

  beforeEach(() => {
    workFolder = mkdtempSync(join(tmpdir(), 'wf-test-'));
    vi.clearAllMocks();
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
