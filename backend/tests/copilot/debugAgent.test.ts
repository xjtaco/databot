// backend/tests/copilot/debugAgent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/workflow/customNodeTemplate.service');

import * as templateService from '../../src/workflow/customNodeTemplate.service';
import { createDebugAgent, DebugAgent } from '../../src/copilot/debugAgent';
import type { CopilotServerMessage } from '../../src/copilot/copilot.types';
import type { CustomNodeTemplateInfo, SqlNodeConfig } from '../../src/workflow/workflow.types';

const SAMPLE_TEMPLATE: CustomNodeTemplateInfo = {
  id: 'tpl-001',
  name: 'Sales Query',
  description: 'Queries the sales database',
  type: 'sql',
  config: {
    nodeType: 'sql',
    datasourceId: 'ds-abc',
    params: {},
    sql: 'SELECT * FROM sales',
    outputVariable: 'sales_result',
  } satisfies SqlNodeConfig,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  creatorName: null,
};

describe('createDebugAgent', () => {
  beforeEach(() => {
    vi.mocked(templateService.getTemplate).mockResolvedValue(SAMPLE_TEMPLATE);
  });

  it('constructs a DebugAgent from a template', async () => {
    const events: CopilotServerMessage[] = [];
    const sendEvent = (e: CopilotServerMessage): void => {
      events.push(e);
    };

    const agent = await createDebugAgent('tpl-001', sendEvent);

    expect(agent).toBeInstanceOf(DebugAgent);
    expect(templateService.getTemplate).toHaveBeenCalledWith('tpl-001');
  });

  it('calls getTemplate with the provided templateId', async () => {
    const sendEvent = vi.fn();
    await createDebugAgent('tpl-002', sendEvent);
    expect(templateService.getTemplate).toHaveBeenCalledWith('tpl-002');
  });

  it('agent has abort and cleanup methods', async () => {
    const sendEvent = vi.fn();
    const agent = await createDebugAgent('tpl-001', sendEvent);

    expect(typeof agent.abort).toBe('function');
    expect(typeof agent.cleanup).toBe('function');
    expect(typeof agent.handleUserMessage).toBe('function');
  });

  it('propagates error when template is not found', async () => {
    vi.mocked(templateService.getTemplate).mockRejectedValue(
      new Error('Custom node template not found')
    );
    const sendEvent = vi.fn();

    await expect(createDebugAgent('nonexistent', sendEvent)).rejects.toThrow(
      'Custom node template not found'
    );
  });
});
