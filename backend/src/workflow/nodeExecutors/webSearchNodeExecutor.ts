import { writeFileSync } from 'fs';
import { join } from 'path';
import type { WebSearchNodeConfig, WebSearchNodeOutput } from '../workflow.types';
import type { NodeExecutionContext, NodeExecutor } from './types';
import { WorkflowExecutionError } from '../../errors/types';
import { getWebSearchConfig } from '../../globalConfig/globalConfig.service';
import {
  createWebSearchProviderFromConfig,
  type WebSearchResult,
} from '../../infrastructure/tools/webSearch';
import { buildNodeIdSuffix, resolveReadableNodeBaseName } from './utils';
import logger from '../../utils/logger';

export class WebSearchNodeExecutor implements NodeExecutor {
  readonly type = 'web_search';

  async execute(context: NodeExecutionContext): Promise<WebSearchNodeOutput> {
    const config = context.resolvedConfig as WebSearchNodeConfig;
    const { keywords } = config;

    if (!keywords.trim()) {
      throw new WorkflowExecutionError('Web search keywords cannot be empty');
    }

    logger.info(`Web search node "${context.nodeName}" searching: "${keywords}"`);

    const wsConfig = await getWebSearchConfig();
    const provider = createWebSearchProviderFromConfig(wsConfig);
    const results = await provider.searchStructured(keywords);

    const markdown = this.formatMarkdown(keywords, results);
    const { baseName, usedFallback } = resolveReadableNodeBaseName(context.nodeName, 'web_search');
    const filePath = join(
      context.workFolder,
      usedFallback
        ? `web_search_results_${buildNodeIdSuffix(context.nodeId)}.md`
        : `${baseName}_search.md`
    );
    writeFileSync(filePath, markdown, 'utf-8');

    logger.info(`Web search saved ${results.length} results to ${filePath}`);

    return {
      markdownPath: filePath,
      totalResults: results.length,
    };
  }

  private formatMarkdown(keywords: string, results: WebSearchResult[]): string {
    const lines: string[] = [`# 搜索结果: ${keywords}`, ''];

    if (results.length === 0) {
      lines.push('无搜索结果。');
      return lines.join('\n');
    }

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      lines.push(`## ${i + 1}. ${r.title}`);
      lines.push(`- **来源**: ${r.url}`);
      lines.push('');
      lines.push(r.snippet);
      lines.push('');
      if (i < results.length - 1) {
        lines.push('---');
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}
