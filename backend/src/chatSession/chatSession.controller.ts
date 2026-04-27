import type { Request, Response } from 'express';
import { ValidationError } from '../errors/types';
import { HttpStatusCode } from '../base/types';
import { getValidatedUuid } from '../utils/routeParams';
import * as chatSessionService from './chatSession.service';

export async function createSessionHandler(req: Request, res: Response): Promise<void> {
  const { title } = req.body as { title?: string };
  const session = await chatSessionService.createSession(
    title && typeof title === 'string' ? title.trim() : undefined,
    req.user?.userId
  );
  res.status(HttpStatusCode.CREATED).json({ session });
}

export async function listSessionsHandler(req: Request, res: Response): Promise<void> {
  const sessions = await chatSessionService.listSessions(req.user?.userId);
  res.json({ sessions });
}

export async function getSessionHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const session = await chatSessionService.getSession(id);
  res.json({ session });
}

export async function getSessionMessagesHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const messages = await chatSessionService.getSessionMessages(id);
  res.json({ messages });
}

export async function updateSessionTitleHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  const { title } = req.body as { title?: string };
  if (!title || typeof title !== 'string') {
    throw new ValidationError('Title is required');
  }
  const session = await chatSessionService.updateSessionTitle(id, title);
  res.json({ session });
}

export async function deleteSessionHandler(req: Request, res: Response): Promise<void> {
  const id = getValidatedUuid(req, 'id');
  await chatSessionService.deleteSession(id);
  res.json({ deleted: true });
}

export async function updateMessageMetadataHandler(req: Request, res: Response): Promise<void> {
  const sessionId = getValidatedUuid(req, 'id');
  const messageId = getValidatedUuid(req, 'messageId');
  const { metadata } = req.body as { metadata?: Record<string, unknown> };
  if (!metadata || typeof metadata !== 'object') {
    throw new ValidationError('metadata is required and must be an object');
  }
  await chatSessionService.getSession(sessionId);
  const message = await chatSessionService.updateMessageMetadata(messageId, metadata);
  res.json({ message });
}
