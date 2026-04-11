import { ChatSessionNotFoundError, ValidationError } from '../errors/types';
import logger from '../utils/logger';
import * as repository from './chatSession.repository';
import { ChatSessionInfo, ChatSessionListItem, ChatMessageRecord } from './chatSession.types';

export async function createSession(title?: string, userId?: string): Promise<ChatSessionInfo> {
  const session = await repository.createSession(title, userId);
  logger.info('Created chat session', { sessionId: session.id, title: session.title });
  return session;
}

export async function listSessions(userId?: string): Promise<ChatSessionListItem[]> {
  return repository.findAllSessions(50, 0, userId);
}

export async function getSession(id: string): Promise<ChatSessionInfo> {
  const session = await repository.findSessionById(id);
  if (!session) {
    throw new ChatSessionNotFoundError('Chat session not found');
  }
  return session;
}

export async function getSessionMessages(id: string): Promise<ChatMessageRecord[]> {
  const session = await repository.findSessionById(id);
  if (!session) {
    throw new ChatSessionNotFoundError('Chat session not found');
  }
  return repository.findMessagesBySessionId(id);
}

export async function updateSessionTitle(id: string, title: string): Promise<ChatSessionInfo> {
  if (!title || title.trim().length === 0) {
    throw new ValidationError('Title must not be empty');
  }
  const session = await repository.findSessionById(id);
  if (!session) {
    throw new ChatSessionNotFoundError('Chat session not found');
  }
  const updated = await repository.updateSessionTitle(id, title.trim());
  logger.info('Updated chat session title', { sessionId: id, title: updated.title });
  return updated;
}

export async function deleteSession(id: string): Promise<void> {
  const session = await repository.findSessionById(id);
  if (!session) {
    throw new ChatSessionNotFoundError('Chat session not found');
  }
  await repository.deleteSession(id);
  logger.info('Deleted chat session', { sessionId: id });
}

export async function addMessage(
  sessionId: string,
  role: string,
  content: string | null
): Promise<ChatMessageRecord> {
  const message = await repository.createMessage({ sessionId, role, content });
  await repository.updateSessionTimestamp(sessionId);
  logger.info('Added chat message', { sessionId, messageId: message.id, role });
  return message;
}

export async function autoGenerateTitle(
  sessionId: string,
  firstUserMessage: string
): Promise<void> {
  const maxLength = 50;
  const chars = Array.from(firstUserMessage);
  const title =
    chars.length > maxLength ? chars.slice(0, maxLength).join('') + '...' : firstUserMessage;
  await repository.updateSessionTitle(sessionId, title);
  logger.info('Auto-generated chat session title', { sessionId, title });
}
