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
    const callbacks = {
      setStatus: vi.fn(),
      setResult: vi.fn(),
      setError: vi.fn(),
    };
    const result = await executeAction(payload, callbacks);
    expect(result.success).toBe(true);
    expect(result.summary).toBe('Opened');
    expect(mockHandler).toHaveBeenCalledWith(payload, callbacks);
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
    const callbacks = {
      setStatus: vi.fn(),
      setResult: vi.fn(),
      setError: vi.fn(),
    };
    const result = await executeAction(payload, callbacks);
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
    const callbacks = {
      setStatus: vi.fn(),
      setResult: vi.fn(),
      setError: vi.fn(),
    };
    const result = await executeAction(payload, callbacks);
    expect(result.success).toBe(false);
    expect(result.error).toContain('API error');
  });

  it('returns default success when handler returns void', async () => {
    const mockHandler: ActionHandler = vi.fn().mockResolvedValue(undefined);
    registerActionHandler('data', 'void_action', mockHandler);

    const payload: UiActionCardPayload = {
      id: 'card-1',
      cardId: 'data.void_action',
      domain: 'data' as ActionDomain,
      action: 'void_action',
      title: 'Void Action',
      summary: 'Returns void',
      params: {},
      riskLevel: 'low',
      confirmRequired: false,
      executionMode: 'frontend',
    };
    const callbacks = {
      setStatus: vi.fn(),
      setResult: vi.fn(),
      setError: vi.fn(),
    };
    const result = await executeAction(payload, callbacks);
    expect(result.success).toBe(true);
  });
});
