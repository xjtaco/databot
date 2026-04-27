import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ChatSessionNotFoundError } from '../../src/errors/types';

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the chat session service
const mockGetSession = vi.hoisted(() => vi.fn());
const mockUpdateMessageMetadata = vi.hoisted(() => vi.fn());

vi.mock('../../src/chatSession/chatSession.service', () => ({
  getSession: mockGetSession,
  updateMessageMetadata: mockUpdateMessageMetadata,
}));

// Import after mocking
import chatSessionRouter from '../../src/chatSession/chatSession.routes';

describe('chatSession metadata API', () => {
  let app: express.Application;

  const sessionUuid = '550e8400-e29b-41d4-a716-446655440000';
  const messageUuid = '550e8400-e29b-41d4-a716-446655440001';

  const mockSession = {
    id: sessionUuid,
    title: 'Test Session',
    createdAt: new Date('2026-03-17T00:00:00Z'),
    updatedAt: new Date('2026-03-17T00:00:00Z'),
  };

  const mockMessage = {
    id: messageUuid,
    sessionId: sessionUuid,
    role: 'assistant',
    content: 'Hello',
    metadata: { status: 'succeeded' },
    createdAt: new Date('2026-03-17T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(mockSession);
    mockUpdateMessageMetadata.mockResolvedValue(mockMessage);
    app = express();
    app.use(express.json());
    app.use(chatSessionRouter);
    app.use(
      (
        err: Error & { statusCode?: number; code?: string },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => {
        res.status(err.statusCode || 500).json({
          error: {
            code: err.code || 'UNKNOWN',
            message: err.message,
          },
        });
      }
    );
  });

  describe('PUT /:id/messages/:messageId/metadata', () => {
    it('should update message metadata and return the updated message', async () => {
      const response = await request(app)
        .put(`/${sessionUuid}/messages/${messageUuid}/metadata`)
        .send({ metadata: { status: 'succeeded' } })
        .expect(200);

      expect(response.body.message).toEqual({
        ...mockMessage,
        createdAt: mockMessage.createdAt.toISOString(),
      });
      expect(mockGetSession).toHaveBeenCalledWith(sessionUuid);
      expect(mockUpdateMessageMetadata).toHaveBeenCalledWith(messageUuid, {
        status: 'succeeded',
      });
    });

    it('should return 400 when metadata is missing', async () => {
      const response = await request(app)
        .put(`/${sessionUuid}/messages/${messageUuid}/metadata`)
        .send({})
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when metadata is not an object', async () => {
      const response = await request(app)
        .put(`/${sessionUuid}/messages/${messageUuid}/metadata`)
        .send({ metadata: 'not-an-object' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when session ID is not a valid UUID', async () => {
      const response = await request(app)
        .put('/invalid-session-id/messages/test-msg-id/metadata')
        .send({ metadata: { status: 'succeeded' } })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when message ID is not a valid UUID', async () => {
      const response = await request(app)
        .put(`/${sessionUuid}/messages/invalid-msg-id/metadata`)
        .send({ metadata: { status: 'succeeded' } })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return 404 when session does not exist', async () => {
      mockGetSession.mockRejectedValue(new ChatSessionNotFoundError('Chat session not found'));

      const response = await request(app)
        .put(`/${sessionUuid}/messages/${messageUuid}/metadata`)
        .send({ metadata: { status: 'succeeded' } })
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when message does not belong to the session', async () => {
      const otherSessionUuid = '550e8400-e29b-41d4-a716-446655440099';
      mockUpdateMessageMetadata.mockResolvedValue({
        ...mockMessage,
        sessionId: otherSessionUuid,
      });

      const response = await request(app)
        .put(`/${sessionUuid}/messages/${messageUuid}/metadata`)
        .send({ metadata: { status: 'succeeded' } })
        .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Message does not belong to this session');
    });
  });
});
