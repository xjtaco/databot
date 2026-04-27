import { describe, it, expect, beforeEach, vi } from 'vitest';

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
const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockMessageCreate = vi.fn();
const mockMessageFindMany = vi.fn();

vi.mock('../../src/infrastructure/database', () => ({
  getPrismaClient: () => ({
    chatSession: {
      create: (...args: unknown[]) => mockCreate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
    chatMessage: {
      create: (...args: unknown[]) => mockMessageCreate(...args),
      findMany: (...args: unknown[]) => mockMessageFindMany(...args),
    },
  }),
}));

import {
  createSession,
  findSessionById,
  findAllSessions,
  updateSessionTitle,
  deleteSession,
  createMessage,
  findMessagesBySessionId,
} from '../../src/chatSession/chatSession.repository';

const now = new Date('2026-03-17T00:00:00Z');

function makePrismaSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    title: 'Test Session',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

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

describe('chatSession.repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a session with default (null) title', async () => {
      const prismaSession = makePrismaSession({ title: null });
      mockCreate.mockResolvedValue(prismaSession);

      const result = await createSession();

      expect(mockCreate).toHaveBeenCalledWith({ data: { title: null, userId: null } });
      expect(result).toEqual({
        id: 'session-1',
        title: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    it('should create a session with a custom title', async () => {
      const prismaSession = makePrismaSession({ title: 'My Chat' });
      mockCreate.mockResolvedValue(prismaSession);

      const result = await createSession('My Chat');

      expect(mockCreate).toHaveBeenCalledWith({ data: { title: 'My Chat', userId: null } });
      expect(result.title).toBe('My Chat');
    });
  });

  describe('findSessionById', () => {
    it('should return a session when found', async () => {
      const prismaSession = makePrismaSession();
      mockFindUnique.mockResolvedValue(prismaSession);

      const result = await findSessionById('session-1');

      expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: 'session-1' } });
      expect(result).toEqual({
        id: 'session-1',
        title: 'Test Session',
        createdAt: now,
        updatedAt: now,
      });
    });

    it('should return null when session not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await findSessionById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAllSessions', () => {
    it('should return sessions ordered by updatedAt desc with last message preview', async () => {
      const sessions = [
        {
          ...makePrismaSession({ id: 's1', title: 'First' }),
          messages: [makePrismaMessage({ content: 'Latest msg' })],
        },
        {
          ...makePrismaSession({ id: 's2', title: 'Second' }),
          messages: [],
        },
      ];
      mockFindMany.mockResolvedValue(sessions);

      const result = await findAllSessions();

      expect(mockFindMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { updatedAt: 'desc' },
        take: 50,
        skip: 0,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
      expect(result).toHaveLength(2);
      expect(result[0].lastMessagePreview).toBe('Latest msg');
      expect(result[0].lastMessageAt).toEqual(now);
      expect(result[1].lastMessagePreview).toBeNull();
      expect(result[1].lastMessageAt).toBeNull();
    });
  });

  describe('updateSessionTitle', () => {
    it('should update the session title', async () => {
      const updated = makePrismaSession({ title: 'New Title' });
      mockUpdate.mockResolvedValue(updated);

      const result = await updateSessionTitle('session-1', 'New Title');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { title: 'New Title' },
      });
      expect(result.title).toBe('New Title');
    });
  });

  describe('deleteSession', () => {
    it('should call prisma delete', async () => {
      mockDelete.mockResolvedValue(makePrismaSession());

      await deleteSession('session-1');

      expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'session-1' } });
    });
  });

  describe('createMessage', () => {
    it('should create a message', async () => {
      const prismaMessage = makePrismaMessage();
      mockMessageCreate.mockResolvedValue(prismaMessage);

      const data = { sessionId: 'session-1', role: 'user', content: 'Hello' };
      const result = await createMessage(data);

      expect(mockMessageCreate).toHaveBeenCalledWith({
        data: { sessionId: 'session-1', role: 'user', content: 'Hello' },
      });
      expect(result).toEqual({
        id: 'msg-1',
        sessionId: 'session-1',
        role: 'user',
        content: 'Hello',
        metadata: null,
        createdAt: now,
      });
    });
  });

  describe('findMessagesBySessionId', () => {
    it('should return messages ordered by createdAt asc', async () => {
      const messages = [
        makePrismaMessage({ id: 'msg-1', content: 'First' }),
        makePrismaMessage({ id: 'msg-2', content: 'Second' }),
      ];
      mockMessageFindMany.mockResolvedValue(messages);

      const result = await findMessagesBySessionId('session-1');

      expect(mockMessageFindMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('First');
      expect(result[1].content).toBe('Second');
    });
  });
});
