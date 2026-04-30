/**
 * ShowUiActionCardTool — lets the LLM display a UI action card
 * for frontend presentation and execution.
 */

import { randomUUID } from 'crypto';
import { Tool, ToolRegistry } from './tools';
import type { ToolParams, ToolResult, JSONSchemaObject } from './types';
import { ToolName } from './types';
import { getCardDefinition } from './uiActionCardCatalog';
import type { UiActionCardPayload } from './uiActionCardTypes';
import logger from '../../utils/logger';

function extractDefaultQuery(params: Record<string, unknown>): string | undefined {
  const queryParamNames = [
    'query',
    'keyword',
    'name',
    'title',
    'id',
    'workflowId',
    'datasourceId',
    'tableId',
    'scheduleId',
    'templateId',
    'folderId',
    'fileId',
  ] as const;

  for (const name of queryParamNames) {
    const value = params[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

export class ShowUiActionCardTool extends Tool {
  name = ToolName.ShowUiActionCard;

  description = `Display a UI action card as a proposed frontend action.
Returns a structured card payload that the frontend renders as a confirmation dialog,
inline form, resource list, or navigation card. Depending on the card configuration,
the frontend may ask the user to confirm before execution.

Use this tool after searching for an action card (via search_ui_action_card) to present
a specific card to the user. Provide the cardId and any required parameters.`;

  parameters: JSONSchemaObject = {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description:
          'The exact cardId of the action card to display (e.g. "data.datasource_create").',
      },
      params: {
        type: 'object',
        description:
          'Key-value pairs for the card parameters. Sensitive values are automatically masked.',
      },
    },
    required: ['cardId'],
  };

  async execute(params: ToolParams): Promise<ToolResult> {
    // Validate cardId is present
    const cardId = params.cardId;
    if (!cardId || typeof cardId !== 'string' || cardId.trim().length === 0) {
      const errorMessage = 'cardId is required';
      logger.warn('ShowUiActionCardTool validation failed: cardId missing');
      return {
        success: false,
        data: null,
        error: errorMessage,
        metadata: {
          status: 'validation_failed',
          resultSummary: errorMessage,
        },
      };
    }

    // Look up card definition
    const definition = getCardDefinition(cardId);
    if (!definition) {
      const errorMessage = `Unknown card: ${cardId}`;
      logger.warn('ShowUiActionCardTool: card not found', { cardId });
      return {
        success: false,
        data: null,
        error: errorMessage,
        metadata: {
          status: 'not_found',
          resultSummary: errorMessage,
        },
      };
    }

    // Collect all param definitions that are sensitive
    const sensitiveParamNames = new Set<string>();
    for (const p of definition.requiredParams) {
      if (p.sensitive) sensitiveParamNames.add(p.name);
    }
    for (const p of definition.optionalParams) {
      if (p.sensitive) sensitiveParamNames.add(p.name);
    }

    // Mask sensitive params
    const rawParams = (params.params as Record<string, unknown>) ?? {};
    const maskedParams: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawParams)) {
      if (sensitiveParamNames.has(key)) {
        maskedParams[key] = '******';
      } else {
        maskedParams[key] = value;
      }
    }

    // Extract copilotPrompt from raw params
    const copilotPrompt = rawParams.copilotPrompt as string | undefined;

    // Build the card payload
    const payload: UiActionCardPayload = {
      id: randomUUID(),
      cardId: definition.cardId,
      domain: definition.domain,
      action: definition.action,
      title: definition.title,
      summary: definition.description,
      presentationMode: definition.presentationMode,
      confirmationMode: definition.confirmationMode,
      titleKey: definition.titleKey,
      summaryKey: definition.summaryKey,
      params: maskedParams,
      riskLevel: definition.riskLevel,
      confirmRequired: definition.confirmRequired,
      executionMode: 'frontend',
      targetNav: definition.targetNav,
      targetDataTab: definition.targetDataTab,
      resourceType: definition.resourceType,
      resourceSections: definition.resourceSections,
      defaultQuery: extractDefaultQuery(rawParams) ?? definition.defaultQuery,
      allowedActions: definition.allowedActions,
      copilotPrompt,
    };

    logger.info('ShowUiActionCardTool: card prepared', {
      cardId: definition.cardId,
      action: definition.action,
    });

    return {
      success: true,
      data: {
        cardId: definition.cardId,
        title: definition.title,
        action: definition.action,
      },
      metadata: {
        status: 'success',
        resultSummary: `Action card: ${definition.title}`,
        cardPayload: payload,
      },
    };
  }
}

// Self-register
ToolRegistry.register(new ShowUiActionCardTool());
