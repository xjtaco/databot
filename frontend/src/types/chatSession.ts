export interface ChatSessionItem {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
}

export interface ChatSessionDetail {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: string;
  content: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}
