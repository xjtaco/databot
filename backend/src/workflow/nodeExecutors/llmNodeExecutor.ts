import { LLMProviderFactory } from '../../infrastructure/llm/factory';
import { WorkflowExecutionError } from '../../errors/types';
import logger from '../../utils/logger';
import { LlmNodeConfig, LlmNodeOutput } from '../workflow.types';
import { NodeExecutionContext, NodeExecutor } from './types';

const MAX_SINGLE_PARAM_CHARS = 8000;
const MAX_TOTAL_PARAMS_CHARS = 32000;

export function truncateParams(
  params: Record<string, string>,
  nodeId: string
): Record<string, string> {
  const result: Record<string, string> = {};

  // Step 1: truncate individual params
  for (const [key, value] of Object.entries(params)) {
    if (value.length > MAX_SINGLE_PARAM_CHARS) {
      logger.warn('LLM node param truncated', {
        nodeId,
        param: key,
        originalLength: value.length,
        truncatedTo: MAX_SINGLE_PARAM_CHARS,
      });
      result[key] =
        value.slice(0, MAX_SINGLE_PARAM_CHARS) +
        `...[truncated, original length: ${value.length} chars]`;
    } else {
      result[key] = value;
    }
  }

  // Step 2: check total length, truncate proportionally if needed
  const totalLength = Object.values(result).reduce((sum, v) => sum + v.length, 0);
  if (totalLength > MAX_TOTAL_PARAMS_CHARS) {
    logger.warn('LLM node total params truncated', {
      nodeId,
      originalTotal: totalLength,
      limit: MAX_TOTAL_PARAMS_CHARS,
    });
    const ratio = MAX_TOTAL_PARAMS_CHARS / totalLength;
    for (const [key, value] of Object.entries(result)) {
      const maxLen = Math.floor(value.length * ratio);
      if (value.length > maxLen) {
        result[key] = value.slice(0, maxLen) + `...[truncated to fit total limit]`;
      }
    }
  }

  return result;
}

export class LlmNodeExecutor implements NodeExecutor {
  readonly type = 'llm';

  async execute(context: NodeExecutionContext): Promise<LlmNodeOutput> {
    const config = context.resolvedConfig as LlmNodeConfig;

    const provider = LLMProviderFactory.getProvider();

    const systemMessage = `You are a data processing assistant. You must respond with valid JSON only. Do not include any text outside the JSON object. Your response must be parseable by JSON.parse().`;

    // Build user message: inject params context before the prompt
    let userMessage = config.prompt;
    if (config.params && Object.keys(config.params).length > 0) {
      const stringParams: Record<string, string> = {};
      for (const [key, value] of Object.entries(config.params)) {
        stringParams[key] = String(value);
      }
      const truncated = truncateParams(stringParams, context.nodeId);
      const paramsContext = Object.entries(truncated)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n');
      userMessage = `The following parameters are available from upstream nodes:\n${paramsContext}\n\n${config.prompt}`;
    }

    const response = await provider.chat(
      [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      { temperature: 0.2 }
    );

    const rawResponse = response.content;

    // Try to extract JSON from the response
    const result = parseJsonResponse(rawResponse);

    logger.info('LLM node executed', {
      nodeId: context.nodeId,
      responseLength: rawResponse.length,
    });

    return {
      result,
      rawResponse,
    };
  }
}

function parseJsonResponse(response: string): Record<string, unknown> {
  // Try parsing the full response
  const trimmed = response.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    // Try to extract JSON from markdown code blocks
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed as Record<string, unknown>;
        }
        return { value: parsed };
      } catch {
        // Fall through
      }
    }

    // Try to find JSON object or array in the response
    const jsonMatch = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed as Record<string, unknown>;
        }
        return { value: parsed };
      } catch {
        // Fall through
      }
    }

    throw new WorkflowExecutionError('LLM response is not valid JSON', {
      rawResponse: trimmed.slice(0, 500),
    });
  }
}
