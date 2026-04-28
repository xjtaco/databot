/**
 * SearchUiActionCardTool — lets the LLM discover UI action cards
 * from the in-memory catalog by free-text query and optional domain filter.
 */

import { Tool, ToolRegistry } from './tools';
import type { ToolParams, ToolResult, JSONSchemaObject } from './types';
import { ToolName } from './types';
import { searchCatalog, type SearchQueryMode } from './uiActionCardCatalog';
import type { ActionDomain } from './uiActionCardTypes';
import logger from '../../utils/logger';

export class SearchUiActionCardTool extends Tool {
  name = ToolName.SearchUiActionCard;

  description = `Search the UI action card catalog to discover available frontend actions.
Returns an array of card definitions matching the query. Each card describes a UI action
(e.g. create datasource, create folder) that can be presented to the user for confirmation.

Use this tool when the user asks to perform an action that requires a UI interaction,
such as creating, deleting, or managing resources like datasources, knowledge folders,
scheduled tasks, or workflows. Always search first before presenting an action card to
ensure you pick the correct one. Use regex query mode for broad intent matching across
card IDs, titles, descriptions, usage text, and parameter descriptions.`;

  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Free-text search query. Matched against cardId, title, action, usage, and parameter fields.',
      },
      domain: {
        type: 'string',
        enum: ['data', 'knowledge', 'schedule', 'workflow', 'template'],
        description: 'Optional domain filter to narrow results to a specific area.',
      },
      queryMode: {
        type: 'string',
        enum: ['text', 'regex'],
        description:
          'Search mode. Use "text" for whitespace token matching or "regex" for grep-like regular expression matching.',
      },
    },
    required: ['query'],
  };

  validate(params: ToolParams): boolean {
    return typeof params.query === 'string' && params.query.trim().length > 0;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    if (!this.validate(params)) {
      const errorMessage = 'query is required and must be a non-empty string';
      logger.warn('SearchUiActionCardTool validation failed', { params });
      return {
        success: false,
        data: [],
        error: errorMessage,
        metadata: {
          status: 'validation_failed',
          resultSummary: errorMessage,
        },
      };
    }

    const query = params.query as string;
    const domain = params.domain as ActionDomain | undefined;
    const queryMode = (params.queryMode as SearchQueryMode | undefined) ?? 'text';

    if (queryMode !== 'text' && queryMode !== 'regex') {
      const errorMessage = 'queryMode must be either text or regex';
      logger.warn('SearchUiActionCardTool validation failed', { params });
      return {
        success: false,
        data: [],
        error: errorMessage,
        metadata: {
          status: 'validation_failed',
          resultSummary: errorMessage,
        },
      };
    }

    if (queryMode === 'regex') {
      try {
        new RegExp(query);
      } catch (err) {
        const errorMessage = `Invalid regex: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn('SearchUiActionCardTool regex validation failed', { params, errorMessage });
        return {
          success: false,
          data: [],
          error: errorMessage,
          metadata: {
            status: 'validation_failed',
            resultSummary: errorMessage,
          },
        };
      }
    }

    logger.info('Searching UI action card catalog', { query, domain, queryMode });

    const cards = searchCatalog(query, { domain, queryMode });

    logger.info('SearchUiActionCardTool completed', {
      query,
      domain,
      queryMode,
      resultCount: cards.length,
    });

    return {
      success: true,
      data: cards,
      metadata: {
        status: 'ok',
        resultSummary: `Found ${cards.length} matching card(s)`,
      },
    };
  }
}

// Self-register
ToolRegistry.register(new SearchUiActionCardTool());
