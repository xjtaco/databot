// backend/tests/copilotWebSocket.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/copilot/copilotAgent');

import { initCopilotWebSocket } from '../src/copilot/copilotWebSocket';

describe('copilotWebSocket', () => {
  it('exports initCopilotWebSocket function', () => {
    expect(typeof initCopilotWebSocket).toBe('function');
  });
});
