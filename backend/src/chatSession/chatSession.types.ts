export interface ChatSessionInfo {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatSessionListItem extends ChatSessionInfo {
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}
