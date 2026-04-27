import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerActionHandler,
  executeAction,
  isActionRegistered,
  getRegistry,
  type ActionHandler,
} from '@/components/chat/actionCards/actionCardRegistry';
import type { UiActionCardPayload, ActionDomain } from '@/types/actionCard';

describe('actionCardRegistry', () => {
  beforeEach(() => {
    getRegistry().clear();
  });

  it('registers and executes a handler', async () => {
    const mockHandler: ActionHandler = vi
      .fn()
      .mockResolvedValue({ success: true, summary: 'Opened' });
    registerActionHandler('data', 'open', mockHandler);
    expect(isActionRegistered('data', 'open')).toBe(true);

    const payload: UiActionCardPayload = {
      id: 'card-1',
      cardId: 'data.open',
      domain: 'data' as ActionDomain,
      action: 'open',
      title: 'Open',
      summary: 'Navigate',
      params: {},
      riskLevel: 'low',
      confirmRequired: false,
      executionMode: 'frontend',
      targetNav: 'data',
    };
    const result = await executeAction(payload);
    expect(result.success).toBe(true);
    expect(result.summary).toBe('Opened');
    expect(mockHandler).toHaveBeenCalledWith(payload);
  });

  it('returns failure for unregistered action', async () => {
    const payload: UiActionCardPayload = {
      id: 'card-1',
      cardId: 'nonexistent.action',
      domain: 'nonexistent' as ActionDomain,
      action: 'action',
      title: 'Test',
      summary: 'Test',
      params: {},
      riskLevel: 'low',
      confirmRequired: false,
      executionMode: 'frontend',
    };
    const result = await executeAction(payload);
    expect(result.success).toBe(false);
    expect(result.summary).toContain('Unsupported');
  });

  it('returns failure when handler throws', async () => {
    const mockHandler: ActionHandler = vi.fn().mockRejectedValue(new Error('API error'));
    registerActionHandler('data', 'test', mockHandler);

    const payload: UiActionCardPayload = {
      id: 'card-1',
      cardId: 'data.test',
      domain: 'data' as ActionDomain,
      action: 'test',
      title: 'Test',
      summary: 'Test',
      params: {},
      riskLevel: 'low',
      confirmRequired: false,
      executionMode: 'frontend',
    };
    const result = await executeAction(payload);
    expect(result.success).toBe(false);
    expect(result.error).toContain('API error');
  });
});
