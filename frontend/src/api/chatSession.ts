import { http } from '@/utils/http';
import type { ChatSessionItem, ChatSessionDetail, ChatMessageRecord } from '@/types/chatSession';

const BASE_URL = '/chat-sessions';

export async function listSessions(): Promise<ChatSessionItem[]> {
  const data = await http.get<{ sessions: ChatSessionItem[] }>(BASE_URL);
  return data.sessions;
}

export async function createSession(title?: string): Promise<ChatSessionDetail> {
  const data = await http.post<{ session: ChatSessionDetail }>(BASE_URL, title ? { title } : {});
  return data.session;
}

export async function getSession(id: string): Promise<ChatSessionDetail> {
  const data = await http.get<{ session: ChatSessionDetail }>(`${BASE_URL}/${id}`);
  return data.session;
}

export async function getSessionMessages(id: string): Promise<ChatMessageRecord[]> {
  const data = await http.get<{ messages: ChatMessageRecord[] }>(`${BASE_URL}/${id}/messages`);
  return data.messages;
}

export async function updateSessionTitle(id: string, title: string): Promise<ChatSessionDetail> {
  const data = await http.put<{ session: ChatSessionDetail }>(`${BASE_URL}/${id}`, { title });
  return data.session;
}

export async function deleteSession(id: string): Promise<void> {
  await http.delete(`${BASE_URL}/${id}`);
}

export async function updateMessageMetadata(
  sessionId: string,
  messageId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await http.put(`${BASE_URL}/${sessionId}/messages/${messageId}/metadata`, { metadata });
}
