// backend/tests/copilotWebSocket.test.ts
import { describe, it, expect, vi } from 'vitest';

const { mockDispose, mockAbort, mockSetHasManualLayoutEdits, mockWaitForWsAuth } = vi.hoisted(
  () => ({
    mockDispose: vi.fn(),
    mockAbort: vi.fn(),
    mockSetHasManualLayoutEdits: vi.fn(),
    mockWaitForWsAuth: vi.fn(() => Promise.resolve()),
  })
);

vi.mock('../src/auth/wsAuth', () => ({
  waitForWsAuth: mockWaitForWsAuth,
}));

vi.mock('../src/copilot/copilotAgent', () => ({
  CopilotAgent: class {
    abort = mockAbort;
    dispose = mockDispose;
    handleUserMessage = vi.fn();
    setHasManualLayoutEdits = mockSetHasManualLayoutEdits;
  },
}));

import { initCopilotWebSocket } from '../src/copilot/copilotWebSocket';

describe('copilotWebSocket', () => {
  it('disposes the copilot agent when the socket closes', async () => {
    const on = vi.fn();
    const ws = {
      on,
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
      OPEN: 1,
    };
    const app = {
      ws: vi.fn(),
    };
    const req = {
      url: '/ws/copilot?workflowId=123e4567-e89b-12d3-a456-426614174000',
      headers: { host: 'localhost' },
    };

    initCopilotWebSocket(app as never);
    expect(app.ws).toHaveBeenCalledTimes(1);

    const handler = vi.mocked(app.ws).mock.calls[0][1];
    handler(ws as never, req as never);

    await Promise.resolve();

    expect(mockWaitForWsAuth).toHaveBeenCalledWith(ws);
    const closeHandler = on.mock.calls.find(([event]) => event === 'close')?.[1] as
      | (() => void)
      | undefined;
    expect(closeHandler).toBeDefined();

    closeHandler?.();

    expect(mockAbort).toHaveBeenCalledTimes(1);
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });
});
