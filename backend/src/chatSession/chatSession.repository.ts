import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../infrastructure/database';
import { ChatSessionInfo, ChatSessionListItem, ChatMessageRecord } from './chatSession.types';

type PrismaSession = Prisma.ChatSessionGetPayload<object>;
type PrismaMessage = Prisma.ChatMessageGetPayload<object>;
type PrismaSessionWithMessages = Prisma.ChatSessionGetPayload<{
  include: { messages: true };
}>;

function mapSession(session: PrismaSession): ChatSessionInfo {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function mapMessage(message: PrismaMessage): ChatMessageRecord {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
}

function mapSessionWithLastMessage(session: PrismaSessionWithMessages): ChatSessionListItem {
  const lastMessage = session.messages.length > 0 ? session.messages[0] : null;
  return {
    ...mapSession(session),
    lastMessagePreview: lastMessage?.content ?? null,
    lastMessageAt: lastMessage?.createdAt ?? null,
  };
}

export async function createSession(title?: string, userId?: string): Promise<ChatSessionInfo> {
  const prisma = getPrismaClient();
  const session = await prisma.chatSession.create({
    data: {
      title: title ?? null,
      userId: userId ?? null,
    },
  });
  return mapSession(session);
}

export async function findSessionById(id: string): Promise<ChatSessionInfo | null> {
  const prisma = getPrismaClient();
  const session = await prisma.chatSession.findUnique({ where: { id } });
  return session ? mapSession(session) : null;
}

export async function findAllSessions(
  limit: number = 50,
  offset: number = 0,
  userId?: string
): Promise<ChatSessionListItem[]> {
  const prisma = getPrismaClient();
  const sessions = await prisma.chatSession.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { updatedAt: 'desc' },
    take: limit,
    skip: offset,
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  return sessions.map(mapSessionWithLastMessage);
}

export async function updateSessionTitle(id: string, title: string): Promise<ChatSessionInfo> {
  const prisma = getPrismaClient();
  const session = await prisma.chatSession.update({
    where: { id },
    data: { title },
  });
  return mapSession(session);
}

export async function updateSessionTimestamp(id: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.chatSession.update({
    where: { id },
    data: { updatedAt: new Date() },
  });
}

export async function deleteSession(id: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.chatSession.delete({ where: { id } });
}

export async function createMessage(data: {
  sessionId: string;
  role: string;
  content: string | null;
}): Promise<ChatMessageRecord> {
  const prisma = getPrismaClient();
  const message = await prisma.chatMessage.create({ data });
  return mapMessage(message);
}

export async function findMessagesBySessionId(sessionId: string): Promise<ChatMessageRecord[]> {
  const prisma = getPrismaClient();
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
  });
  return messages.map(mapMessage);
}
