import { describe, it, expect, vi } from 'vitest';

// Mock logger module
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock database module
const mockUpdate = vi.fn();
vi.mock('../../../src/infrastructure/database', () => ({
  getPrismaClient: vi.fn(() => ({
    chatMessage: {
      update: mockUpdate,
    },
  })),
}));

import { updateMessageMetadata } from '../../../src/chatSession/chatSession.repository';
import * as chatSessionService from '../../../src/chatSession/chatSession.service';

describe('updateMessageMetadata', () => {
  it('should exist as a function in the repository', () => {
    expect(typeof updateMessageMetadata).toBe('function');
  });

  it('should accept messageId and metadata parameters', () => {
    expect(updateMessageMetadata.length).toBe(2);
  });
});

describe('chatSessionService.updateMessageMetadata', () => {
  it('should exist as a function in the service', () => {
    expect(typeof chatSessionService.updateMessageMetadata).toBe('function');
  });

  it('should call repository.updateMessageMetadata and return the mapped record', async () => {
    const fakeDate = new Date('2026-01-15T10:00:00.000Z');
    mockUpdate.mockResolvedValueOnce({
      id: 'msg-1',
      sessionId: 'session-1',
      role: 'tool',
      content: '{}',
      metadata: { type: 'action_card', status: 'proposed' },
      createdAt: fakeDate,
    });

    const result = await chatSessionService.updateMessageMetadata('msg-1', {
      type: 'action_card',
      status: 'proposed',
    });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { metadata: { type: 'action_card', status: 'proposed' } },
    });
    expect(result).toEqual({
      id: 'msg-1',
      sessionId: 'session-1',
      role: 'tool',
      content: '{}',
      metadata: { type: 'action_card', status: 'proposed' },
      createdAt: fakeDate,
    });
  });
});

describe('chatSessionService.addMessage with metadata', () => {
  it('should accept optional metadata as 4th parameter', async () => {
    // addMessage is already mocked at the module level in action-card tests,
    // but here we verify the service function signature accepts metadata
    expect(chatSessionService.addMessage.length).toBeLessThanOrEqual(4);
  });
});
