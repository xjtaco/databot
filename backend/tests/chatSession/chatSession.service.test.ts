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

// Mock repository
const mockCreateSession = vi.fn();
const mockFindSessionById = vi.fn();
const mockFindAllSessions = vi.fn();
const mockUpdateSessionTitle = vi.fn();
const mockUpdateSessionTimestamp = vi.fn();
const mockDeleteSession = vi.fn();
const mockCreateMessage = vi.fn();
const mockFindMessagesBySessionId = vi.fn();

vi.mock('../../src/chatSession/chatSession.repository', () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  findSessionById: (...args: unknown[]) => mockFindSessionById(...args),
  findAllSessions: (...args: unknown[]) => mockFindAllSessions(...args),
  updateSessionTitle: (...args: unknown[]) => mockUpdateSessionTitle(...args),
  updateSessionTimestamp: (...args: unknown[]) => mockUpdateSessionTimestamp(...args),
  deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
  createMessage: (...args: unknown[]) => mockCreateMessage(...args),
  findMessagesBySessionId: (...args: unknown[]) => mockFindMessagesBySessionId(...args),
}));

import {
  createSession,
  listSessions,
  getSession,
  getSessionMessages,
  updateSessionTitle,
  deleteSession,
  addMessage,
  autoGenerateTitle,
} from '../../src/chatSession/chatSession.service';
import { ChatSessionNotFoundError } from '../../src/errors/types';

const now = new Date('2026-03-17T00:00:00Z');

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    title: 'Test Session',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'user',
    content: 'Hello',
    createdAt: now,
    ...overrides,
  };
}

describe('chatSession.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSession', () => {
    it('should delegate to repository', async () => {
      const session = makeSession();
      mockCreateSession.mockResolvedValue(session);

      const result = await createSession('My Chat');

      expect(mockCreateSession).toHaveBeenCalledWith('My Chat', undefined);
      expect(result).toEqual(session);
    });

    it('should delegate to repository without title', async () => {
      const session = makeSession({ title: null });
      mockCreateSession.mockResolvedValue(session);

      const result = await createSession();

      expect(mockCreateSession).toHaveBeenCalledWith(undefined, undefined);
      expect(result.title).toBeNull();
    });
  });

  describe('listSessions', () => {
    it('should delegate to repository', async () => {
      const sessions = [{ ...makeSession(), lastMessagePreview: null, lastMessageAt: null }];
      mockFindAllSessions.mockResolvedValue(sessions);

      const result = await listSessions();

      expect(mockFindAllSessions).toHaveBeenCalled();
      expect(result).toEqual(sessions);
    });
  });

  describe('getSession', () => {
    it('should return session when found', async () => {
      const session = makeSession();
      mockFindSessionById.mockResolvedValue(session);

      const result = await getSession('session-1');

      expect(result).toEqual(session);
    });

    it('should throw ChatSessionNotFoundError when not found', async () => {
      mockFindSessionById.mockResolvedValue(null);

      await expect(getSession('nonexistent')).rejects.toThrow(ChatSessionNotFoundError);
    });
  });

  describe('getSessionMessages', () => {
    it('should return messages when session exists', async () => {
      const session = makeSession();
      const messages = [makeMessage()];
      mockFindSessionById.mockResolvedValue(session);
      mockFindMessagesBySessionId.mockResolvedValue(messages);

      const result = await getSessionMessages('session-1');

      expect(result).toEqual(messages);
    });

    it('should throw ChatSessionNotFoundError when session not found', async () => {
      mockFindSessionById.mockResolvedValue(null);

      await expect(getSessionMessages('nonexistent')).rejects.toThrow(ChatSessionNotFoundError);
    });
  });

  describe('updateSessionTitle', () => {
    it('should update title when valid', async () => {
      const session = makeSession();
      const updated = makeSession({ title: 'New Title' });
      mockFindSessionById.mockResolvedValue(session);
      mockUpdateSessionTitle.mockResolvedValue(updated);

      const result = await updateSessionTitle('session-1', 'New Title');

      expect(mockUpdateSessionTitle).toHaveBeenCalledWith('session-1', 'New Title');
      expect(result.title).toBe('New Title');
    });

    it('should throw ValidationError when title is empty', async () => {
      await expect(updateSessionTitle('session-1', '')).rejects.toThrow('Title must not be empty');
    });

    it('should throw ValidationError when title is whitespace only', async () => {
      await expect(updateSessionTitle('session-1', '   ')).rejects.toThrow(
        'Title must not be empty'
      );
    });

    it('should throw ChatSessionNotFoundError when session not found', async () => {
      mockFindSessionById.mockResolvedValue(null);

      await expect(updateSessionTitle('nonexistent', 'Title')).rejects.toThrow(
        ChatSessionNotFoundError
      );
    });
  });

  describe('deleteSession', () => {
    it('should delete when session exists', async () => {
      const session = makeSession();
      mockFindSessionById.mockResolvedValue(session);
      mockDeleteSession.mockResolvedValue(undefined);

      await deleteSession('session-1');

      expect(mockDeleteSession).toHaveBeenCalledWith('session-1');
    });

    it('should throw ChatSessionNotFoundError when session not found', async () => {
      mockFindSessionById.mockResolvedValue(null);

      await expect(deleteSession('nonexistent')).rejects.toThrow(ChatSessionNotFoundError);
    });
  });

  describe('addMessage', () => {
    it('should add message and touch session timestamp', async () => {
      const message = makeMessage();
      mockCreateMessage.mockResolvedValue(message);
      mockUpdateSessionTimestamp.mockResolvedValue(undefined);

      const result = await addMessage('session-1', 'user', 'Hello');

      expect(mockCreateMessage).toHaveBeenCalledWith({
        sessionId: 'session-1',
        role: 'user',
        content: 'Hello',
      });
      expect(mockUpdateSessionTimestamp).toHaveBeenCalledWith('session-1');
      expect(result).toEqual(message);
    });

    it('should handle null content', async () => {
      const message = makeMessage({ content: null });
      mockCreateMessage.mockResolvedValue(message);
      mockUpdateSessionTimestamp.mockResolvedValue(undefined);

      const result = await addMessage('session-1', 'assistant', null);

      expect(mockCreateMessage).toHaveBeenCalledWith({
        sessionId: 'session-1',
        role: 'assistant',
        content: null,
      });
      expect(result.content).toBeNull();
    });
  });

  describe('autoGenerateTitle', () => {
    it('should use full message when under 50 chars', async () => {
      mockUpdateSessionTitle.mockResolvedValue(makeSession({ title: 'Short title' }));

      await autoGenerateTitle('session-1', 'Short title');

      expect(mockUpdateSessionTitle).toHaveBeenCalledWith('session-1', 'Short title');
    });

    it('should truncate long titles to 50 chars with ellipsis', async () => {
      const longMessage = 'A'.repeat(60);
      const expectedTitle = 'A'.repeat(50) + '...';
      mockUpdateSessionTitle.mockResolvedValue(makeSession({ title: expectedTitle }));

      await autoGenerateTitle('session-1', longMessage);

      expect(mockUpdateSessionTitle).toHaveBeenCalledWith('session-1', expectedTitle);
    });

    it('should not truncate message exactly 50 chars', async () => {
      const exactMessage = 'B'.repeat(50);
      mockUpdateSessionTitle.mockResolvedValue(makeSession({ title: exactMessage }));

      await autoGenerateTitle('session-1', exactMessage);

      expect(mockUpdateSessionTitle).toHaveBeenCalledWith('session-1', exactMessage);
    });
  });
});
