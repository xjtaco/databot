import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Prisma
const mockMessageCreate = vi.fn();
const mockMessageFindMany = vi.fn();

vi.mock('../../src/infrastructure/database', () => ({
  getPrismaClient: () => ({
    chatMessage: {
      create: (...args: unknown[]) => mockMessageCreate(...args),
      findMany: (...args: unknown[]) => mockMessageFindMany(...args),
    },
  }),
}));

import {
  createMessage,
  findMessagesBySessionId,
} from '../../src/chatSession/chatSession.repository';

const now = new Date('2026-03-17T00:00:00Z');

function makePrismaMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'user',
    content: 'Hello',
    metadata: null,
    createdAt: now,
    ...overrides,
  };
}

describe('chatSession.metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMessage', () => {
    it('should accept optional metadata parameter and pass it to prisma', async () => {
      const metadata = { actionCardId: 'card-1', status: 'pending' };
      const prismaMessage = makePrismaMessage({ metadata });
      mockMessageCreate.mockResolvedValue(prismaMessage);

      const data = {
        sessionId: 'session-1',
        role: 'user',
        content: 'Hello',
        metadata,
      };
      const result = await createMessage(data);

      expect(mockMessageCreate).toHaveBeenCalledWith({ data });
      expect(result).toEqual({
        id: 'msg-1',
        sessionId: 'session-1',
        role: 'user',
        content: 'Hello',
        metadata: { actionCardId: 'card-1', status: 'pending' },
        createdAt: now,
      });
    });

    it('should create a message without metadata when not provided', async () => {
      const prismaMessage = makePrismaMessage();
      mockMessageCreate.mockResolvedValue(prismaMessage);

      const data = { sessionId: 'session-1', role: 'user', content: 'Hello' };
      const result = await createMessage(data);

      expect(mockMessageCreate).toHaveBeenCalledWith({ data });
      expect(result.metadata).toBeNull();
    });

    it('should accept null metadata explicitly', async () => {
      const prismaMessage = makePrismaMessage({ metadata: null });
      mockMessageCreate.mockResolvedValue(prismaMessage);

      const data = { sessionId: 'session-1', role: 'user', content: 'Hello', metadata: null };
      const result = await createMessage(data);

      expect(mockMessageCreate).toHaveBeenCalledWith({
        data: {
          sessionId: 'session-1',
          role: 'user',
          content: 'Hello',
          metadata: Prisma.JsonNull,
        },
      });
      expect(result.metadata).toBeNull();
    });
  });

  describe('findMessagesBySessionId', () => {
    it('should return records with metadata field', async () => {
      const metadata = { actionCardId: 'card-1' };
      const messages = [
        makePrismaMessage({ id: 'msg-1', metadata }),
        makePrismaMessage({ id: 'msg-2', metadata: null }),
      ];
      mockMessageFindMany.mockResolvedValue(messages);

      const result = await findMessagesBySessionId('session-1');

      expect(result).toHaveLength(2);
      expect(result[0].metadata).toEqual({ actionCardId: 'card-1' });
      expect(result[1].metadata).toBeNull();
    });
  });
});
